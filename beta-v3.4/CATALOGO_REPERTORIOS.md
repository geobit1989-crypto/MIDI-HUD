# Catálogo maestro y repertorios vinculados

Implementación de revisión del 18 de octubre de 2026. Parte de la rama de iOS/Drive; no sustituye la app ni activa por sí sola Google Drive o la firma de Apple. No incluye estadísticas, conversión de grados a notas ni transporte automático.

## Modelo y compatibilidad

Se conserva el formato de biblioteca 2.0.0 y se añade el marcador opcional `catalogVersion: 1`. Las canciones de `songs[]` son las versiones maestras; su `id` es la identidad estable que utilizan los repertorios. Renombrar el título o el nombre de variante no altera esa identidad.

Cada versión conserva su transcripción completa, tono, BPM, banco, estado inicial, módulos, disposición, estados, indicadores, referencias GT, asignaciones MIDI y campos adicionales ya existentes. Se añade `song.catalog`:

- `familyId`: relaciona variantes de una misma canción sin compartir sus parámetros.
- `variant`: etiqueta visible, por ejemplo Original, Grados o Sol mayor.
- `archived`: oculta la versión del buscador normal, conservando las listas que ya la usan.
- `history[]`: guardados recuperables de la configuración completa de esa versión.

Las versiones nuevas usan IDs aleatorios y no reutilizan IDs eliminados. Una variante recibe nuevos IDs de versión, estados e indicadores; sus acciones MIDI internas se remapean a esos nuevos IDs. El nombre visible es «Título — Variante». Duplicar una variante no transporta los acordes ni cambia el tono por interpretar su nombre: el usuario prepara esa configuración.

`repertoires[].songIds[]` sigue siendo una lista ordenada de referencias, no una colección de copias. Cada repertorio puede tener un orden distinto, incluir otras versiones o quedar vacío. El campo opcional `entryNotes[versionId]` pertenece a la lista y permite guardar notas de ocasión sin modificar la versión musical. Esta entrega incluye su operación de modelo; no añade un formulario de notas al editor.

## Migración y recuperación

`migrateCatalog()` es una transformación pura e idempotente. Conserva IDs, estados, indicadores, transcripciones, referencias de repertorio, mensajes MIDI globales y campos desconocidos. La migración desde 1.0.0 utiliza primero la migración existente del motor.

El editor migra su copia de trabajo al abrir. El primer guardado guarda además el JSON previo, sin modificar, en `midiHudCatalogMigrationV1`, y mantiene el respaldo anterior de Deshacer. No escribe sobre la biblioteca antigua `hudLibraryV1`, ni sobre el canal o la selección de entrada MIDI del dispositivo.

Las operaciones destructivas heredadas se conservan para consumidores de bibliotecas sin catálogo. En la interfaz actual, que migra al abrir, quitar una canción de la lista o eliminar un repertorio conserva todas las versiones maestras, sus estados y sus asociaciones MIDI. No se ofrece borrado físico de versiones maestras.

## Flujos del editor

1. **Añadir material ya preparado:** abrir Biblioteca, buscar título o variante en Catálogo maestro y pulsar **+ Añadir**. Una versión ya incluida muestra **Ya incluida**.
2. **Editar una configuración compartida:** abrir la versión desde una lista o desde el catálogo. El aviso enumera los repertorios que la usan y los botones indican **Guardar cambios compartidos**. Guardar modifica la misma identidad, por lo que todos sus repertorios reciben esos cambios.
3. **Conservar otra configuración:** **Guardar como nueva versión independiente** solicita un nombre reconocible. Copia el borrador completo, valida la transcripción pendiente y conserva el original. Si se hace desde un repertorio, solamente esa lista pasa a referenciar la nueva versión en el mismo lugar; las otras conservan la referencia anterior. Desde el catálogo se crea la versión sin añadirla automáticamente a una lista.
4. **Crear o duplicar listas:** un repertorio nuevo empieza vacío. **Duplicar lista** copia las referencias y el orden, manteniendo membresía, orden y notas independientes. Para domingo y miércoles con el mismo material se puede abrir la misma lista; no hay duplicaciones por fecha.
5. **Quitar y archivar:** **Quitar de la lista** retira solamente su referencia. **Archivar versión** la oculta del buscador habitual y deja válidos los repertorios que ya la utilizan. Mostrar archivadas permite abrirla y restaurarla.
6. **Recuperar errores:** Historial muestra los guardados de la versión seleccionada. Recuperar actualiza esa identidad compartida en todos sus repertorios y guarda también la configuración que se reemplazó, para poder deshacer la recuperación.

## MIDI por versión

Los mensajes globales existentes se conservan para navegación y compatibilidad. `song.midiBindings[]` contiene las asociaciones propias que prevalecen al estar activa esa versión. La migración captura los mensajes que actúan sobre la canción, sus estados o sus indicadores.

Una variante recibe asociaciones propias con los IDs remapeados; editar su MIDI no modifica las asociaciones de otra variante. Al quitar un mensaje propio se conserva una entrada de acciones vacías que impide que reaparezca por la asociación global heredada. El adaptador de navegador, el puente nativo, el canal global y la ausencia de salida MIDI permanecen iguales.

## Transcripción por grados

El parser acepta grados escritos manualmente, como `I, ii, V, bVII` y `1, 2, 5`, conservando literalmente su escritura. No convierte grados a notas ni transporta automáticamente una versión llamada «Sol mayor». Si se mezclan grados y notas en la misma transcripción, el guardado pide separarlos en versiones. La conversión latino/americano anterior continúa disponible para transcripciones de notas.

## LIVE y sincronización

LIVE resuelve los mismos IDs compartidos y muestra el título con su variante. Los repertorios vacíos presentan un estado explícito; no crean canciones de relleno. Como antes, una sesión LIVE ya abierta conserva su copia operativa hasta actualizar, evitando cambiar la interpretación a mitad de una canción.

La fusión de Drive sigue agrupando cada versión con sus estados y módulos como unidad. Las asignaciones MIDI propias viajan dentro de esa unidad. Repertorios diferentes son unidades independientes. Las entradas del historial tienen IDs estables, se unen por identidad y no se descartan al resolver un conflicto musical. Editar la misma versión en dos dispositivos sigue pidiendo resolver el conflicto; editar versiones distintas permite fusionar sin cruzar parámetros.

Esta entrega no configura credenciales de Google, no firma ni instala la app iOS y no despliega la web. Conserva los archivos de iOS/Windows de la base de revisión.

## Validación

Ejecutar desde la raíz:

```sh
node --test beta-v3.4/tests/*.test.mjs
node beta-v3.4/tests/check-site.mjs
```

Las pruebas nuevas cubren migración 1.0/2.0 e idempotencia; conservación de campos adicionales; edición compartida y renombrado; copia completa e independencia de variantes y MIDI; orden, membresía y notas por repertorio; listas vacías; archivado; persistencia y copia previa a migración; recuperación y deshacer recuperación; fusión de Drive e historial en conflictos; grados manuales; y handlers reales del editor para buscar, guardar una variante y añadir desde una lista vacía.

El entorno de trabajo local estuvo desconectado durante esta implementación. Las comprobaciones ejecutadas, sus resultados y cualquier limitación del simulador se documentarán en la revisión de GitHub. Las pruebas automatizadas no sustituyen una prueba con controlador físico ni la autorización real de Drive.
