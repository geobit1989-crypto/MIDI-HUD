import {parseLeadSheetText,formatLeadSheetText} from "./lead-sheet-text.mjs";

/**
 * Vista previa y edición textual del lead sheet. El texto inválido queda como
 * borrador local; nunca reemplaza una partitura previamente válida.
 */
export function createLeadSheetEditor({getSong,commit,storage=localStorage,delay=650}){
  const $=id=>document.getElementById(id);
  const textarea=$("leadText"),preview=$("leadPreview"),gutter=$("leadGutter");
  const status=$("leadStatus"),errors=$("leadErrors"),draftWarning=$("leadDraftWarning");
  const PREFIX="hudLeadSheetDraft:";
  let currentId=null,timer=null,lastResult=null;
  const chip=$("saveStatus");
  function chipStatus(label,color){
    if(chip){chip.textContent=label;chip.style.color=color;}
  }
  const make=(tag,cls,content)=>{
    const element=document.createElement(tag);if(cls)element.className=cls;
    if(content!==undefined)element.textContent=String(content);
    return element;
  };
  function syncScroll(){gutter.style.transform="translateY("+-textarea.scrollTop+"px)";}
  function lineNumber(){
    return textarea.value.slice(0,textarea.selectionStart).split("\n").length;
  }
  function renderNumbers(result){
    const marked=new Set(result.errors.map(x=>x.line));
    const current=lineNumber();
    const fragment=document.createDocumentFragment();
    textarea.value.split("\n").forEach((_,i)=>{
      const number=i+1;
      fragment.append(make("div","sheet-line"+(marked.has(number)?" invalid":"")+
        (number===current?" current":""),number));
    });
    gutter.replaceChildren(fragment);syncScroll();
  }
  function jumpToLine(line){
    const lines=textarea.value.split("\n");
    const offset=lines.slice(0,line-1).reduce((sum,l)=>sum+l.length+1,0);
    textarea.focus();textarea.setSelectionRange(offset,offset+lines[line-1].length);
    textarea.scrollTop=Math.max(0,(line-1)*24-48);
    syncScroll();renderNumbers(lastResult);
  }
  function renderChart(result){
    preview.replaceChildren();errors.replaceChildren();
    if(result.errors.length){
      textarea.setAttribute("aria-invalid","true");
      for(const error of result.errors){
        const button=make("button","sheet-error","Línea "+error.line+
          (error.section?", sección "+error.section:"")+
          (error.bar?", compás "+error.bar:"")+": "+error.message);
        button.type="button";button.onclick=()=>jumpToLine(error.line);
        errors.append(button);
      }
      preview.append(make("p","sheet-draft-warning","Corrige los errores para actualizar la partitura."));
      status.textContent=result.errors.length+" error(es) · borrador conservado";
      chipStatus("Borrador pendiente","#ffd59e");
      draftWarning.hidden=false;
      return;
    }
    textarea.setAttribute("aria-invalid","false");
    draftWarning.hidden=true;
    if(!result.sections.length){
      preview.append(make("p","sheet-helper","Escribe «A - Intro» y una línea de compases para comenzar."));
      status.textContent="Sin lead sheet";
      return;
    }
    for(const section of result.sections){
      const block=make("section","sheet-preview-section");
      const header=make("div","sheet-preview-heading");
      header.append(make("span","sheet-preview-letter",section.letter),
        make("span","",section.label));
      block.append(header);
      const grid=make("div","sheet-preview-bars");
      section.bars.forEach((bar,i)=>{
        const repeat=bar[0]==="/"&&bar.slice(1).every(x=>!x);
        const clazz="sheet-preview-measure"+(repeat?" repeat":"")+
          ((section.repeatStartBars||[]).includes(i)?" start":"")+
          ((section.repeatEndBars||[]).includes(i)?" end":"");
        const cell=make("div",clazz);
        if(repeat)cell.append(make("span","","/"));
        else for(const text of bar.filter(Boolean))cell.append(make("span","",text));
        grid.append(cell);
      });
      block.append(grid);preview.append(block);
    }
    status.textContent=result.sections.length+" secciones · "+result.totalBars+
      " compases · "+result.sections.map(x=>x.letter+": "+x.bars.length).join(" · ");
  }
  function refresh(){
    lastResult=parseLeadSheetText(textarea.value);
    // Un texto nuevo vacío es una espera de edición, no borra automáticamente.
    if(!textarea.value.trim()){
      lastResult={sections:[],errors:[],totalBars:0};
    }
    renderNumbers(lastResult);
    renderChart(lastResult);
  }
  function saveNow(){
    clearTimeout(timer);timer=null;
    if(currentId==null)return true;
    const source=textarea.value;
    // Mantener el último lead sheet válido si el texto está vacío o tiene errores.
    if(!source.trim()||!lastResult||lastResult.errors.length)return false;
    const parsed=lastResult;
    const leadSheet={sourceText:source,sections:parsed.sections};
    const id=currentId;
    const success=commit(id,leadSheet);
    if(success){
      storage.removeItem(PREFIX+id);
      status.textContent=status.textContent.replace(/ · guardando…$/,"")+" · guardado";
    }else{
      status.textContent=status.textContent.replace(/ · guardando…$/,"")+" · pendiente de guardar";
      chipStatus("Pendiente","#ffd59e");
      draftWarning.hidden=false;
    }
    return !!success;
  }
  function edit(){
    if(currentId==null)return;
    storage.setItem(PREFIX+currentId,textarea.value);
    refresh();
    clearTimeout(timer);
    if(lastResult.errors.length===0&&textarea.value.trim()){
      status.textContent+=" · guardando…";
      chipStatus("Guardando…","#ffe8b6");
      timer=setTimeout(saveNow,delay);
    }
  }
  function load(song){
    if(!song)return;
    if(currentId===song.id)return;
    saveNow();
    currentId=song.id;
    const draft=storage.getItem(PREFIX+song.id);
    textarea.value=draft!==null?draft:formatLeadSheetText(song.leadSheet);
    textarea.scrollTop=0;refresh();
    if(draft!==null){
      status.textContent+=lastResult.errors.length?" · borrador local":" · borrador recuperado";
      draftWarning.hidden=lastResult.errors.length===0;
    }
  }
  textarea.addEventListener("input",edit);
  textarea.addEventListener("scroll",syncScroll,{passive:true});
  textarea.addEventListener("click",()=>{if(lastResult)renderNumbers(lastResult)});
  textarea.addEventListener("keyup",()=>{if(lastResult)renderNumbers(lastResult)});
  function reset(){
    clearTimeout(timer);timer=null;currentId=null;
  }
  return {load,reset,saveNow,refresh,getSource:()=>textarea.value};
}
