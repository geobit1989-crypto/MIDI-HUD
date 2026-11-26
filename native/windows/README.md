# MIDI HUD — Windows Alpha 0.1 (QA)

Base: Android QA 75a4e503e702fcacbc9e98eb5a185295040bf3fc. Contenedor WPF/.NET 8, WebView2, Windows 10 2004+ x64; requiere WebView2 Runtime. Empaqueta la raíz canónica sin duplicar código editable; aislamiento https://midihud.local/windows-qa/ y almacenamiento en %LOCALAPPDATA%/MIDI HUD/WindowsQA. No cambia web publicada, Android, iOS, firmware ni configuración GT/Chocolate.

- Entrada MIDI mediante Windows.Devices.Midi (USB y BLE si el sistema expone un puerto MIDI), selección de un puerto, eventos de desconexión. Emparejamiento BLE desde ajustes de Windows. Solo recepción; probar reconexión y selección físicamente.
- Controller Manager: monitor CC/PC/hex, verificación manual del siguiente mensaje, filtro Clock y exportación de registro. Programación, lectura de memoria, backup del controlador y comparación automática con mapa SIG quedan pendientes de auditar protocolo/firmware/licencia de las herramientas existentes.
- Importación mediante selector de archivos WebView, exportación JSON mediante diálogo nativo; validar ambas en Windows.
- Google Drive no configurado, sin red desde WebView. Pendiente cliente OAuth de escritorio en proyecto de pruebas, autorización externa con PKCE, protección local de tokens y prueba de sincronización.
- Nombre visible MIDI HUD; versión interna Alpha 0.1. Icono oficial y MSIX firmado/Microsoft Store pendientes.

## Compilación
Windows con .NET 8 SDK, Python 3 y WebView2 Runtime:
```powershell
cd native/windows
dotnet publish MidiHud.Windows.csproj -c Release -r win-x64 --self-contained true -o ../../dist/windows
```
CI ejecuta regresión Node y empaquetado, comprueba hashes y publica ZIP portable si tiene éxito. Extraer toda la carpeta y abrir MIDI HUD.exe; no ejecutar desde dentro del ZIP. No hay instalador ni firma de distribución todavía. CI no acredita ejecución física ni Bluetooth. Pruebas: Inicio/LIVE/Editor, importación/exportación JSON, modo U, CC/PC canal aprobado, desconexión, coexistencia GT y persistencia al actualizar. Usar copia del repertorio.

Primera CI 45833385173: 274 pruebas correctas; fallo NETSDK1152 por recursos duplicados en publish. Corrección: generación y copia posterior a Build/Publish, sin declarar los recursos como Content del SDK; SDK 8 fijado en global.json. Revalidar CI.
