import {normalizeLibrary,validateLibrary} from './engine-v1.mjs?v=20261016-patch2';

// La beta lee la biblioteca anterior como punto de partida; nunca la sobrescribe.
export const LIBRARY_KEY='hudLibraryV34';
export const BACKUP_KEY='hudLibraryV34Backup';
export const LEGACY_KEY='hudLibraryV1';
export function readLibrarySource(storage){
 return storage.getItem(LIBRARY_KEY)??storage.getItem(LEGACY_KEY);
}
export function replaceLibrary(storage,next,previous){
 validateLibrary(next);
 const written=normalizeLibrary(next);
 const serialized=JSON.stringify(written);
 const priorBackup=storage.getItem(BACKUP_KEY);
 storage.setItem(BACKUP_KEY,JSON.stringify(previous));
 try{storage.setItem(LIBRARY_KEY,serialized);}
 catch(error){
  // Si la escritura principal falla, intentar conservar también el Deshacer.
  try{
   if(priorBackup===null)storage.removeItem(BACKUP_KEY);
   else storage.setItem(BACKUP_KEY,priorBackup);
  }catch{}
  throw error;
 }
 return written;
}
export function saveLibrary(storage,next,previous){
 const written=normalizeLibrary(next);
 written.revision=(Number.isInteger(written.revision)?written.revision:0)+1;
 written.updatedAt=new Date().toISOString();
 return replaceLibrary(storage,written,previous);
}
