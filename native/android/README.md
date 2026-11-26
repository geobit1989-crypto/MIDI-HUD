> **26/11/2026: corrección de marca.** Nombre visible MIDI HUD y vector compacto con separación 1,5 derivados de [SVG maestro](../../assets/brand/midi-hud.svg). Se conserva applicationId, versión QA, comportamiento MIDI y firma. CI verifica geometría, paleta y etiqueta del APK. Validación visual física pendiente.

# MIDI HUD Android QA — 26/11/2026

Contenedor experimental basado en el núcleo compartido `219a53201f9b76c4c2bc8ec351a8d188aaa9db29` y el contrato [SHARED-CORE](../../docs/SHARED-CORE-20261126.md). No se modifica la web publicada, iOS QA, la programación de GT o Chocolate ni los datos de producción.

## Alcance
- Android 8+; SDK de compilación/target 35, Kotlin 2.0.21, AGP 8.7.3, Gradle 8.9, JDK 17. Los recursos web se generan directamente de la raíz, sin conexión.
- Identidad QA `io.midihud.app.androidqa`; prefijo e historial de prueba definidos por el núcleo. WebView local con origen restringido, sin permiso INTERNET; se bloquea contenido externo. Google Drive explícitamente no configurado.
- MIDI 1.0 de recepción por Android MidiManager: enumeración de puertos de salida de dispositivos MIDI (entrada al HUD), USB si Android reconoce el dispositivo, búsqueda BLE, selección y recepción. No transmite ni programa hardware. Permisos solicitados al buscar BLE. El emparejamiento BLE tras desconexión puede requerir volver a buscar; la reconexión física y el ciclo de vida deben verificarse.
- Abrir Inicio, Editor, importar copia JSON, abrir LIVE, conectar Bluetooth MIDI y seleccionar FootCtrlPlus. Comprobar A–D, estado, coexistencia GT y canal aprobado. Importar/exportar mediante selector de documentos. Pantalla activa en LIVE.
- Icono vectorial provisional basado en la cuadrícula aprobada como candidata (no es el raster exacto).
- Seguridad: origen/ruta permitidos, puente solo main frame, lista explícita de comandos, no addJavascriptInterface. Validar con WebView real antes de uso.

## Compilar
Desde `native/android`, con Android SDK 35, JDK 17 y Gradle 8.9:
```
gradle :app:testDebugUnitTest :app:assembleDebug
```
CI ejecuta regresión web, comprobación de recursos, tests JVM, build y firma de APK debug. Artefacto `midi-hud-android-qa` únicamente si termina correctamente. Esta rama no despliega ni instala automáticamente.

Para conservar datos entre actualizaciones manuales, usar la misma clave debug (alias androiddebugkey, contraseña estándar del almacén debug) en todas las compilaciones QA mediante secreto `HUD_ANDROID_QA_KEYSTORE_B64` creado y custodiado por el propietario. No publicar la clave ni usarla en producción. Sin dicho secreto el runner puede generar una firma efímera; no instalar una versión con firma distinta encima de una biblioteca valiosa. Google Play Internal Testing requiere cuenta, firma de distribución estable, AAB, ficha y requisitos vigentes; no se configura todavía. Google OAuth Android se registrará con paquete y huella del certificado real de instalación, sin tocar los clientes existentes. Exportar JSON antes de cualquier migración.

## Aceptación pendiente
Compilación y pruebas CI de este commit; arranque WebView físico, importación/exportación, BLE Chocolate modo U, USB, desconexión/reconexión, latencia, dos dispositivos, orientación, continuidad de sesión y actualización conservando datos. OAuth y distribución automática son fases siguientes. No se declara APK validado hasta revisar CI.
