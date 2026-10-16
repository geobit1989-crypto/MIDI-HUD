# MIDI HUD BETA v3.4 — Integración de las especificaciones (15/10/2026)

## Implementado en código
- Cuatro áreas de Editor: **Canción, Estados, Lead sheet y MIDI**; MIDI independiente.
- **Estados** administra módulos de control y expresión, etiqueta de dispositivo, color, icono, texto, visibilidad, asociación visual, añadir, quitar y reordenar.
- **Nueva canción** genérica: cuatro módulos de control vacíos. **+ Plantilla SIG**: Clean, Ambient, Drive y Solo vinculados a cuatro estados; la duplicación de canción sirve para reutilizar plantillas personalizadas.
- LIVE construye dinámicamente solo los módulos visibles, mezclando control/expresión en las mismas filas. Distribución compensada sin casillas huecas, misma altura de fila y misma anchura dentro de cada fila. Caso de 5: 3+2. Los estados y las asociaciones MIDI siguen siendo independientes del orden visual.
- Controles táctiles y de teclado de LIVE restablecidos tras cada reconstrucción de módulos; la selección es una **consulta visual**, no transmisión MIDI.
- Cifrado americano y latino, con detección durante la edición y confirmación de sistema mezclado al guardar; elección Latino / Americano. Conversión explícita de toda la canción desde Lead sheet. Sin transposición; preserva alteraciones y bajos alternativos.
- Reconocimiento y visualización de tríadas tradicionales, `sus2`, `sus4`, `7`, `m7`, `maj7` y acordes con bajo alternativo.
- Comprobación de estructura antes de convertir, backup local antes de sustituir datos guardados y compatibilidad de esquema v1/v2.
- Ajustes de lead sheet adaptativo, aumento del área de controles en torno a 5 puntos de altura de viewport, límite lateral de etiquetas, símbolo de repetición alineado arriba y encabezado centrado (presentes en base 3.3).
- Sin límite rígido de nueve módulos: límite técnico de seguridad de 256 y sin filas obligatorias de expresión.

## Verificación efectuada
- `node --test tests/v34.test.mjs`: pruebas de parser, conversión, migración, plantillas, módulos, distribución y vista previa.
- `node --check`: scripts JavaScript y scripts embebidos de LIVE sin errores sintácticos.
- Revisión de integridad: CSS, JS referenciados y IDs HTML de entrada.

## Aún por validar fuera de este entorno
- Prueba visual y funcional real en **Safari de iPhone/iPad**, ajuste fino de tamaños y accesibilidad táctil.
- Entrada MIDI real con Chocolate / Boss y permisos del navegador final. Safari iOS no expone Web MIDI estándar.
- Verificación en el dispositivo de almacenamiento local, importación/exportación, cuadro de diálogo de cifrado y geometría responsiva con repertorios reales.
- No se ha instalado ni publicado en Google Drive; este ZIP es un conjunto web estático de prueba.

## Respaldo
- El archivo base **MIDI-HUD-BETA-v3.3-biblioteca-lateral-recuperacion.zip** no ha sido sobrescrito.

## Integración revisada del editor
- Publicación separada en `beta-v3.4/`, sin sustituir archivos ni canciones de v3.3.
- Conservado byte por byte el adaptador MIDI publicado esta noche; también su diagnóstico en LIVE/LAB.
- Corregida la edición con menos de cuatro módulos y permitida la eliminación de todos.
- Reordenar/quitar mantiene referencias a estados, indicadores, colores e iconos.
- Distribución manual opcional con filas mixtas; los nodos de LIVE permanecen estables al cambiar estado.
- Corregida la altura del área adaptable en teléfono y retiradas las expresiones de ejemplo fijas.
- Cancelar, corregir errores y rechazos de almacenamiento mantienen la última versión válida.
