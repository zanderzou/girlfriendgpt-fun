import {makeAllReadyTestGate,selectGatePhase} from './prepublication-gate.mjs';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import path from 'node:path';
const root=path.resolve(import.meta.dirname,'..');
const s=JSON.parse(await readFile(path.join(root,'src/data/editorialSchedule.json'),'utf8'));
const origin=new URL('https://'+s.domain).origin;
const report=JSON.parse(await readFile(path.join(root,'artifacts/editorial-build.json'),'utf8'));
const code=await readFile(path.join(root,report.out,'_worker.js'),'utf8');
const gateMatch=code.match(/^const releaseGate=(.+);$/m);assert.ok(gateMatch,'Compiled gate missing');
const productionGate=JSON.parse(gateMatch[1]);
const testGate=makeAllReadyTestGate(s.articles,productionGate);
const testCode=code.replace(/^const releaseGate=.+;$/m,'const releaseGate='+JSON.stringify(testGate)+';');
const worker=(await import('data:text/javascript;base64,'+Buffer.from(testCode).toString('base64'))).default;
const realNow=Date.now;let now=realNow();Date.now=()=>now;
const fakeAssets={async fetch(request){const p=decodeURIComponent(new URL(request.url).pathname);try{const file=path.join(root,report.out,p.endsWith('/')?p+'index.html':p);return new Response(request.method==='HEAD'?null:await readFile(file),{headers:{'X-Test-Baseline':'preserved'}})}catch{return new Response(request.method==='HEAD'?null:'Not found',{status:404,headers:{'X-Test-Baseline':'preserved'}})}}};
let checks=0;
async function request(p,method='GET',country='US',host=s.domain){const r=new Request('https://'+host+p,{method});Object.defineProperty(r,'cf',{value:{country}});return worker.fetch(r,{ASSETS:fakeAssets},{})}
try{for(const item of s.articles.filter(a=>a.approved&&a.order>(s.baselinePhase??1))){
 const p=(s.articlePrefix??'/blog/')+item.slug+'/';
 for(const suffix of ['', '?check=1','index.html']){now=Math.max(Date.parse(item.releaseAt),Date.parse(item.notBefore)||0)-1;const r=await request(p+suffix);assert.equal(r.status,404,p+' leaked before release');assert.match(r.headers.get('Cache-Control')??'',/no-store/);assert.match(r.headers.get('X-Robots-Tag')??'',/noindex/);checks++}
 now=Math.max(Date.parse(item.releaseAt),Date.parse(item.notBefore)||0)-1;for(const alias of [p.slice(0,-1),p.replace(item.slug,item.slug.replace('-','%2D'))]){const r=await request(alias,'HEAD');assert.equal(r.status,404);assert.equal(await r.text(),'');checks++}
 now=Math.max(Date.parse(item.releaseAt),Date.parse(item.notBefore)||0);for(const method of ['GET','HEAD']){const r=await request(p,method);assert.equal(r.status,200,p+' missing after release');assert.equal(r.headers.get('Cache-Control'),'no-store');if(method==='GET'){const html=await r.text();assert.match(html,/<html[^>]+lang="en"/);assert.ok(html.includes(item.title.replaceAll('&','&amp;'))||html.includes(item.title),p+' title mismatch');assert.ok(html.includes(origin+p),p+' canonical missing')}else assert.equal(await r.text(),'');checks++}
 for(const listing of [s.articlePrefix??'/blog/',s.articlePrefix?.startsWith('/en/')?'/en/rss.xml':'/rss.xml',s.requiresGeography?'/sitemap.xml':'/sitemap-0.xml','/llms.txt']){
  now=Math.max(Date.parse(item.releaseAt),Date.parse(item.notBefore)||0)-1;let r=await request(listing);assert.equal(r.status,200,listing+' inaccessible');assert.ok(!(await r.text()).includes(p),listing+' contains unreleased URL '+p);checks++;
  now=Math.max(Date.parse(item.releaseAt),Date.parse(item.notBefore)||0);r=await request(listing);assert.equal(r.status,200);assert.ok((await r.text()).includes(p),listing+' omits released URL '+p);checks++;
 }
 if(s.requiresGeography){for(const country of ['CN','XX']){const r=await request(p,'GET',country);assert.ok([403,503].includes(r.status),'Geographic guard bypass');checks++}}
 }
 console.log(s.domain+': '+checks+' editorial boundary checks passed');
}finally{Date.now=realNow}

// Check the exact production gate separately from all-ready snapshot fixtures.
const productionWorker=(await import('data:text/javascript;base64,'+Buffer.from(code).toString('base64'))).default;
const futureNow=Math.max(Date.now(),...s.articles.map(a=>Date.parse(a.releaseAt)))+31536000000;
let gateChecks=0;
try{Date.now=()=>futureNow;
 for(const item of s.articles){const p=(s.articlePrefix??'/blog/')+item.slug+'/';const exposed=item.order<=selectGatePhase(s.articles,productionGate,futureNow);
  const req=new Request('https://'+s.domain+p);Object.defineProperty(req,'cf',{value:{country:'US'}});const r=await productionWorker.fetch(req,{ASSETS:fakeAssets},{});
  if(!exposed){assert.equal(r.status,404,p+' pending article exposed by clock');assert.match(r.headers.get('Cache-Control')??'',/no-store/);assert.match(r.headers.get('X-Robots-Tag')??'',/noindex/);
   for(const listing of [s.articlePrefix??'/blog/',s.articlePrefix?.startsWith('/en/')?'/en/rss.xml':'/rss.xml',s.requiresGeography?'/sitemap.xml':'/sitemap-0.xml','/llms.txt']){const q=new Request('https://'+s.domain+listing);Object.defineProperty(q,'cf',{value:{country:'US'}});const l=await productionWorker.fetch(q,{ASSETS:fakeAssets},{});assert.equal(l.status,200);assert.ok(!(await l.text()).includes(p),listing+' leaked held article');gateChecks++;}
  }else assert.equal(r.status,200,p+' previously public article hidden');gateChecks++;
 }
}finally{Date.now=realNow}
console.log(s.domain+': '+gateChecks+' exact-production prepublication gate checks passed');
