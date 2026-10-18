import {parseLeadSheetText} from './lead-sheet-text.mjs';
import {scanNotation,convertSheet} from './chord-notation.mjs';

/** Valida y prepara el guardado; cancelar conserva intactos canción y borrador. */
export async function prepareLeadSheetSave(source, {preferredNotation=null,chooseNotation=async()=>null}={}) {
 const original=String(source??'');
 if(!original.trim())return {leadSheet:null,chordNotation:preferredNotation};
 const parsed=parseLeadSheetText(original);
 if(parsed.errors.length){
  const first=parsed.errors[0];
  throw Error('Línea '+first.line+': '+first.message);
 }
 const notation=scanNotation(original);
 if(notation.mixed&&notation.families.includes('grados'))throw Error('No mezcles grados con notas en la misma versión. Crea una versión independiente y escribe sus acordes.');
 let target=notation.families[0]||preferredNotation;
 let text=original;
 if(notation.mixed){
  target=await chooseNotation();
  if(target==null)return null;
  if(!['latino','americano'].includes(target))throw Error('Elige Latino o Americano.');
  text=convertSheet(original,target);
 }
 const checked=parseLeadSheetText(text);
 if(checked.errors.length)throw Error('El cifrado convertido no es válido.');
 return {leadSheet:{sourceText:checked.sourceText,sections:checked.sections},chordNotation:target};
}

export function convertLeadSheetDraft(source,target){
 const parsed=parseLeadSheetText(source);
 if(parsed.errors.length)throw Error('Línea '+parsed.errors[0].line+': '+parsed.errors[0].message);
 return convertSheet(source,target);
}
