import {normalizeSlot,resolveModuleVisual} from '../core/module-visuals.mjs?v=20261016-overlays1';
import {moduleRows} from '../core/layout-v3.4.mjs';

const rendered=new WeakMap();
const neutral='#b8bdc3';

function paint(color, muted){
 const rgb=color.slice(1).match(/../g).map(channel=>parseInt(channel,16));
 const background=muted?rgb.map(channel=>Math.round(channel*.17+41)):rgb;
 const luminance=background.reduce((sum,channel,i)=>{
  const s=channel/255;
  return sum+[.2126,.7152,.0722][i]*(s<=.04045?s/12.92:((s+.055)/1.055)**2.4);
 },0);
 return {
  background:'#'+background.map(channel=>channel.toString(16).padStart(2,'0')).join(''),
  foreground:luminance>=Math.sqrt(.05*1.05)-.05?'#000':'#fff'
 };
}

function node(doc,tag,klass,text){
 const el=doc.createElement(tag);el.className=klass;
 if(text!=null)el.textContent=String(text);
 return el;
}
function tileFor(doc,source,index){
 const cfg=normalizeSlot(source,index),visual=resolveModuleVisual(cfg,index);
 const expression=cfg.kind==='expression';
 const tile=node(doc,'div',expression?'expression adaptive-expression':'switch');
 const momentary=!expression&&(cfg.action==='tap'||cfg.action==='momentary'||/^tap[\s_-]+tempo$/i.test(cfg.name.trim()));
 for(const [key,value] of Object.entries({light:visual.light,dark:visual.dark,fill:'0%',edge:visual.light}))tile.style.setProperty('--'+key,value);
 const on=paint(momentary?neutral:visual.color,false),off=paint(visual.color,true);
 tile.style.setProperty('--module-bg',on.background);
 tile.style.setProperty('--module-fg',on.foreground);
 tile.style.setProperty('--module-muted-bg',off.background);
 tile.style.setProperty('--module-muted-fg',off.foreground);
 if(momentary)tile.dataset.momentary='true';
 const title=node(doc,expression?'strong':'div',expression?'exname':'name',cfg.name);
 const sub=node(doc,'div',expression?'exsub':'sub',source.sub==='GT'&&cfg.deviceTag==='GT'?'':cfg.sub);
 const tag=cfg.deviceTag?node(doc,'span','gt module-device',cfg.deviceTag):null;
 const icon=node(doc,'span',expression?'exicon':'icon-wrap',visual.glyph);
 icon.setAttribute('aria-hidden','true');
 icon.hidden=!visual.glyph;
 sub.hidden=!sub.textContent;
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
/** Actualiza la apariencia sin reemplazar las filas, los módulos ni el foco. */
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
  const slot=slots[i],cc=slot?.expressionCC,value=vm.expressions?.[cc];
  const readout=tile.querySelector('.value'),meter=tile.querySelector('.exmeter');
  if(readout&&meter){const known=Number.isInteger(value);readout.hidden=!known;meter.hidden=!known;if(known){const percent=Math.round(value*100/127);readout.textContent=percent+'%';tile.style.setProperty('--fill',percent+'%');}}
  if(tile.dataset.momentary)continue;
  const indicators=vm.state.indicators.filter(ind=>ind.displayIndex===i);
  const lit=indicators.some(ind=>ind.active);
  const selected=vm.state.displayIndex===i;
  const expression=slot?.kind==='expression';
  const active=expression
   ? (indicators.length ? lit : selected||Number.isInteger(value)&&(cc===7||value>0))
   : lit||selected&&slot?.stateMode!=='effect';
  tile.dataset.activity=active?'active':'inactive';
  tile.setAttribute('aria-pressed',String(active));
  tile.dataset.consulted=String(vm.previewModuleIndex===i);
 }
}
