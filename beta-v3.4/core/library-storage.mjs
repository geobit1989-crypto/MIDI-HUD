import {normalizeLibrary,validateLibrary} from './engine-v1.mjs';

// La beta lee la biblioteca anterior como punto de partida; nunca la sobrescribe.
export const LIBRARY_KEY='hudLibraryV34';
export const BACKUP_KEY='hudLibraryV34Backup';
export const LEGACY_KEY='hudLibraryV1';
export function readLibrarySource(storage){
 return storage.getItem(LIBRARY_KEY)??storage.getItem(LEGACY_KEY);
}
export function saveLibrary(storage,next,previous){
 validateLibrary(next);
 const written=normalizeLibrary(next);
 written.revision=(Number.isInteger(written.revision)?written.revision:0)+1;
 written.updatedAt=new Date().toISOString();
 const serialized=JSON.stringify(written);
 storage.setItem(BACKUP_KEY,JSON.stringify(previous));
 storage.setItem(LIBRARY_KEY,serialized);
 return written;
}
