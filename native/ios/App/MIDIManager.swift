import Foundation
import CoreMIDI

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
                DispatchQueue.main.async { self?.refresh() }
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
                    DispatchQueue.main.async { self?.receive(bytes, from: endpoint) }
                    pointer = UnsafePointer(MIDIPacketNext(pointer))
                }
            })
        }
        refresh()
        return listing()
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
    func listing() -> [String: Any] {
        ["ports": sources().map { ["id": identifier($0), "name": name($0)] }, "selected": selected]
    }
    func select(_ id: String) throws -> [String: Any] {
        if !id.isEmpty && !sources().contains(where: { identifier($0) == id }) { throw NSError(domain: "MIDI HUD", code: 1, userInfo: [NSLocalizedDescriptionKey: "La entrada MIDI ya no está conectada."]) }
        UserDefaults.standard.set(id, forKey: "selectedMIDIInput")
        refresh(); return listing()
    }
    private func refresh() {
        guard input != 0 else { return }
        let available = Set(sources().filter { selected.isEmpty || identifier($0) == selected })
        for source in connected.subtracting(available) {
            MIDIPortDisconnectSource(input, source); connected.remove(source); parsers.removeValue(forKey: source)
        }
        for source in available.subtracting(connected) {
            if MIDIPortConnectSource(input, source, UnsafeMutableRawPointer(bitPattern: Int(source))) == noErr { connected.insert(source) }
        }
        var event = listing(); event["type"] = "midi.ports"; onEvent?(event)
    }
    private func receive(_ bytes: [UInt8], from source: MIDIEndpointRef) {
        guard connected.contains(source) else { return }
        var parser = parsers[source] ?? MIDIByteParser()
        let messages = parser.consume(bytes); parsers[source] = parser
        for message in messages { onEvent?(["type": "midi.message", "portId": identifier(source), "data": message.map(Int.init)]) }
    }
    func stop() {
        if input != 0 { MIDIPortDispose(input); input = 0 }
        connected.removeAll(); parsers.removeAll()
    }
    deinit { stop(); if client != 0 { MIDIClientDispose(client) } }
}
