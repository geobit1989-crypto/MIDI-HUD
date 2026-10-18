/*
 * MIDI HUD operational engine v0.1
 * Pure state machine: no DOM, network, localStorage or MIDI device access.
 * Compatible with config/midi-hud-data-v1.json (schema 1.0.0).
 */
export const ENGINE_VERSION = "0.4.0";
export const MIDI_CC = Object.freeze({volume:7, state:80, effect:81, morph:91, expression:11});
export const CLOCK_CONFIG = Object.freeze({pulsesPerBeat:24, changeThresholdBpm:2, sustainedBeats:2, timeoutMs:1000});

function requireValid(ok, message) {
  if (!ok) throw new Error("MIDI HUD: " + message);
}

function object(x) { return x !== null && typeof x === "object" && !Array.isArray(x); }
function uint(x, min, max) { return Number.isInteger(x) && x >= min && x <= max; }
function copy(x) { return JSON.parse(JSON.stringify(x)); }
function clamp(x, min, max) { return Math.max(min, Math.min(max, x)); }
function uniqueIds(items, label) {
  const ids = new Set();
  for (const item of items) {
    requireValid(object(item) && typeof item.id === "string" && item.id.length > 0,
      label + ": elemento sin id");
    requireValid(!ids.has(item.id), label + ": id duplicado " + item.id);
    ids.add(item.id);
  }
  return ids;
}

/** Throws a descriptive error if the existing repertoire schema is invalid. */
export function validateLibrary(data) {
  requireValid(object(data), "el repertorio debe ser un objeto");
  requireValid(data.format === "midi-hud-repertoire", "formato incorrecto");
  requireValid(data.schemaVersion === "1.0.0", "versión del esquema no compatible");
  requireValid(object(data.midi) && uint(data.midi.channel, 1, 16),
    "canal MIDI fuera de 1..16");
  requireValid(data.midi.gtChannel == null ||
      (uint(data.midi.gtChannel,1,16) && data.midi.gtChannel !== data.midi.channel),
    "el canal de la GT debe ser distinto del canal HUD");
  requireValid(data.midi.programNumbering === "zero-based",
    "solo se admiten programas MIDI de 0 a 127");
  requireValid(object(data.midi.cc), "faltan los CC MIDI");
  for (const [name, number] of Object.entries(MIDI_CC)) {
    requireValid(data.midi.cc[name] === number, "CC " + name + ": esperado " + number);
  }
  requireValid(Array.isArray(data.repertoires) && data.repertoires.length > 0,
    "no hay repertorios");
  requireValid(Array.isArray(data.songs) && data.songs.length > 0, "no hay canciones");
  requireValid(Array.isArray(data.presets) && data.presets.length > 0, "no hay presets");
  const reps = uniqueIds(data.repertoires, "repertorios");
  const songs = uniqueIds(data.songs, "canciones");
  const presets = uniqueIds(data.presets, "presets");
  // La dirección de canción proviene del repertorio maestro, nunca de su posición.
  // Canciones de ejemplo/legado pueden quedar sin dirección hasta sincronizar.
  const midiAddresses = new Set();
  for (const song of data.songs) {
    if (song.midiAddress == null) continue;
    requireValid(object(song.midiAddress) &&
      uint(song.midiAddress.cc0, 0, 127) && uint(song.midiAddress.pc, 0, 127),
      "dirección CC0/PC inválida en " + song.id);
    const key = song.midiAddress.cc0 + ":" + song.midiAddress.pc;
    requireValid(!midiAddresses.has(key), "dirección MIDI duplicada " + key);
    midiAddresses.add(key);
  }
  requireValid(object(data.controls) && object(data.controls.morph),
    "control Morph no definido");
  for (const rep of data.repertoires) {
    requireValid(Array.isArray(rep.songIds) && rep.songIds.length > 0,
      "repertorio " + rep.id + " sin canciones");
    requireValid(new Set(rep.songIds).size === rep.songIds.length,
      "canciones duplicadas en " + rep.id);
    for (const id of rep.songIds) requireValid(songs.has(id),
      "canción inexistente " + id + " en " + rep.id);
  }
  for (const song of data.songs) {
    requireValid(["none","wah","whammy"].includes(song.expressionMode || "none"), "expresión inválida: "+song.id);
    const effectValues = new Set();
    requireValid(Array.isArray(song.effects), "efectos ausentes en "+song.id);
    for (const e of song.effects) {
      requireValid(e && typeof e.id === "string" && typeof e.name === "string" && e.name.trim() && uint(e.ccValue,0,127),
        "efecto superpuesto inválido en "+song.id);
      requireValid(!effectValues.has(e.ccValue), "CC81 duplicado en "+song.id);
      effectValues.add(e.ccValue);
    }
    const stateValues = new Set();
    for (const presetId of song.presetIds) {
      const assigned = data.presets.find(p => p.id === presetId);
      requireValid(assigned && uint(assigned.controlValue,0,127), "CC80 sin asignar "+presetId);
      requireValid(!stateValues.has(assigned.controlValue), "CC80 duplicado en "+song.id);
      stateValues.add(assigned.controlValue);
    }
    requireValid(typeof song.title === "string" && song.title.trim(),
      "canción sin título " + song.id);
    requireValid(Array.isArray(song.presetIds) && song.presetIds.length > 0,
      "canción " + song.id + " sin presets");
    requireValid(new Set(song.presetIds).size === song.presetIds.length,
      "presets duplicados en " + song.id);
    requireValid(song.tempoBpm == null ||
      (Number.isFinite(song.tempoBpm) && song.tempoBpm >= 30 && song.tempoBpm <= 300),
      "BPM inválido en " + song.id);
    for (const id of song.presetIds) {
      requireValid(presets.has(id), "preset inexistente " + id + " en " + song.id);
      const p = data.presets.find(item => item.id === id);
      requireValid(p.songId === song.id, "preset " + id + " pertenece a otra canción");
    }
  }
  for (const preset of data.presets) {
    requireValid(songs.has(preset.songId), "songId inválido en " + preset.id);
    requireValid(typeof preset.name === "string" && preset.name.trim(),
      "preset sin nombre " + preset.id);
    requireValid(object(preset.morph), "Morph ausente en " + preset.id);
    const m = preset.morph;
    requireValid(uint(m.min, 0, 127) && uint(m.max, 0, 127) && m.min <= m.max &&
      uint(m.onLoad, m.min, m.max), "límites Morph inválidos en " + preset.id);
    requireValid(typeof m.assignment === "string" && m.assignment.length > 0,
      "asignación Morph inválida en " + preset.id);
    requireValid(object(m.parameters), "parámetros Morph inválidos en " + preset.id);
    for (const [name, range] of Object.entries(m.parameters)) {
      requireValid(Array.isArray(range) && range.length === 2 &&
        range.every(Number.isFinite), "rango " + name + " inválido en " + preset.id);
    }
  }
  // "reps" is intentionally evaluated above so all IDs are unique.
  return reps.size > 0;
}

/** Remove legacy volume metadata without changing other repertoire settings. */
export function normalizeLibrary(input) {
  const db = copy(input);
  if (object(db.midi)) {
    db.midi.cc = {...MIDI_CC};
    db.midi.provisional = false;
  }
  if (object(db.controls)) {
    delete db.controls.volume;
    if (object(db.controls.morph)) db.controls.morph.cc = MIDI_CC.morph;
  }
  for (const song of db.songs || []) {
    song.expressionMode ||= "none";
    song.effects ||= [];
    const taken = new Set();
    for (const pid of song.presetIds || []) {
      const p = (db.presets || []).find(x => x.id === pid);
      if (!p) continue;
      if (!uint(p.controlValue,0,127) || taken.has(p.controlValue)) {
        let n = 0; while (taken.has(n)) n++;
        p.controlValue = n;
      }
      taken.add(p.controlValue);
    }
    const usedEffects = new Set();
    for (const e of song.effects) {
      if (!uint(e.ccValue,0,127) || usedEffects.has(e.ccValue)) {
        let n = 0; while (usedEffects.has(n)) n++;
        e.ccValue = n;
      }
      usedEffects.add(e.ccValue);
    }
  }
  for (const p of db.presets || []) delete p.programChange;
  return db;
}

/**
 * Events: SELECT_REPERTOIRE {repertoireId}, SELECT_SONG {songId},
 * NEXT_SONG, PREVIOUS_SONG, SELECT_PRESET {presetId},
 * NEXT_PRESET, PREVIOUS_PRESET, SET_MORPH {value:0..127},
 * SET_WAH {percent:0..100}, RECEIVE_CC {controller,value,channel?},
 * RECEIVE_PC {program,channel?}, RECEIVE_F8 {timestampMs}, CLOCK_TIMEOUT {timestampMs}.
 * RECEIVE_CC uses MIDI_CC 7/11/80/81/91 and ignores other channels.
 * F8 has no channel. Clock only measures GT tempo: it NEVER overwrites song BPM.
 *
 * dispatch returns {state, intents}. Intents describe MIDI messages for a future
 * hardware adapter. The engine NEVER transmits MIDI.
 */
export function createEngine(input) {
  const db = normalizeLibrary(input);
  validateLibrary(db);
  const reps = new Map(db.repertoires.map(x => [x.id, x]));
  const songs = new Map(db.songs.map(x => [x.id, x]));
  const presets = new Map(db.presets.map(x => [x.id, x]));
  const listeners = new Set();
  const firstRep = db.repertoires[0];
  const firstSong = songs.get(firstRep.songIds[0]);
  const firstPreset = presets.get(firstSong.presetIds[0]);
  let selectedSongBank = 0; // CC0 Bank Select MSB, contexto de recepción.
  let clockTicks = [], clockReference = null, clockChangeBeats = 0, clockDirection = 0;
  let lastF8 = null, clockPulseCount = 0;
  function clearClockTracking() {
    clockTicks = []; clockReference = null; clockChangeBeats = 0;
    clockDirection = 0; lastF8 = null; clockPulseCount = 0;
  }
  let state = {
    repertoireId: firstRep.id,
    songId: firstSong.id,
    presetId: firstPreset.id,
    tempoBpm: firstSong.tempoBpm ?? null,
    morphValue: firstPreset.morph.onLoad,
    wahPercent: 0,
    volumePercent: 100,
    overlayStates: Object.fromEntries((firstSong.effects || []).map(e=>[e.id,false])),
    tempoLabel: "BPM",
    clockBpm: null,
    clockStatus: "waiting",
    sequence: 0
  };

  function songMidiIntents(song) {
    if (!song.midiAddress) return []; // Sin asignación: nunca inventar un PC.
    return [
      {type: "midi-intent", message: {kind: "control-change",
        channel: db.midi.channel, controller: 0, value: song.midiAddress.cc0}},
      {type: "midi-intent", message: {kind: "program-change",
        channel: db.midi.channel, program: song.midiAddress.pc}}
    ];
  }
  function ccIntent(name, value) {
    return { type: "midi-intent", message: {
      kind: "control-change", channel: db.midi.channel,
      controller: db.midi.cc[name], value: value
    }};
  }
  function percentToMidi(value) { return Math.round(value * 127 / 100); }
  function midiToPercent(value) { return Math.round(value * 100 / 127); }
  function resetClockDisplay(next) {
    clearClockTracking();
    return {...next, tempoLabel:"BPM", clockBpm:null,clockStatus:"waiting"};
  }
  function loadPreset(id, songId) {
    const p = presets.get(id);
    requireValid(p && p.songId === songId, "preset no pertenece a la canción: " + id);
    const s = songs.get(songId);
    let next = {...state, songId, presetId:id};
    // Nunca enviar reinicios físicos de efectos/expresión aún: pendiente observar GT.
    // Tampoco forzamos Morph al cargar el preset.
    if (state.songId !== songId) {
      next.tempoBpm = s.tempoBpm ?? null;
      next.overlayStates = Object.fromEntries(s.effects.map(e=>[e.id,null]));
      next = resetClockDisplay(next);
    }
    return { next, intents: [{type:"midi-intent",message:{
      kind:"control-change",channel:db.midi.channel,controller:MIDI_CC.state,value:p.controlValue
    }}] };
  }
  function selectSong(id, repId = state.repertoireId) {
    requireValid(reps.has(repId) && reps.get(repId).songIds.includes(id),
      "canción no pertenece al repertorio: " + id);
    const song = songs.get(id);
    const outcome = loadPreset(song.presetIds[0], id);
    outcome.next.repertoireId = repId;
    if (song.midiAddress) selectedSongBank = song.midiAddress.cc0;
    // PC carga estado inicial del nuevo tema; no emitir un CC80 duplicado.
    outcome.intents = songMidiIntents(song);
    return outcome;
  }
  function move(ids, currentId, amount) {
    const i = ids.indexOf(currentId);
    requireValid(i !== -1, "posición actual no encontrada");
    return ids[clamp(i + amount, 0, ids.length - 1)];
  }
  function getState() { return copy(state); }
  function getLibrary() { return copy(db); }
  function getViewModel() {
    const rep = reps.get(state.repertoireId);
    const song = songs.get(state.songId);
    const preset = presets.get(state.presetId);
    const m = preset.morph;
    const factor = m.max === m.min ? 0 :
      (state.morphValue - m.min) / (m.max - m.min);
    const values = {};
    for (const [name, range] of Object.entries(m.parameters)) {
      values[name] = range[0] + (range[1] - range[0]) * factor;
    }
    return copy({
      repertoire: { id: rep.id, name: rep.name },
      song: { id: song.id, title: song.title, tempoBpm: state.tempoBpm,
        midiAddress: song.midiAddress ?? null,
        position: rep.songIds.indexOf(song.id) + 1, total: rep.songIds.length },
      preset: { id: preset.id, name: preset.name, ccValue:preset.controlValue,
        position: song.presetIds.indexOf(preset.id) + 1, total: song.presetIds.length },
      states: song.presetIds.map(pid=>({id:pid,name:presets.get(pid).name,ccValue:presets.get(pid).controlValue,active:pid===preset.id})),
      effects: song.effects.map(e=>({...e,active:state.overlayStates[e.id] ?? null})),
      expressionMode: song.expressionMode,
      morph: { value: state.morphValue, assignment: m.assignment,
        min: m.min, max: m.max, parameters: values },
      wahPercent: state.wahPercent,
      volumePercent: state.volumePercent,
      tempo: {label:state.tempoLabel,displayBpm:state.tempoLabel==="TAP" ? state.clockBpm : state.tempoBpm,
        savedBpm:state.tempoBpm,receivedBpm:state.clockBpm,clockStatus:state.clockStatus},
      sequence: state.sequence
    });
  }
  function dispatch(event) {
    requireValid(object(event) && typeof event.type === "string", "evento inválido");
    let next = state;
    let intents = [];
    const rep = reps.get(state.repertoireId);
    const song = songs.get(state.songId);
    const p = presets.get(state.presetId);
    switch (event.type) {
      case "RECEIVE_CC": {
        requireValid(uint(event.controller, 0, 127) && uint(event.value, 0, 127),
          "CC recibido inválido");
        if (event.channel != null && event.channel !== db.midi.channel) break;
        if (event.controller === 0) {selectedSongBank = event.value; break;}
        if (event.controller === MIDI_CC.state) {
          const target = song.presetIds.map(id=>presets.get(id)).find(x=>x.controlValue===event.value);
          if (target && target.id !== state.presetId) ({next} = loadPreset(target.id,state.songId));
        } else if (event.controller === MIDI_CC.effect) {
          const e = song.effects.find(x=>x.ccValue===event.value);
          if (e) next = {...state,overlayStates:{...state.overlayStates,[e.id]:state.overlayStates[e.id]!==true}};
        } else if (event.controller === MIDI_CC.volume) {
          next = {...state,volumePercent:midiToPercent(event.value)};
        } else if (event.controller === MIDI_CC.morph) {
          next = {...state,morphValue:clamp(event.value,p.morph.min,p.morph.max)};
        } else if (event.controller === MIDI_CC.expression && song.expressionMode !== "none") {
          next = {...state,wahPercent:midiToPercent(event.value)};
        }
        break;
      }
      case "RECEIVE_PC": {
        requireValid(uint(event.program, 0, 127), "PC recibido inválido");
        if (event.channel != null && event.channel !== db.midi.channel) break;
        const target = db.songs.find(s => s.midiAddress &&
          s.midiAddress.cc0 === selectedSongBank &&
          s.midiAddress.pc === event.program);
        if (!target || target.id === state.songId) break;
        const selectedRep = reps.get(state.repertoireId).songIds.includes(target.id)
          ? state.repertoireId
          : db.repertoires.find(r => r.songIds.includes(target.id))?.id;
        if (!selectedRep) break;
        ({next} = selectSong(target.id, selectedRep));
        intents = []; // Evento recibido: evitar reenvío/eco MIDI.
        break;
      }
      case "RECEIVE_F8": {
        requireValid(Number.isFinite(event.timestampMs) && event.timestampMs >= 0,
          "marca temporal Clock inválida");
        const t = event.timestampMs;
        if (lastF8 !== null && (t <= lastF8 || t-lastF8 > CLOCK_CONFIG.timeoutMs)) {
          clearClockTracking();
          next = resetClockDisplay(state);
        }
        lastF8 = t;
        clockTicks.push(t);
        if (clockTicks.length > 49) clockTicks.shift();
        clockPulseCount++;
        if (clockPulseCount === 1) next = {...next,clockStatus:"receiving"};
        if (clockTicks.length>=25 && (clockPulseCount-1) % 24 === 0) {
          const n=clockTicks.length;
          const measured=60000 / (clockTicks[n-1]-clockTicks[n-25]);
          if (Number.isFinite(measured) && measured>=30 && measured<=300) {
            const bpm=Math.round(measured*10)/10;
            if (clockReference===null) clockReference=bpm;
            else {
              const delta=bpm-clockReference;
              const direction=Math.sign(delta);
              if (Math.abs(delta)>=CLOCK_CONFIG.changeThresholdBpm) {
                clockChangeBeats=direction===clockDirection ? clockChangeBeats+1 : 1;
                clockDirection=direction;
                if (clockChangeBeats>=CLOCK_CONFIG.sustainedBeats) {
                  next={...next,tempoLabel:"TAP"};
                  clockReference=bpm;
                  clockChangeBeats=0;
                }
              } else {
                clockChangeBeats=0;
                clockDirection=0;
                // Regresar a BPM solo cuando el Clock coincide con el valor almacenado.
                if (state.tempoLabel==="TAP" && state.tempoBpm!==null &&
                    Math.abs(bpm-state.tempoBpm)<CLOCK_CONFIG.changeThresholdBpm) {
                  next={...next,tempoLabel:"BPM"};
                }
              }
            }
            next={...next,clockBpm:bpm,clockStatus:"receiving"};
          }
        }
        break;
      }
      case "CLOCK_TIMEOUT": {
        requireValid(Number.isFinite(event.timestampMs),"marca temporal inválida");
        if (lastF8!==null && event.timestampMs-lastF8>CLOCK_CONFIG.timeoutMs) {
          next=resetClockDisplay({...state,clockStatus:"lost"});
          next.clockStatus="lost";
        }
        break;
      }
      case "SELECT_REPERTOIRE": {
        requireValid(reps.has(event.repertoireId), "repertorio desconocido");
        if (event.repertoireId === state.repertoireId) break;
        const newRep = reps.get(event.repertoireId);
        ({next, intents} = selectSong(newRep.songIds[0], newRep.id));
        break;
      }
      case "SELECT_SONG":
        if (event.songId === state.songId) break;
        ({next, intents} = selectSong(event.songId));
        break;
      case "NEXT_SONG":
      case "PREVIOUS_SONG": {
        const id = move(rep.songIds, state.songId, event.type === "NEXT_SONG" ? 1 : -1);
        if (id !== state.songId) ({next, intents} = selectSong(id));
        break;
      }
      case "SELECT_PRESET":
        if (event.presetId === state.presetId) break;
        ({next, intents} = loadPreset(event.presetId, state.songId));
        break;
      case "NEXT_PRESET":
      case "PREVIOUS_PRESET": {
        const id = move(song.presetIds, state.presetId,
          event.type === "NEXT_PRESET" ? 1 : -1);
        if (id !== state.presetId) ({next, intents} = loadPreset(id, state.songId));
        break;
      }
      case "SET_MORPH": {
        requireValid(Number.isFinite(event.value), "Morph no numérico");
        if (p.morph.assignment === "none") break;
        const value = clamp(Math.round(event.value), p.morph.min, p.morph.max);
        if (value !== state.morphValue) {
          next = {...state, morphValue: value};
          intents = [ccIntent("morph", value)];
        }
        break;
      }
      case "SET_EFFECT": {
        const e = song.effects.find(x=>x.id===event.effectId);
        requireValid(!!e,"efecto desconocido");
        next={...state,overlayStates:{...state.overlayStates,[e.id]:state.overlayStates[e.id]!==true}};
        intents=[{type:"midi-intent",message:{kind:"control-change",channel:db.midi.channel,
          controller:MIDI_CC.effect,value:e.ccValue}}];
        break;
      }
      case "SET_WAH": {
        requireValid(Number.isFinite(event.percent), "wah no numérico");
        const percent = clamp(event.percent, 0, 100);
        if (song.expressionMode === "none") break;
        if (percent !== state.wahPercent) {
          next = {...state, wahPercent: percent};
          intents = [ccIntent("wah", percentToMidi(percent))];
        }
        break;
      }
      default:
        throw new Error("MIDI HUD: evento desconocido " + event.type);
    }
    if (next !== state) {
      state = {...next, sequence: state.sequence + 1};
      const snapshot = getState();
      for (const listener of listeners) listener(snapshot, copy(intents), copy(event));
    }
    return {state: getState(), intents: copy(intents)};
  }
  function subscribe(listener) {
    requireValid(typeof listener === "function", "listener inválido");
    listeners.add(listener);
    return () => listeners.delete(listener);
  }
  return Object.freeze({dispatch, subscribe, getState, getViewModel, getLibrary});
}
