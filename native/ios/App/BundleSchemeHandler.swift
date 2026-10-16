import Foundation
import WebKit

final class BundleSchemeHandler: NSObject, WKURLSchemeHandler {
    private let root: URL
    init(root: URL) { self.root = root.standardizedFileURL.resolvingSymlinksInPath(); super.init() }
    func webView(_ webView: WKWebView, start urlSchemeTask: WKURLSchemeTask) {
        guard let url = urlSchemeTask.request.url, url.scheme == "hud", url.host == "localhost" else { urlSchemeTask.didFailWithError(URLError(.unsupportedURL)); return }
        let path = url.path == "/" ? "index.html" : String(url.path.dropFirst())
        let file = root.appendingPathComponent(path).standardizedFileURL.resolvingSymlinksInPath()
        guard file.path.hasPrefix(root.path + "/"), let data = try? Data(contentsOf: file) else { urlSchemeTask.didFailWithError(URLError(.fileDoesNotExist)); return }
        let types = ["html":"text/html", "js":"application/javascript", "mjs":"application/javascript", "css":"text/css", "json":"application/json", "svg":"image/svg+xml", "png":"image/png", "ico":"image/x-icon", "txt":"text/plain"]
        let mime = types[file.pathExtension] ?? "application/octet-stream"
        let headers = ["Content-Type": mime + (mime.hasPrefix("text/") || mime.contains("javascript") || mime.contains("json") ? "; charset=utf-8" : ""), "Access-Control-Allow-Origin":"hud://localhost", "Cache-Control":"no-store", "Content-Security-Policy":"default-src 'self' data: blob:; script-src 'self' 'unsafe-inline'; style-src 'self' 'unsafe-inline'; connect-src 'self' blob:; img-src 'self' data: blob:"]
        let response = HTTPURLResponse(url: url, statusCode: 200, httpVersion: "HTTP/1.1", headerFields: headers)!
        urlSchemeTask.didReceive(response); urlSchemeTask.didReceive(data); urlSchemeTask.didFinish()
    }
    func webView(_ webView: WKWebView, stop urlSchemeTask: WKURLSchemeTask) {}
}
