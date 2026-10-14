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

`config/midi-hud-data-v1.json` mantiene el esquema `1.0.0` de repertorios. El motor es `0.2.0`. El motor migra referencias de volumen de los JSON antiguos sin usarlas.
