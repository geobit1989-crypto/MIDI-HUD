// Song controls remain on the song. Only visual music and its key belong here.
const copy=value=>JSON.parse(JSON.stringify(value));
const insist=(ok,message)=>{if(!ok)throw Error('Lead sheets: '+message);};
const uid=()=> 'sheet-'+(globalThis.crypto?.randomUUID?.()||Date.now().toString(36)+'-'+Math.random().toString(36).slice(2));
export function resolveLeadSheet(song,repertoire=null){
 if(!song?.leadSheets?.length)return null;
 const selected=repertoire?.leadSheetIds?.[song.id]||song.defaultLeadSheetId;
 return song.leadSheets.find(sheet=>sheet.id===selected)||song.leadSheets.find(sheet=>sheet.id===song.defaultLeadSheetId)||song.leadSheets[0];
}
export function syncDefaultLeadSheet(song){
 const sheet=song.leadSheets?.find(item=>item.id===song.defaultLeadSheetId);
 if(sheet){song.leadSheet=copy(sheet.leadSheet);song.tono=sheet.tono;}
}
export function migrateLeadSheets(db){
 for(const song of db.songs){
  if(!song.leadSheets){
   const id=song.id+'-sheet-original';
   song.leadSheets=[{id,name:song.catalog?.variant||'Original',tono:song.tono??null,notation:song.chordNotation==='grados'?'grados':'acordes',leadSheet:copy(song.leadSheet??null)}];
   song.defaultLeadSheetId=id;
  }
 }
 return db;
}
export function createLeadSheetVariant(song,{name,sourceId=null,leadSheet,tono,notation}={}){
 insist(typeof name==='string'&&name.trim()&&name.trim().length<=120,'escribe un nombre para la variante');
 const source=sourceId?song.leadSheets?.find(sheet=>sheet.id===sourceId):resolveLeadSheet(song);
 insist(source,'lead sheet de origen desconocido');
 const sheet={...copy(source),id:uid(),name:name.trim()};
 if(leadSheet!==undefined)sheet.leadSheet=copy(leadSheet);
 if(tono!==undefined)sheet.tono=tono;
 if(notation!==undefined)sheet.notation=notation;
 insist(sheet.tono==null||typeof sheet.tono==='string'&&sheet.tono.length<=20,'tonalidad inválida');
 insist(['acordes','grados'].includes(sheet.notation),'notación desconocida');
 insist(sheet.leadSheet===null||typeof sheet.leadSheet==='object','contenido inválido');
 song.leadSheets.push(sheet);return sheet.id;
}
export function selectPlaylistLeadSheet(db,repertoireId,songId,sheetId){
 const rep=db.repertoires.find(item=>item.id===repertoireId),song=db.songs.find(item=>item.id===songId);
 insist(rep?.songIds.includes(songId),'la canción no pertenece a la playlist');
 insist(song?.leadSheets?.some(sheet=>sheet.id===sheetId),'lead sheet ajeno a la canción');
 rep.leadSheetIds??={};rep.leadSheetIds[songId]=sheetId;
}
export function addSongToPlaylist(db,repertoireId,songId,sheetId){
 const rep=db.repertoires.find(item=>item.id===repertoireId),song=db.songs.find(item=>item.id===songId);
 insist(rep&&song&&!song.catalog?.archived,'canción o playlist no disponible');
 const selected=sheetId||resolveLeadSheet(song)?.id;
 insist(song.leadSheets?.some(sheet=>sheet.id===selected),'lead sheet ajeno a la canción');
 const added=!rep.songIds.includes(songId);if(added)rep.songIds.push(songId);
 selectPlaylistLeadSheet(db,repertoireId,songId,selected);return added;
}
