import UIKit

/// A reference-type token for the one document that is currently visible.
///
/// The service retains this token while the share sheet is presented so the PDF URL and
/// document presenter cannot disappear during export.
@MainActor
final class ActiveDocumentShareSession: NSObject {
    let sessionId: String
    let localPDFURL: URL
    let documentViewController: UIViewController

    init(sessionId: String, localPDFURL: URL, documentViewController: UIViewController) {
        self.sessionId = sessionId
        self.localPDFURL = localPDFURL
        self.documentViewController = documentViewController
    }
}

enum DocumentShareOutcome: Equatable {
    case completed
    case cancelled
}

enum DocumentShareError: Error, Equatable {
    case sessionNotActive
    case documentUnavailable
    case presentationInProgress
    case presentationFailed
    case activityFailed

    var code: String {
        switch self {
        case .sessionNotActive:
            return "EXPORT_SESSION_NOT_ACTIVE"
        case .documentUnavailable:
            return "EXPORT_DOCUMENT_UNAVAILABLE"
        case .presentationInProgress:
            return "EXPORT_PRESENTATION_IN_PROGRESS"
        case .presentationFailed:
            return "EXPORT_PRESENTATION_FAILED"
        case .activityFailed:
            return "EXPORT_ACTIVITY_FAILED"
        }
    }

    var userMessage: String {
        switch self {
        case .sessionNotActive:
            return "The selected document is no longer open."
        case .documentUnavailable:
            return "The selected PDF is unavailable for export."
        case .presentationInProgress:
            return "The share and save chooser is already open."
        case .presentationFailed:
            return "The share and save chooser could not be opened."
        case .activityFailed:
            return "The selected PDF could not be shared or saved."
        }
    }
}

/// Owns export state for the active native document viewer.
///
/// Call `activate` when a document viewer is presented and `deactivate` only when that
/// same viewer closes. Export accepts only the active session identifier; callers cannot
/// supply a path or URL at the bridge boundary.
@MainActor
final class DocumentShareService {
    static let shared = DocumentShareService()

    private var activeSession: ActiveDocumentShareSession?
    private var activityController: UIActivityViewController?
    private var pendingDeactivationSessionId: String?

    private init() {}

    @discardableResult
    func activate(
        sessionId: String,
        localPDFURL: URL,
        documentViewController: UIViewController
    ) -> ActiveDocumentShareSession {
        let session = ActiveDocumentShareSession(
            sessionId: sessionId,
            localPDFURL: localPDFURL,
            documentViewController: documentViewController
        )
        activeSession = session
        pendingDeactivationSessionId = nil
        return session
    }

    func deactivate(sessionId: String) {
        guard activeSession?.sessionId == sessionId else { return }
        if activityController != nil {
            pendingDeactivationSessionId = sessionId
        } else {
            activeSession = nil
            pendingDeactivationSessionId = nil
        }
    }

    func export(
        sessionId: String,
        completion: @escaping (Result<DocumentShareOutcome, DocumentShareError>) -> Void
    ) {
        guard activityController == nil else {
            completion(.failure(.presentationInProgress))
            return
        }
        guard let session = activeSession, session.sessionId == sessionId else {
            completion(.failure(.sessionNotActive))
            return
        }
        guard isReadableLocalPDF(session.localPDFURL) else {
            completion(.failure(.documentUnavailable))
            return
        }

        let presenter = session.documentViewController
        guard presenter.isViewLoaded,
              presenter.view.window != nil,
              presenter.presentedViewController == nil else {
            completion(.failure(.presentationFailed))
            return
        }

        let controller = UIActivityViewController(
            activityItems: [session.localPDFURL],
            applicationActivities: nil
        )
        activityController = controller

        // Configure popover presentation for compatible iPad execution as well as iPhone.
        if let popover = controller.popoverPresentationController {
            popover.sourceView = presenter.view
            popover.sourceRect = CGRect(
                x: presenter.view.bounds.midX,
                y: presenter.view.bounds.maxY,
                width: 1,
                height: 1
            )
            popover.permittedArrowDirections = []
        }

        controller.completionWithItemsHandler = { [weak self, weak controller] _, completed, _, error in
            Task { @MainActor in
                guard let self else { return }
                if self.activityController === controller {
                    self.activityController = nil
                }
                if self.pendingDeactivationSessionId == session.sessionId {
                    self.activeSession = nil
                    self.pendingDeactivationSessionId = nil
                }

                if error != nil {
                    completion(.failure(.activityFailed))
                } else if completed {
                    completion(.success(.completed))
                } else {
                    completion(.success(.cancelled))
                }
            }
        }

        // The document viewer remains presented underneath the chooser. The active session
        // is intentionally retained after every outcome so a failed export can be retried.
        presenter.present(controller, animated: !UIAccessibility.isReduceMotionEnabled)
    }

    private func isReadableLocalPDF(_ url: URL) -> Bool {
        guard url.isFileURL,
              url.pathExtension.caseInsensitiveCompare("pdf") == .orderedSame else {
            return false
        }

        var isDirectory: ObjCBool = false
        return FileManager.default.fileExists(atPath: url.path, isDirectory: &isDirectory)
            && !isDirectory.boolValue
            && FileManager.default.isReadableFile(atPath: url.path)
    }
}
