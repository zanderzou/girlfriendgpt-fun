// Reproducible production finalization. Run only after a normal static build.
// Reviewed translations are source-owned; private preview artifacts are never inputs.
import assert from 'node:assert/strict';
import {readFile,writeFile,readdir,access} from 'node:fs/promises';
import path from 'node:path';
const root=path.resolve(import.meta.dirname,'..');
const config=JSON.parse(await readFile(path.join(root,'scripts/localized-release.json'),'utf8'));
assert.notEqual(config.domain,'spicybox.fun','Excluded site');
for(const [key,value] of Object.entries(process.env))if(/(?:PRIVATE.*PREVIEW|LOCALIZED_DRAFT_PREVIEW|PRESERVED_PRIVATE_PREVIEW)/.test(key)&&value)throw Error('Never finalize a private preview');
const exists=async file=>{try{await access(file);return true}catch{return false}};
const out=await exists(path.join(root,'dist/client/index.html'))?path.join(root,'dist/client'):path.join(root,'dist');
assert.ok(!await exists(path.join(out,'PRIVATE-NOT-FOR-DEPLOYMENT.txt')),'Private artifact');
const locales=[['','en','English'],['ja','ja','日本語'],['ko','ko','한국어'],['zh-hant','zh-Hant','繁體中文'],['es','es','Español'],['pt-br','pt-BR','Português (Brasil)'],['ru','ru','Русский'],['de','de','Deutsch'],['fr','fr','Français'],['ar','ar','العربية']];
const origin='https://'+config.domain;
const englishEditorialPaths = new Set(JSON.parse(await readFile(path.join(root,'src/data/editorialSchedule.json'),'utf8')).articles.map(a=>'/blog/'+a.slug+'/'));

const escape=value=>value.replaceAll('&','&amp;').replaceAll('"','&quot;').replaceAll('<','&lt;').replaceAll('>','&gt;');
async function files(dir){const rows=[];for(const e of await readdir(dir,{withFileTypes:true})){if(e.isDirectory())rows.push(...await files(path.join(dir,e.name)));else if(e.isFile())rows.push(path.join(dir,e.name))}return rows;}
const pages=(await files(out)).filter(f=>f.endsWith(path.sep+'index.html')&&!path.relative(out,f).startsWith('404'));
const routeFor=file=>'/'+path.relative(out,file).replaceAll(path.sep,'/').replace(/index\.html$/,'');
const paths=new Set(pages.map(routeFor));assert.equal(paths.size,120+[...paths].filter(p=>englishEditorialPaths.has(p)).length,'Preserve the complete editions and add only English articles');
const promotions={ja:'Playboxへの広告リンク',ko:'Playbox 프로모션 링크','zh-hant':'Playbox 推廣連結',es:'Enlace promocional a Playbox','pt-br':'Link promocional para Playbox',ru:'Рекламная ссылка на Playbox',de:'Werbelink zu Playbox',fr:'Lien promotionnel vers Playbox',ar:'رابط إعلاني إلى Playbox'};
const nativeLanguage={en:'Language',ja:'言語',ko:'언어','zh-hant':'語言',es:'Idioma','pt-br':'Idioma',ru:'Язык',de:'Sprache',fr:'Langue',ar:'اللغة'};
const prefix=/^\/(?:ja|ko|zh-hant|es|pt-br|ru|de|fr|ar)(?=\/)/;
const robots='index,follow,max-image-preview:large,max-snippet:-1,max-video-preview:-1';
for(const file of pages){const route=routeFor(file),slug=route.split('/')[1],translated=locales.some(([code])=>code&&code===slug),english=route.replace(prefix,'')||'/';
 const alternates=locales.filter(([code])=>!englishEditorialPaths.has(english)||code==='').map(([code,lang,label])=>({lang,label,url:origin+(code?'/'+code:'')+english}));
 assert.ok(alternates.every(row=>paths.has(new URL(row.url).pathname)),'Incomplete reciprocal language group: '+route);
 let html=await readFile(file,'utf8');
 html=html.replace(/<link\b[^>]*hreflang="[^"]*"[^>]*>/g,'');
 html=html.replace('</head>',alternates.map(row=>`<link rel="alternate" hreflang="${row.lang}" href="${row.url}">`).join('')+`<link rel="alternate" hreflang="x-default" href="${origin+english}"></head>`);
 if(translated){
  html=html.replace(/<meta\b[^>]*name="(?:robots|googlebot|bingbot)"[^>]*>/g,'');
  html=html.replace('</head>',`<meta name="robots" content="${robots}"><meta name="googlebot" content="${robots}"><meta name="bingbot" content="${robots}"></head>`);
  // Private-only banners are removed from production source, never merely hidden.
  assert.ok(!/<(?:div|aside)[^>]*class="[^"]*preview-flag/.test(html),'Private banner remains: '+route);
  const description=config.metadataOverrides?.[route];
  if(description){assert.ok(description.length>=35&&description.length<=180);html=html.replace(/(<meta\b[^>]*(?:name="description"|property="og:description"|name="twitter:description")[^>]*content=")[^"]*(")/g,(_,a,b)=>a+escape(description)+b);
   html=html.replace(/(<script\b[^>]*type="application\/ld\+json"[^>]*>)([\s\S]*?)(<\/script>)/g,(_,open,json,close)=>{const data=JSON.parse(json);for(const item of data['@graph']??(Array.isArray(data)?data:[data]))if(['WebPage','Article','CollectionPage'].includes(item['@type']))item.description=description;return open+JSON.stringify(data).replaceAll('<','\\u003c')+close;});
  }
  if(route===`/${slug}/`){const key=escape(config.keyword);assert.equal((html.match(/<h1(?:\s|>)/g)||[]).length,1);html=html.replace(/<title>[\s\S]*?<\/title>/,`<title>${key}</title>`).replace(/(<h1\b[^>]*>)[\s\S]*?(<\/h1>)/,(_,a,b)=>a+key+b).replace(/(<meta\b[^>]*(?:property="og:title"|name="twitter:title")[^>]*content=")[^"]*(")/g,(_,a,b)=>a+key+b);}
  html=html.replace(/<a\b([^>]*\bhref="(?:https:\/\/www\.playbox\.com\/\?ref=zanderzou|https:\/\/spicy-box\.com\/\?utm_ref=c546b6e92223b411)"[^>]*)>[\s\S]*?<\/a>/g,(_,a)=>`<a${a.replace(/\srel="[^"]*"/g,'')} rel="sponsored nofollow noopener noreferrer">${promotions[slug]} ↗</a>`);
  // This scope is deliberately limited to translated HTML; English styles are untouched.
  html=html.replace('</head>','<style data-localized-release-fixes>#main :is(h1,h2,h3,p,a,li,td,th){overflow-wrap:anywhere;hyphens:auto}main :is(article,section,div,a){min-width:0}#analytics-settings{max-width:100%;white-space:normal;overflow-wrap:anywhere}@media(max-width:640px){.locale-comparisons{grid-template-columns:minmax(0,1fr)!important}.locale-comparisons>a{min-width:0}}</style></head>');
  const title=html.match(/<title>([\s\S]*?)<\/title>/)?.[1],desc=html.match(/<meta[^>]*name="description"[^>]*content="([^"]*)"/)?.[1];
  for(const [name,value]of [['twitter:title',title],['twitter:description',desc]])if(!html.includes(`name="${name}"`))html=html.replace('</head>',`<meta name="${name}" content="${value}"></head>`);
 }
 // The six newly opened sites previously had no complete public language menu.
 if(config.addLanguageFooter&&!englishEditorialPaths.has(english)){const lang=translated?locales.find(([code])=>code===slug)[1]:'en';html=html.replace('</footer>',`<details data-release-language-menu style="padding:12px 20px;max-width:100%;overflow-wrap:anywhere"><summary>${nativeLanguage[lang]}</summary><div style="display:flex;flex-wrap:wrap;gap:8px 16px;padding-block:8px">${alternates.map(row=>`<a href="${row.url}" lang="${row.lang}"${row.url===origin+route?' aria-current="page"':''}>${row.label}</a>`).join('')}</div></details></footer>`);}
 await writeFile(file,html);
}
// Publish canonical inventories, without private preview exclusions or retired routes.
const ns='xmlns="http://www.sitemaps.org/schemas/sitemap/0.9" xmlns:xhtml="http://www.w3.org/1999/xhtml"';
const xml='<?xml version="1.0" encoding="UTF-8"?><urlset '+ns+'>'+[...paths].sort().map(route=>{const english=route.replace(prefix,'')||'/';return '<url><loc>'+origin+route+'</loc>'+locales.filter(([slug])=>!englishEditorialPaths.has(english)||slug==='').map(([slug,lang])=>`<xhtml:link rel="alternate" hreflang="${lang}" href="${origin+(slug?'/'+slug:'')+english}"/>`).join('')+`<xhtml:link rel="alternate" hreflang="x-default" href="${origin+english}"/></url>`;}).join('')+'</urlset>\n';
await writeFile(path.join(out,'sitemap-0.xml'),xml);
await writeFile(path.join(out,'sitemap-index.xml'),`<?xml version="1.0" encoding="UTF-8"?><sitemapindex xmlns="http://www.sitemaps.org/schemas/sitemap/0.9"><sitemap><loc>${origin}/sitemap-0.xml</loc></sitemap></sitemapindex>\n`);
assert.ok(!/^Disallow:\s*\/$/m.test(await readFile(path.join(out,'robots.txt'),'utf8')),'Production crawl blocked');
console.log(`${config.domain}: finalized 120 indexable routes, reciprocal hreflang and full sitemap; English content retained.`);
