# Biblioteca MIDI HUD QA

Web móvil y escritorio, Windows, Android e iOS usan la misma biblioteca en Google Drive. Los contenedores empaquetan los recursos de la raíz del repositorio.

- Identidad de Drive: `midi-hud-test-sync-20261127-v1`.
- Identidad del documento: `midi-hud-qa-20261127`.
- Revisión inicial: `9e7965fd-52eb-4ddd-baf8-9e50381fedcc`.
- Datos iniciales: Quão Grande É o Meu Deus, siete estados, cuatro secciones y once asignaciones MIDI de canción.
- Historial anterior: `midi-hud-test-sync-v1`. El respaldo privado exportado el 27/11 a las 20:31 UTC conserva las cuatro revisiones. Se conserva fuera del repositorio.

El motor QA acepta solo revisiones de la nueva identidad que descienden de su revisión inicial. Una cuenta que todavía no tiene esa revisión no puede inicializar la biblioteca desde una copia local. El almacenamiento de bibliotecas, borradores y bases de sincronización se separa del historial anterior. Las preferencias de dispositivo y las sesiones OAuth conservan sus claves. En HOME puede aplicarse una sincronización compatible. Durante LIVE, el motor conserva la interpretación activa. El Editor conserva borradores de la biblioteca nueva.

La escritura y lectura de la revisión inicial se verificaron en Drive. La instalación y sincronización bidireccional con la cuenta real en los cuatro clientes requieren aceptación por dispositivo. El respaldo anterior se conserva íntegro y permanece fuera de las rutas de recuperación de los clientes nuevos. Para recuperarlo, utilizar el respaldo privado, cotejar su SHA-256 con el registro canónico y autorizar expresamente una restauración antes de importarlo.
