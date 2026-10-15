import test from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";

const html=readFileSync(new URL("../v03.html",import.meta.url),"utf8");
const css=readFileSync(new URL("../live/responsive-v1.css",import.meta.url),"utf8");
const configCss=readFileSync(new URL("../live/config-menu-v2.css",import.meta.url),"utf8");
const start=html.indexOf("const EDITOR_HOLD_MS=2000;");
const end=html.indexOf('overlay.addEventListener("click"',start);
assert.ok(start>=0&&end>start,"Debe existir el controlador de pulsación prolongada");
const code=html.slice(start,end);

function setup(){
 const listeners={};
 const classes=new Set();
 const timers=new Map();
 let next=0;
 const events={settings:0,editor:[],cleared:[]};
 const gear={
  addEventListener(type,fn){listeners[type]=fn;},
  classList:{add(cls){classes.add(cls)},remove(cls){classes.delete(cls)}}
 };
 const clock={
  setTimeout(fn,delay){const id=++next;timers.set(id,{fn,delay});return id;},
  clearTimeout(id){timers.delete(id);events.cleared.push(id);}
 };
 const env={location:{assign(url){events.editor.push(url)}}};
 const script=new Function("gear","popup","window","setTimeout","clearTimeout",code);
 script(gear,()=>events.settings++,env,clock.setTimeout,clock.clearTimeout);
 const fire=(type,extra={})=>{
  let prevented=false,stopped=false;
  listeners[type]?.({
   pointerType:"touch",button:0,key:"",...extra,
   preventDefault(){prevented=true;},
   stopPropagation(){stopped=true;}
  });
  return {prevented,stopped};
 };
 return {events,timers,fire,classes};
}

test("pulsación corta del engranaje abre configuración, no Editor",()=>{
 const ui=setup();
 ui.fire("pointerdown");ui.fire("pointerup");ui.fire("click");
 assert.equal(ui.events.settings,1);
 assert.deepEqual(ui.events.editor,[]);
 assert.equal(ui.timers.size,0);
});

test("dos segundos abren Editor y anulan el clic de Configuración",()=>{
 const ui=setup();
 ui.fire("pointerdown");
 const pending=[...ui.timers.values()];
 assert.equal(pending.length,1);
 assert.equal(pending[0].delay,2000);
 assert.equal(ui.classes.has("hud-holding"),true);
 pending[0].fn();
 ui.fire("pointerup");
 const click=ui.fire("click");
 assert.deepEqual(ui.events.editor,["./editor/"]);
 assert.equal(ui.events.settings,0);
 assert.equal(click.prevented,true);
 assert.equal(ui.classes.has("hud-holding"),false);
});

test("deslizar el dedo fuera o cancelar la pulsación evita abrir Editor",()=>{
 for(const type of ["pointerleave","pointercancel"]){
  const ui=setup();ui.fire("pointerdown");ui.fire(type);
  assert.equal(ui.timers.size,0);
  assert.deepEqual(ui.events.editor,[]);
 }
});

test("Enter o espacio mantienen acceso a configuración por teclado",()=>{
 const ui=setup();
 for(const key of ["Enter"," "])assert.equal(ui.fire("keydown",{key}).prevented,true);
 assert.equal(ui.events.settings,2);
});

test("interfaz LIVE no añade iconos y prioriza lead sheet en teléfonos verticales",()=>{
 assert.doesNotMatch(html,/class="hud-editor-shortcut"/);
 assert.match(html,/title="Toque: Configuración · Mantener 2 s: Editor"/);
 assert.match(configCss,/\.settings\.hud-holding::after/);
 assert.match(configCss,/@keyframes hud-hold-progress/);
 assert.match(css,/@media \(max-width: 600px\) and \(orientation: portrait\)/);
 assert.match(css,/\.lead-sheet\{flex:1 1 0/);
 assert.match(css,/\.hud-panel\{flex:0 0 auto/);
 assert.match(css,/\.switch-grid\{flex:0 0 auto;height:clamp\(162px,30dvh,258px\)/);
 assert.match(css,/\.song-navigation #song-title\{grid-area:auto/);
});
