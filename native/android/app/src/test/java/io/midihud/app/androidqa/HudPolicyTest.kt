package io.midihud.app.androidqa

import org.junit.Assert.*
import org.junit.Test

class HudPolicyTest {
    @Test fun acceptsOnlyQaOriginAndPath() {
        assertTrue(HudPolicy.isLocal("https://appassets.androidplatform.net/android-qa/v03.html?v=1"))
        listOf("https://example.org/android-qa/v03.html",
            "https://appassets.androidplatform.net.evil.org/android-qa/v03.html",
            "http://appassets.androidplatform.net/android-qa/v03.html",
            "https://appassets.androidplatform.net/android-qa/../secret",
            "https://appassets.androidplatform.net/android-qa/%2e%2e/secret",
            "https://appassets.androidplatform.net/production/v03.html",
            "https://appassets.androidplatform.net:444/android-qa/v03.html",
            "https://user@appassets.androidplatform.net/android-qa/v03.html").forEach {
            assertFalse(it, HudPolicy.isLocal(it))
        }
    }
    @Test fun refusesTransmissionAndSanitizesNames() {
        assertFalse(HudPolicy.commands.contains("midi.send"))
        assertTrue(HudPolicy.commands.contains("midi.select"))
        assertEquals("songs.json", HudPolicy.fileName("../../songs.json"))
        assertEquals("MIDI-HUD.json", HudPolicy.fileName(".."))
    }
}
