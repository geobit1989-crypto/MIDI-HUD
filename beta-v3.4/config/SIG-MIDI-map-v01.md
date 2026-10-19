# SIG / MIDI HUD — Mapa MIDI preliminar v0.1
Fecha: 2026-10-13. Estado: DISEÑO, sin verificación física. Ninguna asignación de CC o PC se considera definitiva.

## Principio
La GT-1000CORE procesa audio; el Chocolate Plus y/o pedales originan comandos; MIDI HUD visualiza los eventos que recibe. Para mostrar el estado real, el HUD debe recibir el mismo evento de selección y los CC relevantes (por duplicación, retransmisión o puente). No basta con que el controlador envíe solo a la GT.

## Propuesta de canal y mensajes (sujetos a prueba)
- Canal MIDI 1: canal lógico propuesto para control de GT y observación del HUD; confirmar recepción/transmisión y configuración real.
- PC 0: Crystal Clean; PC 1: Worship Overdrive; PC 2: Worship Solo. Son identificadores de PRUEBA, no números de patch GT confirmados; revisar numeración PC 0/1 y bancos.
- CC 20 (provisional): Morph, valores 0–127; 0–100 % = round(valor*100/127).
- CC 21 (provisional): volumen global 0–127; 0 silencia ambas rutas si el procesamiento y las asignaciones GT se configuran correctamente.
- CC 22 (reservado): wah/whammy; no activarlo en esta prueba.
- CC 23 (reservado): tap tempo; la semántica por pulsación deberá definirse.
- CC 24 (reservado): afinador; definir on/off tras confirmar funciones disponibles.
Los números CC son etiquetas de diseño, NO compatibilidad verificada de la GT-1000CORE ni de Chocolate Plus.

## Estados
| PC prueba | Estado | Morph 0 | Morph 127 |
| --- | --- | --- | --- |
| 0 | Crystal Clean | ambiente mínimo | delay y reverb larga elevados |
| 1 | Worship Overdrive | sin asignación | sin asignación |
| 2 | Worship Solo | +0 dB | +3 dB de boost adicional |

## Máquina de estados del HUD
1. Al recibir selección de estado/preset, mostrar el estado y reiniciar el indicador Morph a MIDI 0 / 0 % (regla de simulación).
2. Al recibir CC Morph, actualizar valor MIDI y porcentaje; en Clean traducir a ambiente y en Solo a boost 0–3 dB.
3. En Overdrive mostrar 'sin asignación', pero no confundirlo con una lectura de posición física.
4. Al recibir CC volumen, actualizar indicador independiente; 0 representa silencio global de ambas rutas.
5. Si se pierde la conexión, indicar 'sin datos MIDI' y no presentar el valor visual como lectura física confirmada.
6. Para evitar valores falsos al cambiar de preset, la sincronización física queda expresamente pendiente de pruebas con la GT.

## Pedales y pulsadores
- Chocolate Plus: cuatro accesos rápidos por banco, asignaciones físicas pendientes. Propuesta de ensayo: A=Clean, B=Overdrive, C=Solo, D=función reservada.
- GT-1000CORE: sus tres switches siguen disponibles para contingencia y control local; no se sustituyen en esta fase.
- Pedal Morph: EXP separado del pedal de volumen.
- Pedal volumen: normalmente al máximo; swells y silencio intencional; debe afectar las dos rutas independientes.

## Por confirmar con hardware
1. Ruta física de mensajes y posibilidad de duplicar/retransmitir a HUD.
2. Números CC admitidos y asignaciones reales en GT y Chocolate Plus.
3. Comportamiento PC/bank select de la GT y correspondencia de patches.
4. Si se emite valor del pedal al cargar un preset; método de sincronización.
5. Puente compatible con iPhone: Safari no ofrece Web MIDI nativo.
6. Comportamiento real de la ganancia, del volumen de ambas rutas y del Morph.
