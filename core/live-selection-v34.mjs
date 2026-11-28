import {normalizeLibrary,playbackContexts,defaultPlaybackContext,REPERTOIRE_CONTEXT_ID,repertoireContext} from './engine-v1.mjs?v=20261128-library2';

/** Solo listas reales persistidas; Repertorio es un contexto derivado. */
export function prepareLiveLibrary(source){return normalizeLibrary(source);}
/** Selección local de LIVE; no modifica la biblioteca ni los ajustes MIDI. */
export const LIVE_SELECTION_KEY='midiHudLiveSelectionV34';
export function resolveLiveSelection(library,storage,search=''){
 let saved={};
 try{saved=JSON.parse(storage?.getItem(LIVE_SELECTION_KEY))||{};}catch{}
 const params=new URLSearchParams(search),requested=params.get('repertoire');
 const selected=requested||saved.repertoireId;
 const contexts=playbackContexts(library);
 const repertoire=contexts.find(rep=>rep.id===selected)||
  (!requested&&selected&&selected!=="hud-full-repertoire"&&library.catalogVersion===1?repertoireContext(library):defaultPlaybackContext(library));
 const song=params.get('song')||(saved.repertoireId===repertoire.id||repertoire.id===REPERTOIRE_CONTEXT_ID?saved.songId:null);
 return {repertoireId:repertoire.id,songId:repertoire.songIds.includes(song)?song:repertoire.songIds[0]??null,
  missingRequestedRepertoire:!!requested&&!contexts.some(rep=>rep.id===requested)};
}
export function saveLiveSelection(storage,{repertoireId,songId}){
 if(typeof repertoireId!=='string'||!repertoireId.trim()||(songId!==null&&(typeof songId!=='string'||!songId.trim())))
  throw Error('Selección de LIVE inválida');
 storage?.setItem(LIVE_SELECTION_KEY,JSON.stringify({repertoireId,songId}));
}
