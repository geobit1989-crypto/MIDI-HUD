import test from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import {parseSongCatalog,mergeSongCatalog} from "../editor/catalog-import.mjs";
import {validateLibrary} from "../core/engine-v1.mjs";

const fixture=JSON.parse(readFileSync(new URL("../config/midi-hud-data-v2.json",import.meta.url),"utf8"));
const clone=x=>JSON.parse(JSON.stringify(x));

test("Lee TSV copiado desde Google Sheets; conserva acentos y quita duplicados exactos",()=>{
 const items=parseSongCatalog("Canción\tAutor\nA BENÇÃO\tGABRIEL GUEDES\nUMA VEZ\tFHOP MUSIC\nA BENÇÃO\tGABRIEL GUEDES\n");
 assert.deepEqual(items,[{title:"A BENÇÃO",author:"GABRIEL GUEDES"},{title:"UMA VEZ",author:"FHOP MUSIC"}]);
});
test("Lee CSV de Google Sheets y CSV con separador punto y coma y BOM",()=>{
 const csv=parseSongCatalog('"Canción","Autor"\r\n"Uma Vez","FHOP, Music"\r\n');
 assert.equal(csv[0].author,"FHOP, Music");
 const semi=parseSongCatalog('\uFEFF"MÚSICA";"VERSÃO";"URL"\n"A BENÇÃO";"GABRIEL GUEDES";"https://youtu.be/test"\n');
 assert.deepEqual(semi,[{title:"A BENÇÃO",author:"GABRIEL GUEDES"}]);
});
test("Rechaza catálogo sin cabeceras válidas",()=>{
 assert.throws(()=>parseSongCatalog("foo\tbar\na\tb"),/columnas/);
});
test("Importa canciones al repertorio sin alterar estados, MIDI ni lead sheets existentes",()=>{
 const original=clone(fixture),bindings=clone(fixture.bindings);
 const current=clone(fixture.songs);
 const catalog=[{title:"A BENÇÃO",author:"GABRIEL GUEDES"},{title:"A BOA PARTE",author:"FHOP MUSIC"}];
 const {library:updated,stats}=mergeSongCatalog(original,"worship",catalog);
 assert.equal(stats.added,2);
 assert.equal(stats.linked,0);
 assert.deepEqual(updated.bindings,bindings);
 assert.deepEqual(updated.songs.slice(0,current.length),current);
 for(const entry of catalog){
  const song=updated.songs.find(s=>s.title===entry.title);
  assert.equal(song.author,entry.author);
  const state=updated.states.find(s=>s.id===song.initialStateId);
  assert.equal(state.name,"Sin configurar");
  assert.equal(state.gtPatch,null);
  assert.equal(state.displayIndex,null);
 }
 assert.equal(validateLibrary(updated),true);
 assert.deepEqual(original,fixture);
 const repeat=mergeSongCatalog(updated,"worship",catalog);
 assert.equal(repeat.stats.added,0);
 assert.equal(repeat.stats.unchanged,2);
 assert.deepEqual(repeat.library,updated);
});
test("Completa un autor faltante sin reemplazar el lead sheet ni estados",()=>{
 const original=clone(fixture);
 const existing=original.songs.find(s=>s.id==="quao-grande");
 assert.ok(existing);
 existing.author="";
 const saved=clone(existing);
 const r=mergeSongCatalog(original,"worship",[{title:existing.title,author:"Chris Tomlin"}]);
 assert.equal(r.stats.authorsCompleted,1);
 const modified=r.library.songs.find(s=>s.id==="quao-grande");
 assert.deepEqual({...modified,author:""},saved);
});
test("Crea una entrada diferente cuando el título coincide pero el autor es distinto",()=>{
 const original=clone(fixture);
 original.songs.find(s=>s.id==="quao-grande").author="Autor A";
 const title=original.songs.find(s=>s.id==="quao-grande").title;
 const r=mergeSongCatalog(original,"worship",[{title,author:"Autor B"}]);
 assert.equal(r.stats.added,1);
 assert.equal(r.library.songs.filter(s=>s.title===title).length,2);
});
