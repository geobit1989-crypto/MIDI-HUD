import assert from 'node:assert/strict';
import {createServer} from 'node:http';
import {readFile,mkdir} from 'node:fs/promises';
import {resolve,extname,sep} from 'node:path';
import {createRequire} from 'node:module';
import {migrateCatalog} from '../core/catalog-v1.mjs';
const require=createRequire(import.meta.url),{chromium}=require(process.env.HUD_PLAYWRIGHT||'playwright');
const root=resolve('.'),prefix='/MIDI-HUD/pruebas/v6/';
const server=createServer(async(req,res)=>{
 try{let path=new URL(req.url,'http://localhost').pathname;if(path.startsWith(prefix))path=path.slice(prefix.length);else path=path.slice(1);if(!path||path.endsWith('/'))path+='index.html';const file=resolve(root,path);if(!file.startsWith(root+sep))throw Error('path');const bytes=await readFile(file);res.setHeader('Content-Type',({'.html':'text/html','.mjs':'text/javascript','.js':'text/javascript','.css':'text/css','.json':'application/json'})[extname(file)]||'text/plain');res.end(bytes);}
 catch{res.statusCode=404;res.end('Not found');}
});
await new Promise(r=>server.listen(8767,'127.0.0.1',r));let browser;
try{
 browser=await chromium.launch({headless:true,args:['--no-sandbox'],...(process.env.HUD_CHROMIUM?{executablePath:process.env.HUD_CHROMIUM}:{})});
 const context=await browser.newContext({viewport:{width:390,height:844}}),page=await context.newPage(),errors=[];
 page.on('pageerror',e=>errors.push(e.message));await page.route('https://**',route=>route.abort());
 await page.addInitScript(()=>{
  class Input extends EventTarget{constructor(id){super();this.id=id;this.name=id;this.type='input';this.state='connected';}async open(){}send(data){const event=new Event('midimessage');event.data=new Uint8Array(data);this.dispatchEvent(event);}}
  const inputs=new Map([['Chocolate',new Input('Chocolate')],['Other',new Input('Other')]]),access={inputs,onstatechange:null};
  Object.defineProperty(navigator,'requestMIDIAccess',{configurable:true,value:async()=>access});window.testMidi=access;
 });
 const origin='http://127.0.0.1:8767',base=origin+prefix;
 await page.goto(base+'privacy.html');await page.evaluate(()=>{localStorage.setItem('hudLibraryV34','stable-library');localStorage.setItem('midiHudSettingsV1','stable-settings');localStorage.setItem('midiHudTrustedDeviceSessionV1','stable-auth');});
 await page.goto(base+'index.html');
 const home=page.getByRole('dialog',{name:'MIDI HUD',exact:true});
 await home.waitFor();
 assert.equal(await page.title(),'MIDI HUD');
 assert.equal(await home.evaluate(node=>node.ownerDocument.activeElement?.id),'hud-home-title');
 assert.equal(await home.getByRole('button',{name:'LIVE',exact:true}).evaluate(node=>getComputedStyle(node).borderTopWidth),'0px');
 assert.equal(await home.evaluate(node=>{
  const footer=node.querySelector('footer');
  const group=footer.querySelector('.hud-home-midi');
  const drive=footer.querySelector('[data-link="drive"]');
  return group.getBoundingClientRect().left===footer.getBoundingClientRect().left &&
    drive.getBoundingClientRect().right===footer.getBoundingClientRect().right &&
    group.lastElementChild?.dataset.link==='usb';
 }),true);
 assert.equal(await home.locator('.hud-tile').count(),4);
 assert.equal(await home.locator('[data-link="bluetooth"]').getAttribute('data-state'),'idle');
 for(const [width,height] of [[390,844],[844,390],[320,568],[1280,720]]){
  await page.setViewportSize({width,height});
  assert.equal(await home.evaluate(node=>node.scrollHeight<=node.clientHeight && node.scrollWidth<=node.clientWidth),true);
 }
 await page.setViewportSize({width:390,height:844});
 await home.getByRole('button',{name:'AJUSTES',exact:true}).click();
 const settings=page.getByRole('dialog',{name:'AJUSTES'});
 await settings.waitFor();
 assert.deepEqual(await settings.locator('main > details > summary').allTextContents(),['CUENTA','DISPOSITIVOS','REPERTORIOS']);
 assert.equal(await settings.locator('header button').count(),1);
 assert.equal(await settings.evaluate(node=>node.querySelector('header').getBoundingClientRect().width),390);
 await settings.locator('main > details > summary').last().click();
 assert.equal(await settings.getByRole('radio',{name:/cancion/}).count()>0,true);
 await page.locator('#hud-close-btn').click();
 await home.getByRole('button',{name:'LIVE',exact:true}).click();
 assert.equal(await home.isVisible(),false);
 await page.waitForFunction(()=>document.title.includes('LIVE'));
 await page.locator('.topbar .settings').click();
 await page.locator('#hud-close-btn').click();
 assert.equal(await home.isVisible(),false);
 await page.goto(base+'editor/v3.html');await page.waitForFunction(()=>!!window.MIDIHUD_EDITOR);
 await page.locator('#songTitle').fill('Guardado completo de pruebas');await page.locator('[data-tab="states"]').click();await page.locator('#saveAll').click();
 await page.waitForFunction(()=>!!localStorage.getItem('midiHudTest:hudLibraryV34'));
 assert.equal(await page.evaluate(()=>localStorage.getItem('hudLibraryV34')),'stable-library');
 await page.goto(base+'lab/midi-v1.html');
 page.once('dialog',dialog=>dialog.accept());await page.locator('#clone').click();await page.waitForFunction(()=>JSON.parse(localStorage.getItem('midiHudTest:hudLabLibraryV1')).songs.some(s=>s.title==='Guardado completo de pruebas'));
 assert.equal(await page.getByRole('link',{name:'Editor',exact:true}).getAttribute('href'),'../editor/v3.html');
 const source=JSON.parse(await readFile(new URL('./fixtures/main-v04.json',import.meta.url),'utf8'));
 const demo=JSON.parse(await readFile(new URL('../config/midi-hud-data-v2.json',import.meta.url),'utf8'));
 source.songs[0].leadSheet=demo.songs[0].leadSheet;
 const library=migrateCatalog(source);
 library.repertoires.push({id:'test-empty',name:'Ensayo vacío',songIds:[]});
 await page.evaluate(library=>localStorage.setItem('midiHudTest:hudLibraryV34',JSON.stringify(library)),library);
 await page.goto(base+'v03.html');await page.waitForFunction(()=>!!window.MIDIHUD_LIVE);
 await page.locator('.topbar .settings').click();
 await settings.locator('summary').filter({hasText:'REPERTORIOS'}).click();
 await settings.getByText('Ensayo vacío',{exact:false}).click();
 assert.equal(await settings.getByRole('radio',{name:/Ensayo vacío/}).isChecked(),true);
 await page.reload();
 await page.waitForFunction(()=>!!window.MIDIHUD_LIVE);
 assert.equal(await page.evaluate(()=>MIDIHUD_LIVE.getEngine().getViewModel().active.repertoireId),'test-empty');
 await page.locator('.topbar .settings').click();
 await settings.locator('summary').filter({hasText:'REPERTORIOS'}).click();
 await settings.getByText('Repertorio completo',{exact:false}).click();
 assert.equal(await settings.getByRole('radio',{name:/Repertorio completo/}).isChecked(),true);
 const account=settings.locator('summary').filter({hasText:'CUENTA'});
 await account.click();
 await settings.getByRole('checkbox',{name:'Sincronización automática'}).uncheck();
 await page.reload();
 await page.waitForFunction(()=>!!window.MIDIHUD_LIVE);
 await page.locator('.topbar .settings').click();
 await account.click();
 assert.equal(await settings.getByRole('checkbox',{name:'Sincronización automática'}).isChecked(),false);
 assert.equal(await page.evaluate(()=>MIDIHUD_LIVE.getEngine().getViewModel().active.repertoireId),'hud-full-repertoire');
 await page.locator('summary').filter({hasText:'DISPOSITIVOS'}).click();await page.getByText('2',{exact:true}).and(page.locator('.hud-channel-grid span')).click();await page.locator('#hud-midi-btn').click();
 await page.waitForFunction(()=>document.querySelector('#hud-midi-status').dataset.connection==='connected');
 await page.evaluate(()=>{testMidi.inputs.get('Other').send([0xb1,80,1]);testMidi.inputs.get('Chocolate').send([0xb1,80,2]);testMidi.inputs.get('Chocolate').send([0xb1,81,0]);testMidi.inputs.get('Chocolate').send([0xb1,91,77]);});
 const before=await page.evaluate(()=>MIDIHUD_LIVE.getEngine().getState());assert.equal(before.activeStateId,'preset-solo');
 await page.evaluate(()=>testMidi.inputs.get('Chocolate').send([0xb1,80,2]));assert.deepEqual(await page.evaluate(()=>MIDIHUD_LIVE.getEngine().getState()),before);
 await page.evaluate(()=>{const key='midiHudTest:hudLibraryV34',db=JSON.parse(localStorage.getItem(key));db.songs[0].title='Actualización compatible';localStorage.setItem(key,JSON.stringify(db));window.dispatchEvent(new Event('storage'));});
 assert.deepEqual(await page.evaluate(()=>MIDIHUD_LIVE.getEngine().getState()),before);
 assert.equal(await page.locator('#hud-library-update').count(),0);
 await page.evaluate(()=>{const input=testMidi.inputs.get('Chocolate');input.state='disconnected';testMidi.inputs.delete('Chocolate');window.disconnectedInput=input;testMidi.onstatechange();});
 await page.waitForFunction(()=>document.querySelector('#hud-midi-status').dataset.connection==='disconnected');assert.deepEqual(await page.evaluate(()=>MIDIHUD_LIVE.getEngine().getState()),before);
 await page.evaluate(()=>{disconnectedInput.state='connected';testMidi.inputs.set('Chocolate',disconnectedInput);testMidi.onstatechange();});await page.waitForFunction(()=>document.querySelector('#hud-midi-status').dataset.connection==='connected');
 assert.deepEqual(await page.evaluate(()=>MIDIHUD_LIVE.getEngine().getState()),before);
 await page.locator('#hud-close-btn').click();await mkdir('build/browser',{recursive:true});await page.screenshot({path:'build/browser/staging-live-portrait.png',fullPage:true});
 await page.setViewportSize({width:844,height:390});await page.screenshot({path:'build/browser/staging-live-landscape.png',fullPage:true});
 assert.deepEqual(await page.evaluate(()=>['hudLibraryV34','midiHudSettingsV1','midiHudTrustedDeviceSessionV1'].map(k=>localStorage.getItem(k))),['stable-library','stable-settings','stable-auth']);
 assert.deepEqual(errors,[]);console.log('Staging browser passed: Editor save, isolated stable data, channel 2, selected input only, duplicate state, explicit library update, disconnect/reconnect, portrait/landscape, zero JS errors.');
}finally{await browser?.close();await new Promise(r=>server.close(r));}
