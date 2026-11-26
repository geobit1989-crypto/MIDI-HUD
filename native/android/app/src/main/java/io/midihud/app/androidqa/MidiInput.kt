package io.midihud.app.androidqa

import android.annotation.SuppressLint
import android.bluetooth.BluetoothDevice
import android.bluetooth.BluetoothManager
import android.content.Context
import android.media.midi.MidiDevice
import android.media.midi.MidiDeviceInfo
import android.media.midi.MidiManager
import android.media.midi.MidiOutputPort
import android.media.midi.MidiReceiver
import android.os.Handler
import android.os.Looper
import org.json.JSONArray
import org.json.JSONObject

/** One receive-only MIDI 1.0 port. Android output ports send data TO this application. */
@SuppressLint("MissingPermission")
internal class MidiInput(context: Context, private val emit: (JSONObject) -> Unit) {
    private val preferences = context.getSharedPreferences("midi_connection", Context.MODE_PRIVATE)
    private val adapter = context.getSystemService(BluetoothManager::class.java)?.adapter
    private val reconnect = Runnable {
        val address = preferences.getString("bluetooth", null)
        if (address != null && !disposed && !connectingBluetooth) {
            val remote = runCatching { adapter?.takeIf { it.isEnabled }?.getRemoteDevice(address) }.getOrNull()
            if (remote == null) scheduleReconnect()
            else openBluetooth(remote, remember = false) { if (it.isFailure) scheduleReconnect() }
        }
    }
    private fun scheduleReconnect() {
        main.removeCallbacks(reconnect)
        if (preferences.contains("bluetooth") && !disposed) main.postDelayed(reconnect, 4000)
    }
    private val manager = context.getSystemService(MidiManager::class.java)
    private val main = Handler(Looper.getMainLooper())
    private val bluetooth = mutableMapOf<Int, MidiDevice>()
    private var device: MidiDevice? = null
    private var output: MidiOutputPort? = null
    private var receiver: MidiReceiver? = null
    private var generation = 0
    private var selected = ""
    private var active = ""
    private var disposed = false
    private var listening = false
    private var connectingBluetooth = false
    private val callback = object : MidiManager.DeviceCallback() {
        override fun onDeviceAdded(info: MidiDeviceInfo) { if (!connectingBluetooth) publish() }
        override fun onDeviceRemoved(info: MidiDeviceInfo) {
            if (device?.info?.id == info.id) { generation++; closePort(); selected = ""; scheduleReconnect() }
            bluetooth.remove(info.id)?.let { runCatching { it.close() } }
            publish()
        }
    }
    fun start() {
        check(!disposed) { "Sesión MIDI cerrada." }
        check(manager != null) { "Este dispositivo no ofrece Android MIDI." }
        if (!listening) { manager.registerDeviceCallback(callback, main); listening = true; scheduleReconnect() }
    }
    @Suppress("DEPRECATION")
    private fun devices(): List<MidiDeviceInfo> =
        ((manager?.devices?.toList() ?: emptyList()) + bluetooth.values.map { it.info }).distinctBy { it.id }
    private fun id(info: MidiDeviceInfo, port: Int): String {
        val serial = info.properties.getString(MidiDeviceInfo.PROPERTY_SERIAL_NUMBER)
        if (info.type == MidiDeviceInfo.TYPE_USB && !serial.isNullOrBlank()) {
            val manufacturer = info.properties.getString(MidiDeviceInfo.PROPERTY_MANUFACTURER)
            val product = info.properties.getString(MidiDeviceInfo.PROPERTY_PRODUCT)
            return "usb:$manufacturer:$product:$serial:$port"
        }
        return "${info.id}:$port"
    }
    fun list(): JSONObject {
        val ports = JSONArray()
        devices().forEach { info ->
            info.ports.filter { it.type == MidiDeviceInfo.PortInfo.TYPE_OUTPUT }.forEach { p ->
                val key = id(info, p.portNumber)
                val name = info.properties.getString(MidiDeviceInfo.PROPERTY_NAME) ?: "MIDI ${info.id}"
                ports.put(JSONObject().put("id", key).put("name", if (info.outputPortCount > 1) "$name / ${p.portNumber + 1}" else name)
                    .put("connected", active == key)
                    .put("transport", when (info.type) {
                        MidiDeviceInfo.TYPE_BLUETOOTH -> "bluetooth"
                        MidiDeviceInfo.TYPE_USB -> "usb"
                        else -> "unknown"
                    }))
            }
        }
        return JSONObject().put("ports", ports).put("selected", selected)
    }
    private fun publish() {
        if (!disposed) emit(list().put("type", "midi.ports"))
    }
    private fun closePort() {
        val r = receiver
        if (r != null) runCatching { output?.disconnect(r) }
        runCatching { output?.close() }
        val old = device
        if (old != null && bluetooth[old.info.id] !== old) runCatching { old.close() }
        receiver = null; output = null; device = null; active = ""
    }
    fun select(key: String, done: (Result<JSONObject>) -> Unit) {
        start()
        if (key == active && key.isNotEmpty()) { done(Result.success(list())); return }
        val request = ++generation
        val disconnectedBluetooth = if (key.isEmpty()) device?.info?.id?.let { bluetooth[it] } else null
        closePort(); selected = ""
        if (key.isEmpty()) {
            preferences.edit().remove("bluetooth").apply()
            main.removeCallbacks(reconnect)
            if (disconnectedBluetooth != null) {
                bluetooth.remove(disconnectedBluetooth.info.id)
                runCatching { disconnectedBluetooth.close() }
            }
            publish()
            done(Result.success(list()))
            return
        }
        val info = devices().firstOrNull { d -> d.ports.any { it.type == MidiDeviceInfo.PortInfo.TYPE_OUTPUT && id(d, it.portNumber) == key } }
        if (info == null) { publish(); done(Result.failure(IllegalArgumentException("Entrada MIDI no disponible."))); return }
        val portNumber = key.substringAfterLast(':').toInt()
        var completed = false
        fun finish(result: Result<JSONObject>) { if (!completed) { completed = true; done(result) } }
        fun fail(message: String) {
            if (request == generation && !disposed) {
                generation++; closePort(); selected = ""; publish()
                emit(JSONObject().put("type", "midi.error").put("message", message))
            }
            finish(Result.failure(IllegalStateException(message)))
        }
        fun attach(opened: MidiDevice?) {
            if (request != generation || disposed || completed) {
                if (opened != null && bluetooth[opened.info.id] !== opened) runCatching { opened.close() }
                finish(Result.failure(IllegalStateException("Selección MIDI sustituida."))); return
            }
            if (opened == null) { fail("No se pudo abrir el dispositivo MIDI."); return }
            device = opened
            try {
                val port = opened.openOutputPort(portNumber) ?: error("No se pudo abrir el puerto MIDI.")
                output = port
                val target = object : MidiReceiver() {
                    override fun onSend(msg: ByteArray, offset: Int, count: Int, timestamp: Long) {
                        val bytes = msg.copyOfRange(offset, offset + count)
                        val ms = if (timestamp > 0) timestamp / 1_000_000.0 else System.nanoTime() / 1_000_000.0
                        main.post {
                            if (!disposed && request == generation && active == key)
                                emit(JSONObject().put("type", "midi.message").put("portId", key)
                                    .put("data", JSONArray(bytes.map { it.toInt() and 255 })).put("timestampMs", ms))
                        }
                    }
                }
                receiver = target; port.connect(target); active = key; selected = key
                finish(Result.success(list())); publish()
            } catch (e: Exception) { fail(e.message ?: "Error MIDI.") }
        }
        main.postDelayed({ if (!completed) fail("Tiempo de espera al abrir MIDI.") }, 12000)
        try {
            val existing = bluetooth[info.id]
            if (existing != null) attach(existing)
            else manager!!.openDevice(info, { attach(it) }, main)
        } catch (e: Exception) { fail(e.message ?: "Error MIDI.") }
    }
    fun openBluetooth(remote: BluetoothDevice, remember: Boolean = true, done: (Result<JSONObject>) -> Unit) {
        start()
        main.removeCallbacks(reconnect)
        var completed = false
        val request = ++generation
        connectingBluetooth = true
        closePort(); selected = ""
        fun finish(result: Result<JSONObject>) { if (!completed) { completed = true; connectingBluetooth = false; done(result); publish() } }
        main.postDelayed({ if (!completed) { if (generation == request) generation++; finish(Result.failure(IllegalStateException("Tiempo de espera Bluetooth."))) } }, 15000)
        try {
            manager!!.openBluetoothDevice(remote, { opened ->
                if (completed || disposed || generation != request) {
                    runCatching { opened?.close() }
                    finish(Result.failure(IllegalStateException("Conexión Bluetooth sustituida.")))
                } else if (opened == null) {
                    finish(Result.failure(IllegalStateException("No se pudo abrir el dispositivo BLE MIDI.")))
                } else {
                    val previous = bluetooth.put(opened.info.id, opened)
                    if (previous != null && previous !== opened) runCatching { previous.close() }
                    val first = opened.info.ports.firstOrNull { it.type == MidiDeviceInfo.PortInfo.TYPE_OUTPUT }
                    if (first == null) {
                        bluetooth.remove(opened.info.id); runCatching { opened.close() }
                        finish(Result.failure(IllegalStateException("El dispositivo BLE no ofrece salida MIDI.")))
                    } else {
                        // Complete the native selection before notifying the shared session.
                        connectingBluetooth = false
                        completed = true
                        select(id(opened.info, first.portNumber)) { result ->
                            if (result.isSuccess && remember) preferences.edit().putString("bluetooth", remote.address).apply()
                            if (result.isFailure) {
                                bluetooth.remove(opened.info.id)
                                runCatching { opened.close() }
                            }
                            done(result)
                        }
                    }
                }
            }, main)
        } catch (e: Exception) { finish(Result.failure(e)) }
    }
    fun refresh() { publish() }
    fun close() {
        disposed = true; generation++; closePort()
        if (listening) runCatching { manager?.unregisterDeviceCallback(callback) }
        bluetooth.values.forEach { runCatching { it.close() } }; bluetooth.clear()
        main.removeCallbacksAndMessages(null)
    }
}
