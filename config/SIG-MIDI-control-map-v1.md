# SIG — MIDI HUD · mapa operativo de recepción v1 (2026-10-18)

## Principios
- CC y PC se procesan solo en el canal RX propio del HUD (1–16). GT-1000CORE tendrá otro canal RX distinto.
- F8 (System Real-Time) no tiene canal y se procesa con independencia de los RX de HUD/GT.
- Cada canción asigna valores de estados y efectos dentro de su propio contexto.

| Función | Comando | Interpretación HUD |
| --- | --- | --- |
| Canción | CC0=X → PC=Y | Dirección fija única del repertorio maestro |
| Estado exclusivo | CC80=N | Selecciona uno de sus módulos base sin OFF individual |
| Efecto superpuesto | CC81=N | Identifica efecto N; pulsación conmuta solo ese overlay |
| Volumen | CC7=0..127 | Escala de posición 0..100 % |
| Morph | CC91=0..127 | Escala de posición 0..100 % |
| Wah o Whammy | CC11=0..127 | Solo uno por canción; escala de posición 0..100 % |
| Clock | F8 (0xF8) | 24 pulsos/negra, sin datos ni canal |

Porcentaje = Math.round(valor * 100 / 127), limitado a 0..100. Los valores N se guardan con cada módulo; no son la posición visual.

## CC81 y GT
- Chocolate Plus: Single Step para enviar una instrucción por pulsación.
- GT: Toggle del bloque OD/efecto; asignación MIDI de control en canal separado al HUD.
- La posibilidad de diferenciar múltiples efectos usando distintos valores N de un mismo CC81 y la repetición de valores constantes en CTL1 NO han sido verificadas físicamente.
- La persistencia de efectos y expresión al cambiar de canción queda pendiente de comprobar con la GT.

## Clock y campo BPM/TAP
1. Al entrar en una canción LIVE muestra BPM y su tempo preestablecido.
2. GT genera F8 con SYNC CLOCK=INTERNAL y CLOCK OUT=ON. HUD escucha continuamente.
3. Al recibir Clock suficiente HUD aprende el BPM inicial como referencia; una discrepancia preexistente no indica Tap.
4. Cada 24 intervalos calcula BPM = 60000 / (t_actual - t_hace_24_pulsos), medido en ms.
5. Si hay cambio >=2 BPM durante 2 negras, cambia el mismo campo a TAP y muestra BPM medido; no sobrescribe la canción.
6. Cambio de canción restablece referencia BPM. Pérdida de Clock >1 s muestra SIN CLK y conserva el BPM guardado.
7. TAP es inferido: F8 no indica una pulsación física ni el primer tiempo de un compás.

Umbral y duración son valores de partida, sujetos a ajuste con pruebas físicas y latencia real.

## Implementación y límites
- core/engine.mjs v0.4: eventos CC/PC/F8 y CLOCK_TIMEOUT, mapa SIG, vista BPM/TAP.
- core/midi-input.mjs: convierte bytes entrantes a eventos, incluyendo F8 sin canal.
- editor/index.html: canal RX HUD y RX GT, CC80 y CC81 por canción, Wah/Whammy exclusivo.
- v03.html LIVE v0.4: biblioteca localStorage del mismo origen, interfaz actualizada, entrada Web MIDI opcional, indicador de pérdida de Clock.
- tests/midi-v04.test.mjs: pruebas para ejecutar con node --test tests/midi-v04.test.mjs.
- Aún pendiente: recepción GT real, envío GT→HUD (CC81), canal/rutas físicas, soporte MIDI nativo para iOS sin Web MIDI.
