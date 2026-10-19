import {normalizeLibrary,validateLibrary} from './engine-v1.mjs?v=20261016-repertoires1';
import {readLibrarySource,replaceLibrary} from './library-storage.mjs?v=20261016-editor-audit1';

const PREFIX='#midi-hud=',MAX_BYTES=500000;
function ensure(ok,message){if(!ok)throw Error('Enlace MIDI HUD: '+message);}
async function collect(stream){
 const reader=stream.getReader(),chunks=[];let length=0;
 try{
  for(;;){
   const {value,done}=await reader.read();if(done)break;
   length+=value.length;
   if(length>MAX_BYTES){await reader.cancel();throw Error('Enlace MIDI HUD: biblioteca demasiado grande.');}
   chunks.push(value);
  }
 }finally{reader.releaseLock();}
 const result=new Uint8Array(length);let offset=0;
 for(const chunk of chunks){result.set(chunk,offset);offset+=chunk.length;}
 return result;
}
function base64(bytes){
 let text='';for(let i=0;i<bytes.length;i+=32768)text+=String.fromCharCode(...bytes.subarray(i,i+32768));
 return btoa(text).replace(/\+/g,'-').replace(/\//g,'_').replace(/=+$/,'');
}
function unbase64(text){
 ensure(/^[A-Za-z0-9_-]+$/.test(text)&&text.length<=MAX_BYTES*1.4,'contenido inválido o demasiado grande.');
 const decoded=atob(text.replace(/-/g,'+').replace(/_/g,'/')+'='.repeat((4-text.length%4)%4));
 return Uint8Array.from(decoded,char=>char.charCodeAt(0));
}
function validatePacket(packet){
 ensure(packet?.format==='midi-hud-transfer'&&packet.version===1,'formato desconocido.');
 const library=normalizeLibrary(packet.library);validateLibrary(library);
 const repertoire=library.repertoires.find(rep=>rep.id===packet.repertoireId);
 ensure(repertoire?.songIds.includes(packet.songId),'el repertorio o la canción no están en la biblioteca.');
 return {...packet,library};
}
/** La copia viaja en el fragmento del enlace, sin subir la biblioteca al servidor. */
export async function createLibraryTransferUrl(library,{repertoireId,songId},editorUrl){
 const packet=validatePacket({format:'midi-hud-transfer',version:1,library,repertoireId,songId});
 let bytes=new TextEncoder().encode(JSON.stringify(packet)),mode='raw';
 ensure(bytes.length<=MAX_BYTES,'biblioteca demasiado grande para trasladarla con un enlace.');
 if(typeof CompressionStream==='function'){
  try{
   const compressed=await collect(new Blob([bytes]).stream().pipeThrough(new CompressionStream('gzip')));
   if(compressed.length<bytes.length){bytes=compressed;mode='gzip';}
  }catch{}
 }
 const url=new URL('../v03.html',editorUrl);
 url.searchParams.set('v','20261016-transfer1');
 url.searchParams.set('repertoire',repertoireId);url.searchParams.set('song',songId);
 url.hash=PREFIX.slice(1)+'v1.'+mode+'.'+base64(bytes);
 return url.href;
}
export async function decodeLibraryTransfer(hash){
 if(!hash?.startsWith(PREFIX))return null;
 const match=hash.slice(PREFIX.length).match(/^v1\.(raw|gzip)\.([A-Za-z0-9_-]+)$/);
 ensure(match,'el enlace está incompleto o usa una versión desconocida.');
 let bytes=unbase64(match[2]);
 if(match[1]==='gzip'){
  ensure(typeof DecompressionStream==='function','este navegador no permite abrir enlaces comprimidos.');
  bytes=await collect(new Blob([bytes]).stream().pipeThrough(new DecompressionStream('gzip')));
 }
 ensure(bytes.length<=MAX_BYTES,'biblioteca demasiado grande.');
 return validatePacket(JSON.parse(new TextDecoder('utf-8',{fatal:true}).decode(bytes)));
}
export async function receiveLibraryTransfer(storage,hash,{confirmReplace=()=>true}={}){
 const packet=await decodeLibraryTransfer(hash);if(!packet)return null;
 const raw=readLibrarySource(storage);
 let previous=null;
 if(raw){previous=normalizeLibrary(JSON.parse(raw));validateLibrary(previous);}
 const same=previous&&JSON.stringify(previous)===JSON.stringify(packet.library);
 if(previous&&!same&&!await confirmReplace(packet))return {applied:false};
 const written=same?previous:replaceLibrary(storage,packet.library,previous||packet.library);
 return {applied:true,library:written,repertoireId:packet.repertoireId,songId:packet.songId};
}
