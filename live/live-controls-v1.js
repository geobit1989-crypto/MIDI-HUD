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
  [...document.querySelectorAll(".switch-grid .switch")].forEach((node,index)=>{
    node.tabIndex=0;
    node.setAttribute("role","button");
    node.dataset.hudModule=String(index+1);
    node.title="Consultar módulo "+(index+1)+" (sin enviar MIDI)";
    const inspect=()=>{
      const ctx=context();if(!ctx)return;
      const {engine,library}=ctx;
      const vm=engine.getViewModel();
      const song=library.songs.find(s=>s.id===vm.song.id);
      if(!song)return;
      const state=library.states.find(s=>s.songId===song.id&&s.displayIndex===index);
      engine.dispatch(state
        ? {type:"PREVIEW_STATE",stateId:state.id}
        : {type:"PREVIEW_MODULE",index});
      const name=state?.name||song.displaySlots?.[index]?.name||"Sin asignar";
      feedback("Consulta visual: "+name+" · no cambia el sonido");
    };
    node.addEventListener("click",inspect);
    node.addEventListener("keydown",event=>{
      if(event.key==="Enter"||event.key===" "){event.preventDefault();inspect();}
    });
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
      const module=document.querySelectorAll(".switch-grid .switch")[Number(event.key)-1];
      module?.click();
    }
  });
  document.querySelector(".settings")?.addEventListener("click",()=>{
    if(!window.MIDIHUD_LIVE){
      feedback("Configuración no disponible: el motor no se ha cargado.");
    }
  });
})();
