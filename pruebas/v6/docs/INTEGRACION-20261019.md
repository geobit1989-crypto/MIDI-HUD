# Integración web / iOS — 19 octubre 2026

Rama aislada: `integration/ios-unified-20261019`, basada en la arquitectura iOS que compiló el 16/10. No se fusiona ni publica a main o gh-pages. Worker y configuración web se conservan byte por byte desde gh-pages; no se incorpora su workflow de despliegue.

## Referencias verificadas antes de editar

```text
origin 1b899804f965044eaa6a7a66185117e189f72a83
origin/backup/ble-midi-compat-before-20261015 c1a287965ee904b44b45d7a0556cd214f38a96c8
origin/feature/catalog-playlists-current-20261018 02aa348f757840a8faa12022e95fbbd6a0b1d3c0
origin/feature/catalog-repertoires-20261018 f7f6548d7df481d8f2029d2578596495db2ac63c
origin/feature/ios-drive-sync-20261016 f33ec5a6ccf6c3686906b46a8128d39494106558
origin/feature/motor-midi-v1-20261014 b96e1d0447f445e8447fa3c4b4e4f228561e6333
origin/gh-pages 99e724ba05cb6e88684d36a6397c9418fe6900fd
origin/main 1b899804f965044eaa6a7a66185117e189f72a83
```

## Auditoría y decisiones

| Origen | Componente | Divergencia | Decisión |
|---|---|---|---|
| iOS f33ec5a | Swift/WKWebView/Core MIDI/IPA/Windows | parser solo CC, empaquetaba beta | conservar proyecto y bundle ID; añadir PC/F8 y timestamps, empaquetar raíz |
| beta-v3.4 | Editor/LIVE/modelo/módulos | más completo que raíz, sin catálogo nuevo | base de interfaz; cuatro módulos iniciales y distribución flexible, overlays y expresión |
| PR #3 02aa348 | canción maestra / variantes / playlists | raíz antigua de nueve módulos y parser de acordes limitado | integrar modelo y UI por componentes; conservar parser avanzado v3.4 y añadir grados |
| gh-pages 99e724b | autenticación persistente y Drive | auto-sync solo raíz | mismo Worker y protocolo inmutable; adaptación cliente LIVE aislada |
| main 1b89980 | contrato v0.4 CC0/PC/80/81/7/91/11/F8 | motor y esquema distinto; incluye intenciones MIDI de salida | trasladar recepción al motor v2, sin salida; migrar presets/effects/controlValue |
| catalog-repertoires f7f6548 | versiones completas independientes | distinto comportamiento predeterminado | no activar por defecto; conservar API explícita de variante independiente incluida en PR #3 |
| motor-midi b96e1d0 / backup BLE c1a2879 | motores y compatibilidad histórica | consumidores legacy/lab | conservar archivos de compatibilidad, no cargarlos en Editor/LIVE unificados |

## Fuente canónica

`core/`, `editor/`, `live/`, `lab/`, `config/`, `index.html`, `v03.html` son fuente. `scripts/sync-web-resources.py` genera la distribución compatible `beta-v3.4`; CI compara bytes. No editar el espejo. iOS empaqueta la raíz con `prepare_web.py`, manifest SHA-256 y el mismo motor. Tests canónicos en `tests/`; tests previos de beta se conservan como referencia histórica (sus contratos anteriores no son gates de esta integración).

## Datos y migración

Se lee `hudLibraryV34`, luego `hudLibraryV1`, `hudLibrary`, `hudEditorLibrary`. No se mezclan automáticamente dos bibliotecas locales distintas. Recuperación/exportación permiten revisar las otras. Primera escritura guarda originales íntegros inmutables bajo `midiHudOriginal20261019:<clave>` antes de escribir; fallo de cuota aborta. Migración en memoria idempotente conserva IDs/campos desconocidos/presets originales y materializa módulos de v0.4. No se deduplican bibliotecas históricas por título. CSV puede vincular coincidencias exactas no ambiguas y mantiene CC0/PC/URL.

Si hay dos bibliotecas locales diferentes, la precedencia no demuestra que una sea más reciente: revisar/exportar ambas antes de adoptar una. Los originales no se borran.

## MIDI

Canal global 1–16. CC0 prepara; PC busca dirección fija `{cc0,pc}`; no usa posición de playlist, no renumera, ignora destino inexistente/archivado. CC80 selecciona el módulo con `midiValue`; CC81 conmuta el efecto con ese valor; expresión `expressionCC` 7/91/11. Configuración en Editor. Campos sin asignar no se inventan. No se asignan direcciones por título al abrir. CSV del maestro aporta direcciones. Nuevo estado restaura indicadores de entrada configurados en v3.4, conserva posiciones de expresión ya recibidas. Otra playlist de la misma canción conserva estado/overlays/expresión.

Clock: ventanas de 24 intervalos, cambio >=2 BPM sostenido dos negras, referencia externa inicial sin falso TAP, timeout 1 s. No cambia el BPM nominal. Pulsos con timestamp repetido no generan un tempo ficticio. Swift solo parsea bytes y adjunta tiempo monotónico; JS decide toda la lógica musical. Telemetría de expresión empieza ausente, nunca a un porcentaje inventado.

## Sincronización

Web conserva `PersistentDriveAuth` y Worker. iOS conserva Google Sign-In nativo/URLSession sin exponer tokens a JS. Requiere cliente OAuth iOS público del MISMO proyecto Google que web para compartir appDataFolder; no basta solo usar el mismo email. `Config/Local.xcconfig` sigue siendo configuración local excluida de git. No se modifican secretos, CORS ni redirecciones del Worker.

Guardado local primero, debounce 350 ms, inicio/reconexión/primer plano y consulta cada 60 s visible. Cola de cliente vuelve a intentar cambios recibidos durante transferencia; errores esperan siguiente disparador y no hacen bucle inmediato. Editor con borrador bloquea aplicación. LIVE permite descargar/guardar biblioteca pero su motor tiene snapshot propio. Solo «Actualizar repertorios» recarga explícitamente. Arranque local no espera OAuth.

Fusión conservadora por canción: editar lead sheets distintos de la misma canción puede pedir resolución, preservando ambas versiones completas; no se elige por reloj de dispositivo. Historial/ancestros están separados por cuenta. No se promete ejecución iOS suspendida ni prueba real de Google con mocks.

### Auditoría y reparación de CI — 25/10/2026

Base inspeccionada: `b403e20c7d43f500109110ce1cc3bc67982307f8`. Runs fallidos: [web 40196651535](https://github.com/geobit1989-crypto/MIDI-HUD/actions/runs/40196651535), [iOS 40196651522](https://github.com/geobit1989-crypto/MIDI-HUD/actions/runs/40196651522). Se leyeron jobs, pasos y logs completos. Checkout/setup-node correctos; ambos abortan en `node --test tests/*.test.mjs`: 221 casos, 215 aprobados, 6 fallos de catálogo. Primer fallo: historial esperado después de crear una maestra y guardar, `catalog-editor-flow.test.mjs:103` (0 frente a 1). La maestra nueva todavía era borrador, por lo que no existía una versión confirmada anterior. No es un fallo YAML, runner ni OAuth; iOS se omite por `needs: web`. Las advertencias de Node 20 de las acciones no son el error causante.

Comparación: últimos runs satisfactorios del 22/10, SHA `07e74665bdb5b48e0dee7ed7e6a67bb3b8265afa`: [web 39733320060](https://github.com/geobit1989-crypto/MIDI-HUD/actions/runs/39733320060) y [iOS 39733320127](https://github.com/geobit1989-crypto/MIDI-HUD/actions/runs/39733320127); sus jobs alcanzaron Chromium, XCTest, build e integridad IPA. La duración corta actual corresponde a pruebas abortadas antes de esos pasos.

Correcciones limitadas: migrar los seis casos al Guardar global con `await` y afirmaciones previas de no publicación; conservar historial, versiones, notas y fallo de cuota. La migración reveló una regresión real: crear una variante dejaba pendiente el texto de la original y lo confirmaba también después. Ahora la nueva variante recibe el borrador y la original confirmada se conserva. Recuperación aditiva de repertorios pasa por el borrador global; importación completa y Deshacer conservan sus confirmaciones administrativas. Se rechaza un Guardar sobre una biblioteca cambiada por otra sesión; no se sobrescribe ni fusiona silenciosamente. Fallo de limpieza del borrador después de persistir no convierte el guardado en fallo. Lectura fallida del borrador se señala sin bloquear la biblioteca disponible.

Pruebas locales Windows/Node 24: **226 aplicación + 4 Worker, cero fallos**; 41 scripts/123 referencias, 61 espejos idénticos, 63 recursos offline. Chromium real: cuatro pestañas, recuperación tras recarga, tres decisiones de salida, LAB, Guardar/reabrir, playlist vacía, variantes/grados/tono, LIVE snapshot, vertical/horizontal y cero errores JS. Nuevas regresiones: título incompleto, conflicto entre sesiones, limpieza bloqueada, edición durante validación asíncrona, Guardar concurrente y cancelación de validación. XCTest actualizado para pulsar `saveAll` y comprobar borrador entre las cuatro pestañas antes de confirmar. Compilación/XCTest/IPA actuales dependen del resultado remoto, no se ejecutan en Windows. No se usaron datos ni credenciales reales.

**Resultado remoto verificado:** corrección `7bd31eae0a65ca94bce3ab3ee44713c1a1322858`, árbol `662f7565bd9aaea6063910d244712f6cebc0ce4c`. [Web 40203458820](https://github.com/geobit1989-crypto/MIDI-HUD/actions/runs/40203458820) e [iOS 40203458852](https://github.com/geobit1989-crypto/MIDI-HUD/actions/runs/40203458852) finalizaron `success` para ese mismo SHA. Logs: 226 pruebas de aplicación + 4 Worker + 3 XCTest, cero fallos; Chromium ampliado aprobado; `TEST SUCCEEDED`, `BUILD SUCCEEDED`, comprobación ZIP del IPA sin errores y configuración Google iOS embebida verificada. [Artefacto técnico iOS](https://github.com/geobit1989-crypto/MIDI-HUD/actions/runs/40203458852/artifacts/12602798300), sin firma y sin distribución estable. La actualización documental posterior conserva estos resultados de la implementación; los runs de su propio SHA y la lectura final de rama se registran en las tareas ClickUp [arquitectura](https://app.clickup.com/t/869fgw8z3) y [pruebas](https://app.clickup.com/t/869fgw8zk).

Prueba física BLE, firma/instalación y Drive real pendientes. La detección de biblioteca cambiada rechaza un borrador antiguo y exige revisión; no ofrece fusión automática de borradores ni acredita concurrencia real entre dispositivos. No se publica Pages, Worker ni IPA estable. Las anotaciones de ambos fallos se revisaron: salida 1 de tests, advertencias de runtime de acciones y migración del runner; falta de capturas es consecuencia de no alcanzar Chromium. Ningún cambio de workflows respecto al último SHA verde del 22/10.

### Registro anterior de CI solicitada — 25/10/2026 (histórico)

Los workflows **engine-tests.yml** y **native-ios.yml** están definidos en `.github/workflows/` y configurados para ejecutarse con cada `push` a `integration/**`. Los commits de migración de las pruebas del Editor han activado dichas ejecuciones en la rama `integration/ios-unified-20261019` (último commit de la actualización de tests: `844c09d6db2aad653f3685fa8b124d8e6ee4f88d`). Se actualizaron las pruebas `tests/editor-draft-v6.test.mjs`, `tests/editor-states-flow.test.mjs`, `tests/editor-ui.test.mjs` y `tests/browser-integration.mjs` para el guardado global.

La revisión adicional de lectura verificó sintaxis JS de los archivos modificados y que los triggers corresponden a la rama. **Estado de los jobs remotos: pendiente de verificación**: la integración GitHub disponible permite consultar los runs vinculados a PR, pero no enumera los runs de `push`, y los checks Actions no figuran en el endpoint de estados clásicos. No declarar CI verde ni IPA actualizado hasta obtener el resultado de Actions. Enlaces: https://github.com/geobit1989-crypto/MIDI-HUD/actions/workflows/engine-tests.yml y https://github.com/geobit1989-crypto/MIDI-HUD/actions/workflows/native-ios.yml .

## Ajuste de flujo del Editor — 25/10/2026 (rama v6, pendiente de publicación)

**Decisión aprobada:** la navegación entre Canción, Estados, Lead sheet, MIDI, repertorios y canciones no exige guardar ni descarta modificaciones. Cada edición se mantiene como borrador local recuperable bajo `midiHudEditorDraftV6`, con asociación a la revisión de biblioteca confirmada. Las importaciones aditivas de catálogo se incorporan al borrador, no publican automáticamente. Las acciones destructivas/importaciones de reemplazo conservan confirmaciones explícitas.

**Guardado global:** botón «Guardar» en cabecera. Confirma en una operación los datos y lead sheets modificados de todas las secciones/canciones, aplicando validación y elección de cifrado cuando proceda. Los botones de guardado por sección quedan ocultos. Se muestra «Último guardado» con fecha y hora locales del `updatedAt` confirmado; el autoguardado de borrador no modifica esa fecha ni dispara sincronización. Los guardados confirmados disparan el evento de biblioteca para sincronización.

**Separación LIVE:** `committed` y biblioteca persistida/sincronizada permanecen invariantes durante la edición. LIVE solo lee la biblioteca confirmada y mantiene snapshot hasta actualización explícita. La alerta de salida a LIVE/LAB/otros enlaces ofrece «Guardar y salir», «Seguir editando» y «Salir sin confirmar»; cierre/recarga directa conserva la confirmación nativa del navegador. «Salir sin confirmar» preserva el borrador local para recuperación, pero no lo publica.

**Archivos cambiados en la rama:** `editor/v3.mjs`, `editor/v3.html` y espejos idénticos `beta-v3.4/editor/`; prueba nueva `tests/editor-draft-v6.test.mjs`. Ninguna modificación de `main`, `gh-pages`, Cloudflare ni datos de Drive.

**Comprobación ejecutada:** lecturas posteriores verificaron igualdad exacta de ambos archivos con sus espejos. Análisis sintáctico del controlador y prueba de ejecución aislada completados: navegación entre pestañas, persistencia/recuperación de borrador, aislamiento de biblioteca confirmada, confirmación de dos lead sheets y fecha/hora. El archivo de regresión se añadió al repositorio; pendiente obtener evidencia de ejecución de CI y prueba manual en navegador/iPhone, incluida confirmación de navegación y sincronización. **No declarar desplegada ni validada en dispositivo** esta mejora: el enlace GitHub Pages /pruebas/v6 sigue publicando el código anterior.

**Precaución:** exportar copia JSON de biblioteca antes de utilizar datos reales en pruebas. Los borradores locales están ligados al origen del navegador y a la revisión base; ante discrepancia no se sobrescriben bibliotecas automáticamente.

## Validación y entrega

Consultar CI de la rama para resultados finales de Node, navegador y XCTest/IPA. Pruebas locales: `node --test tests/*.test.mjs`, `node --test worker/tests/*.test.mjs`, `node scripts/check-site.mjs`, `python3 scripts/sync-web-resources.py --check`, `python3 native/ios/prepare_web.py`.

Windows: `powershell -ExecutionPolicy Bypass -File .\windows\preparar-midi-hud.ps1` descarga el IPA de esta rama solo desde una ejecución satisfactoria. Bundle ID `io.midihud.app`, iOS >=16. Firma Apple local en Sideloadly, nunca en GitHub. Actualizar encima con la misma identidad de firma, sin eliminar la app; exportar JSON antes. Renovación depende de configuración local de Sideloadly y conectividad.

Pendientes físicos: iPhone offline/rotación/persistencia/retorno a primer plano, USB Lightning y BLE Chocolate Plus, latencia/jitter Clock real, autorización real Google web+iOS y mismos datos privados. Entorno Linux sin Xcode: compilación/XCTest solo se consideran aprobados cuando CI termine.

## Reversión

Producción y ramas originales intactas: basta seguir usando su versión. No instalar una versión anterior sobre datos migrados sin exportar: recuperar JSON original desde copias inmutables/backup y revisar antes de importar. Historial Drive conserva commits, nunca se elimina. No borrar instalación iOS para revertir si contiene cambios no exportados. La integración no ejecuta migración remota de datos reales.

## Evidencia de cierre y regresión adicional

PR de revisión: https://github.com/geobit1989-crypto/MIDI-HUD/pull/4 (sin fusionar).
Primer commit remoto integrado: `283e7b361d40111250d70ea1865510c1a1dda3ae`.
CI web satisfactoria: https://github.com/geobit1989-crypto/MIDI-HUD/actions/runs/39230258079 .
CI iOS satisfactoria (3 XCTest, cero fallos, compilación de dispositivo e IPA verificado): https://github.com/geobit1989-crypto/MIDI-HUD/actions/runs/39230258172 .

La revisión posterior añade una prueba de ciclo de vida real del controlador/UI con transporte simulado: inicio offline, recuperación de sesión al reconectar, guardado durante subida, cola sin transferencias simultáneas, primer plano, borrador, snapshot LIVE y actualización explícita exactamente una vez. Se corrige recuperación de sesión y se conserva intención explícita en la cola. Conectar cuenta no actualiza LIVE. CC0 queda reservado también en el formulario de acciones; se conserva cualquier dato histórico. CC11 admite un único destino de expresión por canción. JSON local inválido detiene el arranque LIVE sin sustituirlo por ejemplos; playlists vacías no permiten previsualización inválida.

Validación local final: 216 pruebas de aplicación y 4 del Worker, cero fallos; 41 scripts/123 referencias; 61 recursos espejo idénticos; 63 recursos offline preparados. La nueva ejecución de CI de la rama verifica este ajuste y publica su propio IPA; seleccionar siempre ejecución satisfactoria correspondiente al último SHA, no confundir el primer artefacto con el ajuste posterior. La prueba de transporte simulado no acredita acceso real a Drive ni hardware.
