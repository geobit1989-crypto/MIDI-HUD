import XCTest
import WebKit
@testable import MIDIHUD

final class MIDIHUDTests: XCTestCase {
    func testRunningStatusRealtimeAndSplitPackets() {
        var parser = MIDIByteParser()
        XCTAssertEqual(parser.consume([0xB2, 20]), [])
        XCTAssertEqual(parser.consume([127, 21, 0xF8, 0]), [[0xB2, 20, 127], [0xB2, 21, 0]])
        XCTAssertEqual(parser.consume([0x90, 60, 100, 61, 0, 0xC0, 1, 0xB0, 25, 1]), [[0xB0, 25, 1]])
    }
    func testSystemMessagesNeverBecomeCC() {
        var parser = MIDIByteParser()
        XCTAssertEqual(parser.consume([0xB0, 20, 1, 0xF0, 1, 2, 0xF8, 3, 0xF7, 20, 2]), [[0xB0, 20, 1]])
        XCTAssertEqual(parser.consume([0xF2, 1, 2, 3, 0xB1, 0, 0]), [[0xB1, 0, 0]])
    }
    @MainActor
    private func until(_ condition: String, in web: WKWebView, timeout: TimeInterval = 20) async throws {
        let deadline = Date().addingTimeInterval(timeout)
        while Date() < deadline {
            if (try? await web.evaluateJavaScript(condition)) as? Bool == true { return }
            try await Task.sleep(nanoseconds: 100_000_000)
        }
        let body = (try? await web.evaluateJavaScript("document.body.innerText")) as? String ?? ""
        XCTFail("No se cumplió \(condition). \(body.prefix(1800))")
        throw NSError(domain: "MIDI HUD Tests", code: 1)
    }
    @MainActor
    func testBundledEditorSavesAndLiveReadsSameLibrary() async throws {
        let controller = HUDViewController()
        let window = UIWindow(frame: UIScreen.main.bounds)
        window.rootViewController = controller; window.makeKeyAndVisible(); controller.loadViewIfNeeded()
        let web = controller.webView!
        try await until("!!window.MIDIHUD_EDITOR", in: web)
        let midiType = try await web.evaluateJavaScript("typeof navigator.requestMIDIAccess") as? String
        XCTAssertEqual(midiType, "function")
        _ = try await web.evaluateJavaScript("document.getElementById('songTitle').value='Prueba iOS sin red'; document.getElementById('songTitle').dispatchEvent(new Event('input')); document.getElementById('songSave').click();")
        try await until("!window.MIDIHUD_EDITOR.hasDraft()", in: web)
        _ = try await web.evaluateJavaScript("document.getElementById('liveLink').click()")
        try await until("!!window.MIDIHUD_LIVE", in: web)
        let title = try await web.evaluateJavaScript("window.MIDIHUD_LIVE.getEngine().getViewModel().song.title") as? String
        XCTAssertEqual(title, "Prueba iOS sin red")
        XCTAssertEqual(web.url?.scheme, "hud")
        _ = window // Mantener visible durante toda la prueba del WKWebView real.
    }
}
