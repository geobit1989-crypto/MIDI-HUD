/* LIVE controls v0.3.1 — visual rehearsal only, no MIDI output.
   Plain browser script: makes clicks visibly respond even when the motor is unavailable. */
(()=>{
  "use strict";
  const get=id=>document.getElementById(id);
  const toast=get("hud-toast");
  let timeout;
  function feedback(text){
    if(!toast)return;
    toast.textContent=text;toast.hidden=false;
    clearTimeout(timeout);
    timeout=setTimeout(()=>{toast.hidden=true;},2700);
  }
  function context(){
    const api=window.MIDIHUD_LIVE;
    const engine=api?.getEngine?.();
    const library=api?.getLibrary?.();
    if(!engine||!library){
      feedback("El motor aún no está listo. Comprueba la publicación y vuelve a cargar.");
      return null;
    }
    return {engine,library};
  }
  function previewSong(delta){
    const ctx=context();if(!ctx)return;
    const {engine,library}=ctx;
    const vm=engine.getViewModel();
    const repertoire=library.repertoires.find(x=>x.id===vm.repertoire.id);
    if(!repertoire?.songIds?.length)return;
    const i=repertoire.songIds.indexOf(vm.song.id);
    const next=repertoire.songIds[(i+delta+repertoire.songIds.length)%repertoire.songIds.length];
    engine.dispatch({type:"PREVIEW_SONG",songId:next});
    const title=library.songs.find(s=>s.id===next)?.title||"Canción";
    feedback("Consulta: "+title+" · estado operativo sin cambios");
  }
  get("hud-prev")?.addEventListener("click",()=>previewSong(-1));
  get("hud-next")?.addEventListener("click",()=>previewSong(1));
  get("hud-return")?.addEventListener("click",()=>{
    const ctx=context();if(!ctx)return;
    ctx.engine.dispatch({type:"RETURN_TO_ACTIVE"});
    feedback("Vista operativa restaurada");
  });
  // Delegación: los módulos se reconstruyen tras cada cambio de canción o estado.
  const grid=document.querySelector(".switch-grid");
  function inspectNode(node){
    const ctx=context();if(!ctx)return;
    const {engine,library}=ctx;
    const vm=engine.getViewModel();
    const song=library.songs.find(s=>s.id===vm.song.id);
    const index=Number(node.dataset.hudIndex);
    if(!song||!Number.isInteger(index)||index<0||index>=song.displaySlots.length)return;
    const state=library.states.find(s=>s.songId===song.id&&s.displayIndex===index);
    engine.dispatch(state?{type:"PREVIEW_STATE",stateId:state.id}:{type:"PREVIEW_MODULE",index});
    feedback("Consulta visual: "+(state?.name||song.displaySlots[index]?.name||"Sin asignar")+" · no cambia el sonido");
  }
  grid?.addEventListener("click",event=>{
    const tile=event.target.closest("[data-hud-index]");
    if(tile&&grid.contains(tile))inspectNode(tile);
  });
  grid?.addEventListener("keydown",event=>{
    if(event.key!=="Enter"&&event.key!==" ")return;
    const tile=event.target.closest("[data-hud-index]");
    if(tile&&grid.contains(tile)){event.preventDefault();inspectNode(tile);}
  });
  window.addEventListener("midi-hud-render",event=>{
    const view=event.detail;
    if(!view)return;
    const returnButton=get("hud-return");
    if(returnButton)returnButton.hidden=!view.isPreview;
  });
  document.addEventListener("keydown",event=>{
    if(event.defaultPrevented||event.altKey||event.ctrlKey||event.metaKey)return;
    if(event.target?.closest?.("input,textarea,select,[role=dialog]"))return;
    if(event.key==="ArrowLeft"){event.preventDefault();previewSong(-1);}
    else if(event.key==="ArrowRight"){event.preventDefault();previewSong(1);}
    else if(/^[1-9]$/.test(event.key)){
      const module=document.querySelectorAll(".switch-grid [data-hud-index]")[Number(event.key)-1];
      module?.click();
    }
  });
  document.querySelector(".settings")?.addEventListener("click",()=>{
    if(!window.MIDIHUD_LIVE){
      feedback("Configuración no disponible: el motor no se ha cargado.");
    }
  });
})();
