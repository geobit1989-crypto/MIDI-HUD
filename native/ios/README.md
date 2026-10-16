# MIDI HUD para iPhone y iPad

Aplicación iOS con Core MIDI de entrada, Editor y LIVE compartiendo almacenamiento local, recursos web incluidos y sincronización privada mediante Google Drive. El motor y la interfaz proceden directamente de `beta-v3.4`; no se mantiene otra implementación del editor. No hay salida MIDI ni telemetría de la GT.

## Construir y probar

Abrir `MIDIHUD.xcodeproj` en un Mac con Xcode y seleccionar el esquema MIDIHUD. El proyecto incluye el SDK oficial GoogleSignIn-iOS 10.0.0 mediante Swift Package Manager. La fase de compilación ejecuta `prepare_web.py` para incluir el editor y LIVE sin conexión. Requiere iOS 16 o posterior.

Para reconstruir el proyecto después de añadir archivos Swift: `python3 native/ios/generate_project.py` desde la raíz del repositorio. El proyecto generado está incluido, de modo que este paso no es necesario para abrirlo.

La acción de GitHub **MIDI HUD iOS and synchronization** compila y prueba en un simulador de iPhone y produce una aplicación para dispositivo **sin firma**. Ese ZIP sirve para comprobar la compilación: no es un instalador utilizable en un iPhone. Para instalar se necesita firmar con la cuenta de Apple correspondiente, desde Xcode o mediante una distribución configurada en App Store Connect/TestFlight.

Pruebas web: `node --test beta-v3.4/tests/*.test.mjs` y `node beta-v3.4/tests/check-site.mjs`.

## Activar Google Drive

Esta integración no reutiliza la conexión de Google Drive de ChatGPT ni contiene credenciales de otro servicio. Necesita identificadores OAuth propios de MIDI HUD. Los identificadores de cliente son públicos; no se introduce ningún secreto de cliente en la web ni en la app.

1. En un proyecto de Google Cloud, habilitar Google Drive API y configurar Google Auth Platform. Si está en modo de prueba, añadir la cuenta de Google que se usará como usuario de prueba.
2. Crear un cliente OAuth de tipo **Aplicación web**. Añadir `https://geobit1989-crypto.github.io` como origen JavaScript autorizado. Colocar su identificador en `beta-v3.4/config/cloud-sync.json`, campo `googleWebClientId`.
3. En el **mismo proyecto Google Cloud**, crear un cliente OAuth **iOS**, con el identificador de paquete elegido para la app (por defecto `io.midihud.app`).
4. Crear `Config/Local.xcconfig` junto a `App.xcconfig`, con los valores:

   ```xcconfig
   GOOGLE_IOS_CLIENT_ID = IDENTIFICADOR_IOS.apps.googleusercontent.com
   GOOGLE_REVERSED_CLIENT_ID = com.googleusercontent.apps.IDENTIFICADOR_IOS
   DEVELOPMENT_TEAM = EQUIPO_APPLE
   ```

   Si se cambia el paquete, añadir también `PRODUCT_BUNDLE_IDENTIFIER = paquete.elegido` y usar exactamente ese paquete en el cliente OAuth iOS. El cliente web y el cliente iOS son distintos y deben pertenecer al mismo proyecto.

5. Compilar, instalar y pulsar **Sincronización → Conectar con Google** tanto en el editor web como en la app. Elegir la misma cuenta.

El permiso de Drive es únicamente `drive.appdata`, para los datos privados de MIDI HUD. La web utiliza Google Identity Services y guarda el token solo en memoria; al caducar solicita reconectar. iOS utiliza el SDK oficial y su almacenamiento seguro de sesión. La autorización se abre mediante el flujo del sistema, fuera del WKWebView del editor. Los tokens no se entregan a JavaScript en iOS.

Hasta completar estos identificadores, la app funciona localmente y con MIDI; la interfaz indica que la conexión de Drive necesita configurarse. No simula una cuenta conectada ni muestra que esté sincronizada.

Documentación oficial: [Google Sign-In iOS](https://developers.google.com/identity/sign-in/ios/start-integrating), [datos privados de Drive](https://developers.google.com/workspace/drive/api/guides/appdata), [Google Identity Services web](https://developers.google.com/identity/oauth2/web/guides/use-token-model).

## Uso

- Al abrir la app aparece el Editor. Guardar una sección conserva la biblioteca local y programa la sincronización cuando la cuenta está conectada. Abrir LIVE utiliza la misma biblioteca y los mismos recursos, sin exportar archivos.
- En LIVE, Configuración contiene **Sincronización**, el canal MIDI, la selección de entrada y **Conectar Bluetooth MIDI**. Autorizar entrada MIDI abre Core MIDI y enumera las fuentes conectadas. USB depende de que iOS reconozca el dispositivo y la conexión; el selector Bluetooth es el de Apple.
- LIVE intenta actualizar antes de iniciar el motor, con una espera máxima de tres segundos. Si la conexión tarda, abre la biblioteca local. Una sesión ya iniciada conserva sus canciones y estados; **Actualizar repertorios** aplica los cambios por elección explícita y vuelve a abrir LIVE.
- El MIDI de entrada tiene el mismo contrato CC + valor + canal que la web. Se respetan running status, mensajes fragmentados y bytes de reloj intercalados. Program Change y Note no se interpretan como acciones de HUD.
- Al desconectar Google, las canciones locales permanecen. Los ajustes de canal y la entrada MIDI seleccionada pertenecen al dispositivo y no se sincronizan.

## Protección de cambios

Cada guardado remoto añade una versión inmutable en `appDataFolder`, con referencias a sus antecesores. Dos dispositivos que suben a la vez generan ramas que se reúnen después; no sobrescriben un único archivo compartido. El sistema no necesita comparar los relojes de los dispositivos.

La fusión automática agrupa cada canción con todos sus estados y módulos. Los cambios en canciones diferentes pueden unirse; si se edita la misma canción en dos lados, se conservan ambas bibliotecas y se pide elegir qué cambios mantener. La elección solo afecta a los elementos en conflicto cuando la mezcla mantiene referencias válidas; si hay dependencias incompatibles, se elige una biblioteca completa. Las asignaciones MIDI globales se tratan juntas y nunca se reconstruyen a partir de nombres o índices.

Las copias de un conflicto se consultan en **Sincronización → Versiones conservadas** en el dispositivo donde se detectó. Recuperar una conserva la biblioteca local anterior. El historial de Drive no se borra automáticamente. La primera versión admite 2 MB por biblioteca y 5.000 versiones de historial, límites explícitos que detienen la sincronización sin borrar datos.

## Límites de validación

Las pruebas de Node cubren dos dispositivos, edición simultánea, desconexión, conflictos, cambios mientras se sube, errores de almacenamiento, REST de Drive y el puente nativo con el adaptador de navegador existente. XCTest cubre el parser MIDI nativo y un WKWebView real que abre el editor incluido, guarda y abre LIVE con esa biblioteca.

El simulador no valida el controlador físico. La autorización real de Google requiere los identificadores configurados. Antes de usar en una actuación, falta probar en el iPhone con Chocolate Plus/USB/Bluetooth y confirmar la conexión y la geometría de la pantalla con el hardware real.
