# MIDI HUD

Prototipo del sistema SIG. Estructura consolidada el **14 de octubre de 2026**.

## Arquitectura de desarrollo

1. **LIVE v0.3**: [v03.html](./v03.html). Maqueta visual de la futura aplicación. Se mantiene su diseño sin cambios y todavía no está conectada al motor.
2. **LAB v0.2**: [lab/index.html](./lab/index.html). ÚNICO banco de pruebas operativo y autónomo. Usa el motor directamente, sin iframe ni dependencia del prototipo antiguo. Permite navegar repertorios, canciones y presets, modificar Morph y la posición simulada de Wah y observar las intenciones MIDI. No envía MIDI real.
3. **Editor**: [editor/index.html](./editor/index.html). Edita repertorios, canciones y presets. Comparte las reglas de validación del motor. Los cambios se guardan en este navegador; para probarlos, copia la configuración a LAB.
4. **Motor**: [core/engine.mjs](./core/engine.mjs). Máquina de estados independiente de la interfaz: valida datos, gestiona navegación y controles, produce intenciones MIDI y expone un modelo de visualización. No abre conexiones de hardware ni emite audio.

El antiguo `worship-demo/` redirige a LAB; `index.html` redirige a LIVE v0.3. El histórico de Git conserva el código anterior.

## Aislamiento de pruebas

- El editor utiliza la clave local `hudLibrary`; LAB usa `hudLabLibrary`.
- Las pruebas de navegación, Morph y Wah no cambian el repertorio del editor.
- Solo la acción **«Aplicar LAB al editor»**, previa confirmación, transfiere el JSON de LAB al editor y guarda un respaldo local en `hudLibraryBackup`.
- LAB no gobierna los botones ni la apariencia de LIVE v0.3.
- El pedal de **volumen queda fuera** de MIDI HUD y del LAB. Los CC y cambios de programa son **provisionales**.
- Los mensajes de LAB son diagnósticos, **no comandos transmitidos a la GT-1000CORE**.

## Cómo probar

1. Abrir `editor/` y preparar una canción o un preset.
2. Abrir `lab/` en el mismo navegador y origen.
3. Pulsar «Copiar editor → LAB» para probar una copia sin alterar el editor.
4. Cambiar canción, preset y Morph/Wah y revisar el registro de eventos.
5. Abrir `v03.html` solo para revisar el diseño visual.

## Pendiente de definición conjunta

Revisar las reglas operativas: persistencia y valor inicial de Morph, activación y posición del Wah, navegación entre canciones/presets, asignación de los controles y conexión MIDI real. Probar manualmente en Safari/iPhone. No se debe considerar MIDI verificado contra hardware hasta efectuar esas pruebas.

## Formato de configuración

El esquema sigue siendo `1.0.0`. El motor es ahora `0.3.0`. El motor migra referencias heredadas de volumen y Program Change de presets sin usarlas.

## Direcciones MIDI de canciones (18 de octubre de 2026)

- Contrato documentado: [CC0 (banco) → PC (canción)](./config/SIG-MIDI-song-selection-v1.md).
- Fuente única de direcciones: [repertorio maestro SIG en Google Sheets](https://docs.google.com/spreadsheets/d/1s8W76PE3IqGHv9uPbIZTRmvZswZ4LGVzhZr4W2fBrQs/edit) (columnas E/F).
- [Instantánea de 133 canciones con CC0 y PC](./config/sig-midi-song-addresses-v1.json): registro sincronizado manualmente con el maestro en fecha indicada; no es una API en vivo.
- Al abrir el editor actualizado en el mismo navegador/origen, se aplican automáticamente direcciones a las canciones guardadas que coincidan por título y autor. Se conservan los IDs y los estados. Al importar después un CSV del maestro, también se leen CC0 y PC.
- El editor muestra CC0/PC en campos de solo lectura. El botón «Nueva canción» **no** asigna direcciones MIDI; esa asignación debe originarse en el maestro.
- El motor admite `RECEIVE_CC` y `RECEIVE_PC` y emite intenciones CC0 → PC al seleccionar una canción. No hay puente MIDI físico integrado todavía y LIVE v0.3 sigue siendo una maqueta estática.
- **Limitación actual:** al añadir canciones al Google Sheet no se actualiza el registro de GitHub por sí solo; hay que publicar la nueva instantánea o importar CSV actualizado desde el editor.

