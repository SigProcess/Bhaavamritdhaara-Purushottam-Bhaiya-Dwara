import Foundation
import PDFKit

struct ResolvedDocument {
    let documentId: String
    let kind: DocumentKind
    let title: String
    let fileURL: URL
    let pdfDocument: PDFDocument
}

enum DocumentKind: String, Codable {
    case bhajan
    case book
}

struct DocumentPluginError: Error {
    let code: String
    let message: String

    static func invalidRequest(_ message: String) -> Self {
        Self(code: "DOCUMENT_REQUEST_INVALID", message: message)
    }

    static func catalogUnavailable() -> Self {
        Self(code: "DOCUMENT_CATALOG_UNAVAILABLE", message: "The document catalog is unavailable.")
    }

    static func catalogInvalid() -> Self {
        Self(code: "DOCUMENT_CATALOG_INVALID", message: "The document catalog is invalid.")
    }

    static func notFound(documentId: String) -> Self {
        Self(code: "DOCUMENT_NOT_FOUND", message: "No document is registered for catalog ID \(documentId).")
    }

    static func kindMismatch(title: String) -> Self {
        Self(code: "DOCUMENT_KIND_MISMATCH", message: "\(title) is not registered as the requested document type.")
    }

    static func pathRejected(title: String) -> Self {
        Self(code: "DOCUMENT_PATH_REJECTED", message: "The catalog path for \(title) is not allowed.")
    }

    static func unsupportedType(title: String) -> Self {
        Self(code: "DOCUMENT_UNSUPPORTED_TYPE", message: "\(title) is not registered as a PDF document.")
    }

    static func invalidPDF(title: String) -> Self {
        Self(code: "DOCUMENT_INVALID", message: "\(title) is not a valid PDF document.")
    }

    static func presentationFailed(title: String) -> Self {
        Self(code: "DOCUMENT_PRESENTATION_FAILED", message: "\(title) could not be presented.")
    }
}

/// Resolves document IDs from the active catalog without accepting paths from the bridge.
final class CatalogDocumentResolver {
    struct CatalogLocation {
        let catalogURL: URL
        let assetRoot: URL
    }

    private struct Catalog: Decodable {
        let bhajans: [Bhajan]
        let books: [Book]
        let assets: [Asset]
    }

    private struct AssetReference: Decodable {
        let assetId: String
    }

    private struct Bhajan: Decodable {
        let id: String
        let hindiTitle: String
        let document: AssetReference
    }

    private struct Book: Decodable {
        let id: String
        let title: String
        let document: AssetReference
    }

    private struct Asset: Decodable {
        let id: String
        let path: String
        let mediaType: String
    }

    private struct CatalogDocument {
        let id: String
        let kind: DocumentKind
        let title: String
        let assetId: String
    }

    private let locations: [CatalogLocation]
    private let fileManager: FileManager

    init(fileManager: FileManager = .default, locations: [CatalogLocation]? = nil) {
        self.fileManager = fileManager
        self.locations = locations ?? Self.defaultLocations(fileManager: fileManager)
    }

    func resolve(documentId: String, expectedKind: DocumentKind) throws -> ResolvedDocument {
        guard isSafeIdentifier(documentId) else {
            throw DocumentPluginError.invalidRequest("The document ID is invalid.")
        }

        let (catalog, location) = try loadActiveCatalog()
        let documents = catalog.bhajans.map {
            CatalogDocument(id: $0.id, kind: .bhajan, title: $0.hindiTitle, assetId: $0.document.assetId)
        } + catalog.books.map {
            CatalogDocument(id: $0.id, kind: .book, title: $0.title, assetId: $0.document.assetId)
        }

        guard let record = documents.first(where: { $0.id == documentId }) else {
            throw DocumentPluginError.notFound(documentId: documentId)
        }
        guard record.kind == expectedKind else {
            throw DocumentPluginError.kindMismatch(title: record.title)
        }
        guard let asset = catalog.assets.first(where: { $0.id == record.assetId }) else {
            throw DocumentPluginError.notFound(documentId: documentId)
        }

        let normalizedMediaType = asset.mediaType
            .split(separator: ";", maxSplits: 1)
            .first?
            .trimmingCharacters(in: .whitespacesAndNewlines)
            .lowercased()
        guard normalizedMediaType == "application/pdf", URL(fileURLWithPath: asset.path).pathExtension.lowercased() == "pdf" else {
            throw DocumentPluginError.unsupportedType(title: record.title)
        }

        let fileURL = try resolveAllowlistedPath(asset.path, beneath: location.assetRoot, title: record.title)
        var isDirectory: ObjCBool = false
        guard fileManager.fileExists(atPath: fileURL.path, isDirectory: &isDirectory),
              !isDirectory.boolValue,
              fileManager.isReadableFile(atPath: fileURL.path),
              let pdf = PDFDocument(url: fileURL),
              pdf.pageCount > 0 else {
            throw DocumentPluginError.invalidPDF(title: record.title)
        }

        return ResolvedDocument(
            documentId: record.id,
            kind: record.kind,
            title: record.title,
            fileURL: fileURL,
            pdfDocument: pdf
        )
    }

    private func loadActiveCatalog() throws -> (Catalog, CatalogLocation) {
        for location in locations {
            guard fileManager.fileExists(atPath: location.catalogURL.path) else { continue }
            do {
                let data = try Data(contentsOf: location.catalogURL, options: [.mappedIfSafe])
                return (try JSONDecoder().decode(Catalog.self, from: data), location)
            } catch {
                throw DocumentPluginError.catalogInvalid()
            }
        }
        throw DocumentPluginError.catalogUnavailable()
    }

    private func resolveAllowlistedPath(_ path: String, beneath root: URL, title: String) throws -> URL {
        let relativePath = path.hasPrefix("/") ? String(path.dropFirst()) : path
        guard !relativePath.isEmpty,
              !relativePath.hasPrefix("/"),
              !relativePath.contains("\\"),
              !relativePath.split(separator: "/", omittingEmptySubsequences: false).contains(where: { $0 == ".." || $0 == "." || $0.isEmpty }) else {
            throw DocumentPluginError.pathRejected(title: title)
        }

        let canonicalRoot = root.standardizedFileURL.resolvingSymlinksInPath()
        let candidate = canonicalRoot.appendingPathComponent(relativePath, isDirectory: false)
            .standardizedFileURL
            .resolvingSymlinksInPath()
        let rootPath = canonicalRoot.path.hasSuffix("/") ? canonicalRoot.path : canonicalRoot.path + "/"
        guard candidate.path.hasPrefix(rootPath) else {
            throw DocumentPluginError.pathRejected(title: title)
        }
        return candidate
    }

    private func isSafeIdentifier(_ value: String) -> Bool {
        guard !value.isEmpty, value.count <= 256 else { return false }
        return value.unicodeScalars.allSatisfy {
            CharacterSet.alphanumerics.contains($0) || $0 == "-" || $0 == "_" || $0 == "." || $0 == ":" || $0 == " "
        } && value != "." && value != ".."
    }

    private static func defaultLocations(fileManager: FileManager) -> [CatalogLocation] {
        var result: [CatalogLocation] = []

        if let applicationSupport = try? fileManager.url(
            for: .applicationSupportDirectory,
            in: .userDomainMask,
            appropriateFor: nil,
            create: true
        ) {
            let storeRoot = applicationSupport.appendingPathComponent("BhaavamritCatalogStore", isDirectory: true)
            let activeRoot = storeRoot.appendingPathComponent("active", isDirectory: true)
            result.append(CatalogLocation(
                catalogURL: activeRoot.appendingPathComponent("catalog.json"),
                assetRoot: activeRoot
            ))
            result.append(CatalogLocation(
                catalogURL: storeRoot.appendingPathComponent("catalog.json"),
                assetRoot: storeRoot
            ))
        }

        if let resources = Bundle.main.resourceURL {
            let packagedRoot = resources.appendingPathComponent("public", isDirectory: true)
            result.append(CatalogLocation(
                catalogURL: packagedRoot.appendingPathComponent("catalog.json"),
                assetRoot: packagedRoot
            ))
        }

        return result
    }
}
