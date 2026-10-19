# MIDI HUD — Contrato MIDI v1: selección de canciones
Fecha: 2026-10-18. Estado: contrato de datos y motor implementados; hardware sin verificar.

## Mensajes
- Canal: el canal MIDI global configurado en la biblioteca (1–16).
- Selección: **CC0 = banco (0..127), seguido de PC = programa (0..127)**.
- La recepción de CC0 actualiza únicamente el banco de selección, sin cambiar de canción.
- La recepción del PC busca la pareja `cc0:pc` y selecciona esa canción, cargando su estado inicial.
- Cambios locales de canción generan **CC0 -> PC**, en ese orden; los mensajes recibidos no se retransmiten (sin bucle MIDI).
- CC32 no se utiliza en v1. El esquema completo MIDI 1.0 también contempla CC32 (Bank Select LSB), que podrá añadirse más adelante.
- Selección de estados musicales, efectos y expresión se realizará por CC; la numeración final de esos CC aún está por definir.
- El anterior campo `presets[].programChange` queda obsoleto: ya no controla estados y se elimina al normalizar datos heredados.

## Fuente única de direcciones
Google Sheet «SIG — Repertorio maestro — Lead sheets», pestaña «Repertorio maestro».
- Columnas E=CC0 y F=PC, junto al nombre (A), autor (B) y URL (C).
- Las 133 canciones existentes tienen dirección única; canciones 1..128 usan CC0=0 con PC 0..127, y 129..133 usan CC0=1 con PC 0..4.
- Ejemplo: canción 35 `CC0=0 -> PC=34`; canción 133 `CC0=1 -> PC=4`.
- No se regeneran direcciones al ordenar el repertorio. La asignación acompaña al registro de la canción.
- Próxima dirección disponible: `CC0=1, PC=5`, para una nueva canción que se dé de alta en el maestro.
- **El editor HUD no inventa direcciones MIDI.** Canciones creadas sin alta en el maestro quedan sin dirección hasta que se importen las columnas CC0/PC.

## Sincronización y preservación
- `config/sig-midi-song-addresses-v1.json` es una **instantánea** de las 133 direcciones del maestro, no una conexión en vivo con Google Sheets.
- Al abrir el editor, el programa consulta esa instantánea y aplica las direcciones a canciones YA existentes por identidad título+autor (o título único cuando falta autor).
- No altera el ID interno, presets, estados, Morph, notas ni tempo de una canción.
- En una importación CSV posterior, se leen también las columnas CC0 y PC y se actualizan las canciones existentes sin duplicarlas.
- El motor valida rango 0..127 y que no haya colisiones entre direcciones.
- El repertorio importado almacenado en `localStorage` solo se actualizará cuando el usuario abra el editor actualizado desde el **mismo navegador y origen**. No puede ser modificado remotamente desde GitHub.
- **Nuevas canciones en Sheets NO se propagan automáticamente a GitHub.** Hay que sincronizar/publicar de nuevo la instantánea o importar el CSV actualizado para que HUD incorpore la dirección.
- La aplicación LIVE v0.3 aún es una maqueta visual; el laboratorio y el motor no disponen de puerto MIDI conectado para recepción física.

## Representación en una canción JSON
```json
{
  "id": "id-interno-conservado",
  "title": "Nombre de la canción",
  "author": "Autor",
  "midiAddress": {"cc0": 0, "pc": 34}
}
```

## Eventos de motor (para adaptadores futuros)
- `dispatch({type:"RECEIVE_CC",channel:1,controller:0,value:0})`
- `dispatch({type:"RECEIVE_PC",channel:1,program:34})`
- Si existe, se selecciona la canción asignada a `0:34`. El primer evento no cambia de canción.
- Para elección local `dispatch({type:"SELECT_SONG",songId:"..."})`, las intenciones se publican como CC0 y PC y después los CC de inicialización correspondientes.

Requiere prueba de ejecución y de hardware con Chocolate Plus, MIDI Bridge y dispositivo iOS antes de considerarlo validado en vivo.
