# Repertorio maestro, playlists y variantes de lead sheet

Base publicada: gh-pages en 99e724ba05cb6e88684d36a6397c9418fe6900fd.
Revisión: feature/catalog-playlists-current-20261018 / PR #3. No publicar automáticamente.

## Modelo vigente

Una canción se registra una vez en songs[]. Sus estados, indicadores, módulos, banco, tempo, controles y expresiones siguen en la canción y se comparten en todas las playlists. Crear otro lead sheet no copia esa capa, no crea otra canción ni remapea MIDI.

Cada canción tiene leadSheets[] con ID estable, nombre, notación (acordes/grados), tono y contenido completo de la partitura. defaultLeadSheetId identifica la vista original. Los campos antiguos song.leadSheet y song.tono se conservan como espejo de la vista predeterminada para compatibilidad; el editor ya no ofrece tonalidad en Datos de canción.

Cada playlist mantiene songIds[] ordenados, leadSheetIds[songId] para su elección visual y entryNotes[songId] para notas de ocasión. Dos playlists pueden usar la misma canción con lead sheets/tonalidades diferentes sin duplicar controles. Duplicar una playlist separa orden, membresía, notas y elección de lead sheets, conservando las referencias compartidas.

## Recorrido del editor

1. Crear o abrir una playlist.
2. En Repertorio maestro, buscar la canción y elegir su lead sheet en el desplegable; pulsar Añadir a playlist. Si ya está incluida, Aplicar lead sheet cambia solo la elección de esa playlist.
3. Ordenar las canciones con los controles existentes. Quitar de lista conserva canción, partituras y controles en el maestro.
4. En Lead sheet elegir la vista, editar su nombre/notación/tonalidad/contenido, o crear una variante con nombre nuevo sin sobrescribir la anterior. La vista recién creada queda seleccionada solo en la playlist actual; desde el maestro se crea sin cambiar elecciones de playlists.
5. Guardar una corrección de una partitura actualiza las playlists que usan esa partitura. Guardar controles/estados/expresiones actualiza la canción común para todas sus vistas.

La tonalidad se configura en Lead sheet. LIVE conserva la posición y el elemento visual de tonalidad existentes: el motor entrega el tono y la partitura elegidos por esa playlist. Cambiar entre dos playlists con la misma canción y otra vista conserva su estado activo y expresiones superpuestas. No existe transporte ni conversión musical automática: la notación y la tonalidad describen lo preparado por el usuario.

## Conservación y recuperación

La migración es pura e idempotente. La partitura y la tonalidad actuales pasan a la vista Original, conservando IDs de canción/estados, controles, transcripción y campos adicionales. No se consolidan por título canciones antiguas que pudieran tener controles diferentes. La API antigua de copia independiente de canciones se conserva para consumidores anteriores; el flujo visual nuevo crea únicamente variantes de lead sheet.

No se escribe al abrir. Al primer guardado se conserva el JSON anterior en midiHudLeadSheetsMigrationV1; se mantienen el respaldo previo del catálogo y Deshacer. Un fallo de cuota conserva la biblioteca y su respaldo. Recuperar historial conserva las partituras nuevas referenciadas por playlists; las instantáneas anteriores al modelo se adaptan a la vista original.

Cambiar solo nombre o tonalidad, o copiar una partitura existente, no la recompila. Esto conserva también compases vacíos, disposiciones y metadatos anteriores. Si se edita el texto sí se valida mediante el parser y se informa de los errores.

## Drive y Cloudflare

No se modifican drive-sync, sync-merge, sync-ui, google-drive-auth, persistent-drive-auth, library-storage, config/cloud-sync.json, worker/** ni el despliegue de Cloudflare. Se conservan los eventos de guardado, la protección de borradores y el arranque/sesión operativa de LIVE.

Las partituras viajan dentro del bundle de canción existente; las elecciones viajan en cada playlist. La fusión actual sigue siendo conservadora: cambios concurrentes en la misma canción, incluso en vistas distintas, pueden requerir elección y conservar ambas bibliotecas completas en recuperación. No se amplía la sincronización ni se cambia la autenticación.

## Validación

Ejecutar: node --test tests/*.test.mjs worker/tests/*.test.mjs

117 pruebas locales aprobadas. Incluyen una canción con varias partituras, tonos y elecciones por playlist; ausencia de duplicación de controles/estados/MIDI; preservación del estado y expresiones al cambiar de vista; migración, historial antiguo, fallos de cuota; handlers reales del editor con DOM de prueba y roundtrip entre dos dispositivos con el controlador Drive actual e historial remoto simulado.

Comprobado en navegador local con datos de ejemplo: variante Grados — Sol mayor sin sobrescribir Original — F; playlist nueva con esa canción y elección propia; LIVE muestra grados y Sol mayor en su ubicación habitual. Quedan iPhone físico, cuenta real de Drive y hardware MIDI antes de publicar. La web del usuario y sus datos reales no se han modificado.
