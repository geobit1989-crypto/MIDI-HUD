## LIVE v3.2 — Lead sheet adaptable, controles +5 % y títulos delimitados (15/10/2026)

- Se asignan **cinco puntos porcentuales adicionales de altura de pantalla** al bloque de controles respecto a la distribución previa. En iPhone, crece la matriz 3×3, preservando encabezado y EXP; el lead sheet utiliza el resto.
- La partitura ajusta dinámicamente los tamaños de acordes, letras de sección y símbolos de repetición usando mediciones reales de anchura y altura en el navegador. Recalcula al cambiar de canción, modificar la ventana o rotar el dispositivo. Las canciones cortas aprovechan el espacio; las densas reducen tipografía para mostrar todos los compases posibles.
- Se aprovecha el ancho de renglones cortos sin añadir compases ficticios. Los dos acordes de un compás mantienen su posición proporcional.
- Los nombres de sección tienen una **columna lateral estricta del 17,6 %**, con límite `min-width:0`, `overflow:hidden`, ajuste de palabras completas y disposición vertical en móvil; nunca invaden las columnas de acordes.
- El símbolo gráfico de repetición `/` deja de centrarse verticalmente: aparece arriba, a la misma altura que los acordes, y utiliza el tamaño de letra adaptativo.
- Pruebas automatizadas `tests/sheet-fit.test.mjs` validadas en GitHub Actions (77 pruebas). Adicionalmente, visualización CSS + renderizador de la hoja probada en Chromium `page.set_content` a 390×844 y 1200×800 con partituras cortas, normales y densas, sin invasión lateral ni desbordamiento horizontal. Esta simulación no supone una comprobación del navegador Safari físico ni del arranque completo en la URL pública.

---
## Editor v3 — Estados unificados y guardado por sección (15/10/2026)

**Secciones actuales:** Canción · **Estados** · Lead sheet · MIDI.

La pestaña **Estados** reúne la definición de estados musicales y la personalización de las nueve casillas de LIVE. Selecciona una casilla 1–9, elige el estado vinculado y configura título, descripción, color (paleta o personalizado) e icono. Las casillas sin estado pueden conservarse para referencias estáticas de la GT. La configuración de color e icono se guarda en las propiedades opcionales de `song.displaySlots[]` para preservar compatibilidad con bibliotecas anteriores. LIVE muestra el gradiente y el icono elegidos.

**Guardado manual:** cada pestaña tiene un único botón con el texto exacto **Guardar**. Editar campos, módulos, lead sheet o asociaciones MIDI solamente actualiza la copia de trabajo en memoria; no modifica `hudLibraryV1` hasta pulsar Guardar. Al abandonar una pestaña con cambios pendientes aparece una advertencia y se pueden descartar. Exportar solo incluye lo último guardado. Se mantiene una copia anterior en `hudLibraryV1Backup`.

**iPhone:** el panel lateral de repertorios se encuentra inicialmente recogido para dar prioridad al contenido del editor. El botón **Biblioteca** permite mostrarlo y elegir otra canción; después se recoge de nuevo.

**Versiones anteriores conservadas:** `editor/v2.html` (edición con guardado automático), `editor/v1.html`, `editor/legacy.html`; la entrada `editor/` abre v3. La biblioteca no se borra ni se reemplaza al cambiar de versión.

**Pruebas:** Node + GitHub Actions; validación interactiva de estados, iconos, colores, canciones, lead sheet y MIDI con Chromium aislado en memoria, incluida comprobación de que el almacenamiento no cambia antes de pulsar Guardar. Prueba con Chrome/Safari reales y Chocolate BLE todavía pendiente.

---

## Editor beta — Lead sheet textual y guardado automático (14/10/2026)

Restaurado el lector de lead sheets v0.4 del proyecto: edición mediante texto con secciones, compases entre |, acordes mayores/menores con # o b, / como compás anterior, y |: ... :| como repetición. El editor muestra simultáneamente el texto, números de línea, diagnósticos y partitura generada. Un compás permite uno o dos acordes; la posición exacta del pulso no se infiere.

Las canciones, estados y nueve módulos visuales se guardan automáticamente sin botones por campo. Las partituras válidas se guardan tras una pausa; si el texto queda incompleto o contiene errores, se almacena un borrador local y LIVE conserva la última partitura válida. Importar o deshacer refresca la fuente textual del editor sin mostrar contenido obsoleto.

En LIVE se incorpora un acceso directo al Editor junto a Configuración. El menú actualizado separa recepción MIDI global, navegación de canciones y enlaces a Editor, LAB e Inicio. No se transmite MIDI a la GT.

Verificación: tests del motor, parser, editor y LIVE mediante GitHub Actions; prueba funcional aislada en Chromium local. La integración de hardware BLE sigue pendiente.

---

# Motor MIDI HUD v1.0 — beta de desarrollo

Esta rama implementa el motor de **visualización** MIDI basado en los acuerdos del 14/10/2026. Se mantiene el prototipo visual LIVE v0.3 y el código v0.2 como respaldo. **No envía mensajes a la GT-1000CORE.**

## Qué se añadió (sin sustituir los respaldos)

- Motor puro: [core/engine-v1.mjs](core/engine-v1.mjs): interpreta canal MIDI global + CC + valor; ejecuta las acciones configuradas; separa canción/estado activos de previsualización; recuerda último estado por canción en la sesión; no envía MIDI ni reinicia Morph/Wah.
- Datos v2: [config/midi-hud-data-v2.json](config/midi-hud-data-v2.json): TONO (valor), BPM, lead sheet, estado inicial, estados y correspondencias CC/valor→acciones. **Los valores son ejemplos no verificados en Chocolate o GT.**
- Ajustes: [core/settings-v1.mjs](core/settings-v1.mjs): canal MIDI 1–16 persistido globalmente, nunca por canción.
- Entrada MIDI opcional: [core/midi-browser.mjs](core/midi-browser.mjs). Solo para navegadores/sistemas con Web MIDI y puertos de entrada expuestos. Safari iOS no ofrece Web MIDI estándar; la integración BLE del iPhone queda pendiente de adaptador nativo u otra plataforma probada.
- LIVE: [v03.html](v03.html) mantiene CSS y composición original; ahora carga motor y puede abrir Configuración desde ⚙, cambiar canal, consultar canciones y autorizar MIDI donde sea compatible. Refleja tono como valor (sin etiqueta), BPM, banco, título, módulos por canción y estado seleccionado.
- [LAB v1](lab/midi-v1.html): simula los CC del controlador, prueba canales, cero/127, estado activo y previsualización; sin MIDI de salida.
- [Editor v1](editor/v1.html): edita canciones, tonalidad, lead sheets, estados, estado inicial, matrices visuales y asociaciones CC + valor. La política de colisiones presenta advertencias.
- [Pruebas](tests/engine-v1.test.mjs): 12 casos reproducibles con \`node --test tests/engine-v1.test.mjs\`.

## Cómo probar sin hardware

Servir la carpeta completa desde un servidor HTTP bajo un mismo origen, para permitir importaciones ES module y carga de JSON. Por ejemplo con Python: \`python -m http.server 8000\`; después abrir \`http://localhost:8000/lab/midi-v1.html\`, \`/editor/v1.html\` y \`/v03.html\`. No abrir los archivos individuales mediante file:// ni subir solamente v03.html a Drive: la versión modular depende de los otros archivos.

**Aislamiento:** editor v1 usa \`hudLibraryV1\`; LAB v1 usa \`hudLabLibraryV1\`; configuración global \`midiHudSettingsV1\`. No sustituyen las claves ni archivos del prototipo anterior.

**Pendiente antes de producción:** comprobar entrada BLE MIDI real en la plataforma final, verificar valores emitidos por Chocolate, validar la interfaz en tamaño móvil con el usuario y decidir cómo desplegar el conjunto de archivos en Drive sin romper el HTML actualmente utilizable. La prueba automatizada no equivale a prueba con hardware ni a una validación visual.

---

## Editor visual v2 — fase de construcción

**Entradas:** [editor/](editor/) abre [editor/v2.html](editor/v2.html); respaldo de la versión anterior en [editor/legacy.html](editor/legacy.html).

La interfaz incluye cinco áreas:
- **Canción:** título, tonalidad (editor), BPM, banco mostrado y estado inicial.
- **Estados:** crear, duplicar, eliminar, reordenar, escoger módulo de la matriz y documentar patch GT, más indicadores ON/OFF.
- **Módulos:** editar los nombres y las descripciones de las nueve casillas LIVE sin rediseñar su distribución.
- **Lead sheet:** hasta cuatro secciones con compases de cuatro pulsos; edición de acordes y glifo de repetición en LIVE.
- **MIDI:** matriz ilustrativa Chocolate (ocho bancos por cuatro botones), CC inicial y valor configurables, selección CC+valor fuera de la matriz, edición de listas de acciones, reordenación y advertencias de conflictos. El editor no configura el canal MIDI de recepción por canción.

**Biblioteca y seguridad:** archivos v2 JSON con validación transaccional, copia previa en localStorage, posibilidad de deshacer el último cambio, importación/exportación, eliminación referencial de acciones huérfanas y separación de los datos de la versión anterior.

**Importante:** guardar en el editor no programa el controlador ni la GT. Los números CC del ejemplo son demostrativos. Las acciones son instrucciones visuales interpretadas por el motor.

**Pruebas:** `node --test tests/engine-v1.test.mjs tests/editor-model.test.mjs tests/editor-ui.test.mjs`. La validación de scripts y los tests automatizados **no sustituyen** una revisión visual y funcional real en navegador/tablet. El proyecto es modular: requiere servir los archivos como un sitio estático bajo el mismo origen para usar imports ES module, JSON y almacenamiento local.

---

## Documentación del prototipo anterior

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
