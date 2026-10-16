import {normalizeSlot,resolveModuleVisual} from '../core/module-visuals.mjs?v=20261016-overlays1';
import {moduleRows} from '../core/layout-v3.4.mjs';

const rendered=new WeakMap();
function node(doc,tag,klass,text){
 const el=doc.createElement(tag);el.className=klass;
 if(text!=null)el.textContent=String(text);
 return el;
}
function tileFor(doc,source,index){
 const cfg=normalizeSlot(source,index),visual=resolveModuleVisual(cfg,index);
 const expression=cfg.kind==='expression';
 const tile=node(doc,'div',expression?'expression adaptive-expression':'switch');
 for(const [key,value] of Object.entries({light:visual.light,dark:visual.dark,meter:visual.meter,fill:'0%',edge:visual.light,'exp-a':visual.dark,'exp-b':visual.color}))tile.style.setProperty('--'+key,value);
 const title=node(doc,expression?'strong':'div',expression?'exname':'name',cfg.name);
 const sub=node(doc,'div',expression?'exsub':'sub',source.sub==='GT'&&cfg.deviceTag==='GT'?'':cfg.sub);
 const tag=cfg.deviceTag?node(doc,'span','gt module-device',cfg.deviceTag):null;
 const icon=node(doc,'span',expression?'exicon':'icon-wrap',visual.glyph);
 icon.setAttribute('aria-hidden','true');
 if(expression){
  const head=node(doc,'div','exhead');
  const label=node(doc,'div','exlabel');
  if(visual.glyph)label.append(icon);
  label.append(title);
  const value=node(doc,'strong','value','');value.hidden=true;
  head.append(label,value);
  tile.append(head,sub);
  if(tag)tile.append(tag);
  const meter=node(doc,'div','exmeter');meter.hidden=true;tile.append(meter);
 }else{
  const details=node(doc,'div','details');details.append(title,sub);
  if(tag)details.append(tag);
  tile.append(node(doc,'span','number',index+1),icon,details,node(doc,'span','arrow','›'),node(doc,'div','meter'));
 }
 tile.dataset.hudIndex=String(index);tile.tabIndex=0;
 tile.setAttribute('role','button');
 tile.title='Consultar módulo '+(index+1)+' (sin enviar MIDI)';
 tile.setAttribute('aria-label',cfg.name);
 return tile;
}
/** Cambiar estado/indicadores solo actualiza el resaltado: conserva filas, nodos y foco. */
export function renderLiveModules(grid,vm){
 const slots=vm.song.displaySlots||[];
 const signature=JSON.stringify([vm.song.id,slots,vm.song.moduleLayout]);
 if(rendered.get(grid)!==signature){
  const doc=grid.ownerDocument,rows=moduleRows(slots,{manual:vm.song.moduleLayout==='manual'});
  // Las filas adaptativas son una columna flex; la cuadrícula 3x3 heredada no debe distribuirlas.
  grid.style.display='flex';grid.style.flexDirection='column';
  grid.style.gridTemplateColumns='none';grid.style.gridTemplateRows='none';
  const maxColumns=Math.max(1,...rows.map(items=>items.length));
  const content=rows.map(items=>{
   const row=node(doc,'div','adaptive-module-row');
   row.style.flex='1 1 0';row.style.minHeight='0';
   row.append(...items.map(({cfg,index})=>{
    const tile=tileFor(doc,cfg,index);
    tile.style.setProperty('--module-width-ratio',String(items.length/maxColumns));
    return tile;
   }));
   return row;
  });
  if(!rows.length)content.push(node(doc,'div','modules-empty','Sin módulos visibles · configura Estados en el Editor'));
  grid.replaceChildren(...content);rendered.set(grid,signature);
 }
 for(const tile of grid.querySelectorAll('[data-hud-index]')){
  const i=Number(tile.dataset.hudIndex);
  const selected=(vm.previewModuleIndex??vm.state.displayIndex)===i;
  const lit=vm.state.indicators.some(ind=>ind.active&&ind.displayIndex===i);
  tile.style.boxShadow=selected?'inset 0 0 0 3px #f3ffff,0 0 14px #00d6f455':lit?'inset 0 0 0 3px #5fe9f0,0 0 12px #00d6f455':'';
  tile.setAttribute('aria-pressed',String(selected||lit));
 }
}
