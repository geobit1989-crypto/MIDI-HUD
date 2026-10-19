import {readFileSync,readdirSync,existsSync,statSync} from 'node:fs';
import {fileURLToPath} from 'node:url';
import {join,dirname,resolve} from 'node:path';
import {spawnSync} from 'node:child_process';
const root=fileURLToPath(new URL('../',import.meta.url));
function walk(dir){return readdirSync(dir,{withFileTypes:true}).flatMap(e=>e.isDirectory()?walk(join(dir,e.name)):[join(dir,e.name)]);}
let scripts=0,links=0;
function checkScript(code,type,label){
 const result=spawnSync(process.execPath,['--check',...(type==='module'?['--input-type=module']:[])],{input:code,encoding:'utf8'});
 if(result.status!==0)throw Error(label+'\n'+result.stderr);
 scripts++;
}
function checkRef(file,ref){
 if(!ref||/^(?:[a-z]+:|#|\/)/i.test(ref))return;
 const target=resolve(dirname(file),ref.split(/[?#]/)[0]);
 if(!existsSync(target))throw Error(file+': falta '+ref);
 if(statSync(target).isDirectory()&&!existsSync(join(target,'index.html')))throw Error(file+': carpeta sin entrada '+ref);
 links++;
}
for(const file of ['core','editor','live','lab','config'].flatMap(dir=>walk(join(root,dir))).concat(['index.html','v03.html'].map(name=>join(root,name)))){
 if(!/\.(?:html|m?js)$/.test(file))continue;
 const source=readFileSync(file,'utf8');
 if(/\.html$/.test(file)){
  for(const match of source.matchAll(/<script\b([^>]*)>([\s\S]*?)<\/script>/gi)){
   if(/\bsrc=/.test(match[1]))continue;
   checkScript(match[2],/type=["']module["']/.test(match[1])?'module':'script',file);
  }
  for(const match of source.matchAll(/\b(?:src|href)=["']([^"']+)["']/g))checkRef(file,match[1]);
 }else checkScript(source,file.endsWith('.mjs')?'module':'script',file);
 for(const match of source.matchAll(/(?:\bfrom\s+|^\s*import\s*)["']([^"']+)["']/gm))checkRef(file,match[1]);
 for(const match of source.matchAll(/\bfetch\(["']([^"']+)["']/g))checkRef(file,match[1]);
}
console.log('Sintaxis: '+scripts+' scripts. Referencias locales: '+links+'. Sin errores.');
