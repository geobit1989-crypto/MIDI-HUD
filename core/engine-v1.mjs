/**
 * MIDI HUD - Motor de visualizacion v1.0 (MIDI 1.0).
 * Sin DOM, audio, temporizadores, redes ni envio MIDI.
 * Los datos de cancion no contienen el canal de recepcion: es un ajuste global.
 */
export const ENGINE_VERSION = "1.0.0-beta.1";
export const SCHEMA_VERSION = "2.0.0";

const isObject = x => x !== null && typeof x === "object" && !Array.isArray(x);
const integer = (x,a,b) => Number.isInteger(x) && x >= a && x <= b;
const duplicate = x => JSON.parse(JSON.stringify(x));
function insist(test, reason) { if (!test) throw new Error("MIDI HUD: " + reason); }
function unique(items, label) {
  insist(Array.isArray(items), label + " debe ser un array");
  const values = new Map();
  for (const item of items) {
    insist(isObject(item) && typeof item.id === "string" && item.id.trim(), label + ": id invalido");
    insist(!values.has(item.id), label + ": id duplicado " + item.id);
    values.set(item.id, item);
  }
  return values;
}

/** Convierte bibliotecas anteriores sin modificar el original. */
export function normalizeLibrary(raw) {
  insist(isObject(raw), "biblioteca no valida");
  if (raw.schemaVersion === SCHEMA_VERSION) return duplicate(raw);
  insist(raw.schemaVersion === "1.0.0" && raw.format === "midi-hud-repertoire",
    "version de biblioteca desconocida");
  const data = duplicate(raw);
  const states = (data.presets || []).map(p => ({
    id: p.id, songId: p.songId, name: p.name,
    gtPatch: integer(p.programChange,0,127) ? p.programChange : null,
    indicators: []
  }));
  return {
    format: "midi-hud-repertoire", schemaVersion: SCHEMA_VERSION,
    libraryId: data.libraryId || "migrated", revision: data.revision || 0,
    repertoires: data.repertoires,
    songs: (data.songs || []).map(s => ({
      id:s.id, title:s.title, tono:s.tono || null,
      tempoBpm:s.tempoBpm ?? null, leadSheet:s.leadSheet || null,
      bank:s.bank || null, stateIds:s.presetIds || [],
      initialStateId:s.initialStateId || (s.presetIds || [])[0]
    })),
    states, bindings: [],
    extensions: {legacyMigrated: true}
  };
}
function validAction(a, states, songs) {
  insist(isObject(a), "accion invalida");
  switch (a.type) {
    case "ACTIVATE_STATE":
      insist(states.has(a.stateId), "estado desconocido en accion");
      break;
    case "SELECT_SONG":
      insist(songs.has(a.songId), "cancion desconocida en accion");
      break;
    case "SET_INDICATOR":
      insist(typeof a.indicatorId === "string" && !!a.indicatorId.trim()
        && typeof a.active === "boolean", "indicador invalido");
      break;
    default: throw new Error("MIDI HUD: tipo de accion desconocido: " + String(a.type));
  }
}
/** Confirma integridad de referencias, comandos y estado inicial. */
export function validateLibrary(raw) {
  const db = normalizeLibrary(raw);
  insist(db.format === "midi-hud-repertoire", "formato incorrecto");
  const reps = unique(db.repertoires, "repertorios");
  const songs = unique(db.songs, "canciones");
  const states = unique(db.states, "estados");
  insist(reps.size > 0 && songs.size > 0 && states.size > 0, "biblioteca vacia");
  for (const r of reps.values()) {
    insist(Array.isArray(r.songIds) && r.songIds.length > 0, "repertorio sin canciones");
    insist(new Set(r.songIds).size === r.songIds.length, "cancion repetida en repertorio");
    for (const id of r.songIds) insist(songs.has(id), "cancion inexistente: " + id);
  }
  for (const s of songs.values()) {
    insist(typeof s.title === "string" && !!s.title.trim(), "titulo de cancion vacio");
    insist(s.tono == null || (typeof s.tono === "string" && s.tono.length <= 20), "tono invalido");
    insist(s.tempoBpm == null || (Number.isFinite(s.tempoBpm) && s.tempoBpm>=30 && s.tempoBpm<=300), "BPM invalido");
    insist(s.leadSheet == null || isObject(s.leadSheet), "lead sheet invalido");
    insist(Array.isArray(s.stateIds) && s.stateIds.length > 0, "cancion sin estados");
    insist(new Set(s.stateIds).size === s.stateIds.length, "estados duplicados");
    insist(s.stateIds.includes(s.initialStateId), "estado inicial no pertenece a la cancion");
    for (const id of s.stateIds) {
      insist(states.has(id) && states.get(id).songId === s.id, "estado ajeno/inexistente: " + id);
    }
  }
  for (const st of states.values()) {
    insist(songs.has(st.songId) && songs.get(st.songId).stateIds.includes(st.id), "estado huerfano");
    insist(typeof st.name === "string" && !!st.name.trim(), "estado sin nombre");
    insist(st.indicators === undefined || Array.isArray(st.indicators), "indicadores invalidos");
  }
  insist(Array.isArray(db.bindings), "asignaciones invalidas");
  const seen = new Set();
  for (const b of db.bindings) {
    insist(integer(b.cc,0,127) && integer(b.value,0,127), "CC/valor fuera de rango");
    const key = b.cc+":"+b.value;
    insist(!seen.has(key), "asignacion duplicada: "+key);
    seen.add(key);
    insist(Array.isArray(b.actions) && b.actions.length > 0, "asignacion sin acciones");
    for (const a of b.actions) validAction(a,states,songs);
  }
  return true;
}
export function decodeMidiCC(data) {
  if (!data || data.length < 3) return null;
  const [status,cc,value] = data;
  if (!integer(status,0,255) || (status & 0xF0) !== 0xB0
      || !integer(cc,0,127) || !integer(value,0,127)) return null;
  return {type:"MIDI_CC",channel:(status & 0x0F)+1,cc,value};
}

/**
 * Motor puro. La vista puede previsualizar otra cancion sin modificar la activa.
 * El mensaje MIDI reconocido ejecuta sus acciones en orden configurado y vuelve
 * a mostrar la vista operativa. La GT nunca es controlada por este modulo.
 */
export function createEngine(source, {midiChannel=1}={}) {
  const db = normalizeLibrary(source);
  validateLibrary(db);
  insist(integer(midiChannel,1,16), "canal global fuera de 1..16");
  const reps = new Map(db.repertoires.map(x=>[x.id,x]));
  const songs = new Map(db.songs.map(x=>[x.id,x]));
  const states = new Map(db.states.map(x=>[x.id,x]));
  const bindings = new Map(db.bindings.map(x=>[x.cc+":"+x.value,x.actions]));
  const initialRep = db.repertoires[0];
  const initialSong = songs.get(initialRep.songIds[0]);
  const listeners = new Set();
  let session = {
    midiChannel,
    activeSongId:initialSong.id,
    activeStateId:initialSong.initialStateId,
    previewSongId:null,
    rememberedStates:{[initialSong.id]:initialSong.initialStateId},
    indicatorOverrides:{},
    sequence:0
  };
  function repertoireFor(songId) {
    return db.repertoires.find(x=>x.songIds.includes(songId)) || initialRep;
  }
  function enterSong(next,songId) {
    const song=songs.get(songId);
    insist(song,"cancion desconocida: "+songId);
    next.activeSongId=songId;
    next.activeStateId=next.rememberedStates[songId] || song.initialStateId;
    next.rememberedStates[songId]=next.activeStateId;
    next.indicatorOverrides={};
  }
  function activateState(next,stateId) {
    const st=states.get(stateId);
    insist(st,"estado desconocido: "+stateId);
    next.activeSongId=st.songId;
    next.activeStateId=stateId;
    next.rememberedStates[st.songId]=stateId;
    next.indicatorOverrides={};
  }
  function getState() {return duplicate(session);}
  function getLibrary() {return duplicate(db);}
  function getViewModel() {
    const songId=session.previewSongId||session.activeSongId;
    const song=songs.get(songId);
    const stateId=(session.previewSongId
      ? session.rememberedStates[songId] || song.initialStateId
      : session.activeStateId);
    const st=states.get(stateId);
    const indicators=(st.indicators||[]).map(x=>({
      ...x,
      active: session.previewSongId ? !!x.active
        : (session.indicatorOverrides[x.id] ?? !!x.active)
    }));
    const rep=repertoireFor(songId);
    return duplicate({
      song:{id:song.id,title:song.title,tono:song.tono,tempoBpm:song.tempoBpm,
        leadSheet:song.leadSheet,bank:song.bank,
        position:rep.songIds.indexOf(song.id)+1,total:rep.songIds.length},
      repertoire:{id:rep.id,name:rep.name},
      state:{id:st.id,name:st.name,gtPatch:st.gtPatch??null,
        displayIndex:st.displayIndex??null,indicators,position:song.stateIds.indexOf(st.id)+1,total:song.stateIds.length},
      active:{songId:session.activeSongId,stateId:session.activeStateId},
      isPreview:!!session.previewSongId,
      midiChannel:session.midiChannel, sequence:session.sequence
    });
  }
  function dispatch(event) {
    insist(isObject(event)&&typeof event.type==="string", "evento invalido");
    let next=duplicate(session), matched=false, changed=false, actions=[];
    switch(event.type) {
      case "SET_CHANNEL":
        insist(integer(event.channel,1,16), "canal global invalido");
        next.midiChannel=event.channel;
        changed=next.midiChannel!==session.midiChannel;
        break;
      case "PREVIEW_SONG":
        insist(songs.has(event.songId), "cancion de consulta desconocida");
        next.previewSongId=event.songId;
        changed=next.previewSongId!==session.previewSongId;
        break;
      case "RETURN_TO_ACTIVE":
        next.previewSongId=null;
        changed=session.previewSongId!==null;
        break;
      case "MIDI_CC": {
        insist(integer(event.channel,1,16) && integer(event.cc,0,127) &&
          integer(event.value,0,127), "mensaje CC invalido");
        if(event.channel!==session.midiChannel) break;
        const instructions=bindings.get(event.cc+":"+event.value);
        if(!instructions) break;
        matched=true;
        actions=duplicate(instructions);
        for(const a of instructions) {
          if(a.type==="ACTIVATE_STATE") activateState(next,a.stateId);
          else if(a.type==="SELECT_SONG") enterSong(next,a.songId);
          else if(a.type==="SET_INDICATOR") next.indicatorOverrides[a.indicatorId]=a.active;
        }
        next.previewSongId=null;
        changed=JSON.stringify(next)!==JSON.stringify(session);
        break;
      }
      default: throw new Error("MIDI HUD: evento desconocido "+event.type);
    }
    if(changed) {
      next.sequence=session.sequence+1;
      session=next;
      for(const fn of listeners) fn(getState(),getViewModel(),duplicate(event));
    }
    return {matched,changed,actions,state:getState(),view:getViewModel(),intents:[]};
  }
  function subscribe(listener) {
    insist(typeof listener==="function","observador invalido");
    listeners.add(listener);
    return ()=>listeners.delete(listener);
  }
  return Object.freeze({dispatch,subscribe,getState,getLibrary,getViewModel});
}
