# AGENTS.md — Entrada operativa MIDI HUD
Actualización documental: 25/11/2026. Este archivo es un índice de trabajo, no una orden automática de lectura desde otros chats.

## Fuente de verdad y entrada
- PCP v1.0: https://docs.google.com/document/d/1NaYQOiI-vL4vueMNFM014jXPInE023hA0xDcM9xZph0/edit
- Índice SIG: https://docs.google.com/document/d/1VADgtXc-TjDVmoA0aVQ7wzOs03VZyBRAm8LmKgaIsl4/edit
- Publicaciones, rama/commit de pruebas e incidencias: https://docs.google.com/document/d/1fXLaabQe_0vkbvgp8KG0pZayoywnI9_lEFr17BaceXE/edit
- Pruebas físicas y pendientes: https://app.clickup.com/t/869fgw8zk
- Leer el README de LA RAMA QUE SE VA A EDITAR y sus contratos/configuración pertinentes. Las secciones históricas no sustituyen el encabezado vigente.

## Rama y propósito (consultar SHA actual antes de intervenir)
- `main`: prototipo heredado v0.4, NO asumir que contiene la aplicación v8.
- `gh-pages`: páginas publicadas. Separar entorno estable de `/pruebas/v6/` (ruta histórica que puede hospedar código posterior, no determina versión).
- `integration/ios-unified-20261019`: integración histórica v6. PR #4 cerrado el 19/10/2026 **sin fusionar**; no es una PR activa ni prueba de despliegue.
- `integration/consolidacion-181126-v8`: código completo v8, base de la entrega web de pruebas del 18/11.
- `feature/android-ble-midi-20261121`: trabajo Android BLE, mantener su evidencia por separado.
- `test/ios-midi-hud-20261123`: app iOS de prueba con identidad y OAuth aislados; NO equivaler a producción. Compilación/IPA y pruebas de simulador no son aceptación física con FootCtrlPlus ni Drive.
- `feature/live-ui-20261124`: evolución de LIVE y publicación web de pruebas del 24/11; verificar cada nuevo commit con el registro de accesos.
- `integration/shared-core-20261126`: contrato del núcleo compartido Web/iOS/Android, sin publicación ni APK; ver [contrato](docs/SHARED-CORE-20261126.md).
- `feature/android-native-qa-20261126`: contenedor Android QA experimental, ver [README Android](native/android/README.md); no distribuir ni fusionar sin validación.
Cualquier rama nueva se identifica por nombre, commit y contenido; no inferir "más actual" solo por nombre. No fusionar, publicar ni cambiar hardware sin autorización.

## Antes de modificar
1. Seleccionar rama y leer su README, contrato y archivos afectados; comprobar último SHA y estado del repositorio.
2. Distinguir producción, staging web, integración iOS, simulación, dispositivo físico y validación musical.
3. Consultar el registro GT y los hitos físicos cuando afecten a MIDI: el 18/11 se confirmó Chocolate→GT y Chocolate→HUD simultáneos en un entorno probado; el 21/11 se confirmó recepción BLE Android. No extrapolar estas pruebas a todas las plataformas, iOS QA ni sincronización real con Google Drive.
4. Preservar bibliotecas, datos reales, configuraciones de Chocolate/GT y las decisiones aprobadas.

## Pruebas según la rama, no una única prueba universal
- `main`: `node --test tests/midi-v04.test.mjs` y workflow `.github/workflows/midi-hud-tests.yml`.
- Ramas v8 / QA: seguir el README vigente; como comprobación inicial `node --test tests/*.test.mjs`, `node --test worker/tests/*.test.mjs`, `node scripts/check-site.mjs` y `python3 scripts/sync-web-resources.py --check` cuando los archivos estén presentes. Revisar los workflows web/Chromium/iOS de la rama, incluyendo sus pruebas reales y estado CI para el SHA que se entrega.
- No afirmar CI aprobada si no se inspecciona su ejecución. No inferir prueba física de tests Node, Chromium, WebKit, XCTest, build o IPA.

## Cierre
Actualizar documentación específica, contratos y tareas existentes solo si el cambio lo exige; conservar históricos y evitar copias paralelas. Leer de retorno commit y contenido; documentar entregado, publicado, probado y pendiente con enlaces.
La consulta del PCP debe activarla el flujo humano/asistente que trabaja en el proyecto; este archivo no garantiza lectura automática desde cualquier conversación.
