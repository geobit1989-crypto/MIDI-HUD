import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createEngine,normalizeLibrary,validateLibrary} from '../core/engine-v1.mjs';
import {createMidiParser} from '../core/midi-stream.mjs';
import {createClockTracker} from '../core/midi-clock.mjs';
import {migrateCatalog} from '../core/catalog-v1.mjs';
import {createLeadSheetVariant,addSongToPlaylist} from '../core/lead-sheet-variants.mjs';
import {parseSongCatalog,mergeSongCatalog} from '../editor/catalog-import.mjs';
import {readLibrarySource,LIBRARY_KEY,replaceLibrary} from '../core/library-storage.mjs';
const file=name=>JSON.parse(readFileSync(new URL(name,import.meta.url)));
const fixture=()=>migrateCatalog(file('./fixtures/main-v04.json'));
const cc=(cc,value,channel=1)=>({type:'MIDI_CC',cc,value,channel});
const pc=(program,channel=1)=>({type:'MIDI_PC',program,channel});
for(const name of ['main-v04','legacy-v1'])test(`migration ${name}: IDs, opaque fields and original survive; idempotent`,()=>{
 const source=file(`./fixtures/${name}.json`);source.future={field:[1,2]};source.songs[0].custom={data:'keep'};source.presets[0].opaque='keep';
 const original=structuredClone(source),db=migrateCatalog(source);
 assert(validateLibrary(db));assert.deepEqual(source,original);assert.deepEqual(migrateCatalog(db),db);
 assert.deepEqual(db.future,source.future);assert.deepEqual(db.songs[0].custom,source.songs[0].custom);
 assert.equal(db.states[0].opaque,'keep');assert.deepEqual(db.presets,source.presets);
});
test('v0.4 states, effects and expression map remain functional after migration',()=>{
 const engine=createEngine(fixture());engine.dispatch(cc(80,1));assert.equal(engine.getState().activeStateId,'preset-drive');
 engine.dispatch(cc(81,0));assert.equal(engine.getViewModel().state.indicators.find(x=>x.id==='fx-boost').active,true);
 engine.dispatch(cc(91,99));engine.dispatch(cc(11,64));engine.dispatch(cc(7,127));
 assert.deepEqual(engine.getState().expressions,{7:127,11:64,91:99});assert.equal(engine.getState().activeStateId,'preset-drive');
 engine.dispatch(cc(81,0));assert.equal(engine.getViewModel().state.indicators.find(x=>x.id==='fx-boost').active,false);
});
test('CC0 only prepares; PC uses stable addresses independent of order and RX channel',()=>{
 let db=fixture();const text='Canción\tAutor\tCC0\tPC\n'+Array.from({length:133},(_,i)=>`S${i+1}\tAuthor\t${Math.floor(i/128)}\t${i%128}`).join('\n');
 db=mergeSongCatalog(db,db.repertoires[0].id,parseSongCatalog(text)).library;
 const target=db.songs.find(s=>s.title==='S133');db.songs.reverse();db.repertoires[0].songIds.reverse();
 const e=createEngine(db,{midiChannel:3}),before=e.getState().activeSongId;
 e.dispatch(cc(0,1,2));e.dispatch(pc(4,2));assert.equal(e.getState().activeSongId,before);
 e.dispatch(cc(0,1,3));assert.equal(e.getState().activeSongId,before);
 const result=e.dispatch(pc(4,3));assert.equal(result.view.song.id,target.id);assert.deepEqual(result.intents,[]);
 e.dispatch(pc(127,3));assert.equal(e.getState().activeSongId,target.id);
 target.catalog.archived=true;const archived=createEngine(db,{songId:'song-demo'});archived.dispatch(cc(0,1));assert.equal(archived.dispatch(pc(4)).matched,false);
});
test('address collision and out of range rejected, no implicit renumbering',()=>{
 const db=fixture();db.songs[0].midiAddress={cc0:128,pc:0};assert.throws(()=>validateLibrary(db),/dirección/);
 assert.throws(()=>parseSongCatalog('Canción,Autor,CC0,PC\nX,Y,1,128'),/CC0/);
 const result=mergeSongCatalog(fixture(),'worship-main',[{title:'Unassigned',author:'Me'}]);assert.equal(result.library.songs.at(-1).midiAddress,undefined);
});
test('same song in another playlist keeps state, overlays and measured expressions',()=>{
 const db=fixture(),song=db.songs[0];const sheet=createLeadSheetVariant(song,{name:'Alternate',tono:'D'});
 db.repertoires.push({id:'second',name:'Second',songIds:[]});addSongToPlaylist(db,'second',song.id,sheet);
 const e=createEngine(db);e.dispatch(cc(80,2));e.dispatch(cc(81,0));e.dispatch(cc(91,88));const before=e.getState();
 e.dispatch({type:'SELECT_REPERTOIRE',repertoireId:'second'});assert.equal(e.getViewModel().song.tono,'D');
 assert.equal(e.getState().activeStateId,before.activeStateId);assert.deepEqual(e.getState().indicatorOverrides,before.indicatorOverrides);assert.deepEqual(e.getState().expressions,before.expressions);
});
test('empty playlist opens, accepts realtime and channel input, then switches safely',()=>{
 const db=fixture();db.repertoires.unshift({id:'empty',name:'Empty',songIds:[]});const e=createEngine(db);
 e.dispatch(cc(80,0));e.dispatch({type:'MIDI_CLOCK',timestampMs:0});assert.equal(e.getViewModel().empty,true);
 e.dispatch({type:'SELECT_REPERTOIRE',repertoireId:'worship-main'});assert.equal(e.getViewModel().song.id,'song-demo');
});
test('stream parser handles running PC, fragmented CC, interleaved realtime, SysEx and system common',()=>{
 const parse=createMidiParser();assert.deepEqual(parse([0xb2,0]),[]);
 assert.deepEqual(parse([0xf8,1,80,2,0xc2,4,5],100),[{type:'MIDI_CLOCK',timestampMs:100},cc(0,1,3),cc(80,2,3),pc(4,3),pc(5,3)]);
 assert.deepEqual(parse([0xf0,1,0xf8,2,0xf7,80,3,0xf2,1,2,0xb0,81,0],200),[{type:'MIDI_CLOCK',timestampMs:200},cc(81,0)]);
});
test('clock learns first external tempo, requires two beats, tolerates jitter and times out',()=>{
 const clock=createClockTracker();let time=0;clock.pulse(time,120);
 const beat=(bpm,jitter=0)=>{for(let i=0;i<24;i++){time+=60000/bpm/24;clock.pulse(time+(i%2?jitter:-jitter),120);}return clock.getView();};
 for(let i=0;i<6;i++)assert.equal(beat(110,0.7).label,'BPM');
 assert.equal(beat(120).label,'BPM');assert.equal(beat(120).label,'TAP');
 assert.equal(clock.timeout(time+1001).clockStatus,'lost');assert.equal(clock.getView().label,'BPM');
});
test('no fictitious expression position until received; state entry applies configured overlays',()=>{
 const e=createEngine(fixture());assert.deepEqual(e.getViewModel().expressions,{});e.dispatch(cc(81,0));e.dispatch(cc(91,100));e.dispatch(cc(80,1));
 assert.equal(e.getViewModel().state.indicators[0].active,false);assert.equal(e.getViewModel().expressions[91],100);
});
test('local storage preserves every known original and can restore its exact JSON',()=>{
 const old=file('./fixtures/main-v04.json'),raw=JSON.stringify(old),map=new Map([['hudLibrary',raw]]);
 const storage={getItem:k=>map.get(k)??null,setItem:(k,v)=>map.set(k,v),removeItem:k=>map.delete(k)};
 assert.equal(readLibrarySource(storage),raw);replaceLibrary(storage,migrateCatalog(old),old);
 assert.equal(storage.getItem('midiHudOriginal20261019:hudLibrary'),raw);
 assert.deepEqual(JSON.parse(storage.getItem('midiHudOriginal20261019:hudLibrary')),old);
 assert.equal(JSON.parse(storage.getItem(LIBRARY_KEY)).schemaVersion,'2.0.0');
});
test('engine owns an operational snapshot independent of future storage/remote mutation',()=>{
 const db=fixture(),e=createEngine(db);e.dispatch(cc(80,2));e.dispatch(cc(81,0));e.dispatch(cc(91,70));const before=e.getViewModel();
 db.songs[0].title='Remote';db.states[2].name='Remote state';db.songs[0].leadSheets[0].tono='F#';
 assert.deepEqual(e.getViewModel(),before);assert.deepEqual(e.dispatch(cc(7,90)).intents,[]);
});
