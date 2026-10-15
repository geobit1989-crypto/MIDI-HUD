# MIDI HUD · Editor y LIVE v3.4

Beta integrada de los acuerdos del 15 de octubre de 2026. La publicación anterior se conserva fuera de esta carpeta.

- [Editor](editor/): Canción, Estados, Lead sheet y MIDI. Guardado manual por sección.
- [LIVE](v03.html): módulos de Control y Expresión adaptativos.
- [LAB](lab/): simulación y entrada MIDI con el adaptador compatible con puentes de navegador.

## Cambios del editor

Estados permite añadir, quitar, ocultar, mostrar y ordenar módulos; configurar nombre, descripción, dispositivo, color e icono; vincular estados e indicadores. Una canción genérica comienza con cuatro controles sin asignar. «+ Plantilla SIG» crea Clean, Ambient, Drive y Solo; duplicar la canción reutiliza cualquier configuración personalizada.

La distribución automática equilibra las filas sin casillas vacías. «Filas elegidas» y «Empezar una fila nueva» permiten, por ejemplo, cuatro controles en una fila y Morph en otra, o tres controles junto a Morph. Los módulos de cada fila tienen el mismo ancho y todas las filas la misma altura. El layout y los nodos se conservan al cambiar estado durante LIVE.

El Lead sheet reconoce mayores/menores, alteraciones, sus2/sus4, 7/m7/maj7 y bajo alternativo. Si mezcla cifrado latino y americano, Guardar pregunta «¿Qué sistema quieres usar?» con Latino y Americano; convierte y guarda después de elegir. Cerrar el diálogo conserva el borrador. La conversión explícita de toda la canción está disponible; errores de símbolo o estructura bloquean el guardado.

## Conservación de datos y MIDI

Al abrir esta beta en el mismo navegador y origen, lee las canciones guardadas en la versión anterior. Guarda sus cambios en una copia separada y conserva un respaldo previo. No escribe sobre los datos de v3.3. Exportar/importar JSON permite trasladar la configuración a otro navegador.

El adaptador `core/midi-browser.mjs` es idéntico al publicado en el commit `946a123a7b0dd3553094e085d198987e8b3e980f`: mantiene puertos estándar, colecciones no iterables y listeners usados por navegadores con puente MIDI. LIVE y LAB conservan detección de puertos y diagnóstico de recepción CC. El canal sigue siendo global. Reordenar módulos conserva destinos de estados, indicadores y asociaciones MIDI.

MIDI HUD representa estados visuales; no transmite MIDI al hardware. Las expresiones muestran «—» cuando no existe telemetría; esta versión no añade recepción de valores de expresión.

## Verificación

`node --test beta-v3.4/tests/*.test.mjs` desde la raíz del repositorio.

La suite prueba parser y cifrado, cancelación, errores, persistencia, compatibilidad v1/v2, módulos/plantillas, referencias MIDI, adaptador de navegador y estabilidad de los nodos de LIVE. También se comprueban sintaxis e integridad de archivos referenciados.

La comprobación física en iPhone/Chocolate y la geometría renderizada en Safari quedan pendientes. No se ha ejecutado un navegador real en este entorno.
