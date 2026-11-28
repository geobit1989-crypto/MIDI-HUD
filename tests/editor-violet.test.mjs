import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {inflateSync} from 'node:zlib';
const read=p=>readFileSync(new URL('../'+p,import.meta.url));
const str=p=>read(p).toString('utf8');
test('approved Editor violet, other HOME tile colors unchanged',()=>{
 const html=str('editor/v3.html'),home=str('live/home-qa.mjs');
 assert.match(html,/--accent:#7654C4/);
 assert.match(html,/--accent-hover:#8A6BE0/);
 assert.match(html,/--accent-dark:#5B3FA3/);
 assert.match(html,/lib-picker-row\[aria-pressed=true\].*background:var\(--accent-bg\)/);
 assert.match(home,/tile\('editor', 'EDITOR', '#7654C4'\)/);
 for(const [id,label,color] of [['live','LIVE','#305FF3'],['settings','AJUSTES','#B56829'],['controller','CONTROLLER','#168B8E'],['about','ACERCA DE','#52657C']])
  assert.ok(home.includes("tile('"+id+"', '"+label+"', '"+color+"'"));
});
test('official icon vector and generated opaque PNGs use approved colors and unchanged geometry',()=>{
 const svg=str('assets/brand/midi-hud.svg');
 assert.equal(svg,str('core/brand/midi-hud.svg'));
 assert.match(svg,/x="54.75" y="15.5" width="38.25" height="38.25" rx="7" fill="#5B3FA3"/);
 assert.match(svg,/x="15" y="15.5" width="38.25" height="38.25" rx="7" fill="#305FF3"/);
 assert.match(str('native/android/app/src/main/res/drawable/ic_hud.xml'),/fillColor="#5B3FA3"/);
 for(const [path,n] of [['core/brand/apple-touch-icon.png',180],['native/ios/App/Assets.xcassets/AppIcon.appiconset/AppIcon.png',1024]]){
  const png=read(path);
  assert.equal(png.readUInt32BE(16),n);assert.equal(png.readUInt32BE(20),n);assert.equal(png[25],2);
  const chunks=[];for(let pos=8;pos<png.length;){const len=png.readUInt32BE(pos),type=png.toString('ascii',pos+4,pos+8);if(type==='IDAT')chunks.push(png.subarray(pos+8,pos+8+len));pos+=12+len;}
  const pixels=inflateSync(Buffer.concat(chunks)),stride=n*3+1;
  assert.equal(pixels.length,n*stride);
  for(const [x,y,c] of [[1,1,[8,10,22]],[34,34,[48,95,243]],[74,34,[91,63,163]],[34,74,[83,66,48]],[74,74,[79,44,50]]]){
   const off=Math.floor(y*n/108)*stride+1+3*Math.floor(x*n/108);
   assert.deepEqual([...pixels.subarray(off,off+3)],c);
  }
 }
});
