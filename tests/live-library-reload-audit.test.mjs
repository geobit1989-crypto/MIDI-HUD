import test from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import {createEngine,normalizeLibrary} from "../core/engine.mjs";
import {receiveMidiBytes} from "../core/midi-input.mjs";

const fixture=()=>normalizeLibrary(JSON.parse(readFileSync(new URL("../config/midi-hud-data-v1.json",import.meta.url),"utf8")));

test("AUDITORÍA: LIVE reinicia el estado al recrear el motor tras actualizar biblioteca",()=>{
  const liveSource=readFileSync(new URL("../v03.html",import.meta.url),"utf8");
  assert.match(liveSource,/function startEngine\(library\)\s*\{\s*engine=createEngine\(library\)/);
  assert.match(liveSource,/if\(event\.key!=="hudLibrary"\|\|!event\.newValue\)return;[\s\S]*?startEngine\(data\)/);
  const db=fixture();
  let engine=createEngine(db);
  receiveMidiBytes(engine,[0xB0,80,2],0);
  assert.equal(engine.getViewModel().preset.ccValue,2);
  const before=engine.getState();
  const updated=structuredClone(db);
  updated.revision=(updated.revision||0)+1;
  updated.songs[0].title="Título editado";
  engine=createEngine(updated); // Reproduce el startEngine(data) de LIVE
  assert.equal(engine.getViewModel().song.title,"Título editado");
  assert.equal(engine.getViewModel().preset.ccValue,0);
  assert.notEqual(engine.getState().presetId,before.presetId);
});

test("AUDITORÍA: cambio de datos sin recrear el motor no ocurre por mensajes MIDI",()=>{
  const engine=createEngine(fixture());
  receiveMidiBytes(engine,[0xB0,80,2],0);
  assert.equal(engine.getViewModel().preset.ccValue,2);
  receiveMidiBytes(engine,[0xB0,80,2],1);
  assert.equal(engine.getViewModel().preset.ccValue,2);
});
