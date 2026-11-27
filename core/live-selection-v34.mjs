import {normalizeLibrary} from './engine-v1.mjs';
import {QA_LIBRARY_ID} from './environment.mjs?v=20261127-drive5';

export function withFullRepertoire(source){
 const library=normalizeLibrary(source);
 let id='hud-full-repertoire';
 while(library.repertoires.some(rep=>rep.id===id))id+='-local';
 const songIds=library.songs.filter(song=>!song.catalog?.archived).map(song=>song.id);
 const onlyRepertoire=library.repertoires.length===1?library.repertoires[0]:null;
 if(library.libraryId===QA_LIBRARY_ID&&onlyRepertoire?.songIds.length===songIds.length&&songIds.every(songId=>onlyRepertoire.songIds.includes(songId)))return library;
 library.repertoires.push({id,name:'Repertorio completo',songIds});
 return library;
}
/** Selección local de LIVE; no modifica la biblioteca ni los ajustes MIDI. */
export const LIVE_SELECTION_KEY='midiHudLiveSelectionV34';
export function resolveLiveSelection(library,storage,search=''){
 let saved={};
 try{saved=JSON.parse(storage?.getItem(LIVE_SELECTION_KEY))||{};}catch{}
 const params=new URLSearchParams(search),requested=params.get('repertoire');
 const selected=requested||saved.repertoireId;
 const repertoire=library.repertoires.find(rep=>rep.id===selected)||library.repertoires[0];
 const song=params.get('song')||(saved.repertoireId===repertoire.id?saved.songId:null);
 return {repertoireId:repertoire.id,songId:repertoire.songIds.includes(song)?song:repertoire.songIds[0],
  missingRequestedRepertoire:!!requested&&!library.repertoires.some(rep=>rep.id===requested)};
}
export function saveLiveSelection(storage,{repertoireId,songId}){
 if(typeof repertoireId!=='string'||!repertoireId.trim()||(songId!==null&&(typeof songId!=='string'||!songId.trim())))
  throw Error('Selección de LIVE inválida');
 storage?.setItem(LIVE_SELECTION_KEY,JSON.stringify({repertoireId,songId}));
}
