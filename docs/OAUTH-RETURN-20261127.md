# Retorno Google OAuth — Windows e iOS

Corrección acotada: conservar servidor común, PKCE, sesiones y biblioteca única. No se modifica el esquema D1, scopes ni identidad de biblioteca.
- iOS: ASWebAuthenticationSession con callback midihud-oauth://complete.
- Windows: navegador del sistema, retorno exclusivo a 127.0.0.1, puerto efímero y ruta aleatoria. Reactiva la ventana sin navegar el WebView; el navegador puede impedir el cierre automático de la pestaña y Windows puede limitar el foco.
- Worker acepta únicamente el retorno correspondiente al origen. Callback sin tokens ni pruebas. Clientes anteriores y Android conservan flujo previo.
- Nuevo cliente exige confirmación del destino por servidor. Desplegar Worker compatible antes de probar.
- Pendientes: CI, autorización/cancelación, retorno a Ajustes y sincronización física de ambas plataformas. No borrar biblioteca ni sesiones para probar.

## Segunda revisión de Windows (27/11/2026)

La prueba física del usuario mostró que la redirección local se recibía, pero el navegador seguía en primer plano. `window.close()` no es una garantía para una pestaña externa. Se sustituye por una ventana independiente de Edge (Chrome como alternativa), con perfil temporal único y proceso propiedad del flujo OAuth. Al recibir el callback o cancelar, se cierra ese proceso, se elimina su perfil temporal cuando es posible y se restaura la ventana original de HUD sin navegar el WebView. No se cierra el navegador habitual ni se modifican sus perfiles. Se requiere Edge o Chrome instalado; se usa un perfil temporal y no las cuentas guardadas en el navegador habitual. No se modifica iOS, el Worker ni la biblioteca. Compilación y aceptación física pendientes.

## Tercera revisión Windows (27/11/2026)

El usuario rechaza cambiar Chrome por Edge y crear un perfil temporal. El historial muestra que la versión WPF anterior a la unificación aún no tenía conexión Drive operativa; por ello no se restaura un código nativo histórico inexistente. Se mantiene el servidor y se utiliza Chrome instalado con su perfil habitual y `--new-window`. En ausencia de Chrome se conserva el navegador del sistema. El callback local devuelve un título con nonce único; se identifica exclusivamente una ventana nueva con ese título y, en Chrome, el proceso Chrome. Se solicita WM_CLOSE y se verifica que la ventana desapareció; jamás se cierran ventanas preexistentes ni procesos del navegador. Se reactiva HUD sin navegar Ajustes. Si el navegador no permite identificar/cerrar la ventana, se registra una advertencia y no se fuerza el cierre de ventanas ajenas. Se añade prueba de Windows con Chrome real y dos ventanas para verificar cierre selectivo (el perfil aislado pertenece solo a la prueba de CI, no a la app). No se modifica iOS, Worker, biblioteca ni sesiones. Prueba OAuth real pendiente de aceptación física.

## Retorno de Ajustes web

Prueba del usuario: Inicio → Ajustes → Google terminaba en LIVE, porque el callback vuelve a v03.html sin estado de navegación. Se conserva el origen HOME/LIVE dentro del registro local de prueba OAuth existente, limitado a diez minutos, al pathname esperado y a callbacks de autorización/cancelación. Se lee antes de que restore consuma el registro; se abre Ajustes y su cierre recupera el origen. No se cambia el Worker, el destino autorizado, los datos ni el flujo nativo. Prueba unitaria añadida para ambos orígenes, cancelación, almacenamiento alternativo, expiración y ruta incorrecta. Aceptación web real pendiente.

## Android QA (28/11/2026)
Se añade retorno fijo io.midihud.app.androidqa://oauth/complete limitado al origen Android, actividad singleTask y apertura mediante Custom Tabs cuando el navegador lo admite. El retorno no transporta credenciales; se mantiene el intercambio por prueba y polling existente. Biblioteca y sesiones intactas. Requiere desplegar Worker compatible antes de autorizar con el APK nuevo. Pendientes CI y prueba física de retorno, cancelación y sincronización; el navegador puede conservar su pestaña según implementación.
