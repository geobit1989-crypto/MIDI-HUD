# MIDI HUD - Versi�n de pruebas del 18/11/2026

Alcance: aplicaci�n completa. Fuente de esta entrega: `integration/consolidacion-181126-v8`. No se fusiona en `main`.

## Auditor�a de ramas

| Rama | SHA auditado | Tratamiento |
| --- | --- | --- |
| main | 62cd182d860bbe414ee3f4e7862bd7261daff3f6 | Referencia v0.4; permanece intacta |
| gh-pages | bbd4781c0d96f356d85bba59919e55cb335c83d6 | Base de publicaci�n; solo cambia `pruebas/v6/` |
| integration/ios-unified-20261019 | 0463c372e34afaadad9d2ec01b9c214b0f5f9747 | Base completa v6, incluido guardado global del 25/10 |
| feature/midi-connection-session | 82f9d971cc0bc6aad54945e20d6a1a425d4bf6f8 | Correcciones y regresiones MIDI del 18/11 integradas |
| feature/catalog-playlists-current-20261018 | 02aa348f757840a8faa12022e95fbbd6a0b1d3c0 | Cat�logo/variantes ya integrados selectivamente en v6; no sustituir el Editor con su versi�n antigua |
| feature/catalog-repertoires-20261018 | f7f6548d7df481d8f2029d2578596495db2ac63c | Antecedente del cat�logo; conservado |
| feature/ios-drive-sync-20261016 | f33ec5a6ccf6c3686906b46a8128d39494106558 | Ancestro de integraci�n; conservado |
| feature/motor-midi-v1-20261014 | b96e1d0447f445e8447fa3c4b4e4f228561e6333 | Hist�rico, incorporado y superado por integraci�n |
| backup/ble-midi-compat-before-20261015 | c1a287965ee904b44b45d7a0556cd214f38a96c8 | Respaldo ancestro; conservado |

Los PR #1-#4 est�n cerrados sin merge. Se contrastaron contratos en Drive, �ndice SIG, tareas de arquitectura/pruebas y comparaciones de ramas. El anexo del 29/10 sobre simplificaci�n MIDI sigue pendiente de an�lisis y no se implementa. Los ejemplos de canal 2 son fixtures; no se cambia la programaci�n f�sica.

## Cambios integrados

- Inicio, LIVE, Editor v3, LAB, ajustes y p�ginas legales en un mismo paquete modular. LAB copia la biblioteca confirmada actual del Editor; los accesos al Editor y al respaldo anterior apuntan a sus destinos correctos.
- Editor: cuatro secciones, borradores persistentes entre pesta�as/canciones/repertorios, un Guardar global, validaci�n transaccional, detecci�n de ediciones concurrentes, fecha del guardado confirmado y tres opciones de salida.
- Cat�logo maestro, canciones compartidas por playlists, orden/notas por repertorio, lead sheets y tonalidades por variante; se conserva la variante confirmada al crear otra desde un borrador.
- Estados/efectos/expresiones, m�dulos adaptativos, notaci�n textual y por grados, vista m�vil vertical/horizontal y navegaci�n de consulta.
- Motor unificado receptor de CC0+PC, CC80/81/7/91/11 y F8, parser con running status y fragmentaci�n. Memoria de dispositivo, selecci�n de una entrada, reconexi�n autom�tica y retirada de listeners obsoletos. Desconectar nunca env�a un evento musical.
- CC80 repetido conserva efectos y expresiones; actualizaci�n expl�cita de repertorios conserva canci�n, estado, efectos, expresiones y Clock. Ediciones incompatibles se rechazan y el motor anterior sigue operativo. No se aplica una actualizaci�n remota autom�ticamente durante LIVE.
- Persistencia, importaci�n/exportaci�n, recuperaci�n, historial y sincronizaci�n serializada de Drive conservados.

## Publicaci�n y aislamiento

Se mantiene `https://geobit1989-crypto.github.io/MIDI-HUD/pruebas/v6/` como direcci�n del entorno de pruebas para reutilizar los retornos OAuth ya autorizados. El segmento `v6` es la ruta hist�rica; la fuente nueva corresponde a v8 y al corte del 18/11. La versi�n se identifica mediante `release.json` y el registro de despliegue.

La prueba usa el prefijo local/sessionStorage `midiHudTest:` y el tipo de historial Drive `midi-hud-test-sync-v1`; no importa autom�ticamente datos ni sesiones de la versi�n estable o de la antigua prueba. Para probar una biblioteca real, exportar JSON e importar una copia. Las versiones anteriores quedan recuperables por Git; no se eliminan datos existentes. No hay cambios de Worker, secretos, OAuth de producci�n, hardware ni audio.

## Validaci�n local

- 253 pruebas de aplicaci�n, cero fallos, omisiones o cancelaciones. Incluyen las regresiones de v6 y de la rama del 18/11, pruebas de esfuerzo con 1.000 cambios, reconexi�n, selecci�n concurrente de entradas y copia EditorLAB con transporte simulado.
- 4 pruebas del Worker, cero fallos; ejecuci�n de tests sin despliegue del Worker.
- 45 scripts y 140 referencias locales sin errores; 65 recursos compartidos/espejo iguales; 67 recursos offline iOS preparados.
- Navegador local Windows: no ejecutable en el sandbox. GitHub Actions ejecuta la interacci�n completa existente y una prueba adicional del entorno aislado con Editor, MIDI simulado, actualizaci�n y reconexi�n. Registrar sus resultados finales antes de anunciar la publicaci�n como verificada.

## Pendientes de aceptaci�n

Google real y sincronizaci�n entre dispositivos; iPhone/iOS y Android f�sicos; Chocolate Plus USB/BLE, permisos, latencia y reconexi�n real; firma e instalaci�n de IPA y ensayo musical. Las pruebas sint�ticas no acreditan esos puntos. No se declara aceptaci�n operativa del SIG ni se cambia el estado de tareas a terminado.

## Reversi�n

La aplicaci�n estable conserva todos sus blobs y enlaces. El despliegue de pruebas puede revertirse restaurando solamente el sub�rbol `pruebas/v6` del commit publicado anterior; conservar previamente cualquier JSON de prueba que se quiera recuperar. No revertir `main`, el Worker ni bibliotecas remotas de producci�n.
