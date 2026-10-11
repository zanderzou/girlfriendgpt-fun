import assert from 'node:assert/strict';
import {readFile,readdir,access} from 'node:fs/promises';
import path from 'node:path';
import {parse,walkSync} from 'ultrahtml';
const root=path.resolve(import.meta.dirname,'..'),config=JSON.parse(await readFile(path.join(root,'scripts/localized-release.json'),'utf8'));
const exists=async f=>{try{await access(f);return true}catch{return false}};
const out=path.join(root,await exists(path.join(root,'dist/client/index.html'))?'dist/client':'dist');
async function files(dir,prefix=''){let a=[];for(const e of await readdir(dir,{withFileTypes:true})){if(e.isDirectory())a.push(...await files(path.join(dir,e.name),prefix+e.name+'/'));else a.push(prefix+e.name)}return a}
const languages=['ja','ko','zh-hant','es','pt-br','ru','de','fr','ar'],info=['about','contact','editorial-policy','privacy','terms'];
const names=(await files(out)).filter(f=>f.endsWith('index.html')),routes=new Set(names.map(f=>'/'+f.replace(/index\.html$/,''))),origin='https://'+config.domain;
const canonicals=new Set();
for(const name of names){const html=await readFile(path.join(out,name),'utf8'),route='/'+name.replace(/index\.html$/,''),locale=route.split('/')[1],translated=languages.includes(locale),en=translated?route.slice(locale.length+1)||'/':route,nodes=[];walkSync(parse(html),n=>{if(n.type===1)nodes.push(n)});
 const select=(tag,attr,value)=>nodes.filter(n=>n.name===tag&&(!attr||n.attributes[attr]===value));
 assert.equal(select('h1').length,1,route+' H1');assert.equal(select('link','rel','canonical')[0]?.attributes.href,origin+route,route+' canonical');
 assert.ok(select('title')[0]?.children.length,route+' title');assert.ok(select('meta','name','description')[0]?.attributes.content.length>=25,route+' description');
 assert.ok(!canonicals.has(origin+route),route+' duplicate canonical');canonicals.add(origin+route);
 assert.match(select('meta','name','robots')[0]?.attributes.content??'',/^index,follow/);
 assert.ok(select('meta','property','og:title').length&&select('meta','property','og:image').length&&select('meta','name','twitter:card').length,route+' social metadata');
 for(const img of select('img'))assert.ok(Object.hasOwn(img.attributes,'alt'),route+' image alternative text');
 if(translated){assert.ok(en==='/'||en.startsWith('/blog/'),route+' must be home or blog');assert.equal(select('html')[0]?.attributes.lang.toLowerCase(),locale.toLowerCase());assert.equal(select('html')[0]?.attributes.dir,locale==='ar'?'rtl':'ltr');assert.match(select('meta','name','robots')[0]?.attributes.content??'',/^index,follow/);}
 const alternatives=nodes.filter(n=>n.name==='link'&&n.attributes.hreflang),expected=['en',...languages.filter(code=>routes.has('/'+code+en)),'x-default'];assert.equal(alternatives.length,expected.length,route+' hreflang count');
 for(const a of alternatives){const target=new URL(a.attributes.href);assert.equal(target.origin,origin);assert.ok(routes.has(target.pathname),route+' missing language target');}
 for(const node of nodes.filter(n=>n.name==='a'||n.name==='option')){const href=node.attributes.href??node.attributes.value;if(!href)continue;let url;try{url=new URL(href,origin)}catch{continue}if(url.origin===origin&&/^\/(?:ja|ko|zh-hant|es|pt-br|ru|de|fr|ar)\//.test(url.pathname))assert.ok(routes.has(url.pathname),route+' missing localized link '+href);}
 if(translated&&en==='/'){const hero=nodes.find(n=>n.attributes['data-locale-hero']!==undefined);assert.ok(hero,route+' hero');const calls=[];walkSync(hero,n=>{if(n.name==='a'&&/utm_ref=|ref=zanderzou/.test(n.attributes.href??''))calls.push(n)});assert.equal(calls.length,1,route+' primary CTA');}
}
const redirects=await readFile(path.join(out,'_redirects'),'utf8'),sitemap=await readFile(path.join(out,'sitemap-0.xml'),'utf8');
let dynamicSeen=false;for(const line of redirects.split(/\r?\n/).filter(line=>line.trim()&&!line.startsWith('#'))){if(/[:*]/.test(line.split(/\s+/)[0]))dynamicSeen=true;else assert.ok(!dynamicSeen,'Static redirects must precede dynamic patterns');}
for(const locale of languages){assert.equal([...routes].filter(p=>p.startsWith('/'+locale+'/')).length,7,locale+' home, blog index and five comparisons');for(const page of info){assert.ok(!routes.has(`/${locale}/${page}/`),'English-only generic page');assert.ok(redirects.includes(`/${locale}/${page}/ /${page}/ 301`),'Missing retired info redirect');assert.ok(!sitemap.includes(`/${locale}/${page}/`),'Generic translation in sitemap');}}
assert.ok(!/^Disallow:\s*\/$/m.test(await readFile(path.join(out,'robots.txt'),'utf8')),'Crawl blocked');
console.log(config.domain+': public locale audit passed; nine home/blog editions, English information pages, valid CTA and language links.');
