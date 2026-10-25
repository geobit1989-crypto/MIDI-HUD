import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {spawn} from 'node:child_process';
import {mkdir} from 'node:fs/promises';
const require=createRequire(import.meta.url);
const {chromium}=require(process.env.HUD_PLAYWRIGHT||'playwright');
const server=spawn('python3',['-m','http.server','8766'],{stdio:'ignore'});
let browser;
try{
 for(let i=0;i<50;i++){try{await fetch('http://127.0.0.1:8766/');break;}catch{await new Promise(r=>setTimeout(r,100));}}
 browser=await chromium.launch({headless:true,args:['--no-sandbox']});
 const page=await browser.newPage({viewport:{width:390,height:844}}),errors=[];
 page.on('pageerror',e=>errors.push(e.message));
 await page.route('https://**',route=>route.abort());
 await page.goto('http://127.0.0.1:8766/editor/v3.html');
 await page.waitForFunction(()=>!!window.MIDIHUD_EDITOR);
 await page.locator('#songTitle').fill('Prueba integrada iPhone');await page.locator('#saveAll').click();
 await page.waitForFunction(()=>!window.MIDIHUD_EDITOR.hasDraft());
 await page.reload();await page.waitForFunction(()=>!!window.MIDIHUD_EDITOR);
 assert.equal(await page.locator('#songTitle').inputValue(),'Prueba integrada iPhone');
 await page.locator('#libraryToggle').click();await page.locator('#repAdd').click();await page.locator('#repNameInput').fill('Domingo');await page.locator('#repFormSubmit').click();
 await page.locator('#masterResults button').first().click();
 await page.locator('#masterResults button').nth(1).click();
 await page.locator('#libraryClose').click();
 await page.locator('[data-tab="sheet"]').click();
 await page.locator('#newVariantName').fill('Grados');await page.locator('#leadNotation').selectOption('grados');await page.locator('#songTone').fill('G');
 await page.locator('#leadText').fill('A - Intro\n| I | V | vi | IV |');await page.locator('#versionNew').click();await page.locator('#saveAll').click();
 await page.waitForFunction(()=>window.MIDIHUD_EDITOR.getLibrary().songs.some(s=>s.leadSheets?.some(v=>v.name==='Grados')));
 await mkdir('build/browser',{recursive:true});await page.screenshot({path:'build/browser/editor-portrait.png',fullPage:true});
 await page.locator('#liveLink').click();await page.waitForFunction(()=>!!window.MIDIHUD_LIVE);
 assert.equal(await page.locator('.topbar .key').innerText(),'G');
 const before=await page.evaluate(()=>MIDIHUD_LIVE.getEngine().getViewModel());
 await page.evaluate(()=>{const library=JSON.parse(localStorage.getItem('hudLibraryV34'));library.songs[0].title='Cambio remoto';localStorage.setItem('hudLibraryV34',JSON.stringify(library));window.dispatchEvent(new Event('storage'));});
 assert.deepEqual(await page.evaluate(()=>MIDIHUD_LIVE.getEngine().getViewModel()),before);
 await page.screenshot({path:'build/browser/live-portrait.png',fullPage:true});
 await page.setViewportSize({width:844,height:390});await page.screenshot({path:'build/browser/live-landscape.png',fullPage:true});
 assert.deepEqual(errors,[]);
 console.log('Browser integration passed: local save/reload, empty playlist, shared song, degree variant/key, LIVE snapshot, portrait/landscape.');
}finally{await browser?.close();server.kill();}
