# AGENTS.md — Entrada rápida para trabajo en MIDI HUD

Este archivo guía la continuidad del trabajo en el repositorio, **no** sustituye las instrucciones del Proyecto de ChatGPT ni provoca lecturas automáticas en chats externos.

## Contexto y fuentes
- PCP transversal v1.0 (fuente maestra): https://docs.google.com/document/d/1NaYQOiI-vL4vueMNFM014jXPInE023hA0xDcM9xZph0/edit
- Estado funcional: [README.md](./README.md)
- Selección de canciones: [config/SIG-MIDI-song-selection-v1.md](./config/SIG-MIDI-song-selection-v1.md)
- Mapa MIDI y BPM/TAP: [config/SIG-MIDI-control-map-v1.md](./config/SIG-MIDI-control-map-v1.md)
- Registro de pendientes y pruebas: [docs/2026-10-18-cierre-midi-hud-y-plan-pruebas.md](./docs/2026-10-18-cierre-midi-hud-y-plan-pruebas.md)
- Índice documental SIG (Drive): https://docs.google.com/document/d/1VADgtXc-TjDVmoA0aVQ7wzOs03VZyBRAm8LmKgaIsl4/edit

## Antes de una modificación
1. Leer README y los archivos directamente afectados, no todo el repositorio.
2. Recuperar contratos vigentes y hechos probados; las propuestas no equivalen a pruebas.
3. Inspeccionar estado actual y SHA antes de reemplazar archivos. No deshacer trabajos ajenos.
4. No incorporar afinador al HUD v1 ni dar por probada la ruta Web MIDI de Safari iOS.
5. Registrar contradicciones o decisiones nuevas sin inventar resultados.

## Después de una modificación
1. Ejecutar las pruebas automatizadas: `node --test tests/midi-v04.test.mjs`, y revisar CI en GitHub Actions.
2. Actualizar README, contratos o registros específicos **solo** si el cambio altera su contenido.
3. Diferenciar: decisión aprobada, código implementado, prueba automatizada, prueba física pendiente.
4. Verificar commit/lectura de retorno e informar qué se cambió y qué quedó bloqueado.
5. Si afecta a SIG, FreeCAD o ClickUp, enlazar el cambio en el artefacto canónico correspondiente cuando la conexión lo permita; no crear documentación paralela.

## Restricción de alcance
No modificar compras, presupuesto, hardware físico ni tareas externas de forma destructiva por inferencia. La consulta del PCP se realiza por el flujo humano/asistente que trabaja en el proyecto; este archivo no garantiza que ChatGPT lo lea en todas las conversaciones.
