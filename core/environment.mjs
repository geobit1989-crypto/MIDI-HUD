/** Storage and Drive history are isolated for the published test application. */
export function isTestEnvironment(path=globalThis.location?.pathname||'') {
 return /\/MIDI-HUD\/pruebas\//.test(path);
}
export function scopeStorage(storage,prefix='midiHudTest:') {
 const keys=()=>Array.from({length:storage.length},(_,i)=>storage.key(i)).filter(k=>k?.startsWith(prefix));
 return {getItem:key=>storage.getItem(prefix+key),setItem:(key,value)=>storage.setItem(prefix+key,value),removeItem:key=>storage.removeItem(prefix+key),
  key:index=>keys()[index]?.slice(prefix.length)??null,get length(){return keys().length;},clear(){for(const key of keys())storage.removeItem(key);}};
}
export const IS_IOS_TEST_ENVIRONMENT=globalThis.location?.protocol==='hud:'&&globalThis.location?.hostname==='ios-test.localhost';
export function isNativeQA(location=globalThis.location){
 return !!location&&((location.protocol==='https:'&&location.hostname==='midihud.local'&&location.pathname.startsWith('/windows-qa/'))||
 (location.protocol==='https:'&&location.hostname==='appassets.androidplatform.net'&&location.pathname.startsWith('/android-qa/')));
}
export const IS_TEST_ENVIRONMENT=IS_IOS_TEST_ENVIRONMENT||isNativeQA()||isTestEnvironment();
export const QA_LIBRARY_KIND='midi-hud-test-sync-20261127-v1';
export const QA_LIBRARY_ID='midi-hud-qa-20261127';
export const QA_LIBRARY_ROOT='9e7965fd-52eb-4ddd-baf8-9e50381fedcc';
export const QA_LIBRARY_STORAGE_PREFIX='midiHudQa20261127:';

const libraryDataKey=key=>/^(hudLibrary|hudEditorLibrary|hudRecoverySnapshot|midiHud(?:DriveSync|EditorDraft|SyncRecovery|CatalogMigration|LeadSheetsMigration|Original20261019|Recovery))/i.test(key);
function isolateLibraryStorage(storage){
 const scopedKey=key=>libraryDataKey(key)?QA_LIBRARY_STORAGE_PREFIX+key:key;
 function keys(){
  return Array.from({length:storage.length},(_,i)=>storage.key(i)).flatMap(key=>{
   if(key===null)return [];
   if(key.startsWith(QA_LIBRARY_STORAGE_PREFIX))return [key.slice(QA_LIBRARY_STORAGE_PREFIX.length)];
   return libraryDataKey(key)?[]:[key];
  });
 }
 return {getItem:key=>storage.getItem(scopedKey(key)),setItem:(key,value)=>storage.setItem(scopedKey(key),value),
  removeItem:key=>storage.removeItem(scopedKey(key)),key:index=>keys()[index]??null,get length(){return keys().length;},
  clear(){for(const key of keys())storage.removeItem(scopedKey(key));}};
}
function lazyStorage(name){
 const current=()=>{
  const storage=globalThis[name];
  if(!IS_TEST_ENVIRONMENT)return storage;
  const platformStorage=isNativeQA()?storage:scopeStorage(storage);
  return name==='localStorage'?isolateLibraryStorage(platformStorage):platformStorage;
 };
 return {getItem:key=>current().getItem(key),setItem:(key,value)=>current().setItem(key,value),removeItem:key=>current().removeItem(key),key:index=>current().key(index),get length(){return current().length;},clear:()=>current().clear()};
}
export const appStorage=lazyStorage('localStorage');
export const appSessionStorage=lazyStorage('sessionStorage');
