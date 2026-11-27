import UIKit
import WebKit
import CoreAudioKit

private final class BrokerNoRedirect: NSObject, URLSessionTaskDelegate {
    func urlSession(_ session: URLSession, task: URLSessionTask, willPerformHTTPRedirection response: HTTPURLResponse, newRequest request: URLRequest, completionHandler: @escaping (URLRequest?) -> Void) { completionHandler(nil) }
}

final class HUDViewController: UIViewController, WKNavigationDelegate, WKUIDelegate, WKScriptMessageHandlerWithReply {
    private let webHost = "ios-test.localhost"
    private(set) var webView: WKWebView!
    private let midi = MIDIManager()
    private let drive = GoogleDriveService()
    private let brokerDelegate = BrokerNoRedirect()
    private lazy var brokerSession: URLSession = {
        let config = URLSessionConfiguration.ephemeral
        config.timeoutIntervalForRequest = 18; config.timeoutIntervalForResource = 25
        return URLSession(configuration: config, delegate: brokerDelegate, delegateQueue: nil)
    }()
    private func brokerRequest(_ payload: [String: Any]) async throws -> Any {
        guard let path = payload["path"] as? String, let method = payload["method"] as? String,
              (method == "GET" && ["/health","/session","/session/devices"].contains(path)) ||
              (method == "POST" && ["/auth/native/start","/auth/native/poll","/session/revoke","/session/devices/revoke","/drive/request"].contains(path)),
              let url = URL(string:"https://midihudaut.midihudapp.workers.dev" + path) else { throw URLError(.unsupportedURL) }
        var request = URLRequest(url:url)
        request.httpMethod = method
        request.setValue("hud://ios-test.localhost",forHTTPHeaderField:"Origin")
        request.setValue("application/json",forHTTPHeaderField:"Content-Type")
        if let token = payload["token"] as? String {
            guard token.range(of:"^[A-Za-z0-9_-]{64}$",options:.regularExpression) != nil else { throw URLError(.userAuthenticationRequired) }
            request.setValue("Bearer " + token,forHTTPHeaderField:"Authorization")
        }
        if method == "POST" {
            let data = try JSONSerialization.data(withJSONObject:payload["body"] ?? [:])
            guard data.count <= 3_200_000 else { throw URLError(.dataLengthExceedsMaximum) }
            request.httpBody = data
        }
        let (data,response) = try await brokerSession.data(for:request)
        guard data.count <= 3_200_000, let http = response as? HTTPURLResponse else { throw URLError(.badServerResponse) }
        return ["status":http.statusCode,"data":try JSONSerialization.jsonObject(with:data)]
    }
    private var scheme: BundleSchemeHandler?
    override func viewDidLoad() {
        super.viewDidLoad()
        view.backgroundColor = .black
        guard let root = Bundle.main.url(forResource: "Web", withExtension: nil) else { fatalError("Faltan los recursos web de MIDI HUD") }
        let configuration = WKWebViewConfiguration()
        configuration.websiteDataStore = .default()
        let scheme = BundleSchemeHandler(root: root, host: webHost); self.scheme = scheme
        configuration.setURLSchemeHandler(scheme, forURLScheme: "hud")
        configuration.userContentController.addScriptMessageHandler(self, contentWorld: .page, name: "hud")
        if let script = try? String(contentsOf: root.appendingPathComponent("core/native-bridge.js"), encoding: .utf8) {
            configuration.userContentController.addUserScript(WKUserScript(source: script, injectionTime: .atDocumentStart, forMainFrameOnly: true))
        }
        webView = WKWebView(frame: .zero, configuration: configuration)
        webView.navigationDelegate = self; webView.uiDelegate = self
        webView.isOpaque = false; webView.backgroundColor = .black; webView.scrollView.backgroundColor = .black
        webView.translatesAutoresizingMaskIntoConstraints = false
        view.addSubview(webView)
        NSLayoutConstraint.activate([webView.topAnchor.constraint(equalTo: view.safeAreaLayoutGuide.topAnchor), webView.bottomAnchor.constraint(equalTo: view.safeAreaLayoutGuide.bottomAnchor), webView.leadingAnchor.constraint(equalTo: view.leadingAnchor), webView.trailingAnchor.constraint(equalTo: view.trailingAnchor)])
        midi.onEvent = { [weak self] event in self?.send(event) }
        webView.load(URLRequest(url: URL(string: "hud://\(webHost)/index.html")!))
    }
    func becameActive() {
        guard webView != nil else { return }
        UIApplication.shared.isIdleTimerDisabled = webView.url?.path.hasSuffix("v03.html") == true
        webView.evaluateJavaScript("window.dispatchEvent(new Event('hud-foreground'))", completionHandler: nil)
        if webView.url?.path.hasSuffix("/v03.html") == true {
            do { _ = try midi.start() }
            catch { send(["type": "midi.error", "message": error.localizedDescription]) }
        }
    }
    private func send(_ event: [String: Any]) {
        guard let data = try? JSONSerialization.data(withJSONObject: event), let json = String(data: data, encoding: .utf8) else { return }
        webView?.evaluateJavaScript("window.MidiHudNative?.receive(\(json))", completionHandler: nil)
    }
    func webView(_ webView: WKWebView, didStartProvisionalNavigation navigation: WKNavigation!) { midi.stop() }
    func webView(_ webView: WKWebView, didFinish navigation: WKNavigation!) { becameActive() }
    func webView(_ webView: WKWebView, decidePolicyFor navigationAction: WKNavigationAction, decisionHandler: @escaping (WKNavigationActionPolicy) -> Void) {
        guard let url = navigationAction.request.url else { decisionHandler(.cancel); return }
        if url.scheme == "hud" && url.host == webHost { decisionHandler(.allow); return }
        decisionHandler(.cancel)
        // El contenido externo nunca se ejecuta con acceso al puente nativo.
        if navigationAction.navigationType == .linkActivated && url.scheme == "https" { UIApplication.shared.open(url) }
    }
    func userContentController(_ userContentController: WKUserContentController, didReceive message: WKScriptMessage, replyHandler: @escaping (Any?, String?) -> Void) {
        guard message.frameInfo.isMainFrame, message.frameInfo.securityOrigin.protocol == "hud", message.frameInfo.securityOrigin.host == webHost, let body = message.body as? [String: Any], let command = body["command"] as? String else { replyHandler(nil, "Origen no autorizado."); return }
        let payload = body["payload"] as? [String: Any] ?? [:]
        Task { @MainActor in
            do {
                let result: Any
                switch command {
                case "midi.open": result = try midi.start()
                case "midi.list": result = midi.listing()
                case "midi.select": result = try midi.select(payload["id"] as? String ?? "")
                case "midi.bluetooth":
                    _ = try midi.start()
                    portsBeforeBluetooth = Set((midi.listing()["ports"] as? [[String: Any]] ?? []).compactMap { $0["id"] as? String })
                    let controller = CABTMIDICentralViewController()
                    let navigation = UINavigationController(rootViewController: controller)
                    controller.navigationItem.rightBarButtonItem = UIBarButtonItem(barButtonSystemItem: .done, target: self, action: #selector(closeBluetooth))
                    navigation.isModalInPresentation = true
                    present(navigation, animated: true); result = true
                case "broker.request": result = try await brokerRequest(payload)
                case "broker.open":
                    guard let raw = payload["url"] as? String, let url = URL(string:raw), url.scheme == "https", url.host == "accounts.google.com", url.port == nil, url.user == nil, url.path == "/o/oauth2/v2/auth" else { throw URLError(.unsupportedURL) }
                    result = await UIApplication.shared.open(url)
                case "cloud.config": result = ["configured": drive.configured]
                case "cloud.restore": result = try await drive.restore() as Any? ?? NSNull()
                case "cloud.connect": result = try await drive.connect(presenting: self)
                case "cloud.disconnect": drive.disconnect(); result = true
                case "cloud.request": result = try await drive.request(payload)
                case "share.text":
                    guard let text = payload["text"] as? String, text.utf8.count <= 3_000_000 else { throw URLError(.dataLengthExceedsMaximum) }
                    let name = ((payload["name"] as? String ?? "MIDI-HUD.json") as NSString).lastPathComponent
                    let file = FileManager.default.temporaryDirectory.appendingPathComponent(UUID().uuidString + "-" + name)
                    try text.write(to: file, atomically: true, encoding: .utf8)
                    let share = UIActivityViewController(activityItems: [file], applicationActivities: nil)
                    share.popoverPresentationController?.sourceView = view; share.popoverPresentationController?.sourceRect = CGRect(x: view.bounds.midX, y: view.bounds.midY, width: 1, height: 1)
                    share.completionWithItemsHandler = { _, _, _, _ in try? FileManager.default.removeItem(at: file) }
                    present(share, animated: true); result = true
                default: replyHandler(nil, "Acción no disponible."); return
                }
                replyHandler(result, nil)
            } catch { replyHandler(nil, error.localizedDescription) }
        }
    }
    private var portsBeforeBluetooth = Set<String>()
    @objc private func closeBluetooth() {
        dismiss(animated: true) { [weak self] in
            guard let self = self else { return }
            do {
                let listing = try self.midi.start()
                let ports = listing["ports"] as? [[String: Any]] ?? []
                let added = ports.compactMap { $0["id"] as? String }.filter { !self.portsBeforeBluetooth.contains($0) }
                let detail = added.count == 1 ? ["id": added[0]] : [:]
                let data = try JSONSerialization.data(withJSONObject: detail)
                let json = String(decoding: data, as: UTF8.self)
                self.webView.evaluateJavaScript("window.dispatchEvent(new CustomEvent('hud-bluetooth-picker-closed', {detail: \(json)}))", completionHandler: nil)
            }
            catch { self.send(["type": "midi.error", "message": error.localizedDescription]) }
        }
    }
    func webView(_ webView: WKWebView, runJavaScriptAlertPanelWithMessage message: String, initiatedByFrame frame: WKFrameInfo, completionHandler: @escaping () -> Void) {
        let alert = UIAlertController(title: "MIDI HUD", message: message, preferredStyle: .alert)
        alert.addAction(UIAlertAction(title: "Aceptar", style: .default) { _ in completionHandler() }); present(alert, animated: true)
    }
    func webView(_ webView: WKWebView, runJavaScriptConfirmPanelWithMessage message: String, initiatedByFrame frame: WKFrameInfo, completionHandler: @escaping (Bool) -> Void) {
        let alert = UIAlertController(title: "MIDI HUD", message: message, preferredStyle: .alert)
        alert.addAction(UIAlertAction(title: "Cancelar", style: .cancel) { _ in completionHandler(false) }); alert.addAction(UIAlertAction(title: "Continuar", style: .default) { _ in completionHandler(true) }); present(alert, animated: true)
    }
    func webView(_ webView: WKWebView, runJavaScriptTextInputPanelWithPrompt prompt: String, defaultText: String?, initiatedByFrame frame: WKFrameInfo, completionHandler: @escaping (String?) -> Void) {
        let alert = UIAlertController(title: "MIDI HUD", message: prompt, preferredStyle: .alert)
        alert.addTextField { $0.text = defaultText }
        alert.addAction(UIAlertAction(title: "Cancelar", style: .cancel) { _ in completionHandler(nil) }); alert.addAction(UIAlertAction(title: "Aceptar", style: .default) { _ in completionHandler(alert.textFields?.first?.text) }); present(alert, animated: true)
    }
}
