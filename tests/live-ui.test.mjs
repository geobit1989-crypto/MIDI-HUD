import test from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";

const source=new URL("../",import.meta.url);
const html=readFileSync(new URL("v03.html",source),"utf8");
const css=readFileSync(new URL("live/responsive-v1.css",source),"utf8");
const controller=readFileSync(new URL("live/live-controls-v1.js",source),"utf8");

test("LIVE carga motor modular, CSS responsivo y controles interactivos",()=>{
 assert.match(html,/href="\.\/live\/responsive-v1\.css(?:\?v=[^"]+)?"/);
 assert.match(html,/src="\.\/live\/live-controls-v1\.js"/);
 assert.match(html,/id="hud-prev"/);
 assert.match(html,/id="hud-next"/);
 assert.match(html,/id="hud-return"/);
 assert.match(html,/id="hud-boot-status"/);
 assert.match(controller,/addEventListener\("click",inspect\)/);
 assert.match(controller,/addEventListener\("keydown",event/);
});
test("no se confunde la navegación manual con una orden MIDI operativa",()=>{
 assert.match(controller,/type:"PREVIEW_SONG"/);
 assert.match(controller,/type:"PREVIEW_STATE"/);
 assert.match(controller,/type:"PREVIEW_MODULE"/);
 assert.match(controller,/type:"RETURN_TO_ACTIVE"/);
 assert.doesNotMatch(controller,/MIDI_OUT|sendMIDI|requestMIDIAccess/);
 assert.match(html,/window\.MIDIHUD_LIVE=Object\.freeze/);
});
test("3:2 y proporciones variables reservan altura flexible a los nueve módulos",()=>{
 assert.match(css,/38dvh/);
 assert.match(css,/flex:1 1 0/);
 assert.match(css,/max-height:none/);
 assert.match(css,/max-height:740px/);
 assert.match(css,/orientation:portrait/);
 assert.match(css,/\.switch:focus-visible/);
});
test("LIVE no deja la copia demo sin advertencia si falla la inicialización",()=>{
 assert.match(html,/Inicializando motor/);
 assert.match(html,/Error de inicialización/);
 assert.match(html,/const boot=document\.querySelector/);
 assert.match(html,/data-preview/);
});
