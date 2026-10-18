import {saveLiveSelection} from '../core/live-selection-v34.mjs?v=20261016-repertoires1';

/** El selector cambia el contexto visual sin reabrir la entrada MIDI. */
export function installLibraryPicker({root,engine,library,storage,usingSavedLibrary,missingRequestedRepertoire=false,onUse=()=>{}}){
 const select=root.querySelector('#hud-repertoire'),songs=root.querySelector('#hud-preview');
 const status=root.querySelector('#hud-library-status'),doc=select.ownerDocument;
 const option=(label,value)=>{const item=doc.createElement('option');item.textContent=label;item.value=value;return item;};
 select.replaceChildren(...library.repertoires.map(rep=>option(rep.name,rep.id)));
 const message=missingRequestedRepertoire?'El repertorio solicitado no está guardado en este navegador. Abre el Editor donde lo creaste y usa «Enlace para navegador MIDI».':
  usingSavedLibrary?library.repertoires.length+' repertorios guardados en este navegador.':
  'Mostrando datos de ejemplo. Para traer tus repertorios, abre el Editor en el navegador anterior y usa «Enlace para navegador MIDI».';
 status.textContent=message;
 let previousRep=null,previousSelection=null;
 function sync(){
  const vm=engine.getViewModel(),rep=library.repertoires.find(item=>item.id===vm.active.repertoireId);
  select.value=rep.id;
  const previewButton=root.querySelector("#hud-preview-btn");if(previewButton)previewButton.disabled=rep.songIds.length===0;
  if(previousRep!==rep.id){
   songs.replaceChildren(...rep.songIds.map(id=>option(((song)=>song.title+(song.catalog?.variant?" — "+song.catalog.variant:""))(library.songs.find(song=>song.id===id)),id)));
   songs.value=rep.songIds.includes(vm.song.id)?vm.song.id:rep.songIds[0];previousRep=rep.id;
  }
  const selection={repertoireId:rep.id,songId:vm.active.songId},signature=JSON.stringify(selection);
  if(signature!==previousSelection){
   try{saveLiveSelection(storage,selection);previousSelection=signature;status.textContent=message;}
   catch{status.textContent=message+' No se pudo recordar la selección; puedes volver a elegirla al abrir LIVE.';}
  }
 }
 select.onchange=()=>{
  try{engine.dispatch({type:'SELECT_REPERTOIRE',repertoireId:select.value});sync();onUse();}
  catch(error){sync();status.textContent=error.message;}
 };
 const unsubscribe=engine.subscribe(sync);sync();
 return {sync,destroy(){unsubscribe();select.onchange=null;}};
}
