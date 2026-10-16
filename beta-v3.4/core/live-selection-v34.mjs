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
 if(typeof repertoireId!=='string'||!repertoireId.trim()||typeof songId!=='string'||!songId.trim())
  throw Error('Selección de LIVE inválida');
 storage?.setItem(LIVE_SELECTION_KEY,JSON.stringify({repertoireId,songId}));
}
