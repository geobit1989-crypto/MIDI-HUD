/**
 * MIDI HUD - Motor de visualizacion v1.0 (MIDI 1.0).
 * Sin DOM, audio, temporizadores, redes ni envio MIDI.
 * Los datos de cancion no contienen el canal de recepcion: es un ajuste global.
 */
import {validModuleColor,validModuleIcon} from "./module-visuals.mjs";
import {resolveLeadSheet} from './lead-sheet-variants.mjs';
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
      id:s.id, title:s.title, author:s.author || "", tono:s.tono || null,
      tempoBpm:s.tempoBpm ?? null, leadSheet:s.leadSheet || null,
      bank:s.bank || null, displaySlots:s.displaySlots || [], stateIds:s.presetIds || [],
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
  insist(db.catalogVersion==null||db.catalogVersion===1,"versión de catálogo desconocida");
  const reps = unique(db.repertoires, "repertorios");
  const songs = unique(db.songs, "canciones");
  const states = unique(db.states, "estados");
  insist(reps.size > 0 && songs.size > 0 && states.size > 0, "biblioteca vacia");
  for (const r of reps.values()) {
    insist(Array.isArray(r.songIds) && (r.songIds.length > 0 || db.catalogVersion===1), "repertorio sin canciones");
    insist(r.entryNotes==null || (isObject(r.entryNotes)&&Object.entries(r.entryNotes).every(([id,note])=>r.songIds.includes(id)&&typeof note==="string"&&note.length<=4000)), "notas de repertorio inválidas");
    insist(new Set(r.songIds).size === r.songIds.length, "cancion repetida en repertorio");
    for (const id of r.songIds) insist(songs.has(id), "cancion inexistente: " + id);
    insist(r.leadSheetIds==null||(isObject(r.leadSheetIds)&&Object.entries(r.leadSheetIds).every(([songId,sheetId])=>r.songIds.includes(songId)&&songs.get(songId)?.leadSheets?.some(sheet=>sheet.id===sheetId))),"selección de lead sheet inválida");
  }
  for (const s of songs.values()) {
    insist(typeof s.title === "string" && !!s.title.trim(), "titulo de cancion vacio");
    insist(s.author===undefined || (typeof s.author==="string" && s.author.length<=160), "autor invalido");
    insist(s.tono == null || (typeof s.tono === "string" && s.tono.length <= 20), "tono invalido");
    insist(s.tempoBpm == null || (Number.isFinite(s.tempoBpm) && s.tempoBpm>=30 && s.tempoBpm<=300), "BPM invalido");
    insist(s.leadSheet == null || isObject(s.leadSheet), "lead sheet invalido");
    if(s.leadSheet != null) {
      insist(Array.isArray(s.leadSheet.sections) && s.leadSheet.sections.length>0
        && s.leadSheet.sections.length<=4, "lead sheet: secciones invalidas");
      for(const section of s.leadSheet.sections) {
        insist(isObject(section) && typeof section.label==="string"
          && typeof section.letter==="string" && Array.isArray(section.bars)
          && section.bars.length<=32, "lead sheet: seccion invalida");
        for(const bar of section.bars) {
          insist(Array.isArray(bar) && bar.length===4 &&
            bar.every(v=>typeof v==="string" && v.length<=30), "lead sheet: cuatro pulsos por compas");
        }
      }
    }
    insist(s.displaySlots === undefined || (Array.isArray(s.displaySlots) &&
      s.displaySlots.length<=9 && s.displaySlots.every(slot=>isObject(slot) &&
      typeof slot.name==="string" && typeof slot.sub==="string" &&
      (slot.color==null||validModuleColor(slot.color)) &&
      (slot.icon==null||validModuleIcon(slot.icon)))),
      "matriz visual invalida");
    insist(Array.isArray(s.stateIds) && s.stateIds.length > 0, "cancion sin estados");
    insist(new Set(s.stateIds).size === s.stateIds.length, "estados duplicados");
    insist(s.stateIds.includes(s.initialStateId), "estado inicial no pertenece a la cancion");
    for (const id of s.stateIds) {
      insist(states.has(id) && states.get(id).songId === s.id, "estado ajeno/inexistente: " + id);
    }
  }
  for(const song of songs.values()){
    if(song.leadSheets!==undefined){
      const sheets=unique(song.leadSheets,'lead sheets');
      insist(sheets.size>0&&sheets.has(song.defaultLeadSheetId),'lead sheet predeterminado inválido');
      for(const sheet of sheets.values()){
        insist(typeof sheet.name==='string'&&sheet.name.trim()&&sheet.name.length<=120,'nombre de lead sheet inválido');
        insist(sheet.tono==null||typeof sheet.tono==='string'&&sheet.tono.length<=20,'tonalidad de lead sheet inválida');
        insist(['acordes','grados'].includes(sheet.notation),'notación de lead sheet inválida');
        // Use the existing full lead-sheet validator for every variant.
        insist(sheet.leadSheet===null||isObject(sheet.leadSheet),'lead sheet inválido');
        if(sheet.leadSheet!==null){
          const sections=sheet.leadSheet.sections;
          insist(Array.isArray(sections)&&sections.length>0&&sections.length<=4,'secciones de lead sheet inválidas');
          for(const section of sections)insist(isObject(section)&&typeof section.label==='string'&&typeof section.letter==='string'&&Array.isArray(section.bars)&&section.bars.length<=32&&section.bars.every(bar=>Array.isArray(bar)&&bar.length===4&&bar.every(v=>typeof v==='string'&&v.length<=30)),'compases de lead sheet inválidos');
        }
      }
    }
    if(song.catalog!=null){
      const item=song.catalog;
      insist(isObject(item)&&typeof item.familyId==="string"&&!!item.familyId.trim()&&typeof item.variant==="string"&&item.variant.length<=120&&typeof item.archived==="boolean"&&Array.isArray(item.history),"metadatos de catálogo inválidos");
      const historyIds=new Set();
      for(const entry of item.history){
        insist(isObject(entry)&&typeof entry.id==="string"&&!historyIds.has(entry.id)&&typeof entry.createdAt==="string"&&typeof entry.reason==="string"&&isObject(entry.snapshot)&&entry.snapshot.song?.id===song.id&&Array.isArray(entry.snapshot.states),"historial de catálogo inválido");
        historyIds.add(entry.id);
      }
    }
    if(song.midiBindings!==undefined){
      insist(Array.isArray(song.midiBindings),"asignaciones MIDI de versión inválidas");const keys=new Set();
      for(const binding of song.midiBindings){
        const key=binding.cc+":"+binding.value;
        insist(integer(binding.cc,0,127)&&integer(binding.value,0,127)&&!keys.has(key)&&Array.isArray(binding.actions),"mensaje MIDI de versión inválido");
        keys.add(key);for(const action of binding.actions)validAction(action,states,songs);
      }
    }
  }
  for (const st of states.values()) {
    insist(songs.has(st.songId) && songs.get(st.songId).stateIds.includes(st.id), "estado huerfano");
    insist(typeof st.name === "string" && !!st.name.trim(), "estado sin nombre");
    insist(st.indicators === undefined || (Array.isArray(st.indicators) &&
      st.indicators.every(x=>isObject(x) && typeof x.id==="string" &&
      typeof x.label==="string" && typeof x.active==="boolean" &&
      (x.displayIndex == null || integer(x.displayIndex,0,8)))),
      "indicadores invalidos");
    insist(st.displayIndex == null || integer(st.displayIndex,0,8), "posicion visual invalida");
    insist(st.gtPatch == null || integer(st.gtPatch,0,127), "referencia de patch invalida");
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
export function createEngine(source, {midiChannel=1,repertoireId=null,songId=null}={}) {
  const db = normalizeLibrary(source);
  validateLibrary(db);
  insist(integer(midiChannel,1,16), "canal global fuera de 1..16");
  const reps = new Map(db.repertoires.map(x=>[x.id,x]));
  const songs = new Map(db.songs.map(x=>[x.id,x]));
  const states = new Map(db.states.map(x=>[x.id,x]));
  const bindings = new Map(db.bindings.map(x=>[x.cc+":"+x.value,x.actions]));
  const initialRep = reps.get(repertoireId)||db.repertoires[0];
  const versionBindings=new Map(db.songs.filter(s=>Array.isArray(s.midiBindings)).map(s=>[s.id,new Map(s.midiBindings.map(b=>[b.cc+":"+b.value,b.actions]))]));
  const initialSong = songs.get(initialRep.songIds.includes(songId)?songId:initialRep.songIds[0]);
  const listeners = new Set();
  let session = {
    midiChannel,
    activeRepertoireId:initialRep.id,
    activeSongId:initialSong?.id??null,
    activeStateId:initialSong?.initialStateId??null,
    previewSongId:null,
    previewStateId:null,
    previewModuleIndex:null,
    rememberedStates:initialSong?{[initialSong.id]:initialSong.initialStateId}:{},
    indicatorOverrides:{},
    sequence:0
  };
  function repertoireFor(songId) {
    const preferred=reps.get(session.activeRepertoireId);
    return preferred?.songIds.includes(songId)?preferred:db.repertoires.find(x=>x.songIds.includes(songId)) || initialRep;
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
    if(!song){
      const rep=reps.get(session.activeRepertoireId)||initialRep;
      return duplicate({empty:true,song:{id:null,title:"Repertorio vacío",tono:null,tempoBpm:null,leadSheet:null,bank:null,displaySlots:[],moduleLayout:"auto",position:0,total:0},
        state:{id:null,name:"Añade canciones desde el catálogo",gtPatch:null,displayIndex:null,indicators:[],position:0,total:0},
        repertoire:{id:rep.id,name:rep.name},active:{repertoireId:rep.id,songId:null,stateId:null},isPreview:false,previewModuleIndex:null,midiChannel:session.midiChannel,sequence:session.sequence});
    }
    const stateId=session.previewStateId || (session.previewSongId
      ? session.rememberedStates[songId] || song.initialStateId
      : session.activeStateId);
    const st=states.get(stateId);
    const indicators=(st.indicators||[]).map(x=>({
      ...x,
      active: session.previewSongId ? !!x.active
        : (session.indicatorOverrides[x.id] ?? !!x.active)
    }));
    const rep=repertoireFor(songId);
    const sheet=resolveLeadSheet(song,rep);
    return duplicate({
      song:{id:song.id,title:song.title,author:song.author||"",tono:sheet?sheet.tono:song.tono,tempoBpm:song.tempoBpm,
        leadSheet:sheet?sheet.leadSheet:song.leadSheet,leadSheetId:sheet?.id??null,leadSheetName:sheet?.name??null,bank:song.bank,displaySlots:song.displaySlots||[],
        position:rep.songIds.indexOf(song.id)+1,total:rep.songIds.length},
      repertoire:{id:rep.id,name:rep.name},
      state:{id:st.id,name:st.name,gtPatch:st.gtPatch??null,
        displayIndex:st.displayIndex??null,indicators,position:song.stateIds.indexOf(st.id)+1,total:song.stateIds.length},
      active:{songId:session.activeSongId,stateId:session.activeStateId},
      isPreview:!!session.previewSongId,
      previewModuleIndex:session.previewModuleIndex,
      midiChannel:session.midiChannel, sequence:session.sequence
    });
  }
  function dispatch(event) {
    insist(isObject(event)&&typeof event.type==="string", "evento invalido");
    let next=duplicate(session), matched=false, changed=false, actions=[];
    switch(event.type) {
      case "SELECT_REPERTOIRE": {
        const rep=reps.get(event.repertoireId);insist(rep,"repertorio desconocido");
        next.activeRepertoireId=rep.id;
        if(rep.songIds.length){if(next.activeSongId!==rep.songIds[0])enterSong(next,rep.songIds[0]);}
        else {next.activeSongId=null;next.activeStateId=null;next.indicatorOverrides={};}
        next.previewSongId=null;next.previewStateId=null;next.previewModuleIndex=null;
        changed=JSON.stringify(next)!==JSON.stringify(session);break;
      }
      case "SET_CHANNEL":
        insist(integer(event.channel,1,16), "canal global invalido");
        next.midiChannel=event.channel;
        changed=next.midiChannel!==session.midiChannel;
        break;
      case "PREVIEW_SONG":
        insist(songs.has(event.songId), "cancion de consulta desconocida");
        next.previewSongId=event.songId;
        next.previewStateId=null;next.previewModuleIndex=null;
        changed=JSON.stringify(next)!==JSON.stringify(session);
        break;
      case "PREVIEW_STATE": {
        const st=states.get(event.stateId);
        insist(st,"estado de consulta desconocido");
        next.previewSongId=st.songId;
        next.previewStateId=st.id;
        next.previewModuleIndex=st.displayIndex??null;
        changed=JSON.stringify(next)!==JSON.stringify(session);
        break;
      }
      case "PREVIEW_MODULE":
        insist(integer(event.index,0,8),"módulo de consulta invalido");
        next.previewSongId=session.previewSongId||session.activeSongId;
        next.previewStateId=null;
        next.previewModuleIndex=event.index;
        changed=JSON.stringify(next)!==JSON.stringify(session);
        break;
      case "RETURN_TO_ACTIVE":
        next.previewSongId=null;next.previewStateId=null;next.previewModuleIndex=null;
        changed=session.previewSongId!==null;
        break;
      case "MIDI_CC": {
        insist(integer(event.channel,1,16) && integer(event.cc,0,127) &&
          integer(event.value,0,127), "mensaje CC invalido");
        if(event.channel!==session.midiChannel) break;
        const key=event.cc+":"+event.value,scoped=versionBindings.get(session.activeSongId);
        const instructions=scoped?.has(key)?scoped.get(key):bindings.get(key);
        if(!instructions?.length) break;
        matched=true;
        actions=duplicate(instructions);
        for(const a of instructions) {
          if(a.type==="ACTIVATE_STATE") activateState(next,a.stateId);
          else if(a.type==="SELECT_SONG") enterSong(next,a.songId);
          else if(a.type==="SET_INDICATOR") next.indicatorOverrides[a.indicatorId]=a.active;
        }
        next.previewSongId=null;next.previewStateId=null;next.previewModuleIndex=null;
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
