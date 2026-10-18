/**
 * Importación no destructiva del catálogo de canciones/autor.
 * No usa red, DOM ni localStorage; seguro para pruebas fuera del navegador.
 */
import {newSong} from "./editor-model.mjs";
import {validateLibrary} from "../core/engine-v1.mjs";

const copy=value=>JSON.parse(JSON.stringify(value));
const normalized=value=>String(value??"").normalize("NFD")
  .replace(/[\u0300-\u036f]/g,"").replace(/\s+/g," ").trim().toLocaleLowerCase("es");
const titleKey=s=>normalized(s);
const songKey=(title,author)=>titleKey(title)+"\u0000"+normalized(author);

function rowsFromText(text){
 if(typeof text!=="string"||text.length>2000000)throw Error("La tabla debe tener menos de 2 MB.");
 const input=text.replace(/^\uFEFF/,"").replace(/^sep=([^\r\n]+)\r?\n/i,"");
 const first=input.split(/\r?\n/,1)[0]||"";
 const delimiter=first.includes("\t")?"\t":
   (first.match(/;/g)||[]).length>(first.match(/,/g)||[]).length?";":",";
 const rows=[],row=[];let field="",quoted=false;
 for(let i=0;i<input.length;i++){
  const c=input[i];
  if(c==='"'){
   if(quoted&&input[i+1]==='"'){field+='"';i++;}
   else if(!field||quoted)quoted=!quoted;
   else field+=c;
  }else if(c===delimiter&&!quoted){row.push(field);field="";}
  else if((c==="\n"||c==="\r")&&!quoted){
   if(c==="\r"&&input[i+1]==="\n")i++;
   row.push(field);if(row.some(x=>x.trim()))rows.push([...row]);
   row.length=0;field="";
  }else field+=c;
 }
 if(quoted)throw Error("Hay comillas sin cerrar en el CSV.");
 row.push(field);if(row.some(x=>x.trim()))rows.push([...row]);
 return rows;
}

/** Entiende CSV de Google Sheets o tabla copiada (TSV). */
export function parseSongCatalog(text){
 const rows=rowsFromText(text);
 if(!rows.length)throw Error("El catálogo está vacío.");
 const header=rows[0].map(normalized);
 const titleIndex=header.findIndex(x=>["cancion","canciones","musica","titulo","title"].includes(x));
 const authorIndex=header.findIndex(x=>["autor","author","artista","version","versao","interprete"].includes(x));
 if(titleIndex<0||authorIndex<0)throw Error("Selecciona las columnas «Canción» y «Autor», incluyendo la cabecera.");
 rows.shift();
 const seen=new Set(),result=[];
 for(const row of rows){
  const title=(row[titleIndex]||"").trim().replace(/\s+/g," ");
  const author=(row[authorIndex]||"").trim().replace(/\s+/g," ");
  if(!title&&!author)continue;
  if(!title)throw Error("Se encontró una fila con autor, pero sin título.");
  if(title.length>120||author.length>160)throw Error("Título o autor demasiado largo: "+title.slice(0,45));
  const key=songKey(title,author);
  if(!seen.has(key)){seen.add(key);result.push({title,author});}
 }
 if(!result.length)throw Error("No hay canciones después de la cabecera.");
 if(result.length>3000)throw Error("Demasiadas canciones en un único archivo.");
 return result;
}

/**
 * Enlaza coincidencias exactas, completa autor si falta, y crea lo demás.
 * No reescribe título, estados, lead sheets, controles MIDI ni bindings de canciones existentes.
 */
export function mergeSongCatalog(library,repertoireId,entries){
 const db=copy(library);
 const rep=db.repertoires.find(x=>x.id===repertoireId);
 if(!rep)throw Error("Repertorio de destino desconocido.");
 if(!Array.isArray(entries)||!entries.length)throw Error("No hay canciones que importar.");
 const stats={read:entries.length,added:0,linked:0,authorsCompleted:0,unchanged:0};
 const originalIds=new Set(rep.songIds);
 for(const entry of entries){
  const title=String(entry.title||"").trim(),author=String(entry.author||"").trim();
  if(!title)throw Error("Canción sin título.");
  // Buscar globalmente: una canción puede pertenecer a más de un repertorio.
  let found=db.songs.find(s=>songKey(s.title,s.author||"")===songKey(title,author));
  if(!found&&author){
   const unnamed=db.songs.filter(s=>titleKey(s.title)===titleKey(title)&&!String(s.author||"").trim());
   if(unnamed.length===1){
    found=unnamed[0];found.author=author;stats.authorsCompleted++;
   }
  }
  if(found){
   if(originalIds.has(found.id))stats.unchanged++;
   else{rep.songIds.push(found.id);originalIds.add(found.id);stats.linked++;}
   continue;
  }
  const id=newSong(db,repertoireId,title);
  const newEntry=db.songs.find(s=>s.id===id);
  newEntry.author=author;
  const state=db.states.find(s=>s.id===newEntry.initialStateId);
  state.name="Sin configurar";state.displayIndex=null;state.gtPatch=null;
  originalIds.add(id);stats.added++;
 }
 validateLibrary(db);
 return {library:db,stats};
}
