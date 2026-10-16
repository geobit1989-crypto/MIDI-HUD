# Pruebas manuales de aceptación en iPhone / Safari

Estas comprobaciones **no se han ejecutado automáticamente en Safari**. Ejecútalas con la carpeta completa publicada como sitio web (mismo origen para Editor y LIVE). Antes de importar datos reales, exporta el JSON como respaldo.

1. **Editor > Biblioteca:** abre y cierra el cajón; añade una canción normal y confirma cuatro módulos vacíos en Estados; crea `+ Plantilla SIG` y confirma Clean, Ambient, Drive, Solo.
2. **Editor > Estados:** añade dos módulos, cámbiales nombre y dispositivo, deja uno de Expresión, oculta otro, cambia el orden y pulsa Guardar.
3. **LIVE:** recarga. Verifica que solo aparecen los módulos visibles, que las filas son de igual altura y los módulos de una misma fila del mismo ancho. Activa un estado en LAB o prueba tocar un módulo en LIVE; el diseño no debe moverse.
4. **Lead sheet > cifrado:** escribe `A - Intro` y `| Do | G | Lam |`; pulsa Guardar y elige Americano. Comprueba `| C | G | Am |` guardado. Repite eligiendo Latino y comprueba `| Do | Sol | Lam |`.
5. **Cifrado homogéneo:** guarda `| Cmaj7/G | Dsus4 | Am7 D7 |` sin aviso. Comprueba que `Cmaj7/G` se ve legible en LIVE.
6. **Cambio explícito:** selecciona Latino en el desplegable y `Convertir toda la canción`; confirma y pulsa Guardar. Verifica preservación de barras `|`, repeticiones `/`, nombre de sección y alteraciones.
7. **Seguridad:** escribe `| C | Q |`; Guardar no debe reemplazar el último lead sheet válido de LIVE. Cancela el cuadro de mezcla y comprueba que tampoco guarda.
8. **Compatibilidad:** importa una biblioteca antigua v2 (si existe una copia), revisa que sus módulos no cambian sin autorización. Prueba exportar/importar un archivo JSON.
9. **Distribución:** prueba canciones con 4, 5, 10 módulos y 4 controles + Morph mezclados; usa «Filas elegidas» para probar también 3 controles junto a Morph; revisa paisaje/retrato. Las filas no deben cambiar de altura al pulsar un control.
10. **MIDI físico:** si el navegador final admite entrada MIDI, verificar pares CC/valor con el Chocolate. En Safari iOS se necesita un navegador con puente MIDI; se conserva el adaptador ya integrado.
