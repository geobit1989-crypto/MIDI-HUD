# MIDI HUD — Versión de pruebas del 18/11/2026

Alcance: aplicación completa. Fuente de esta entrega: `integration/consolidacion-181126-v8`. No se fusiona en `main`.

## Auditoría de ramas

| Rama | SHA auditado | Tratamiento |
| --- | --- | --- |
| main | 62cd182d860bbe414ee3f4e7862bd7261daff3f6 | Referencia v0.4; permanece intacta |
| gh-pages | bbd4781c0d96f356d85bba59919e55cb335c83d6 | Base de publicación; solo cambia `pruebas/v6/` |
| integration/ios-unified-20261019 | 0463c372e34afaadad9d2ec01b9c214b0f5f9747 | Base completa v6, incluido guardado global del 25/10 |
| feature/midi-connection-session | 82f9d971cc0bc6aad54945e20d6a1a425d4bf6f8 | Correcciones y regresiones MIDI del 18/11 integradas |
| feature/catalog-playlists-current-20261018 | 02aa348f757840a8faa12022e95fbbd6a0b1d3c0 | Catálogo/variantes ya integrados selectivamente en v6; no sustituir el Editor con su versión antigua |
| feature/catalog-repertoires-20261018 | f7f6548d7df481d8f2029d2578596495db2ac63c | Antecedente del catálogo; conservado |
| feature/ios-drive-sync-20261016 | f33ec5a6ccf6c3686906b46a8128d39494106558 | Ancestro de integración; conservado |
| feature/motor-midi-v1-20261014 | b96e1d0447f445e8447fa3c4b4e4f228561e6333 | Histórico, incorporado y superado por integración |
| backup/ble-midi-compat-before-20261015 | c1a287965ee904b44b45d7a0556cd214f38a96c8 | Respaldo ancestro; conservado |

Los PR #1–#4 están cerrados sin merge. Se contrastaron contratos en Drive, índice SIG, tareas de arquitectura/pruebas y comparaciones de ramas. El anexo del 29/10 sobre simplificación MIDI sigue pendiente de análisis y no se implementa. Los ejemplos de canal 2 son fixtures; no se cambia la programación física.

## Cambios integrados

- Inicio, LIVE, Editor v3, LAB, ajustes y páginas legales en un mismo paquete modular.
- Editor: cuatro secciones, borradores persistentes entre pestañas/canciones/repertorios, un Guardar global, validación transaccional, detección de ediciones concurrentes, fecha del guardado confirmado y tres opciones de salida.
- Catálogo maestro, canciones compartidas por playlists, orden/notas por repertorio, lead sheets y tonalidades por variante; se conserva la variante confirmada al crear otra desde un borrador.
- Estados/efectos/expresiones, módulos adaptativos, notación textual y por grados, vista móvil vertical/horizontal y navegación de consulta.
- Motor unificado receptor de CC0+PC, CC80/81/7/91/11 y F8, parser con running status y fragmentación. Memoria de dispositivo, selección de una entrada, reconexión automática y retirada de listeners obsoletos. Desconectar nunca envía un evento musical.
- CC80 repetido conserva efectos y expresiones; actualización explícita de repertorios conserva canción, estado, efectos, expresiones y Clock. Ediciones incompatibles se rechazan y el motor anterior sigue operativo. No se aplica una actualización remota automáticamente durante LIVE.
- Persistencia, importación/exportación, recuperación, historial y sincronización serializada de Drive conservados.

## Publicación y aislamiento

Se mantiene `https://geobit1989-crypto.github.io/MIDI-HUD/pruebas/v6/` como dirección del entorno de pruebas para reutilizar los retornos OAuth ya autorizados. El segmento `v6` es la ruta histórica; la fuente nueva corresponde a v8 y al corte del 18/11. La versión se identifica mediante `release.json` y el registro de despliegue.

La prueba usa el prefijo local/sessionStorage `midiHudTest:` y el tipo de historial Drive `midi-hud-test-sync-v1`; no importa automáticamente datos ni sesiones de la versión estable o de la antigua prueba. Para probar una biblioteca real, exportar JSON e importar una copia. Las versiones anteriores quedan recuperables por Git; no se eliminan datos existentes. No hay cambios de Worker, secretos, OAuth de producción, hardware ni audio.

## Validación local

- 251 pruebas de aplicación, cero fallos, omisiones o cancelaciones. Incluyen las regresiones de v6 y de la rama del 18/11, pruebas de esfuerzo con 1.000 cambios y reconexión con transporte simulado.
- 4 pruebas del Worker, cero fallos; ejecución de tests sin despliegue del Worker.
- 45 scripts y 139 referencias locales sin errores; 65 recursos compartidos/espejo iguales; 67 recursos offline iOS preparados.
- Navegador local Windows: no ejecutable en el sandbox. GitHub Actions ejecuta la interacción completa existente y una prueba adicional del entorno aislado con Editor, MIDI simulado, actualización y reconexión. Registrar sus resultados finales antes de anunciar la publicación como verificada.

## Pendientes de aceptación

Google real y sincronización entre dispositivos; iPhone/iOS y Android físicos; Chocolate Plus USB/BLE, permisos, latencia y reconexión real; firma e instalación de IPA y ensayo musical. Las pruebas sintéticas no acreditan esos puntos. No se declara aceptación operativa del SIG ni se cambia el estado de tareas a terminado.

## Reversión

La aplicación estable conserva todos sus blobs y enlaces. El despliegue de pruebas puede revertirse restaurando solamente el subárbol `pruebas/v6` del commit publicado anterior; conservar previamente cualquier JSON de prueba que se quiera recuperar. No revertir `main`, el Worker ni bibliotecas remotas de producción.
