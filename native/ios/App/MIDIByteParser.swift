import Foundation

/// MIDI 1.0, con running status y mensajes de tiempo real intercalados.
/// La aplicación solo representa CC; nunca envía mensajes al hardware.
struct MIDIByteParser {
    private var status: UInt8?
    private var bytes: [UInt8] = []
    private var systemRemaining = 0
    private var inSysEx = false

    mutating func consume(_ input: [UInt8]) -> [[UInt8]] {
        var messages: [[UInt8]] = []
        for byte in input {
            if byte >= 0xF8 { continue }
            if byte & 0x80 != 0 {
                bytes.removeAll(keepingCapacity: true)
                if byte >= 0xF0 {
                    status = nil
                    inSysEx = byte == 0xF0
                    systemRemaining = byte == 0xF2 ? 2 : ([UInt8(0xF1), 0xF3].contains(byte) ? 1 : 0)
                } else {
                    inSysEx = false; systemRemaining = 0; status = byte
                }
                continue
            }
            if inSysEx { continue }
            if systemRemaining > 0 { systemRemaining -= 1; continue }
            guard let status = status else { continue }
            bytes.append(byte)
            let count = [UInt8(0xC0), 0xD0].contains(status & 0xF0) ? 1 : 2
            if bytes.count == count {
                if status & 0xF0 == 0xB0 { messages.append([status] + bytes) }
                bytes.removeAll(keepingCapacity: true)
            }
        }
        return messages
    }
}
