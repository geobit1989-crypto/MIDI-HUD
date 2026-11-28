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
