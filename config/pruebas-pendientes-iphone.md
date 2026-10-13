# MIDI HUD — Pruebas pendientes (iPhone / Safari)
Fecha: 13 de octubre de 2026
Estado: pendientes de validación en dispositivo real.

## Enlaces
- Configuración: https://geobit1989-crypto.github.io/MIDI-HUD/editor/
- LIVE: https://geobit1989-crypto.github.io/MIDI-HUD/worship-demo/

## Prueba principal: flujo sin exportar ni importar
- [ ] Abrir Configuración en Safari normal (no privado).
- [ ] Crear una canción de prueba con tres presets: Clean, Drive y Solo. Editar sus nombres y asignaciones Morph.
- [ ] Pulsar el botón superior derecho «♫ LIVE» y verificar que se muestran los cambios **sin exportar ni importar JSON**.
- [ ] Mantener pulsado el engranaje de LIVE durante dos segundos: comprobar barra de progreso y acceso a Configuración.
- [ ] Verificar que un toque corto al engranaje no abre Configuración.
- [ ] Cambiar el nombre de un preset, regresar a LIVE y comprobar que se actualiza.
- [ ] Cerrar y reabrir Safari; confirmar que el repertorio editado persiste.

## Controles LIVE
- [ ] Cambiar entre Clean, Drive y Solo.
- [ ] Comprobar que Morph vuelve a cero al cambiar de preset.
- [ ] Verificar Morph ambiental en Clean, sin asignación en Drive y boost en Solo.
- [ ] Cambiar volumen y verificar que mantiene su valor al cambiar de preset.
- [ ] Poner volumen a cero y verificar indicación de silencio de ambas rutas (solo simulación visual; todavía no controla audio ni MIDI).

## Copias de seguridad y funcionamiento sin red
- [ ] Exportar JSON desde Configuración y conservar una copia.
- [ ] Importar JSON de respaldo y verificar recuperación de cambios.
- [ ] Probar la apertura sin conexión y anotar qué funciona: **no se ha implementado todavía un modo offline garantizado**.

## Limitaciones conocidas
- LIVE muestra principalmente la primera canción y hasta tres presets; navegación entre canciones pendiente.
- El navegador todavía no envía MIDI real a la Boss GT-1000CORE.
- La persistencia depende del almacenamiento local del navegador y puede perderse al borrar datos del sitio.
- La validación de la interfaz táctil en iPhone sigue pendiente.

## Resultado de la prueba
Fecha y hora: __________
¿Flujo Configuración → LIVE sin archivos?: __________
¿Engranaje 2 s?: __________
¿Persistencia?: __________
Incidencias y capturas: __________
Próximo paso, si pasa: diseñar navegación entre canciones en LIVE.
