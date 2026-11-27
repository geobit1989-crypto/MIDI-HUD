# Retorno Google OAuth — Windows e iOS

Corrección acotada: conservar servidor común, PKCE, sesiones y biblioteca única. No se modifica el esquema D1, scopes ni identidad de biblioteca.
- iOS: ASWebAuthenticationSession con callback midihud-oauth://complete.
- Windows: navegador del sistema, retorno exclusivo a 127.0.0.1, puerto efímero y ruta aleatoria. Reactiva la ventana sin navegar el WebView; el navegador puede impedir el cierre automático de la pestaña y Windows puede limitar el foco.
- Worker acepta únicamente el retorno correspondiente al origen. Callback sin tokens ni pruebas. Clientes anteriores y Android conservan flujo previo.
- Nuevo cliente exige confirmación del destino por servidor. Desplegar Worker compatible antes de probar.
- Pendientes: CI, autorización/cancelación, retorno a Ajustes y sincronización física de ambas plataformas. No borrar biblioteca ni sesiones para probar.
