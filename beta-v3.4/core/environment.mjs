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
function lazyStorage(name){
 const current=()=>IS_TEST_ENVIRONMENT&&!isNativeQA()?scopeStorage(globalThis[name]):globalThis[name];
 return {getItem:key=>current().getItem(key),setItem:(key,value)=>current().setItem(key,value),removeItem:key=>current().removeItem(key),key:index=>current().key(index),get length(){return current().length;},clear:()=>current().clear()};
}
export const appStorage=lazyStorage('localStorage');
export const appSessionStorage=lazyStorage('sessionStorage');
