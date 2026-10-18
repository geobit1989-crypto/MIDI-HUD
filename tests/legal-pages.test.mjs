import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
const read=path=>readFileSync(new URL('../'+path,import.meta.url),'utf8');
const pages=['privacy.html','privacy-en.html','terms.html','terms-en.html'];

test('public legal pages are bilingual, have working cross-links and identify contact',()=>{
 for(const file of pages){
  const html=read(file);
  assert.match(html,/<!doctype html>/i);
  assert.match(html,/<html lang="(?:en|pt-PT)">/);
  assert.match(html,/<meta name="viewport"/);
  assert.match(html,/midihudapp@gmail\.com/g);
  assert.match(html,/href="\.\/"/);
  assert.match(html,/rel="canonical"/);
  assert.match(html,/hreflang="pt-PT"/);
  assert.match(html,/hreflang="en"/);
  assert.match(html,/18 (?:October|de outubro) 2026|18 de outubro de 2026|18 October 2026/);
  assert.doesNotMatch(html,/client_secret|access_token\s*[:=]\s*["']/i);
 }
 assert.match(read('privacy.html'),/Regulamento Geral|RGPD|artigo 13\.º/);
 assert.match(read('privacy-en.html'),/GDPR Article 13/);
 assert.match(read('privacy.html'),/appDataFolder/);
 assert.match(read('privacy-en.html'),/appDataFolder/);
 assert.match(read('privacy.html'),/Google API Services User Data Policy/);
 assert.match(read('privacy-en.html'),/Limited Use/);
 assert.match(read('terms.html'),/fase beta/);
 assert.match(read('terms-en.html'),/beta/);
});
test('home, V3 Editor and LIVE link to all four legal pages',()=>{
 for(const file of ['index.html','editor/v3.html','v03.html']){
  const html=read(file);
  for(const page of pages)assert(html.includes(page),file+' missing '+page);
 }
});
