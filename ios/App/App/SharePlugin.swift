import Capacitor
import Foundation

@objc(SharePlugin)
final class SharePlugin: CAPPlugin, CAPBridgedPlugin {
    let identifier = "SharePlugin"
    let jsName = "BhaavamritShare"
    let pluginMethods: [CAPPluginMethod] = [
        CAPPluginMethod(name: "exportDocument", returnType: CAPPluginReturnPromise)
    ]

    @objc func exportDocument(_ call: CAPPluginCall) {
        guard let sessionId = call.getString("sessionId"), !sessionId.isEmpty else {
            call.reject(
                "A document session ID is required.",
                "EXPORT_REQUEST_INVALID",
                nil,
                ["retryable": false]
            )
            return
        }

        Task { @MainActor in
            DocumentShareService.shared.export(sessionId: sessionId) { result in
                switch result {
                case .success(.completed):
                    call.resolve(["status": "completed", "sessionId": sessionId])
                case .success(.cancelled):
                    call.resolve(["status": "cancelled", "sessionId": sessionId])
                case .failure(let error):
                    call.reject(
                        error.userMessage,
                        error.code,
                        nil,
                        ["retryable": Self.isRetryable(error), "sessionId": sessionId]
                    )
                }
            }
        }
    }

    private static func isRetryable(_ error: DocumentShareError) -> Bool {
        switch error {
        case .presentationFailed, .activityFailed, .documentUnavailable:
            return true
        case .sessionNotActive, .presentationInProgress:
            return false
        }
    }
}
