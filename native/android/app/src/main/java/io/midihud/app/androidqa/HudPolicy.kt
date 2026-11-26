package io.midihud.app.androidqa

import java.net.URI

internal object HudPolicy {
    const val ORIGIN = "https://appassets.androidplatform.net"
    const val PATH = "/android-qa/"
    val commands = setOf("midi.open", "midi.list", "midi.select", "midi.bluetooth",
        "cloud.config", "cloud.restore", "cloud.connect", "cloud.disconnect", "cloud.request", "share.text")
    fun isLocal(url: String?): Boolean = try {
        val u = URI(url ?: "")
        u.scheme == "https" && u.host == "appassets.androidplatform.net" &&
            u.port == -1 && u.userInfo == null && u.path.startsWith(PATH) &&
            u.path.split('/').none { it == ".." || it == "." } && !u.path.contains('\\')
    } catch (_: Exception) { false }
    fun fileName(raw: String): String = raw.substringAfterLast('/').substringAfterLast('\\')
        .replace(Regex("[^a-zA-Z0-9._-]"), "_").take(100)
        .takeIf { it.isNotBlank() && it != "." && it != ".." } ?: "MIDI-HUD.json"
}
