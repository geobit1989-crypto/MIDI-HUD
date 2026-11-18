# SIG / MIDI HUD — cierre técnico y plan de validación
**Fecha de registro:** 18 de octubre de 2026
**Ventana de continuidad:** semana del 19 al 25 de octubre de 2026, según disponibilidad.
**Hitos existentes en ClickUp:** plazo 31 de octubre de 2026, **sin adelantarlo**.
**Naturaleza:** registro de decisiones, evidencias y trabajo pendiente; NO certificación de hardware.

## 1. Decisiones cerradas

### Arquitectura
- MIDI HUD es visualizador e intérprete de mensajes, no reemplaza al músico ni toma decisiones de interpretación musical. No se requiere localizar el primer pulso o compás de una canción mediante Clock.
- El **afinador queda excluido de MIDI HUD** por ahora. Se activa, desactiva y consulta **directamente en GT-1000CORE**. **No crear CC, módulo, pantalla ni prueba funcional de afinador para HUD v1.** Un campo/CC provisional de "tuner" en prototipos antiguos NO representa requisito aprobado.
- La GT y el HUD tienen canales de **recepción Channel Voice diferentes**, configurables y aún sin números definitivos. Los mensajes System Real-Time, como F8, **no tienen canal**.
- La GT-1000CORE permanece como equipo futuro/no verificado; el M-VAVE Chocolate Plus ya está disponible. La prueba real del audio GT no se confunde con indicadores del HUD.
- La navegación/previsualización y los cambios visuales en HUD no deben cambiar el sonido de la GT por sí solos. Continúan pendientes validación y perfeccionamiento del estado inicial editable, memoria de estados por canción y nomenclatura de código "presets" → "estados".

### Mapa MIDI acordado
| ID | Mensaje recibido en HUD | Semántica | Estado |
|---|---|---|---|
| HUD-001 | CC0=X seguido de PC=Y | Banco+programa identifican canción fija del repertorio maestro | Definido y recepción software v0.4 |
| HUD-002 | CC80=N | Estado musical/control exclusivo, valor fijo N por canción | Definido y recepción software v0.4 |
| HUD-003 | CC81=N | Efecto superpuesto: HUD alterna activo/inactivo por cada acción | Definido en HUD, hardware GT pendiente |
| HUD-004 | CC7=0…127 | Volumen general visual 0–100%; silencio debe afectar ambas rutas de audio | Software v0.4; audio sin probar |
| HUD-005 | CC91=0…127 | Morph visual 0–100% | Software v0.4 |
| HUD-006 | CC11=0…127 | Wah **o** Whammy, solo uno por canción | Software v0.4 |
| HUD-007 | Sin CC adicional | Reinicio/persistencia de efectos/EXP entre canciones | EN REVISIÓN hasta GT real |
| HUD-008 | Ajustes de canal RX | HUD RX distinto de GT RX; F8 no lleva canal | Software v0.4, ruta física pendiente |
| HUD-009 | F8 (un byte hexadecimal) | Clock GT recibido; 24 pulsos por negra; BPM/TAP en mismo campo | Software v0.4, GT real pendiente |
| HUD-010 | Ningún mensaje | Afinador **fuera** de MIDI HUD; función local en GT | Decisión aprobada de alcance |

**No asignar una secuencia como "F824824":** el mensaje Clock es solo F8, repetido a la frecuencia del tempo.

### Efectos superpuestos CC81 / hardware
- En Chocolate Plus se propone pulsación Single Step; HUD interpreta CC81=N por **evento** y conmuta el overlay sin reemplazar el estado CC80.
- En la GT se utilizaría Toggle para el efecto local; una función interna como CTL1 podría controlar OD y, si la GT realmente lo permite, notificar su evento a HUD por un CC81=N dirigido al canal RX del HUD.
- **Aún no probado:** si la GT emite el mismo valor CC81=N cada vez que CTL1 se pulsa, y cómo la GT discrimina varios índices N del mismo CC81 al recibirlos. No declarar sincronización audiovisual de overlays validada.
- La persistencia de efectos y valores de pedales al cambiar de canción queda ABIERTA hasta comprobar GT físicamente.

### Tempo, Clock y TAP
- El BPM de la canción estará **preprogramado tanto en HUD como en GT**; Tap es una contingencia del músico.
- Configuración candidata GT: SYNC CLOCK=INTERNAL, CLOCK OUT=ON, pulsador asignado a BPM TAP (no solamente DLY TAP).
- GT envía F8 continuamente según su BPM interno; no envia número BPM en el mensaje, ni aviso explícito de "alguien pulsó Tap".
- HUD mide F8 mediante marcas temporales: 24 intervalos equivalen a una negra; BPM estimado = 60000 / delta_ms_24_intervalos.
- LIVE muestra **BPM 120** inicialmente. Tras aprender una referencia estable y observar variación sostenida, cambia a **TAP 124** y enseña el tempo medido sin sobrescribir song.tempoBpm.
- Parámetro **provisional** de detector: al menos **2 BPM durante dos negras**; filtrar jitter de temporización, variaciones breves y fallos de recepción. Este número NO es una precisión física garantizada ni resultado de ensayo.
- Cambiar de canción reinicia etiqueta BPM y referencia de medición. Si no llegan F8 durante más de 1 s, marcar **SIN CLK** y conservar BPM preestablecido.
- Un desacuerdo inicial del tempo real GT y el BPM guardado **no demuestra** que haya ocurrido una pulsación Tap.
- No automatizar interpretación de compás ni entradas de sección: sigue siendo responsabilidad del músico.

## 2. Estado comprobable del código — 18/10/2026
**Repositorio:** https://github.com/geobit1989-crypto/MIDI-HUD

- [core/engine.mjs](../core/engine.mjs) v0.4.0: normaliza/valida mapa CC; recibe eventos CC, PC y F8; calcula BPM, timeout y etiqueta; construye modelo de LIVE.
- [core/midi-input.mjs](../core/midi-input.mjs): decodifica mensajes Web MIDI, reconoce F8 sin canal y CC/PC dirigidos al RX propio. No envía MIDI.
- [editor/index.html](../editor/index.html): introduce RX HUD/GT, estados CC80, overlays CC81 y modo de expresión Wah/Whammy por canción.
- [v03.html](../v03.html): archivo antiguo con LIVE v0.4; refleja biblioteca almacenada en el mismo navegador/origen, permite elegir una entrada Web MIDI, muestra BPM/TAP y SIN CLK. No ejecuta comandos de audio.
- [config/midi-hud-data-v1.json](../config/midi-hud-data-v1.json): datos de ejemplo migrados a mapa aprobado; NO equivale al repertorio real completo.
- [tests/midi-v04.test.mjs](../tests/midi-v04.test.mjs): casos automáticos escritos; [CI](../.github/workflows/midi-hud-tests.yml) configurado. **No consta ejecución/success verificable**; correr y registrar salidas antes de considerarlos superados.
- El **lead sheet real** aún no está integrado a LIVE y la sincronización entre dispositivos/navegadores **no está realizada**. LAB es simulador auxiliar independiente. El motor conserva nomenclatura técnica heredada "preset", que no debe trasladarse al lenguaje de interfaz como equivalente al preset de GT.

## 3. Estrategia de pruebas sin forzar compras

**Ruta disponible ahora:** Windows + Chrome + Chocolate Plus por USB MIDI como dispositivo, con cable y conexión apropiados. Registrar versión del navegador/Windows, firmware/programación Chocolate, puertos y mensajes exactos recibidos.

**Ruta móvil preferida cuando se disponga de un Android:** Android + Chrome ofrece API Web MIDI y solicitud de permiso al sitio, según [Google Chrome Help Android](https://support.google.com/chrome/answer/14871962?co=GENIE.Platform%3DAndroid&hl=en) y [Chrome Developers](https://developer.chrome.com/blog/web-midi-permission-prompt). Probar primero **USB MIDI vía OTG/dispositivo compatible**; comprobar si el puerto enumera y aparece en selector Web MIDI. No dar por garantizada la recepción BLE MIDI de un controlador concreto por el mero soporte de Web MIDI.

**iPhone actual:** Safari iOS no ofrece el mismo camino Web MIDI estándar; la vía Core MIDI/BLE en app nativa sigue siendo un hito independiente. No confundir "app instalada" con "entrada MIDI real validada".

**GT futura:** pruebas de Clock F8 (continuidad, Tap, cambio de patch), múltiples overlays CC81 y CTL1, rutas de mensajes, persistencia de controles, Wah OFF vs ON al mínimo y volumen silenciando ambas rutas.

## 4. Casos de prueba para la próxima sesión

| ID | Preparación / entrada | Observación requerida | Estado |
|---|---|---|---|
| SW-01 | Ejecutar node --test tests/midi-v04.test.mjs y revisar CI | Todos los casos terminan sin error | Por ejecutar |
| RX-01 | Chrome Windows, seleccionar entrada Chocolate USB | Dispositivo aparece y emite mensajes legibles | Pendiente real |
| RX-02 | Enviar CC0=0, luego PC=un programa registrado | HUD selecciona solamente canción CC0/PC que corresponda | Pendiente real |
| RX-03 | CC80=N (varios estados de la canción) | Activa exclusivamente N, sin cambiar audio al navegar visualmente | Pendiente real |
| RX-04 | CC81=N repetido, dos pulsaciones | Alterna indicador del mismo overlay ON/OFF, sin sustituir estado base | Pendiente real |
| RX-05 | CC7 / CC91 / CC11 = 0,64,127 | Porcentaje 0,50,100; CC11 solo modo elegido | Pendiente real |
| RX-06 | Repetir CC/PC en canal distinto del RX HUD | Ignorados por HUD; F8 nunca se filtra por canal | Pendiente real |
| CLK-01 | Inyectar/generar F8 continuo de 120 BPM | Mostrar BPM 120; no falso TAP | Sintético por probar; GT pendiente |
| CLK-02 | Modificar referencia F8 de 120 a 124 BPM estable | Tras filtro: TAP 124; BPM guardado sigue 120 | Sintético por probar; GT pendiente |
| CLK-03 | Pausar F8 >1 s | Señalar SIN CLK y conservar BPM programado | Sintético por probar; GT pendiente |
| AND-01 | Android + Chrome y USB/OTG compatible | Permiso, puerto listado y CC recibido | Cuando haya Android |
| GT-01 | GT real, SYNC CLOCK INTERNAL, CLOCK OUT ON, BPM TAP | Captura F8 real y cambio de frecuencia; evaluar jitter y umbral | Requiere GT |
| GT-02 | GT CTL1 OD Toggle + envío a HUD CC81=N | Verificar el mensaje enviado en cada pulsación, valor/canal | Requiere GT |

**Criterio de registro:** anotar fecha, dispositivo, versión, cable/ruta, canal RX, mensaje hex/dec, resultado esperado y real, evidencia/log y fallo reproducible. Un monitor MIDI que ya mostró mensajes del Chocolate **no demuestra** todavía su funcionamiento dentro de LIVE.

## 5. Propuesta de trabajo (19–25 oct; revisión global 31 oct)
1. Revisar mapa CC/PC aprobado y definir programación concreta de dos canciones de ensayo sin alterar direcciones del repertorio maestro.
2. Ejecutar y corregir las pruebas de motor/CI; distinguir problemas de software de problemas MIDI físico.
3. Probar Chocolate Plus → Chrome Windows → Web MIDI → LIVE con CC0/PC, CC80 y CC81; después las tres expresiones.
4. Si se dispone de Android, repetir prueba por USB; si no, dejar Android en cola sin forzar compra.
5. Documentar logs/resultados. GT/F8 real/CTL1 e integración nativa iOS quedan pendientes según disponibilidad y entregables existentes.

## 6. Referencias y decisiones de gestión
- [Mapa MIDI oficial Google Sheets](https://docs.google.com/spreadsheets/d/1Y0gb0GekjhQMOCsU7AzV5AqVHtHSrw4nTFFU38J3nHE/edit).
- [Repertorio maestro — direcciones CC0/PC](https://docs.google.com/spreadsheets/d/1s8W76PE3IqGHv9uPbIZTRmvZswZ4LGVzhZr4W2fBrQs/edit).
- [Contrato de mapa MIDI](../config/SIG-MIDI-control-map-v1.md).
- [ClickUp app y arquitectura](https://app.clickup.com/t/869fgw8z3).
- [ClickUp protocolo Chocolate Plus](https://app.clickup.com/t/869fdy03t).
- [ClickUp pruebas MIDI HUD](https://app.clickup.com/t/869fgw8zk).

**Conservar fechas vigentes de ClickUp: 31/10/2026.** Los ensayos propuestos esta semana son continuación flexible, no un adelanto de la entrega.
