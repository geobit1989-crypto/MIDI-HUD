import test from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
const read=path=>readFileSync(new URL("../"+path,import.meta.url),"utf8");
const editorPage=read("editor/v3.html");
const editorScript=read("editor/v3.mjs");
const livePage=read("v03.html");
const syncUI=read("core/sync-ui.mjs");
const storage=read("core/library-storage.mjs");

test("V3 editor connects saved repertoire changes to private Drive sync",()=>{
 assert.match(editorPage,/id="cloudSync"/);
 assert.match(editorScript,/installCloudSync\(/);
 assert.match(editorScript,/getLocal:\(\)=>\{/);
 assert.match(editorScript,/readLibrarySource\(localStorage\)/);
 assert.match(editorScript,/onApplied:next=>/);
 assert.match(editorScript,/new Event\(['"]hud-library-saved['"]\)/);
 assert.match(editorScript,/canApply:\(\)=>!hasDraft/);
});
test("LIVE receives shared repertoires without interrupting the current song",()=>{
 assert.match(livePage,/id="hud-sync-root"/);
 assert.match(livePage,/mode:'live'/);
 assert.match(livePage,/canApply:\(\)=>true/);
 assert.doesNotMatch(livePage,/await Promise\.race\(\[cloud\.ready/);
 assert.match(syncUI,/mode!==\'live\'\|\|options\?\.explicit/);
 assert.match(livePage,/window\.location\.reload\(\)/);
});
test("Cloud sync uses existing browser V3 key, not another beta browser database",()=>{
 assert.match(storage,/LIBRARY_KEY='hudLibraryV34'/);
 assert.match(storage,/BACKUP_KEY='hudLibraryV34Backup'/);
});
test("Public Google OAuth ID can be configured without app secrets",()=>{
 assert.match(syncUI,/CLIENT_STORAGE_KEY='midiHudGoogleWebClientId'/);
 assert.match(syncUI,/loadGoogleIdentity\(\)/);
 assert.match(syncUI,/GoogleDriveAuth\(\{clientId:id\}\)/);
 assert.doesNotMatch(read("config/cloud-sync.json"),/client_secret/i);
});

test("iPhone sync dialog shows Connect and Sync before advanced OAuth settings",()=>{
 const open=syncUI.indexOf("function open(){");
 const actions=syncUI.indexOf("actions.append(connect,sync,disconnect",open);
 const panel=syncUI.indexOf("panel.append(actions,setup)",open);
 const settings=syncUI.indexOf("setup.append(make('summary'",open);
 assert(open>=0&&actions>open&&panel>actions&&settings>open);
 assert.match(syncUI,/const setup=make\('details'\)/);
 assert.match(syncUI,/panel\.append\(actions,setup\)/);
 assert.match(syncUI,/\.hud-sync-actions \[data-connect\],\.hud-sync-actions \[data-sync\]\{grid-column:1\/-1\}/);
 assert.match(syncUI,/panel\.scrollTop=0/);
});

test("sincroniza automáticamente al guardar, volver a la pestaña y reconectarse a internet",()=>{
 assert.match(syncUI,/window\.addEventListener\('hud-library-saved',onSaved\)/);
 assert.match(syncUI,/window\.addEventListener\('online',resume\)/);
 assert.match(syncUI,/window\.addEventListener\('focus',resume\)/);
 assert.match(syncUI,/window\.addEventListener\('pageshow',resume\)/);
 assert.match(syncUI,/document\.addEventListener\('visibilitychange',resume\)/);
 assert.match(syncUI,/setInterval\(resume,60000\)/);
 assert.match(syncUI,/synchronize\(\{reason:'saved'\}\)/);
 assert.match(syncUI,/if\(busy\)\{queued=true;return;\}/);
 assert.match(syncUI,/if\(result\?\.pending/);
 assert.match(syncUI,/auth\.restore\(\)/);
 assert.match(syncUI,/state:'reauth'/);
});

test("trusted-device OAuth becomes active only when Worker confirms readiness",()=>{
 assert.match(syncUI,/import \{PersistentDriveAuth\}/);
 assert.match(syncUI,/const persistent=new PersistentDriveAuth\(\)/);
 assert.match(syncUI,/persistent\.hasSession\|\|await persistent\.ready\(\)/);
 assert.match(syncUI,/auth=new GoogleDriveAuth/);
 assert.match(syncUI,/auth\.listDevices\(\)/);
 assert.match(syncUI,/auth\.revokeDevice\(d\.id\)/);
 assert.match(editorScript,/sync-ui\.mjs/);
 assert.match(livePage,/sync-ui\.mjs/);
 const webClient=read("core/persistent-drive-auth.mjs");
 assert.match(webClient,/midiHudTrustedDeviceSessionV1/);
 assert.match(webClient,/\/session\/exchange/);
 assert.match(webClient,/\/drive\/request/);
 assert.match(webClient,/hud_auth_ticket/);
 assert.doesNotMatch(webClient,/client_secret|refresh_token\s*[:=]/);
});
