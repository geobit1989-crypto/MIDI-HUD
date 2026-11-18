# Validación de MIDI HUD de pruebas — 18/11/2026

Rama: `integration/consolidacion-181126-v8`.
Fuente exacta: `a435f8c2c875ca378af61e388b98b62ee89bee71`.
URL: https://geobit1989-crypto.github.io/MIDI-HUD/pruebas/v6/ . [Manifiesto de versión](../release.json).

## Aplicación consolidada

Inicio, LIVE, Editor completo, catálogo maestro, playlists/repertorios, variantes y tonalidades de lead sheet, ajustes, LAB, motor MIDI, persistencia y sincronización. Guardar global y borradores protegidos del 25/10; conexión MIDI persistente y reconexión del 18/11; conservación del estado musical al actualizar bibliotecas; CC80 repetido sin apagar efectos; selección de entradas concurrentes protegida; copia de la biblioteca confirmada Editor→LAB y enlaces corregidos.

Se corrigió la transcodificación de textos en la transferencia final y se incorporó validación UTF-8 estricta que bloquea caracteres de sustitución en el sitio. No quedan textos dañados en los recursos corregidos.

## Evidencias

[CI web de esta fuente](https://github.com/geobit1989-crypto/MIDI-HUD/actions/runs/44413145045): 253 pruebas de aplicación y 4 del Worker; dos recorridos Chromium (Editor/guardado/catálogo/variantes y entorno aislado/Editor→LAB/MIDI/reconexión). Capturas vertical/horizontal en su artefacto unified-browser-evidence. [CI iOS de esta fuente](https://github.com/geobit1989-crypto/MIDI-HUD/actions/runs/44413144946): XCTest, build e IPA sin firma. Las conclusiones finales y verificación pública se registran en el documento oficial de enlaces de Google Drive.

Comprobaciones: 45 scripts, 140 referencias, 65 recursos espejo y 67 recursos offline preparados. El fallo inicial de Chromium en Ubuntu 26.04 se resolvió fijando Ubuntu 24.04 compatible.

## Aislamiento

Solo cambia `pruebas/v6/` en gh-pages. Todos los blobs exteriores, main y Worker se conservan. No se programó Chocolate Plus ni GT-1000CORE y no se envía MIDI. La ruta v6 se conserva por los callbacks OAuth existentes, aunque el código corresponda a v8.

Almacenamiento de pruebas `midiHudTest:`; historial Drive `midi-hud-test-sync-v1`. Las bibliotecas y sesiones existentes no se importan ni sobrescriben automáticamente: importar una copia JSON para ensayar un repertorio propio.

## Pendientes

Google y sincronización reales entre dispositivos; iPhone/Android físicos; MIDI USB/BLE, permisos, latencia y Clock reales; firma e instalación de IPA y ensayo musical. Las pruebas automáticas no acreditan estos puntos.

[Auditoría de ramas y cambios](CONSOLIDACION-20261118.md).
