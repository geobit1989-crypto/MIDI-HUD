# Validación de la aplicación de pruebas — 18/11/2026

Fuente: `28c7a15cba2796011bf337b675fcff3c503a50ee`, rama `integration/consolidacion-181126-v8`.

Publicación prevista/verificable: https://geobit1989-crypto.github.io/MIDI-HUD/pruebas/v6/ . El manifiesto [release.json](../release.json) identifica la fuente del sitio desplegado. El documento oficial de Drive registra la verificación final de URL y el commit de publicación.

## Resultados de CI del mismo commit

[CI web satisfactoria](https://github.com/geobit1989-crypto/MIDI-HUD/actions/runs/44409898639): 252 pruebas de aplicación y 4 del Worker, cero fallos. Dos suites Chromium aprobadas: Editor completo con borradores, salida/guardado, catálogo y variantes; aplicación de pruebas aislada con guardado, canal 2, entrada seleccionada, conservación del estado, actualización explícita, desconexión y reconexión. Sin errores JavaScript. Capturas vertical/horizontal en el artefacto unified-browser-evidence de esa ejecución.

65 recursos espejo comprobados, 45 scripts y 139 referencias correctos; 67 recursos offline preparados. [CI iOS de esta fuente](https://github.com/geobit1989-crypto/MIDI-HUD/actions/runs/44409898284): consultar conclusión del job; no equivale a instalación física.

## Aislamiento y alcance

Aplicación completa: Inicio, LIVE, Editor, catálogo, playlists, lead sheets, ajustes, LAB, motor MIDI, persistencia y sincronización. Solo se reemplaza el subárbol `pruebas/v6/` de `gh-pages`; todos los blobs exteriores y la rama main se conservan. La ruta v6 es histórica y mantiene los callbacks OAuth ya autorizados.

Prefijo de almacenamiento de pruebas `midiHudTest:`; historial Drive `midi-hud-test-sync-v1`. No se importan automáticamente datos existentes. Importar una copia JSON si se desea probar un repertorio propio. No se desplegó el Worker ni se cambió hardware, programación del Chocolate Plus o GT-1000CORE.

## Pendientes

Drive con cuentas reales y dos dispositivos, permisos/MIDI USB y BLE físicos, iPhone/Android reales, firma e instalación iOS, latencia/Clock y ensayo musical. La condición inicial de CI con Ubuntu 26.04/Playwright antiguo quedó resuelta fijando Ubuntu 24.04; no queda un fallo web automatizado en la fuente publicada.

[Auditoría de ramas y cambios integrados](CONSOLIDACION-20261118.md).
