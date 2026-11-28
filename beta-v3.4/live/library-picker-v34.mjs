import {saveLiveSelection} from '../core/live-selection-v34.mjs?v=20261016-repertoires1';

import {LIBRARY_ICONS} from '../core/library-icons.mjs';
const listMusic = LIBRARY_ICONS.lists;

function repertoireInput(doc, rep, onChange) {
 const label=doc.createElement('label');
 label.className='hud-settings-repertoire';
 const input=doc.createElement('input');
 input.type='radio';input.name='hud-active-repertoire';input.value=rep.id;
 input.onchange=()=>onChange(rep.id);
 const content=doc.createElement('span');
 content.innerHTML=listMusic+'<span></span><span class="hud-choice" aria-hidden="true"></span>';
 const name=content.children[1];
 const count=doc.createElement('small');
 count.textContent=rep.songIds.length+(rep.songIds.length===1?' canción':' canciones');
 name.append(doc.createTextNode(rep.name),count);
 label.append(input,content);
 return {label,input};
}

/** El selector cambia el contexto visual sin reabrir la entrada MIDI. */
export function installLibraryPicker({root,engine,library,storage,usingSavedLibrary,missingRequestedRepertoire=false,onUse=()=>{}}){
 const select=root.querySelector('#hud-repertoire'),songs=root.querySelector('#hud-preview');
 const list=root.querySelector('#hud-repertoire-list');
 const status=root.querySelector('#hud-library-status'),doc=(list||select).ownerDocument;
 const rows=list?library.repertoires.map(rep=>repertoireInput(doc,rep,use)):[];
 if(list){for(const row of rows)list.append(row.label);}
 const option=(label,value)=>{const item=doc.createElement('option');item.textContent=label;item.value=value;return item;};
 select?.replaceChildren(...library.repertoires.map(rep=>option(rep.name,rep.id)));
 const message=missingRequestedRepertoire?'La lista solicitada no está guardada en este navegador. Abre el Editor donde lo creaste y usa «Enlace para navegador MIDI».':
  usingSavedLibrary?library.repertoires.length+' listas disponibles.':
  'Mostrando datos de ejemplo. Para traer tus listas, abre el Editor en el navegador anterior y usa «Enlace para navegador MIDI».';
 status.textContent=message;
 let previousRep=null,previousSelection=null;
 function sync(){
  const vm=engine.getViewModel(),rep=library.repertoires.find(item=>item.id===vm.active.repertoireId);
  if(select)select.value=rep.id;
  for(const {input} of rows)input.checked=input.value===rep.id;
  if(songs&&previousRep!==rep.id){
   songs.replaceChildren(...rep.songIds.map(id=>option(library.songs.find(song=>song.id===id).title,id)));
   songs.value=rep.songIds.includes(vm.song.id)?vm.song.id:rep.songIds[0];previousRep=rep.id;
   const preview=root.querySelector('#hud-preview-btn');if(preview)preview.disabled=!rep.songIds.length;
  }
  const selection={repertoireId:rep.id,songId:vm.active.songId},signature=JSON.stringify(selection);
  if(signature!==previousSelection){
   try{saveLiveSelection(storage,selection);previousSelection=signature;status.textContent=message;}
   catch{status.textContent=message+' No se pudo recordar la selección; puedes volver a elegirla al abrir LIVE.';}
  }
 }
 function use(repertoireId){
  try{engine.dispatch({type:'SELECT_REPERTOIRE',repertoireId});sync();onUse();}
  catch(error){sync();status.textContent=error.message;}
 }
 if(select)select.onchange=()=>use(select.value);
 const unsubscribe=engine.subscribe(sync);sync();
 return {sync,destroy(){unsubscribe();if(select)select.onchange=null;for(const row of rows)row.label.remove();}};
}
