/*
 * MIDI HUD operational engine v0.1
 * Pure state machine: no DOM, network, localStorage or MIDI device access.
 * Compatible with config/midi-hud-data-v1.json (schema 1.0.0).
 */
export const ENGINE_VERSION = "0.2.0";

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
  requireValid(data.midi.programNumbering === "zero-based",
    "solo se admiten programas MIDI de 0 a 127");
  requireValid(object(data.midi.cc), "faltan los CC MIDI");
  for (const name of ["morph", "wah"]) {
    requireValid(uint(data.midi.cc[name], 0, 127), "CC " + name + " inválido");
  }
  requireValid(Array.isArray(data.repertoires) && data.repertoires.length > 0,
    "no hay repertorios");
  requireValid(Array.isArray(data.songs) && data.songs.length > 0, "no hay canciones");
  requireValid(Array.isArray(data.presets) && data.presets.length > 0, "no hay presets");
  const reps = uniqueIds(data.repertoires, "repertorios");
  const songs = uniqueIds(data.songs, "canciones");
  const presets = uniqueIds(data.presets, "presets");
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
    requireValid(uint(preset.programChange, 0, 127),
      "Program Change inválido en " + preset.id);
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
  if (object(db.midi) && object(db.midi.cc)) delete db.midi.cc.volume;
  if (object(db.controls)) delete db.controls.volume;
  return db;
}

/**
 * Events: SELECT_REPERTOIRE {repertoireId}, SELECT_SONG {songId},
 * NEXT_SONG, PREVIOUS_SONG, SELECT_PRESET {presetId},
 * NEXT_PRESET, PREVIOUS_PRESET, SET_MORPH {value:0..127},
 * SET_WAH {percent:0..100}.
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
  let state = {
    repertoireId: firstRep.id,
    songId: firstSong.id,
    presetId: firstPreset.id,
    tempoBpm: firstSong.tempoBpm ?? null,
    morphValue: firstPreset.morph.onLoad,
    wahPercent: 0,
    sequence: 0
  };

  function pcIntent(preset) {
    return { type: "midi-intent", message: {
      kind: "program-change", channel: db.midi.channel, program: preset.programChange
    }};
  }
  function ccIntent(name, value) {
    return { type: "midi-intent", message: {
      kind: "control-change", channel: db.midi.channel,
      controller: db.midi.cc[name], value: value
    }};
  }
  function percentToMidi(value) { return Math.round(value * 127 / 100); }
  function loadPreset(id, songId) {
    const p = presets.get(id);
    requireValid(p && p.songId === songId, "preset no pertenece a la canción: " + id);
    const s = songs.get(songId);
    const next = { ...state, songId: songId, presetId: id,
      tempoBpm: s.tempoBpm ?? null, morphValue: p.morph.onLoad };
    const intents = [pcIntent(p), ccIntent("morph", p.morph.onLoad)];
    return { next, intents };
  }
  function selectSong(id, repId = state.repertoireId) {
    requireValid(reps.has(repId) && reps.get(repId).songIds.includes(id),
      "canción no pertenece al repertorio: " + id);
    const song = songs.get(id);
    const outcome = loadPreset(song.presetIds[0], id);
    outcome.next.repertoireId = repId;
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
        position: rep.songIds.indexOf(song.id) + 1, total: rep.songIds.length },
      preset: { id: preset.id, name: preset.name, programChange: preset.programChange,
        position: song.presetIds.indexOf(preset.id) + 1, total: song.presetIds.length },
      morph: { value: state.morphValue, assignment: m.assignment,
        min: m.min, max: m.max, parameters: values },
      wahPercent: state.wahPercent,
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
      case "SET_WAH": {
        requireValid(Number.isFinite(event.percent), "wah no numérico");
        const percent = clamp(event.percent, 0, 100);
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
