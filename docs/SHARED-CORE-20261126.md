# Núcleo compartido — contrato de plataforma v1 (26/11/2026)

Base auditada: `c7440c42ecf5395b923c555a83a4c92751098e4f` de `feature/live-ui-20261124`. Rama de integración experimental; no es publicación ni APK. La raíz continúa siendo la única fuente editable; `beta-v3.4` es un espejo generado. No se cambia el mapa MIDI, las bibliotecas ni el firmware.

## Capas
- Compartidas: Inicio, LIVE, Editor, LAB, catálogo/repertorios/lead sheets, motor y parser MIDI, sesión de entrada, validación y persistencia, historial y resolución de conflictos Drive.
- Adaptadores: Web MIDI / Web Bluetooth (navegador), Core MIDI + WKWebView (iOS), Android MidiManager + WebView (pendiente).
- `core/native-bridge.js` expone el mismo objeto `MidiHudNative` y la fachada de entrada Web MIDI para las dos plataformas. Conserva el transporte WebKit existente. No sobrescribe Web MIDI disponible ni transmite MIDI.

## Contrato Android
Usar AndroidX WebKit WebViewAssetLoader, con recursos locales bajo `https://appassets.androidplatform.net/android-qa/` para QA. Identidad propuesta y aún no registrada: `io.midihud.app.androidqa`. Inyectar el puente al inicio del documento, solo en el frame principal de la app. Registrar `MidiHudAndroidHost` mediante WebViewCompat.addWebMessageListener con origen permitido exacto; validar además isMainFrame y ruta QA, bloquear navegaciones no autorizadas, no otorgar el puente a páginas externas. Si falta soporte de inyección segura, fallar explícitamente. No usar un puente global addJavascriptInterface con páginas no confiables.

JS → host: JSON string `{"id":"1","command":"midi.open","payload":{}}`. Host → JS: WebMessage de texto JSON `{"kind":"reply","id":"1","result":{"ports":[{"id":"foot","name":"FootCtrlPlus","connected":true}],"selected":"foot"}}` o `{"kind":"reply","id":"1","error":"..."}`. Un reply por solicitud, correlación por id; respuestas desconocidas se ignoran. Eventos asíncronos mediante `{"kind":"event","event":{"type":"midi.message","portId":"foot","data":[177,80,2],"timestampMs":1234}}`. Usar reloj monotónico, bytes MIDI 1.0 (no paquetes BLE GATT), eventos midi.ports con ports/selected y midi.error con message. Reusar la sesión común, seleccionar una única entrada y no sintetizar eventos musicales al reconectar.

Comandos existentes: midi.open/list/select/bluetooth; cloud.config/restore/connect/disconnect/request; share.text. Los comandos desconocidos se rechazan. Drive requiere OAuth Android propio en el mismo proyecto de prueba, permisos mínimos drive.appdata, autenticación externa a WebView, tokens solo en host. Si no está configurado, cloud.config debe informar configured:false. El host debe validar parámetros, comandos, rutas y limitar datos, no confiar en JS. Responder también en cancelación; cancelar operaciones vencidas en el host. Los eventos de desconexión no cambian el estado musical.

## Aislamiento
Android QA usa el prefijo local midiHudTest: y el historial de pruebas midi-hud-test-sync-v1, igual que web/iOS QA. Producción sigue separada. Exportar JSON antes de migrar. Nunca aplicar actualizaciones de biblioteca automáticamente durante LIVE.

## Pruebas y pendientes
Prueba de contrato simulada en Node: `node --test tests/shared-native-platform.test.mjs`; regresión: `node --test tests/*.test.mjs`, Worker, check-site, sync-web-resources y CI. Esto no acredita APK ni hardware. Siguiente fase: proyecto Kotlin/Gradle, WebView seguro, permisos y Android MidiManager (BLE y USB), OAuth, importación/exportación, ciclo de vida y reconexión, compilación firmada y distribución privada. Validar con Chocolate Plus en modo U y canal aprobado sin alterar programación. Verificar coexistencia con GT y conservación de datos en una actualización real.
