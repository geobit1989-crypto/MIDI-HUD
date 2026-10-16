# MIDI HUD: instalación y renovación desde Windows

Esta carpeta prepara la entrega para un iPhone **sin Mac local**. El binario iOS se compila en GitHub Actions (macOS), y la firma con la cuenta gratuita de Apple se realiza **solo en el Windows del propietario**, usando Sideloadly.

## Primera instalación

1. Instala [GitHub CLI](https://cli.github.com/), inicia una sesión en tu repositorio con `gh auth login` y conserva tu contraseña Apple **fuera** de GitHub y de Codex.
2. Descarga [Sideloadly](https://sideloadly.io/) desde el sitio oficial e instala los componentes iTunes/iCloud para Windows que indique el instalador. Si Sideloadly lo necesita, instala también Bonjour.
3. Conecta el iPhone por USB, pulsa **Confiar en este ordenador** y activa **Modo de desarrollador** en Ajustes → Privacidad y seguridad, si iOS lo solicita.
4. En la raíz del repositorio, ejecuta desde PowerShell:

   ```powershell
   powershell -ExecutionPolicy Bypass -File .\windows\preparar-midi-hud.ps1
   ```

   El script selecciona la ejecución completa más reciente de la rama iOS, descarga el artefacto, verifica que el IPA contenga `Payload/MIDIHUD.app/Info.plist`, guarda la versión en Descargas y abre su ubicación. **No contiene credenciales de Apple, no firma y no instala**.
5. Arrastra ese `*.ipa` a Sideloadly. Selecciona el iPhone y usa tu Apple ID. Activa **Automatic Refresh** al instalar. Mantén siempre el mismo Apple ID y Bundle ID para renovar o actualizar sin eliminar la instalación anterior.
6. Configura la conexión por Wi-Fi con el ordenador; conserva Sideloadly Daemon activo y el PC disponible regularmente. La renovación automática solo se intenta si el iPhone es visible por Wi-Fi o USB.

## Dos operaciones diferentes

- **Renovar la firma**: Sideloadly Daemon puede renovar en segundo plano la versión ya instalada, sin volver a ejecutar Codex, GitHub ni el script.
- **Instalar una nueva versión de MIDI HUD**: ejecuta de nuevo `preparar-midi-hud.ps1` para obtener el IPA reciente y vuelve a instalarlo mediante Sideloadly. Mantén la opción de renovación automática.

## Limitaciones y precauciones

- La cuenta gratuita de Apple genera perfiles temporales de unos **siete días**. Si el Windows no está disponible, la renovación puede fallar y la aplicación podría dejar de abrir. Comprueba la fecha antes de tocar en directo.
- Es importante **actualizar encima de la instalación existente** y no borrar la app para conservar el almacenamiento local. Realiza un respaldo del repertorio.
- Un `*.ipa` sin firma **no puede instalarse directamente** pulsándolo en el iPhone.
- El proyecto iOS todavía necesita la configuración OAuth específica para la sincronización privada de Drive. La conexión de Drive en ChatGPT **no** configura automáticamente la app.
- No se han verificado aún el iPhone físico, el Chocolate Plus ni la renovación automática para MIDI HUD.
- Sideloadly es un servicio de terceros: instala solo desde su sitio oficial y evalúa el riesgo de proporcionar tus credenciales de Apple a una herramienta externa.

Documentación: [Sideloadly FAQ](https://sideloadly.io/faq), [AltStore Windows](https://faq.altstore.io/altstore-classic/how-to-install-altstore-windows), [Apple Developer Personal Team](https://developer.apple.com/help/account/basics/about-your-developer-account).
