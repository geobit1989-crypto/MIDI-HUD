# Catálogo maestro y playlists sobre la web actual

Base: gh-pages en 99e724ba05cb6e88684d36a6397c9418fe6900fd.
Rama: feature/catalog-playlists-current-20261018. No se sustituye por la beta histórica.

## Modelo y flujos

La biblioteca conserva esquema 2.0.0 y las claves actuales. catalogVersion: 1 habilita listas vacías. songs[] contiene versiones maestras con ID estable; repertoires[].songIds[] contiene referencias ordenadas. Quitar una referencia o eliminar una lista conserva las versiones, sus estados y MIDI.

song.catalog contiene familyId, variant, archived e history[]. Una variante copia toda la configuración y campos adicionales con nuevos IDs para canción, estados e indicadores, remapeando las referencias MIDI. No interpreta el nombre para transportar música. Se admiten grados escritos manualmente, conservando su texto.

El catálogo permite buscar por título/variante, añadir sin duplicar y abrir maestras sin lista. Guardar cambios compartidos actualiza esa identidad en todos sus repertorios; el aviso enumera las listas afectadas. Guardar como nueva versión conserva el borrador completo: desde una lista cambia solo su referencia actual; desde el catálogo crea una versión sin añadirla a listas.

Una lista nueva empieza vacía. Duplicar conserva referencias con orden, membresía y notas independientes. Las notas de ocasión pertenecen a entryNotes[versionId] de la lista. Archivar oculta del buscador normal sin romper referencias. El historial recupera configuraciones completas y registra la configuración reemplazada para deshacer la recuperación. LIVE puede seleccionar una lista concreta y mostrar variantes o listas vacías.

song.midiBindings permite editar una variante sin cambiar otra. Las asignaciones globales existentes se conservan; las propias de la versión activa prevalecen. Acciones vacías bloquean el fallback global de un mensaje eliminado. La migración captura asociaciones relacionadas con cada canción sin retirar el mapa global.

## Persistencia y compatibilidad

La migración es pura e idempotente y no escribe al abrir. El primer guardado conserva el JSON anterior en midiHudCatalogMigrationV1. Se utiliza la escritura transaccional existente y su copia Deshacer: un fallo de cuota no reemplaza biblioteca ni respaldo.

No se modifican los módulos drive-sync, sync-merge, sync-ui, google-drive-auth, persistent-drive-auth o library-storage, ni la configuración OAuth, worker/** o su despliegue. Se mantienen los eventos de sincronización, protección de borradores y arranque de LIVE.

El catálogo viaja dentro de los bundles actuales de canción/estados; las listas siguen siendo unidades independientes. Se conserva la fusión conservadora actual: editar la misma versión en dos dispositivos requiere elección. Ambas bibliotecas completas quedan en recuperación; el historial del lado descartado se recupera allí, sin unirlo silenciosamente con el elegido.

Sheets/CSV sigue disponible. Si título/autor identifica varias variantes, se exige elegir la versión concreta desde el catálogo, sin adivinar.

## Validación y límites

Ejecutar: node --test tests/*.test.mjs worker/tests/*.test.mjs

Cubre propagación, aislamiento musical/MIDI, identidad, listas/notas independientes, archivado, historial, migración, cuota, importación ambigua y handlers reales del editor con DOM de prueba. Las pruebas de dos dispositivos usan el controlador Drive actual con un historial remoto simulado; no conectan con la cuenta real. Se mantienen las regresiones de OAuth y Cloudflare.

CI de la rama ejecuta pruebas y empaqueta el Editor V3 actual. No despliega Pages ni el Worker. Comprobado en navegador local: creación de lista vacía, añadir referencia, edición compartida, nueva variante, conservación de la lista original, persistencia al recargar y selección de lista/variante en LIVE. Los controles adicionales se agrupan para conservar el espacio de edición. Queda la comprobación con iPhone físico, Drive real y MIDI antes de publicar. No se incluyen estadísticas ni transporte automático.
