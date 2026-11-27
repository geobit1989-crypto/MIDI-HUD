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
 assert.match(read("live/settings-qa.mjs"),/id="hud-sync-root"/);
 assert.match(livePage,/mode:'live'/);
 assert.match(livePage,/const safeToRefresh=\(\)=>!!document\.querySelector\('\.hud-home\[open\]'\)\|\|dialog\.open&&returnToHome/);
 assert.match(livePage,/canApply:safeToRefresh/);
 assert.match(livePage,/if\(!safeToRefresh\(\)\)throw error/);
 assert.match(syncUI,/inline&&canApply\(options\)/);
 assert.match(livePage,/function showHome\(\)\{openHome\(\);refreshLocal\(\)/);
 assert.doesNotMatch(livePage,/await Promise\.race\(\[cloud\.ready/);
 assert.match(syncUI,/if\(mode!=='live'\)onApplied/);
 assert.match(livePage,/engine\.updateLibrary\(withFullRepertoire\(next\)\)/);
});
test("Cloud sync uses existing browser V3 key, not another beta browser database",()=>{
 assert.match(storage,/LIBRARY_KEY='hudLibraryV34'/);
 assert.match(storage,/BACKUP_KEY='hudLibraryV34Backup'/);
});
test("Google sign-in uses deployment configuration without exposing a technical form",()=>{
 assert.match(syncUI,/config\.googleWebClientId/);
 assert.match(syncUI,/loadGoogleIdentity\(\)/);
 assert.match(syncUI,/actions\.append\(connect,sync,disconnect/);
 assert.doesNotMatch(syncUI,/Identificador OAuth|Guardar identificador|Configuración avanzada de Google/);
 assert.doesNotMatch(read("config/cloud-sync.json"),/client_secret/i);
});

test("sincroniza automáticamente al guardar, volver a la pestaña y reconectarse a internet",()=>{
 assert.match(syncUI,/window\.addEventListener\('hud-library-saved',onSaved\)/);
 assert.match(syncUI,/window\.addEventListener\('online',resume\)/);
 assert.match(syncUI,/window\.addEventListener\('focus',resume\)/);
 assert.match(syncUI,/window\.addEventListener\('pageshow',resume\)/);
 assert.match(syncUI,/document\.addEventListener\('visibilitychange',resume\)/);
 assert.match(syncUI,/setInterval\(resume,60000\)/);
 assert.match(syncUI,/synchronize\(\{reason:'saved'\}\)/);
 assert.match(syncUI,/if\(busy\)\{queued=true;queuedOptions=/);
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
