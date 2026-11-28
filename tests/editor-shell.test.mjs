import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
const read=p=>readFileSync(new URL('../'+p,import.meta.url),'utf8');
test('approved Editor shell, exact E3, retained automatic sync and direct settings',()=>{
 const h=read('editor/v3.html'),s=read('editor/v3.mjs');
 assert.match(h,/id="cloudSync" hidden/);assert.match(s,/installCloudSync\(\{/);
 assert.doesNotMatch(h,/id="midiLinkBtn"/);assert.doesNotMatch(s,/createLibraryTransferUrl/);
 assert.match(h,/M34 9H24L7 56H55L41 22" stroke-width="6"/);
 assert.match(h,/M29 45L48 9" stroke-width="5"/);
 assert.ok(h.includes('id="settingsLink" href="../v03.html?settings=1'));
 assert.ok(read('v03.html').includes("get('settings')==='1')popup(true)"));
 assert.match(h,/id="editorHistory"/);assert.match(h,/id="songSummary" class="song-metadata"/);
 assert.match(h,/<dialog id="sharedControls"/);assert.ok(s.includes('["Historial",()=>{openMasterSong'));assert.ok(s.includes('["Notas",()=>{useSong'));
});

test('three tabs and inline identity, DIN five pins, legal links centralized, icon-only global save',()=>{
 const h=read('editor/v3.html'),s=read('editor/v3.mjs');
 assert.equal((h.match(/data-tab="/g)||[]).length,3);assert.doesNotMatch(h,/data-panel="song"/);
 for(const id of ['songTitle','songAuthor','songTone','songBpm','songBank'])assert.match(h,new RegExp('<input id="'+id+'"[^>]* hidden'));
 assert.match(h,/id="songBankSummary"/);assert.match(s,/function registerIdentity/);
 assert.match(h,/data-state="saving"\] svg\{animation:editor-save-pulse/);
 assert.doesNotMatch(h,/<nav aria-label="Legal"/);assert.doesNotMatch(read('v03.html'),/<nav aria-label="Legal"/);
 assert.match(read('live/home-qa.mjs'),/Privacidad.*Condiciones.*Privacy.*Terms/);
});

test('Lead Sheet uses original Lucide File Music geometry and includes its license',()=>{
 const h=read('editor/v3.html');
 assert.match(h,/Lucide File Music 0\.456\.0/);assert.match(h,/ISC License/);
 for(const d of ['M10.5 22H18a2 2 0 0 0 2-2V7l-5-5H6a2 2 0 0 0-2 2v8.4','M8 18v-7.7L16 9v7'])assert.ok(h.includes(d));
 assert.match(h,/<circle cx="14" cy="16" r="2" \/>/);assert.match(h,/<circle cx="6" cy="18" r="2" \/>/);
});
