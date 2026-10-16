import Foundation
import UIKit
import GoogleSignIn

private final class DriveRedirectPolicy: NSObject, URLSessionTaskDelegate {
    func urlSession(_ session: URLSession, task: URLSessionTask, willPerformHTTPRedirection response: HTTPURLResponse, newRequest request: URLRequest, completionHandler: @escaping (URLRequest?) -> Void) {
        completionHandler(request.url?.scheme == "https" && request.url?.host == "www.googleapis.com" ? request : nil)
    }
}

@MainActor
final class GoogleDriveService {
    private let scope = "https://www.googleapis.com/auth/drive.appdata"
    private let redirectPolicy = DriveRedirectPolicy()
    private lazy var session: URLSession = {
        let config = URLSessionConfiguration.ephemeral
        config.httpCookieStorage = nil
        config.timeoutIntervalForRequest = 15
        config.timeoutIntervalForResource = 30
        return URLSession(configuration: config, delegate: redirectPolicy, delegateQueue: nil)
    }()
    let configured: Bool
    init() {
        let clientID = Bundle.main.object(forInfoDictionaryKey: "GIDClientID") as? String ?? ""
        configured = clientID.range(of: "^[a-zA-Z0-9_-]+\\.apps\\.googleusercontent\\.com$", options: .regularExpression) != nil
        if configured { GIDSignIn.sharedInstance.configuration = GIDConfiguration(clientID: clientID) }
    }
    private func problem(_ message: String) -> Error { NSError(domain: "MIDI HUD Drive", code: 1, userInfo: [NSLocalizedDescriptionKey: message]) }
    private func requireConfiguration() throws {
        if !configured { throw problem("La conexión con Drive todavía necesita configurarse para esta instalación.") }
    }
    func restore() async throws -> [String: String]? {
        if !configured || !GIDSignIn.sharedInstance.hasPreviousSignIn() { return nil }
        let user: GIDGoogleUser = try await withCheckedThrowingContinuation { continuation in
            GIDSignIn.sharedInstance.restorePreviousSignIn { user, error in
                if let error = error { continuation.resume(throwing: error) }
                else if let user = user { continuation.resume(returning: user) }
                else { continuation.resume(throwing: self.problem("Vuelve a conectar tu cuenta de Google.")) }
            }
        }
        return try account(user)
    }
    func connect(presenting: UIViewController) async throws -> [String: String] {
        try requireConfiguration()
        let user: GIDGoogleUser = try await withCheckedThrowingContinuation { continuation in
            GIDSignIn.sharedInstance.signIn(withPresenting: presenting, hint: nil, additionalScopes: [scope]) { result, error in
                if let error = error { continuation.resume(throwing: error) }
                else if let result = result { continuation.resume(returning: result.user) }
                else { continuation.resume(throwing: self.problem("Conexión cancelada.")) }
            }
        }
        return try account(user)
    }
    private func account(_ user: GIDGoogleUser) throws -> [String: String] {
        guard user.grantedScopes?.contains(scope) == true else { throw problem("Autoriza a MIDI HUD a guardar sus datos en Drive.") }
        guard let id = user.userID, let email = user.profile?.email else { throw problem("Google no devolvió una cuenta válida.") }
        return ["id": id, "email": email]
    }
    func disconnect() { if configured { GIDSignIn.sharedInstance.signOut() } }
    func request(_ payload: [String: Any]) async throws -> Any {
        try requireConfiguration()
        guard let method = payload["method"] as? String, ["GET", "POST"].contains(method), let path = payload["path"] as? String else { throw problem("Petición a Drive no permitida.") }
        let isFilePath = path.range(of: "^/drive/v3/files(/[a-zA-Z0-9_-]+)?$", options: .regularExpression) != nil
        guard isFilePath || path == "/upload/drive/v3/files", method != "POST" || path == "/upload/drive/v3/files" else { throw problem("Solo se pueden leer o añadir versiones de MIDI HUD.") }
        guard let current = GIDSignIn.sharedInstance.currentUser else { throw problem("Conecta tu cuenta de Google.") }
        let user: GIDGoogleUser = try await withCheckedThrowingContinuation { continuation in
            current.refreshTokensIfNeeded { user, error in
                if let error = error { continuation.resume(throwing: error) }
                else if let user = user { continuation.resume(returning: user) }
                else { continuation.resume(throwing: self.problem("Vuelve a conectar tu cuenta de Google.")) }
            }
        }
        _ = try account(user)
        var components = URLComponents(string: "https://www.googleapis.com" + path)!
        if let query = payload["query"] as? [String: String] { components.queryItems = query.sorted { $0.key < $1.key }.map { URLQueryItem(name: $0.key, value: $0.value) } }
        var request = URLRequest(url: components.url!)
        request.httpMethod = method
        request.setValue("Bearer " + user.accessToken.tokenString, forHTTPHeaderField: "Authorization")
        if let headers = payload["headers"] as? [String: String] {
            for (key, value) in headers {
                guard key.lowercased() == "content-type" else { throw problem("Cabecera no permitida.") }
                request.setValue(value, forHTTPHeaderField: key)
            }
        }
        if let body = payload["body"] as? String {
            guard let data = body.data(using: .utf8), data.count <= 3_000_000 else { throw problem("La petición supera el tamaño permitido.") }
            request.httpBody = data
        }
        let (data, response) = try await session.data(for: request)
        guard data.count <= 3_000_000, let http = response as? HTTPURLResponse else { throw problem("Respuesta inválida de Drive.") }
        guard (200..<300).contains(http.statusCode) else {
            throw problem(http.statusCode == 401 ? "Vuelve a conectar tu cuenta de Google." : "Drive no pudo completar la sincronización (\(http.statusCode)). Tus datos locales se conservan.")
        }
        return try JSONSerialization.jsonObject(with: data)
    }
}
