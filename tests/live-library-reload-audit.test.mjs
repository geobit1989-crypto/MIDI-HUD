import test from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import {createEngine,normalizeLibrary} from "../core/engine.mjs";
import {receiveMidiBytes} from "../core/midi-input.mjs";

const fixture=()=>normalizeLibrary(JSON.parse(readFileSync(new URL("../config/midi-hud-data-v1.json",import.meta.url),"utf8")));
const cc=(engine,n,v)=>receiveMidiBytes(engine,[0xB0,n,v],0);

test("LIVE conserva canción, estado, morph, volumen y efectos tras actualizar repertorio",()=>{
  const source=readFileSync(new URL("../v03.html",import.meta.url),"utf8");
  assert.match(source,/createEngine\(library,\{restoreState:engine\?\.getState\(\)\?\?null\}\)/);
  let engine=createEngine(fixture());
  cc(engine,80,2);cc(engine,91,45);cc(engine,7,64);cc(engine,81,0);
  const before=engine.getState();
  const edited=fixture();edited.revision++;edited.songs[0].title="Título actualizado";
  engine=createEngine(edited,{restoreState:before});
  const after=engine.getState();
  for(const field of ["repertoireId","songId","presetId","morphValue","volumePercent","overlayStates"])
    assert.deepEqual(after[field],before[field],field);
  assert.equal(engine.getViewModel().song.title,"Título actualizado");
  assert.equal(engine.getViewModel().preset.ccValue,2);
});

test("LIVE rechaza la actualización si elimina el estado activo",()=>{
  const engine=createEngine(fixture());cc(engine,80,2);
  const before=engine.getState();
  const edited=fixture();
  edited.songs[0].presetIds=edited.songs[0].presetIds.filter(id=>id!==before.presetId);
  edited.presets=edited.presets.filter(p=>p.id!==before.presetId);
  assert.throws(()=>createEngine(edited,{restoreState:before}),/elimina la canción o el estado activo/);
  assert.deepEqual(engine.getState(),before);
});

test("LIVE rechaza cambios de límites Morph incompatibles con la interpretación",()=>{
  const engine=createEngine(fixture());cc(engine,80,2);cc(engine,91,90);
  const edited=fixture();edited.presets.find(p=>p.id===engine.getState().presetId).morph.max=30;
  assert.throws(()=>createEngine(edited,{restoreState:engine.getState()}),/límites del Morph activo/);
});

test("Mensajes CC80 repetidos no alteran el estado",()=>{
  const engine=createEngine(fixture());cc(engine,80,2);
  cc(engine,80,2);
  assert.equal(engine.getViewModel().preset.ccValue,2);
});
