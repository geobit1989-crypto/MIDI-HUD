# MIDI HUD — SIG

Prototipo operativo para gestión de repertorios y comandos MIDI. Actualizado el 18 de octubre de 2026.

## Componentes

1. **[LIVE v0.4](./v03.html)** (se conserva el nombre de archivo): lee la biblioteca del Editor guardada en el mismo origen y navegador; muestra canción, estados CC80, efectos CC81, controles y tempo BPM/TAP. Permite conectar una **entrada Web MIDI** cuando el navegador la admite. No envía mensajes MIDI ni controla el audio.
2. **[Editor](./editor/index.html)**: gestiona repertorios, tempos por canción, CC80 y CC81, modo exclusivo Wah/Whammy y canales RX separados HUD/GT. Asignaciones CC0/PC de canciones proceden del repertorio maestro, no se inventan desde Editor.
3. **[Motor v0.4](./core/engine.mjs)**: máquina de estados sin DOM ni red. Admite CC0+PC, CC80, CC81, CC7, CC91, CC11, F8 y pérdida de Clock, además de emitir intenciones de MIDI local (no transmisiones reales).
4. **[Adaptador de recepción](./core/midi-input.mjs)**: interpreta mensajes entrantes CC/PC y mensajes de reloj sin canal F8. No transmite.
5. **[LAB](./lab/index.html)**: banco aislado de simulación. Copiar Editor → LAB no cambia datos del Editor; no transmite MIDI.

## Mapa MIDI aprobado

| Comando | Función |
| --- | --- |
| CC0=X → PC=Y | canción |
| CC80=N | estado exclusivo en la canción activa |
| CC81=N | efecto superpuesto, conmutación por pulsación |
| CC7=0..127 | volumen 0..100 % |
| CC91=0..127 | Morph 0..100 % |
| CC11=0..127 | Wah o Whammy, único destino por canción |
| F8 | reloj maestro recibido de GT (24 pulsos por negra), sin canal |

Los números CC/PC pertenecen al canal RX del HUD, distinto del RX de GT; **F8 no lleva canal**. CC91 es un uso propio de HUD: en MIDI general suele ser nivel del efecto 1/reverb, sin conflicto entre equipos si los canales y el ruteo están correctamente configurados.

## Tempo en LIVE

- Cada canción contiene su BPM preprogramado; LIVE muestra inicialmente **BPM 120**, por ejemplo.
- GT configurada con SYNC CLOCK INTERNAL y CLOCK OUT ON transmite continuamente F8 según su BPM.
- Tras aprender la frecuencia inicial de F8, el HUD etiqueta **TAP 124** cuando detecta cambio sostenido >=2 BPM durante 2 negras (tolerancia inicial de ensayo).
- No interpreta una discrepancia inicial entre GT y canción como Tap, y no sobrescribe el BPM guardado.
- Tras cambio de canción, recalibra la referencia y vuelve a BPM. Ante una interrupción de Clock >1 s señala **SIN CLK** y conserva el tempo preestablecido.
- La etiqueta TAP es una inferencia a partir del reloj, no un aviso explícito del pedal Tap.

## Pruebas

- Tests Node: `node --test tests/midi-v04.test.mjs`.
- Automatización CI: [.github/workflows/midi-hud-tests.yml](./.github/workflows/midi-hud-tests.yml).
- Para comprobar en navegador, abrir **Editor** en el mismo origen de GitHub Pages, configurar canción y módulos, después abrir **LIVE** y conceder permiso Web MIDI mediante ⚙ → Conectar MIDI.
- El Editor guarda en `localStorage.hudLibrary`; LAB guarda por separado en `localStorage.hudLabLibrary`. No existe todavía sincronización automática entre navegadores, equipos o cuentas.
- **En iOS Safari no contamos con Web MIDI garantizado.** Para recibir MIDI real en iPhone hará falta verificar disponibilidad en la plataforma o una solución nativa/puente.
- **Sin prueba física aún:** Clock F8 y Tap desde GT-1000CORE, conmutación real CC81 en GT, ruteo del puente y persistencia de efectos/expresión entre canciones. La lectura LIVE no constituye control de audio.
- El lead sheet mostrado en la antigua maqueta era ilustrativo; LIVE señala que los cifrados reales todavía requieren integración, para no asociar acordes de ejemplo a canciones ajenas.

## Continuidad y persistencia

Para trabajos posteriores, consultar la [entrada operativa AGENTS.md](./AGENTS.md) y el [PCP — Protocolo de Continuidad y Persistencia v1.0](https://docs.google.com/document/d/1NaYQOiI-vL4vueMNFM014jXPInE023hA0xDcM9xZph0/edit). Este enlace orienta la consulta selectiva; no establece una lectura automática global en ChatGPT.

## Documentación

- [Contrato de selección de canciones](./config/SIG-MIDI-song-selection-v1.md).
- [Mapa CC y tempo BPM/TAP](./config/SIG-MIDI-control-map-v1.md).
- [Catálogo de 133 direcciones MIDI](./config/sig-midi-song-addresses-v1.json), instantánea que requiere actualización manual.
- [Repertorio maestro SIG — Google Sheets](https://docs.google.com/spreadsheets/d/1s8W76PE3IqGHv9uPbIZTRmvZswZ4LGVzhZr4W2fBrQs/edit).

## Cierre de decisiones y próxima ronda de pruebas (18 de octubre)

- [Registro de avances, pendientes y matriz de pruebas del 19 al 25 de octubre](./docs/2026-10-18-cierre-midi-hud-y-plan-pruebas.md).
- El afinador queda **fuera de MIDI HUD**: se opera directamente en GT-1000CORE. No asignar CC/módulo de afinador en HUD v1.
- Para Web MIDI real, priorizar Windows + Chrome + Chocolate Plus USB (ya disponible). Android + Chrome es la ruta móvil preferida cuando exista dispositivo, inicialmente USB/OTG; BLE debe comprobarse por separado. La vía iPhone requiere app nativa/Core MIDI u otro transporte compatible.
- Las tareas de integración y validación mantienen el plazo ya acordado en ClickUp del **31/10/2026**; no adelantarlo por la planificación exploratoria semanal.
