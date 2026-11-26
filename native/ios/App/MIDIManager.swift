import Foundation
import CoreMIDI
import Darwin

final class MIDIManager {
    private var client = MIDIClientRef()
    private var input = MIDIPortRef()
    private var connected = Set<MIDIEndpointRef>()
    private var parsers: [MIDIEndpointRef: MIDIByteParser] = [:]
    private var selected: String { UserDefaults.standard.string(forKey: "selectedMIDIInput") ?? "" }
    var onEvent: (([String: Any]) -> Void)?

    private func check(_ code: OSStatus) throws {
        if code != noErr { throw NSError(domain: "MIDI HUD", code: Int(code), userInfo: [NSLocalizedDescriptionKey: "No se pudo abrir Core MIDI (\(code))."]) }
    }
    func start() throws -> [String: Any] {
        if client == 0 {
            try check(MIDIClientCreateWithBlock("MIDI HUD" as CFString, &client) { [weak self] _ in
                DispatchQueue.main.async { _ = try? self?.refresh() }
            })
        }
        if input == 0 {
            try check(MIDIInputPortCreateWithBlock(client, "Entrada MIDI HUD" as CFString, &input) { [weak self] list, context in
                guard let context = context else { return }
                let endpoint = MIDIEndpointRef(UInt(bitPattern: context))
                let offset = MemoryLayout<MIDIPacketList>.offset(of: \MIDIPacketList.packet)!
                var pointer = UnsafeRawPointer(list).advanced(by: offset).assumingMemoryBound(to: MIDIPacket.self)
                for _ in 0..<list.pointee.numPackets {
                    let dataOffset = MemoryLayout<MIDIPacket>.offset(of: \MIDIPacket.data)!
                    let data = UnsafeRawPointer(pointer).advanced(by: dataOffset).assumingMemoryBound(to: UInt8.self)
                    let bytes = Array(UnsafeBufferPointer(start: data, count: Int(pointer.pointee.length)))
                    let hostTime = pointer.pointee.timeStamp == 0 ? mach_absolute_time() : pointer.pointee.timeStamp
                    var info = mach_timebase_info_data_t(); mach_timebase_info(&info)
                    let milliseconds = Double(hostTime) * Double(info.numer) / Double(info.denom) / 1_000_000
                    DispatchQueue.main.async { self?.receive(bytes, from: endpoint, timestamp: milliseconds) }
                    pointer = UnsafePointer(MIDIPacketNext(pointer))
                }
            })
        }
        return try refresh()
    }
    private func identifier(_ endpoint: MIDIEndpointRef) -> String {
        var value: Int32 = 0
        if MIDIObjectGetIntegerProperty(endpoint, kMIDIPropertyUniqueID, &value) == noErr { return String(value) }
        return "endpoint-\(endpoint)"
    }
    private func name(_ endpoint: MIDIEndpointRef) -> String {
        var value: Unmanaged<CFString>?
        if MIDIObjectGetStringProperty(endpoint, kMIDIPropertyDisplayName, &value) == noErr, let value = value { return value.takeRetainedValue() as String }
        return "Entrada MIDI \(endpoint)"
    }
    private func sources() -> [MIDIEndpointRef] {
        (0..<MIDIGetNumberOfSources()).map { MIDIGetSource($0) }.filter { $0 != 0 }
    }
    private func transport(_ endpoint: MIDIEndpointRef) -> String {
        var entity: MIDIEntityRef = 0
        var device: MIDIDeviceRef = 0
        _ = MIDIEndpointGetEntity(endpoint, &entity)
        if entity != 0 { _ = MIDIEntityGetDevice(entity, &device) }
        for object in [endpoint, entity, device] where object != 0 {
            var owner: Unmanaged<CFString>?
            if MIDIObjectGetStringProperty(object, kMIDIPropertyDriverOwner, &owner) == noErr,
               let driver = owner?.takeRetainedValue() as String?,
               driver.localizedCaseInsensitiveContains("Bluetooth") { return "bluetooth" }
        }
        return "unknown"
    }
    func listing() -> [String: Any] {
        let ports: [[String: Any]] = sources().map { endpoint in
            ["id": identifier(endpoint), "name": name(endpoint), "connected": connected.contains(endpoint), "transport": transport(endpoint)]
        }
        return ["ports": ports, "selected": selected, "connectedCount": connected.count]
    }
    func select(_ id: String) throws -> [String: Any] {
        // Nunca seleccionar una fuente sin inicializar primero el puerto Core MIDI.
        _ = try start()
        if id != "__hud_disconnected__" && !id.isEmpty && !sources().contains(where: { identifier($0) == id }) {
            throw NSError(domain: "MIDI HUD", code: 1, userInfo: [NSLocalizedDescriptionKey: "La entrada MIDI ya no está disponible."])
        }
        let previous = selected
        UserDefaults.standard.set(id, forKey: "selectedMIDIInput")
        do { return try refresh() }
        catch {
            UserDefaults.standard.set(previous, forKey: "selectedMIDIInput")
            _ = try? refresh()
            throw error
        }
    }
    @discardableResult
    func refresh() throws -> [String: Any] {
        guard input != 0 else { return listing() }
        let found = sources()
        // Un nuevo emparejamiento BLE puede asignar otro identificador.
        if selected != "__hud_disconnected__" && !selected.isEmpty && found.count == 1 && !found.contains(where: { identifier($0) == selected }) {
            UserDefaults.standard.set("", forKey: "selectedMIDIInput")
        }
        let available = Set(found.filter { selected.isEmpty || identifier($0) == selected })
        for source in connected.subtracting(available) {
            MIDIPortDisconnectSource(input, source)
            connected.remove(source)
            parsers.removeValue(forKey: source)
        }
        var failures: [String] = []
        for source in available.subtracting(connected) {
            let code = MIDIPortConnectSource(input, source, UnsafeMutableRawPointer(bitPattern: Int(source)))
            if code == noErr { connected.insert(source) }
            else { failures.append("\(name(source)): Core MIDI \(code)") }
        }
        var event = listing()
        event["type"] = "midi.ports"
        onEvent?(event)
        if !failures.isEmpty {
            let message = "No se pudo abrir la entrada MIDI: " + failures.joined(separator: "; ")
            onEvent?(["type": "midi.error", "message": message])
            throw NSError(domain: "MIDI HUD", code: 2, userInfo: [NSLocalizedDescriptionKey: message])
        }
        return listing()
    }
    private func receive(_ bytes: [UInt8], from source: MIDIEndpointRef, timestamp: Double) {
        guard connected.contains(source) else { return }
        var parser = parsers[source] ?? MIDIByteParser()
        let messages = parser.consume(bytes); parsers[source] = parser
        for message in messages { onEvent?(["type": "midi.message", "portId": identifier(source), "data": message.map(Int.init), "timestampMs": timestamp]) }
    }
    func stop() {
        if input != 0 { MIDIPortDispose(input); input = 0 }
        connected.removeAll(); parsers.removeAll()
    }
    deinit { stop(); if client != 0 { MIDIClientDispose(client) } }
}
