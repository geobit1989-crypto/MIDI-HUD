import test from 'node:test';
import assert from 'node:assert/strict';
import {renderLiveModules} from '../live/modules-v34.mjs';

// Doble DOM mínimo: comprueba identidad y contenido, no geometría de un navegador.
class Element {
 constructor(doc){this.ownerDocument=doc;this.children=[];this.dataset={};this.attributes={};this.style={setProperty(k,v){this[k]=v;}};}
 append(...items){this.children.push(...items);}
 replaceChildren(...items){this.children=items;}
 setAttribute(k,v){this.attributes[k]=v;}
 querySelectorAll(){return this.children.flatMap(x=>typeof x==='object'?[...(x.dataset.hudIndex!=null?[x]:[]),...x.querySelectorAll()]:[]);}
}
const document={createElement(){return new Element(document);}};
function view(){return {song:{id:'song',displaySlots:[{name:'Clean',sub:'Twin',kind:'control'},{name:'Morph',sub:'Solo',kind:'expression'},{name:'Oculto',sub:'',hidden:true}]},state:{displayIndex:0,indicators:[]},previewModuleIndex:null};}
test('cambiar estado conserva los nodos y las filas durante LIVE',()=>{
 const grid=new Element(document),vm=view();renderLiveModules(grid,vm);
 const rows=[...grid.children],tiles=grid.querySelectorAll();
 assert.equal(tiles.length,2);assert.equal(tiles[0].attributes['aria-pressed'],'true');
 vm.state.displayIndex=1;renderLiveModules(grid,vm);
 assert.deepEqual(grid.children,rows);assert.equal(grid.querySelectorAll()[0],tiles[0]);
 assert.equal(grid.querySelectorAll()[1],tiles[1]);assert.equal(tiles[1].attributes['aria-pressed'],'true');
 assert.equal(tiles[1].className,'expression adaptive-expression');
});
test('cambiar de canción reconstruye con los índices originales y sin huecos ocultos',()=>{
 const grid=new Element(document),vm=view();renderLiveModules(grid,vm);const old=grid.children[0];
 vm.song.id='other';vm.song.displaySlots[0].hidden=true;renderLiveModules(grid,vm);
 assert.notEqual(grid.children[0],old);
 assert.deepEqual(grid.querySelectorAll().map(x=>x.dataset.hudIndex),['1']);
 vm.song.displaySlots=[];renderLiveModules(grid,vm);
 assert.equal(grid.children[0].className,'modules-empty');assert.equal(grid.querySelectorAll().length,0);
});
