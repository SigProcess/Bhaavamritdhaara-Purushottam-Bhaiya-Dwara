import Capacitor
import UIKit

@objc(DocumentPlugin)
public final class DocumentPlugin: CAPPlugin, CAPBridgedPlugin {
    public let identifier = "DocumentPlugin"
    public let jsName = "Document"
    public let pluginMethods: [CAPPluginMethod] = [
        CAPPluginMethod(name: "open", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "close", returnType: CAPPluginReturnPromise)
    ]

    private struct Session {
        let documentId: String
        let kind: DocumentKind
        let navigationController: UINavigationController
        let viewer: DocumentViewController
    }

    private let resolver = CatalogDocumentResolver()
    private var sessions: [String: Session] = [:]

    @objc func open(_ call: CAPPluginCall) {
        guard let requestId = call.getString("requestId"), !requestId.isEmpty,
              let documentId = call.getString("documentId"),
              let kindValue = call.getString("kind"),
              let kind = DocumentKind(rawValue: kindValue) else {
            reject(call, with: .invalidRequest("requestId, documentId, and a valid kind are required."))
            return
        }

        DispatchQueue.main.async { [weak self] in
            guard let self else { return }
            do {
                let document = try self.resolver.resolve(documentId: documentId, expectedKind: kind)
                guard let presenter = self.bridge?.viewController,
                      presenter.presentedViewController == nil else {
                    throw DocumentPluginError.presentationFailed(title: document.title)
                }

                let sessionId = UUID().uuidString.lowercased()
                let viewer = DocumentViewController(sessionId: sessionId, resolvedDocument: document)
                let navigationController = UINavigationController(rootViewController: viewer)
                navigationController.modalPresentationStyle = .fullScreen
                navigationController.isModalInPresentation = true

                viewer.onDismiss = { [weak self] dismissedSessionId in
                    guard let self else { return }
                    DocumentShareService.shared.deactivate(sessionId: dismissedSessionId)
                    self.sessions.removeValue(forKey: dismissedSessionId)
                    self.notifyListeners("documentDismissed", data: [
                        "sessionId": dismissedSessionId,
                        "documentId": document.documentId,
                        "kind": document.kind.rawValue
                    ])
                }

                self.sessions[sessionId] = Session(
                    documentId: document.documentId,
                    kind: document.kind,
                    navigationController: navigationController,
                    viewer: viewer
                )
                DocumentShareService.shared.activate(
                    sessionId: sessionId,
                    localPDFURL: document.fileURL,
                    documentViewController: viewer
                )
                presenter.present(
                    navigationController,
                    animated: !UIAccessibility.isReduceMotionEnabled
                ) {
                    call.resolve([
                        "requestId": requestId,
                        "sessionId": sessionId,
                        "documentId": document.documentId,
                        "kind": document.kind.rawValue
                    ])
                }
            } catch let error as DocumentPluginError {
                self.reject(call, with: error)
            } catch {
                self.reject(call, with: .invalidRequest("The document request could not be completed."))
            }
        }
    }

    @objc func close(_ call: CAPPluginCall) {
        guard let sessionId = call.getString("sessionId"), !sessionId.isEmpty else {
            reject(call, with: .invalidRequest("sessionId is required."))
            return
        }

        DispatchQueue.main.async { [weak self] in
            guard let self else { return }
            guard let session = self.sessions[sessionId] else {
                self.reject(call, with: DocumentPluginError(
                    code: "DOCUMENT_SESSION_NOT_FOUND",
                    message: "The document session is no longer active."
                ))
                return
            }

            session.viewer.close(animated: true) {
                DocumentShareService.shared.deactivate(sessionId: sessionId)
                self.sessions.removeValue(forKey: sessionId)
                call.resolve([
                    "sessionId": sessionId,
                    "documentId": session.documentId,
                    "kind": session.kind.rawValue
                ])
            }
        }
    }

    private func reject(_ call: CAPPluginCall, with error: DocumentPluginError) {
        call.reject(error.message, error.code)
    }
}
