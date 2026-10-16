import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {chordParts,scanNotation,convertChord,convertSheet} from '../editor/chord-notation.mjs';
import {parseLeadSheetText,compileLeadSheetText,formatLeadSheetText} from '../editor/lead-sheet-text.mjs';
import {normalizeLibrary,validateLibrary,createEngine} from '../core/engine-v1.mjs';
import {newSong,newRepertoire,copySong,editLibrary, newState,moveState} from '../editor/editor-model.mjs';
import {normalizeSlot} from '../core/module-visuals.mjs';
const sample=JSON.parse(readFileSync(new URL('../config/midi-hud-data-v2.json',import.meta.url)));
const fresh=()=>structuredClone(sample);
test('fase 1: símbolos legados y extensiones reconocidos',()=>{
 for(const s of ['A','Am','F#','Bbm','G♭','Csus2','Dsus4','G7','Am7','Cmaj7','C/E','D/F#','Bb/D','Sol/Si','Lam7','Fa♯sus4'])assert.ok(chordParts(s),s);
 for(const s of ['H','C##','Qm7','Csus9','C///E','C7/','Solsus9',''] )assert.equal(chordParts(s),null,s);
});
test('latino ⇄ americano sin transposición, con alteraciones y bajos',()=>{
 for(const chord of ['C/E','D/F#','Bb/D','F♯maj7/C♯','Am7/G','Gsus4','A7','F♭sus2'])assert.equal(convertChord(convertChord(chord,'latino'),'americano'),chord);
 assert.equal(convertChord('Sol/Si','americano'),'G/B');
 assert.equal(convertChord('Re♭m7/La♭','americano'),'D♭m7/A♭');
});
test('mezcla exige elección, fuentes homogéneas no, títulos inmunes',()=>{
 const mixed='A - INTRO\n| Do | G | Lam |';
 assert.equal(scanNotation(mixed).mixed,true);
 assert.equal(convertSheet(mixed,'americano'),'A - INTRO\n| C | G | Am |');
 assert.equal(convertSheet(mixed,'latino'),'A - INTRO\n| Do | Sol | Lam |');
 assert.equal(scanNotation('A - Intro\n| Do | Sol | Lam |').mixed,false);
 assert.equal(scanNotation('A - Intro\n| C | G | Am |').mixed,false);
 assert.equal(scanNotation('A - Intro\n| C | Gsus4 | / |').invalid.length,0);
 assert.equal(convertSheet('A - Solo de Ana\n| C | G |','latino'),'A - Solo de Ana\n| Do | Sol |');
});
test('errores no se convierten silenciosamente',()=>{
 assert.equal(scanNotation('A - Intro\n| F | Q |').invalid[0].line,2);
 assert.throws(()=>convertSheet('A - Intro\n| F | Q |','latino'));
});
test('mini lenguaje y repetición preservan slash chords',()=>{
 const text='A - Intro\n| C/E | / | Am7 D7 |\n\nB - Coro\n|: Gsus4 | Cmaj7/G :|';
 const parsed=compileLeadSheetText(text);
 assert.equal(parsed.valid,true,JSON.stringify(parsed.errors));
 assert.equal(parsed.leadSheet.sections[0].bars[0][0],'C/E');
 assert.equal(parsed.leadSheet.sections[0].bars[1][0],'/');
 assert.equal(parsed.leadSheet.sections[0].bars[2][2],'D7');
 assert.equal(formatLeadSheetText(parsed.leadSheet),text);
});
test('schema v2 demo survives roundtrip without mutating original',()=>{
 const db=fresh();assert.equal(validateLibrary(db),true);
 const cp=normalizeLibrary(db);cp.songs[0].title='otro';assert.notEqual(cp.songs[0].title,db.songs[0].title);
 assert.equal(validateLibrary(cp),true);
});
test('generic song four empty modules, SIG template four mapped states',()=>{
 const db=fresh();let a=newSong(db,'worship','Nueva canción');let gen=db.songs.find(x=>x.id===a);
 assert.equal(gen.displaySlots.length,4);
 assert.ok(gen.displaySlots.every(x=>x.name==='—'&&x.kind==='control'));
 assert.equal(gen.stateIds.length,1);
 assert.equal(db.states.find(st=>st.id===gen.initialStateId).displayIndex,0);
 let b=newSong(db,'worship','Otra canción','sig');let sig=db.songs.find(x=>x.id===b);
 assert.deepEqual(sig.displaySlots.map(x=>x.name),['Clean','Ambient','Drive','Solo']);
 assert.deepEqual(sig.stateIds.map(id=>db.states.find(x=>x.id===id).displayIndex),[0,1,2,3]);
 assert.equal(validateLibrary(db),true);
});
test('module appearance retains device tag kind hidden and color',()=>{
 const slot={name:'Morph',sub:'EXP',deviceTag:'MX',kind:'expression',hidden:true,color:'#123456',icon:'target'};
 const norm=normalizeSlot(slot,13);
 assert.equal(norm.deviceTag,'MX');assert.equal(norm.kind,'expression');assert.equal(norm.hidden,true);
 const db=fresh();db.songs[0].displaySlots=[slot];
 assert.equal(validateLibrary(db),true);
 const tooLong=fresh();tooLong.songs[0].displaySlots=[{...slot,deviceTag:'X'.repeat(17)}];assert.throws(()=>validateLibrary(tooLong));
});
test('hasta 256 módulos validados, cambio visual no altera asignaciones MIDI',()=>{
 const db=fresh();const song=db.songs[0];song.displaySlots=Array.from({length:100},(_,i)=>({name:'M'+i,sub:'',kind:i%2?'expression':'control',hidden:false}));
 db.states.find(s=>s.id===song.stateIds[0]).displayIndex=99;
 assert.equal(validateLibrary(db),true);
 const engine=createEngine(db);const res=engine.dispatch({type:'PREVIEW_MODULE',index:90});
 assert.equal(res.view.previewModuleIndex,90);
 assert.equal(res.view.song.displaySlots.length,100);
 assert.throws(()=>engine.dispatch({type:'PREVIEW_MODULE',index:255}));
 const originalBinding=JSON.stringify(db.bindings);
 [song.displaySlots[2],song.displaySlots[3]]=[song.displaySlots[3],song.displaySlots[2]];
 assert.equal(JSON.stringify(db.bindings),originalBinding);
});
test('estado y canción SIG clonados con referencias nuevas',()=>{
 const db=fresh();const id=newSong(db,'worship','SIG','sig');const cloneId=copySong(db,'worship',id);
 const orig=db.songs.find(s=>s.id===id),clone=db.songs.find(s=>s.id===cloneId);
 assert.equal(clone.stateIds.length,4);assert.ok(clone.stateIds.every(k=>!orig.stateIds.includes(k)));
 assert.equal(validateLibrary(db),true);
});
test('compatibilidad de migración v1',()=>{
 const old=JSON.parse(readFileSync(new URL('../config/midi-hud-data-v1.json',import.meta.url)));
 const db=normalizeLibrary(old);
 assert.equal(db.schemaVersion,'2.0.0');assert.equal(validateLibrary(db),true);
});
import {balancedModuleRows} from '../core/layout-v3.4.mjs';
test('simetría y distribución adaptativa sin huecos para 0..256',()=>{
 assert.deepEqual(balancedModuleRows(0),[]);
 assert.deepEqual(balancedModuleRows(4),[2,2]);
 assert.deepEqual(balancedModuleRows(5),[3,2]);
 assert.deepEqual(balancedModuleRows(6),[3,3]);
 assert.deepEqual(balancedModuleRows(10),[4,3,3]);
 for(let i=0;i<=256;i++){
  const rows=balancedModuleRows(i);
  assert.equal(rows.reduce((a,b)=>a+b,0),i);
  assert.ok(rows.every(n=>n>0));
  assert.ok(!rows.length||Math.max(...rows)-Math.min(...rows)<=1);
 }
 assert.throws(()=>balancedModuleRows(257));
});
