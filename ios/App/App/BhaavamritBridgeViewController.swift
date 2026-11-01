import Capacitor

final class BhaavamritBridgeViewController: CAPBridgeViewController {
    override func capacitorDidLoad() {
        bridge?.registerPluginInstance(DocumentPlugin())
        bridge?.registerPluginInstance(SharePlugin())
        bridge?.registerPluginInstance(LifecycleNetworkPlugin())
    }
}
