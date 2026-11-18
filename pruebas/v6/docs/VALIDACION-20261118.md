# Validación de la aplicación de pruebas — 18/11/2026

Fuente: `6534c31c3805680d6f0fcef9a5fd32596ab80028`, rama `integration/consolidacion-181126-v8`.

URL: https://geobit1989-crypto.github.io/MIDI-HUD/pruebas/v6/ . El manifiesto [release.json](../release.json) identifica la fuente del sitio desplegado. El documento oficial de Drive registra la verificación final y el commit de publicación.

## Pruebas de la misma fuente

[CI web](https://github.com/geobit1989-crypto/MIDI-HUD/actions/runs/44411784796): 253 pruebas de aplicación y 4 del Worker. Dos suites Chromium: Editor completo con borradores, salida/guardado, catálogo y variantes; aplicación de pruebas aislada con Editor→Guardar→LAB→Copiar, canal 2, entrada seleccionada, conservación de estados/efectos/expresiones, actualización explícita, desconexión y reconexión. Capturas vertical/horizontal en el artefacto unified-browser-evidence de esa ejecución. Consultar su conclusión final, registrada también en Drive.

65 recursos espejo, 45 scripts y 140 referencias locales; 67 recursos offline preparados. [CI iOS](https://github.com/geobit1989-crypto/MIDI-HUD/actions/runs/44411788692) verifica parser, Editor/LIVE offline, build e IPA sin firma. No equivale a instalación física.

## Cambios y aislamiento

Inicio, LIVE, Editor, catálogo, playlists, lead sheets, ajustes, LAB, motor MIDI, persistencia y sincronización consolidados. Incluye borradores/Guardar global del 25/10, mejoras MIDI del 18/11, protección ante actualización incompatible y selección concurrente de entradas, y corrección de copia/enlaces Editor↔LAB.

Solo cambia el subárbol `pruebas/v6/`; todos los blobs exteriores y la rama main se conservan. La ruta v6 es histórica y mantiene los callbacks OAuth existentes. Almacenamiento de pruebas `midiHudTest:`; historial Drive `midi-hud-test-sync-v1`. Importar una copia JSON para probar un repertorio propio. No se importan ni sobrescriben datos existentes automáticamente. No hay cambios de Worker, secretos, Chocolate Plus, GT-1000CORE o audio.

## Pendientes

Google y sincronización entre dispositivos reales, permisos/MIDI USB y BLE físicos, iPhone/Android reales, firma e instalación iOS, latencia/Clock y ensayo musical. La incompatibilidad inicial Ubuntu 26.04/Playwright antiguo se resolvió fijando Ubuntu 24.04.

[Auditoría de ramas y cambios integrados](CONSOLIDACION-20261118.md).
