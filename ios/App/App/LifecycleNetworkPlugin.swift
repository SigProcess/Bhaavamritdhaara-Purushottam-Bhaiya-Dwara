import Capacitor
import Foundation
import Network
import UIKit

@objc(LifecycleNetworkPlugin)
public final class LifecycleNetworkPlugin: CAPPlugin, CAPBridgedPlugin {
    public let identifier = "LifecycleNetworkPlugin"
    public let jsName = "LifecycleNetwork"
    public let pluginMethods: [CAPPluginMethod] = [
        CAPPluginMethod(name: "getNetworkStatus", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "getLifecycleState", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "getPlatform", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "getVersion", returnType: CAPPluginReturnPromise)
    ]

    private let monitor = NWPathMonitor()
    private let monitorQueue = DispatchQueue(label: "com.bhaavamrit.app.network-monitor")
    private var notificationObservers: [NSObjectProtocol] = []
    private var lastNetworkStatus = "unknown"

    public override func load() {
        super.load()

        observeLifecycle()
        monitor.pathUpdateHandler = { [weak self] path in
            self?.publishNetworkStatus(Self.networkStatus(for: path))
        }
        monitor.start(queue: monitorQueue)
    }

    deinit {
        monitor.cancel()
        notificationObservers.forEach(NotificationCenter.default.removeObserver)
    }

    @objc public func getNetworkStatus(_ call: CAPPluginCall) {
        monitorQueue.async { [weak self] in
            guard let self else { return }
            call.resolve(["status": self.lastNetworkStatus])
        }
    }

    @objc public func getLifecycleState(_ call: CAPPluginCall) {
        DispatchQueue.main.async {
            call.resolve(["state": Self.lifecycleState(for: UIApplication.shared.applicationState)])
        }
    }

    @objc public func getPlatform(_ call: CAPPluginCall) {
        call.resolve(["platform": "ios"])
    }

    @objc public func getVersion(_ call: CAPPluginCall) {
        let bundle = Bundle.main
        let version = (bundle.object(forInfoDictionaryKey: "CFBundleShortVersionString") as? String)?
            .trimmingCharacters(in: .whitespacesAndNewlines) ?? ""

        guard !version.isEmpty, version.count <= 64 else {
            call.reject(
                "The application release version is missing or invalid.",
                "APP_METADATA_INVALID",
                nil,
                ["field": "version"]
            )
            return
        }

        call.resolve(["version": version])
    }

    private func observeLifecycle() {
        let center = NotificationCenter.default

        notificationObservers.append(center.addObserver(
            forName: UIApplication.didBecomeActiveNotification,
            object: nil,
            queue: .main
        ) { [weak self] _ in
            self?.notifyListeners("appStateChanged", data: ["state": "foreground"])
            self?.refreshNetworkStatus()
        })

        notificationObservers.append(center.addObserver(
            forName: UIApplication.didEnterBackgroundNotification,
            object: nil,
            queue: .main
        ) { [weak self] _ in
            self?.notifyListeners("appStateChanged", data: ["state": "background"])
        })
    }

    private func refreshNetworkStatus() {
        monitorQueue.async { [weak self] in
            guard let self else { return }
            self.publishNetworkStatus(Self.networkStatus(for: self.monitor.currentPath), forceNotification: true)
        }
    }

    private func publishNetworkStatus(_ status: String, forceNotification: Bool = false) {
        monitorQueue.async { [weak self] in
            guard let self else { return }
            let changed = self.lastNetworkStatus != status
            self.lastNetworkStatus = status

            guard changed || forceNotification else { return }
            DispatchQueue.main.async { [weak self] in
                self?.notifyListeners("networkStatusChanged", data: ["status": status])
            }
        }
    }

    private static func networkStatus(for path: NWPath) -> String {
        path.status == .satisfied ? "online" : "offline"
    }

    private static func lifecycleState(for state: UIApplication.State) -> String {
        state == .background ? "background" : "foreground"
    }
}
