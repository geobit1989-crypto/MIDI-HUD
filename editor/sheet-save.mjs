import {parseLeadSheetText} from './lead-sheet-text.mjs?v=20261128-editor8b';
import {scanNotation,convertSheet} from './chord-notation.mjs';

/** Valida y prepara el guardado; cancelar conserva intactos canción y borrador. */
export async function prepareLeadSheetSave(source, {preferredNotation=null,chooseNotation=async()=>null,meter}={}) {
 const original=String(source??'');
 if(!original.trim())return {leadSheet:null,chordNotation:preferredNotation};
 const parsed=parseLeadSheetText(original,meter);
 if(parsed.errors.length){
  const first=parsed.errors[0];
  throw Error('Línea '+first.line+': '+first.message);
 }
 const notation=scanNotation(original);
 let target=notation.families[0]||preferredNotation;
 let text=original;
 if(notation.mixed){
  target=await chooseNotation();
  if(target==null)return null;
  if(!['latino','americano'].includes(target))throw Error('Elige Latino o Americano.');
  text=convertSheet(original,target);
 }
 const checked=parseLeadSheetText(text,meter);
 if(checked.errors.length)throw Error('El cifrado convertido no es válido.');
 return {leadSheet:{sourceText:checked.sourceText,sections:checked.sections},chordNotation:target};
}

export function convertLeadSheetDraft(source,target,meter){
 const parsed=parseLeadSheetText(source,meter);
 if(parsed.errors.length)throw Error('Línea '+parsed.errors[0].line+': '+parsed.errors[0].message);
 return convertSheet(source,target);
}
