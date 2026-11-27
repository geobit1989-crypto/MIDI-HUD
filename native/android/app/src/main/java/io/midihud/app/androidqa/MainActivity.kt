package io.midihud.app.androidqa

import android.Manifest
import android.annotation.SuppressLint
import android.app.Activity
import android.app.AlertDialog
import android.bluetooth.BluetoothDevice
import android.bluetooth.BluetoothManager
import android.bluetooth.le.ScanCallback
import android.bluetooth.le.ScanResult
import android.bluetooth.le.BluetoothLeScanner
import android.content.Intent
import android.content.pm.PackageManager
import android.net.Uri
import android.os.Build
import android.os.Bundle
import android.os.Handler
import android.os.Looper
import android.os.ParcelUuid
import android.view.WindowManager
import android.webkit.ValueCallback
import android.webkit.WebChromeClient
import android.webkit.WebResourceRequest
import android.webkit.WebResourceResponse
import android.webkit.WebView
import android.webkit.WebViewClient
import android.widget.TextView
import androidx.webkit.JavaScriptReplyProxy
import androidx.webkit.WebViewAssetLoader
import androidx.webkit.WebViewCompat
import androidx.webkit.WebViewFeature
import org.json.JSONObject
import java.io.ByteArrayInputStream
import java.net.URL
import javax.net.ssl.HttpsURLConnection

@SuppressLint("SetJavaScriptEnabled", "MissingPermission")
class MainActivity : Activity() {
    private val handler = Handler(Looper.getMainLooper())
    private lateinit var web: WebView
    private lateinit var midi: MidiInput
    private var eventProxy: JavaScriptReplyProxy? = null
    private var picker: ValueCallback<Array<Uri>>? = null
    private var export: Pair<String, (Result<Any?>) -> Unit>? = null
    private var bluetoothReply: ((Result<Any?>) -> Unit)? = null
    private var scanner: BluetoothLeScanner? = null
    private var scanCallback: ScanCallback? = null
    private var scanDialog: AlertDialog? = null
    private val midiUuid = ParcelUuid.fromString("03b80e5a-ede8-4b33-a751-6ce34ec4c700")
    private var destroyed = false

    override fun onCreate(state: Bundle?) {
        super.onCreate(state)
        if (!WebViewFeature.isFeatureSupported(WebViewFeature.WEB_MESSAGE_LISTENER) ||
            !WebViewFeature.isFeatureSupported(WebViewFeature.DOCUMENT_START_SCRIPT)) {
            setContentView(TextView(this).apply { text = "Actualiza Android System WebView para usar MIDI HUD de forma segura." })
            return
        }
        midi = MidiInput(this) { event ->
            runCatching { eventProxy?.postMessage(JSONObject().put("kind", "event").put("event", event).toString()) }
        }
        web = WebView(this)
        // Explicit MIME types are required for ES modules on Android WebView.
        val loader = WebViewAssetLoader.Builder()
            .addPathHandler(HudPolicy.PATH) { path ->
                if (path.isEmpty() || path.split('/').any { it == ".." || it == "." } || path.contains('\\')) {
                    null
                } else {
                    val mime = when (path.substringAfterLast('.', "").lowercase()) {
                        "html" -> "text/html"
                        "js", "mjs" -> "text/javascript"
                        "css" -> "text/css"
                        "json" -> "application/json"
                        "svg" -> "image/svg+xml"
                        "png" -> "image/png"
                        "jpg", "jpeg" -> "image/jpeg"
                        "md", "txt" -> "text/plain"
                        else -> "application/octet-stream"
                    }
                    try {
                        WebResourceResponse(mime,
                            if (mime.startsWith("text/") || mime == "application/json" || mime == "image/svg+xml") "UTF-8" else null,
                            assets.open(path))
                    } catch (_: java.io.IOException) { null }
                }
            }.build()
        web.settings.apply {
            javaScriptEnabled = true
            domStorageEnabled = true
            allowFileAccess = false
            allowContentAccess = false
            javaScriptCanOpenWindowsAutomatically = false
            mixedContentMode = android.webkit.WebSettings.MIXED_CONTENT_NEVER_ALLOW
        }
        web.setOnApplyWindowInsetsListener { view, insets ->
            @Suppress("DEPRECATION")
            view.setPadding(insets.systemWindowInsetLeft, insets.systemWindowInsetTop,
                insets.systemWindowInsetRight, insets.systemWindowInsetBottom)
            insets
        }
        web.webViewClient = object : WebViewClient() {
            override fun shouldInterceptRequest(view: WebView, request: WebResourceRequest): WebResourceResponse {
                if (HudPolicy.isLocal(request.url.toString())) {
                    // Web pages have links to directory index entries.
                    val local = if (request.url.path?.endsWith("/") == true)
                        request.url.buildUpon().appendPath("index.html").build() else request.url
                    loader.shouldInterceptRequest(local)?.let { return it }
                }
                return WebResourceResponse("text/plain", "UTF-8", 403, "Blocked",
                    emptyMap(), ByteArrayInputStream("Blocked".toByteArray()))
            }
            override fun shouldOverrideUrlLoading(view: WebView, request: WebResourceRequest): Boolean =
                !HudPolicy.isLocal(request.url.toString())
            override fun onPageStarted(view: WebView, url: String, favicon: android.graphics.Bitmap?) {
                eventProxy = null
                if (!HudPolicy.isLocal(url)) view.stopLoading()
                updateScreen(url)
            }
            override fun onPageFinished(view: WebView, url: String) { updateScreen(url) }
        }
        web.webChromeClient = object : WebChromeClient() {
            override fun onShowFileChooser(view: WebView, callback: ValueCallback<Array<Uri>>, params: FileChooserParams): Boolean {
                picker?.onReceiveValue(null); picker = callback
                val intent = Intent(Intent.ACTION_OPEN_DOCUMENT).addCategory(Intent.CATEGORY_OPENABLE).setType("*/*")
                try { startActivityForResult(intent, 51) } catch (_: Exception) { picker?.onReceiveValue(null); picker = null }
                return true
            }
        }
        WebViewCompat.addWebMessageListener(web, "MidiHudAndroidHost", setOf(HudPolicy.ORIGIN)) { view, message, source, mainFrame, proxy ->
            if (!mainFrame || source.toString().trimEnd('/') != HudPolicy.ORIGIN || !HudPolicy.isLocal(view.url)) return@addWebMessageListener
            eventProxy = proxy
            val raw = message.data ?: return@addWebMessageListener
            if (raw.length > 3_200_000) return@addWebMessageListener
            val request = runCatching { JSONObject(raw) }.getOrNull() ?: return@addWebMessageListener
            val id = request.optString("id")
            if (!id.matches(Regex("[0-9]{1,18}"))) return@addWebMessageListener
            var answered = false
            fun reply(result: Result<Any?>) {
                if (answered) return
                answered = true
                val response = JSONObject().put("kind", "reply").put("id", id)
                result.fold({ response.put("result", it ?: JSONObject.NULL) },
                    { response.put("error", it.message ?: "Error del servicio nativo.") })
                runCatching { proxy.postMessage(response.toString()) }
            }
            try { dispatch(request.optString("command"), request.optJSONObject("payload") ?: JSONObject(), ::reply) }
            catch (e: Exception) { reply(Result.failure(e)) }
        }
        val bridge = assets.open("core/native-bridge.js").bufferedReader().use { it.readText() }
        WebViewCompat.addDocumentStartJavaScript(web,
            "if (window === window.top && location.pathname.startsWith('/android-qa/')) {\n$bridge\n}",
            setOf(HudPolicy.ORIGIN))
        setContentView(web)
        web.loadUrl(HudPolicy.ORIGIN + HudPolicy.PATH + "index.html")
    }
    private fun updateScreen(url: String) {
        if (Uri.parse(url).path?.endsWith("/v03.html") == true)
            window.addFlags(WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON)
        else window.clearFlags(WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON)
    }
    private fun brokerRequest(payload: JSONObject, reply: (Result<Any?>) -> Unit) {
        Thread {
            val result = runCatching {
                val path = payload.getString("path")
                val method = payload.getString("method")
                require(HudPolicy.brokerPath(path, method)) { "Ruta de sincronización no permitida." }
                val token = if (payload.isNull("token")) "" else payload.optString("token", "")
                require(token.isEmpty() || token.matches(Regex("[A-Za-z0-9_-]{64}")))
                val c = URL("https://midihudaut.midihudapp.workers.dev" + path).openConnection() as HttpsURLConnection
                try {
                    c.instanceFollowRedirects = false
                    c.connectTimeout = 12000; c.readTimeout = 18000
                    c.requestMethod = method
                    c.setRequestProperty("Origin", HudPolicy.ORIGIN)
                    c.setRequestProperty("Content-Type", "application/json")
                    if (token.isNotEmpty()) c.setRequestProperty("Authorization", "Bearer " + token)
                    if (method == "POST") {
                        val bytes = (payload.optJSONObject("body") ?: JSONObject()).toString().toByteArray(Charsets.UTF_8)
                        require(bytes.size <= 3_200_000)
                        c.doOutput = true; c.outputStream.use { it.write(bytes) }
                    }
                    val status = c.responseCode
                    val stream = if (status in 200..299) c.inputStream else c.errorStream
                    val data = stream?.use { input ->
                        val out = java.io.ByteArrayOutputStream(); val buffer = ByteArray(8192)
                        while (true) { val n = input.read(buffer); if (n < 0) break; require(out.size() + n <= 3_200_000); out.write(buffer,0,n) }
                        JSONObject(out.toString("UTF-8"))
                    } ?: JSONObject().put("error","invalid_response")
                    JSONObject().put("status",status).put("data",data)
                } finally { c.disconnect() }
            }
            handler.post { reply(result) }
        }.start()
    }
    private fun dispatch(command: String, payload: JSONObject, reply: (Result<Any?>) -> Unit) {
        require(command in HudPolicy.commands) { "Acción no disponible." }
        when (command) {
            "midi.open" -> { midi.start(); reply(Result.success(midi.list())) }
            "midi.list" -> { midi.start(); reply(Result.success(midi.list())) }
            "midi.select" -> {
                check(bluetoothReply == null) { "Espera a que termine la conexión Bluetooth." }
                midi.select(payload.optString("id")) { reply(it) }
            }
            "midi.bluetooth" -> beginBluetooth(reply)
            "broker.request" -> brokerRequest(payload, reply)
            "broker.open" -> {
                val url = Uri.parse(payload.getString("url"))
                require(url.scheme == "https" && url.host == "accounts.google.com" && url.port == -1 && url.userInfo == null && url.path == "/o/oauth2/v2/auth")
                startActivity(Intent(Intent.ACTION_VIEW,url))
                reply(Result.success(true))
            }
            "cloud.config" -> reply(Result.success(JSONObject().put("configured", false)))
            "cloud.restore" -> reply(Result.success(null))
            "cloud.disconnect" -> reply(Result.success(true))
            "cloud.connect", "cloud.request" -> reply(Result.failure(IllegalStateException("Google Drive todavía no está configurado en Android QA.")))
            "share.text" -> {
                check(export == null) { "Ya hay una exportación en curso." }
                val text = payload.getString("text")
                require(text.toByteArray(Charsets.UTF_8).size <= 3_000_000) { "Archivo demasiado grande." }
                export = text to reply
                try {
                    startActivityForResult(Intent(Intent.ACTION_CREATE_DOCUMENT).addCategory(Intent.CATEGORY_OPENABLE)
                        .setType("application/json").putExtra(Intent.EXTRA_TITLE, HudPolicy.fileName(payload.optString("name"))), 52)
                } catch (e: Exception) { export = null; reply(Result.failure(e)) }
            }
        }
    }
    private fun permissions(): Array<String> =
        if (Build.VERSION.SDK_INT >= 31) arrayOf(Manifest.permission.BLUETOOTH_SCAN, Manifest.permission.BLUETOOTH_CONNECT)
        else arrayOf(Manifest.permission.ACCESS_FINE_LOCATION)
    private fun beginBluetooth(reply: (Result<Any?>) -> Unit) {
        check(bluetoothReply == null) { "Ya hay una búsqueda Bluetooth en curso." }
        bluetoothReply = reply
        val missing = permissions().filter { checkSelfPermission(it) != PackageManager.PERMISSION_GRANTED }
        if (missing.isNotEmpty()) requestPermissions(missing.toTypedArray(), 53)
        else scan()
    }
    override fun onRequestPermissionsResult(requestCode: Int, permissions: Array<String>, results: IntArray) {
        super.onRequestPermissionsResult(requestCode, permissions, results)
        if (requestCode == 53 && bluetoothReply != null) {
            if (results.isNotEmpty() && results.all { it == PackageManager.PERMISSION_GRANTED }) scan()
            else finishBluetooth(Result.failure(IllegalStateException("Permiso Bluetooth denegado.")))
        }
    }
    private fun stopScan() {
        val callback = scanCallback
        if (callback != null) runCatching { scanner?.stopScan(callback) }
        scanCallback = null; scanner = null
    }
    private fun finishBluetooth(result: Result<Any?>) {
        stopScan(); scanDialog?.dismiss(); scanDialog = null
        val reply = bluetoothReply; bluetoothReply = null; reply?.invoke(result)
    }
    private fun scan() {
        try {
            val adapter = getSystemService(BluetoothManager::class.java)?.adapter
            check(adapter != null && adapter.isEnabled) { "Activa Bluetooth en Android." }
            val scan = adapter.bluetoothLeScanner ?: error("Escáner BLE no disponible.")
            val found = linkedMapOf<String, Pair<String, BluetoothDevice>>()
            val cb = object : ScanCallback() {
                override fun onScanResult(callbackType: Int, result: ScanResult) {
                    val name = result.scanRecord?.deviceName ?: runCatching { result.device.name }.getOrNull() ?: ""
                    if (result.scanRecord?.serviceUuids?.contains(midiUuid) == true ||
                        name.startsWith("FootCtrl", true) || name.startsWith("GAM-10", true))
                        found[result.device.address] = (name.ifBlank { "BLE MIDI" }) to result.device
                }
                override fun onScanFailed(errorCode: Int) {
                    handler.post { finishBluetooth(Result.failure(IllegalStateException("Error de escaneo BLE: $errorCode"))) }
                }
            }
            scanner = scan; scanCallback = cb
            scanDialog = AlertDialog.Builder(this).setTitle("Buscando dispositivos MIDI Bluetooth")
                .setMessage("Enciende el Chocolate Plus en modo U.").setNegativeButton("Cancelar") { _, _ ->
                    finishBluetooth(Result.failure(IllegalStateException("Búsqueda cancelada.")))
                }.setOnCancelListener { finishBluetooth(Result.failure(IllegalStateException("Búsqueda cancelada."))) }.show()
            scan.startScan(cb)
            handler.postDelayed({
                if (scanCallback !== cb || destroyed) return@postDelayed
                stopScan(); scanDialog?.dismiss(); scanDialog = null
                val candidates = found.values.toList()
                if (candidates.isEmpty()) finishBluetooth(Result.failure(IllegalStateException("No se detectó ningún dispositivo BLE MIDI.")))
                else {
                    var selected = -1
                    val picker = AlertDialog.Builder(this).setTitle("Dispositivos MIDI Bluetooth")
                        .setSingleChoiceItems(candidates.map { it.first }.toTypedArray(), -1) { dialog, index ->
                            selected = index
                            (dialog as AlertDialog).getButton(AlertDialog.BUTTON_POSITIVE).isEnabled = true
                        }.setPositiveButton("Conectar") { _, _ ->
                            scanDialog = null
                            try { midi.openBluetooth(candidates[selected].second) { finishBluetooth(it) } }
                            catch (e: Exception) { finishBluetooth(Result.failure(e)) }
                        }.setNegativeButton("Cancelar") { _, _ -> finishBluetooth(Result.failure(IllegalStateException("Selección cancelada."))) }
                        .setOnCancelListener { finishBluetooth(Result.failure(IllegalStateException("Selección cancelada."))) }.show()
                    picker.getButton(AlertDialog.BUTTON_POSITIVE).isEnabled = false
                    scanDialog = picker
                }
            }, 8000)
        } catch (e: Exception) { finishBluetooth(Result.failure(e)) }
    }
    @Deprecated("Legacy activity result used for the system document picker")
    override fun onActivityResult(requestCode: Int, resultCode: Int, data: Intent?) {
        super.onActivityResult(requestCode, resultCode, data)
        if (requestCode == 51) {
            val uri = data?.data
            picker?.onReceiveValue(if (resultCode == RESULT_OK && uri != null) arrayOf(uri) else null)
            picker = null
        } else if (requestCode == 52) {
            val job = export ?: return
            export = null
            val uri = data?.data
            if (resultCode != RESULT_OK || uri == null) job.second(Result.failure(IllegalStateException("Exportación cancelada.")))
            else try {
                val stream = contentResolver.openOutputStream(uri, "wt") ?: error("No se pudo abrir el archivo.")
                stream.use { it.write(job.first.toByteArray(Charsets.UTF_8)) }
                job.second(Result.success(true))
            } catch (e: Exception) { job.second(Result.failure(e)) }
        }
    }
    override fun onResume() {
        super.onResume()
        if (::midi.isInitialized) runCatching { midi.refresh() }
        if (::web.isInitialized) web.evaluateJavascript("window.dispatchEvent(new Event('hud-foreground'))", null)
    }
    override fun onDestroy() {
        destroyed = true
        finishBluetooth(Result.failure(IllegalStateException("Aplicación cerrada.")))
        picker?.onReceiveValue(null); picker = null
        export?.second?.invoke(Result.failure(IllegalStateException("Aplicación cerrada."))); export = null
        handler.removeCallbacksAndMessages(null)
        if (::midi.isInitialized) midi.close()
        eventProxy = null
        if (::web.isInitialized) web.destroy()
        super.onDestroy()
    }
}
