# MIDI HUD — Windows Alpha 0.1 (QA)

## Actualizaciones de Windows QA

El portable WPF existente se empaqueta completo como MSIX. Tras la primera instalación con el archivo `.appinstaller`, Windows comprueba GitHub Releases al abrir desde Inicio, como máximo una vez cada ocho horas. Windows aplica la actualización en un momento oportuno, sin solicitar el cierre de LIVE. El empaquetado conserva ruta, origen WebView y perfil QA de la edición portable en `%LOCALAPPDATA%\MIDI HUD\WindowsQA`. Cierra el portable antes de iniciar la versión instalada.

La identidad `MidiHud.WindowsQA` y la publicación preliminar `windows-qa` son exclusivas de pruebas. La identidad y publicación estables están reservadas en `config/native-updates.json`. El generador solo admite el portable QA, que tiene su propio perfil y origen. La sección de versión de Android e iOS reserva los proveedores de cada canal y mantiene apagados los puntos de integración hasta validar las cuentas y configurar los adaptadores de tienda.

### Preparar y publicar una versión QA

1. Publica WPF como se indica abajo. Ejecuta `python native/windows/package_updates.py dist/windows dist/update 1.0.0.0 "CN=EDITOR QA"` desde la raíz del repositorio. Usa el valor exacto de Subject del certificado QA y sube los cuatro componentes de versión en cada publicación.
2. Empaqueta con Windows SDK: `makeappx pack /d dist/update/layout /p dist/update/midi-hud-windows-qa-x64-1.0.0.0.msix`. Firma el MSIX con SignTool, SHA-256, el certificado QA y un sello de tiempo de confianza. Verifica con `signtool verify /pa /v RUTA.msix`. Protege la clave privada y mantén el mismo editor para las sucesivas versiones. El equipo de destino debe confiar en el certificado.
3. En el repositorio oficial, usa la publicación preliminar con etiqueta fija `windows-qa`. Sube el MSIX con su nombre versionado y verifica su descarga HTTPS. Sube o sustituye `midi-hud-windows-qa-x64.appinstaller` al final. Conserva los MSIX anteriores y evita que la publicación QA pase a ser la última versión estable. Verifica ambos archivos por su URL pública. El repositorio y los activos deben ser accesibles a Windows App Installer sin sesión de GitHub. La lista de archivos de CI sirve para QA, independientemente de la publicación firmada.

### Primera instalación y recuperación

Exporta una copia JSON del repertorio y conserva una copia del directorio de perfil QA con MIDI HUD cerrado. Con Windows App Installer y WebView2 Runtime disponibles, descarga el `.appinstaller` de la publicación QA verificada, ábrelo y acepta instalar la versión firmada por el editor indicado en la publicación. Abre MIDI HUD Pruebas desde Inicio y comprueba repertorio, lead sheets y entrada MIDI. Instalar solo el MSIX no registra el origen de actualizaciones. Para buscar manualmente fuera de un ensayo, cierra la aplicación y vuelve a abrir el descriptor del canal QA.

Si falla una descarga o firma, conserva la instalación anterior y vuelve a intentar desde Inicio cuando se restablezca el origen. Si una versión instalada tiene un defecto funcional, publica una compilación corregida o reconstruida a partir de la última versión buena, con un número superior y la misma identidad. Evita desinstalar para recuperar una versión. La instalación de una versión inferior está desactivada.

Base: Android QA 75a4e503e702fcacbc9e98eb5a185295040bf3fc. Contenedor WPF/.NET 8, WebView2, Windows 10 2004+ x64; requiere WebView2 Runtime. Empaqueta la raíz canónica sin duplicar código editable; aislamiento https://midihud.local/windows-qa/ y almacenamiento en %LOCALAPPDATA%/MIDI HUD/WindowsQA. No cambia web publicada, Android, iOS, firmware ni configuración GT/Chocolate.

- Entrada MIDI mediante Windows.Devices.Midi (USB y BLE si el sistema expone un puerto MIDI), selección de un puerto, eventos de desconexión. Emparejamiento BLE desde ajustes de Windows. Solo recepción; probar reconexión y selección físicamente.
- Controller Manager: monitor CC/PC/hex, verificación manual del siguiente mensaje, filtro Clock y exportación de registro. Programación, lectura de memoria, backup del controlador y comparación automática con mapa SIG quedan pendientes de auditar protocolo/firmware/licencia de las herramientas existentes.
- Importación mediante selector de archivos WebView, exportación JSON mediante diálogo nativo; validar ambas en Windows.
- Google Drive no configurado, sin red desde WebView. Pendiente cliente OAuth de escritorio en proyecto de pruebas, autorización externa con PKCE, protección local de tokens y prueba de sincronización.
- Nombre visible MIDI HUD; versión interna Alpha 0.1. Icono compacto derivado de la captura de referencia aportada por el usuario el 26/11/2026; SVG común assets/brand/midi-hud.svg, ICO de 7 tamaños, ejecutable y ventana. Reconstrucción vectorial de proporciones y colores aproximados; no es el raster original. MSIX firmado/Microsoft Store pendientes.

## Compilación
Windows con .NET 8 SDK, Python 3 y WebView2 Runtime:
```powershell
cd native/windows
dotnet publish MidiHud.Windows.csproj -c Release -r win-x64 --self-contained true -o ../../dist/windows
```
CI ejecuta regresión Node y empaquetado, comprueba hashes y publica ZIP portable si tiene éxito. Extraer toda la carpeta y abrir MIDI HUD.exe; no ejecutar desde dentro del ZIP. No hay instalador ni firma de distribución todavía. CI no acredita ejecución física ni Bluetooth. Pruebas: Inicio/LIVE/Editor, importación/exportación JSON, modo U, CC/PC canal aprobado, desconexión, coexistencia GT y persistencia al actualizar. Usar copia del repertorio.

Primera CI 45833385173: 274 pruebas correctas; fallo NETSDK1152 por recursos duplicados en publish. Corrección: generación y copia posterior a Build/Publish, sin declarar los recursos como Content del SDK; SDK 8 fijado en global.json. Revalidar CI.

CI corregida: `f96f2b443c82b787691dd0928c43b6e2cfa9be17`, [run 45833793227](https://github.com/geobit1989-crypto/MIDI-HUD/actions/runs/45833793227), compilación y hashes correctos. [Portable anterior al icono](https://github.com/geobit1989-crypto/MIDI-HUD/actions/runs/45833793227/artifacts/15122899234), 79.234.515 bytes. Nuevo build del icono pendiente de CI. Identidad visual: captura del usuario, módulos de 38,25 y separación 1,5 en lienzo 108; colores muestreados. Fondo a sangre sin esquinas blancas. Fuente única SVG; otros contenedores pendientes de adaptación. No cambiar los identificadores internos.
