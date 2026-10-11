// Source-owned release checks for public home and blog editions.
// Keep text and scripts byte-for-byte except for the specific elements below.
import {readFile,writeFile,readdir,rm} from 'node:fs/promises';
import path from 'node:path';
import assert from 'node:assert/strict';
import {parse,walkSync} from 'ultrahtml';
const languages=['ja','ko','zh-hant','es','pt-br','ru','de','fr','ar'];
const info=['about','contact','editorial-policy','privacy','terms'];
export const calls={
 ja:['今すぐ始める','さっそく試す','もっと見てみる'],ko:['지금 시작하기','바로 둘러보기','직접 살펴보기'],
 'zh-hant':['立即開始','開始探索','立即體驗'],es:['Empieza ahora','Descúbrelo','Pruébalo ahora'],
 'pt-br':['Comece agora','Explore agora','Experimente agora'],ru:['Начать сейчас','Попробовать','Узнать больше'],
 de:['Jetzt starten','Jetzt entdecken','Jetzt ausprobieren'],fr:['Commencer','Découvrir','Essayer maintenant'],ar:['ابدأ الآن','اكتشف المزيد','جرّب الآن']
};
const ancestors=n=>{const a=[];while(n?.parent){n=n.parent;a.push(n)}return a};
const cls=n=>n.attributes?.class??'';
const descendants=n=>{const a=[];walkSync(n,x=>{if(x.type===1)a.push(x)});return a};
const promo=n=>n.name==='a'&&/^https:\/\/(?:www\.playbox\.com\/\?ref=zanderzou|spicy-box\.com\/\?utm_ref=c546b6e92223b411)$/.test(n.attributes.href??'');
const escape=s=>s.replaceAll('&','&amp;').replaceAll('"','&quot;').replaceAll('<','&lt;');
async function files(dir){let a=[];for(const e of await readdir(dir,{withFileTypes:true})){if(e.isDirectory())a.push(...await files(path.join(dir,e.name)));else a.push(path.join(dir,e.name))}return a}
export async function applyLocalizedExperience(out,config){
 assert.notEqual(config.domain,'spicybox.fun');
 const root=path.resolve(out);
 for(const lang of languages)for(const page of info){const dir=path.resolve(root,lang,page);assert.ok(dir.startsWith(root+path.sep));await rm(dir,{recursive:true,force:true});}
 const redirectFile=path.join(root,'_redirects');let redirects='';try{redirects=await readFile(redirectFile,'utf8')}catch{}
 redirects=redirects.split(/\r?\n/).filter(s=>!/^\/(?:ja|ko|zh-hant|es|pt-br|ru|de|fr|ar)\/(?:about|contact|editorial-policy|privacy|terms)(?:\/|\s)/.test(s)).join('\n').trim();
 for(const lang of languages)for(const page of info)redirects+=`\n/${lang}/${page} /${page}/ 301\n/${lang}/${page}/ /${page}/ 301\n/${lang}/${page}/index.html /${page}/ 301`;
 const redirectLines=redirects.trim().split(/\r?\n/).filter(Boolean),dynamic=line=>/[:*]/.test(line.split(/\s+/)[0]);
 // Pages requires static entries before dynamic patterns; otherwise later entries
 // can be consumed by the lower dynamic-rule limit during upload.
 await writeFile(redirectFile,[...redirectLines.filter(line=>!dynamic(line)),...redirectLines.filter(dynamic)].join('\n')+'\n');
 const choice=[...config.domain].reduce((n,c)=>n+c.charCodeAt(0),0)%3;
 const pageFiles=(await files(root)).filter(f=>f.endsWith(path.sep+'index.html'));
 const pageRoutes=new Set(pageFiles.map(f=>'/'+path.relative(root,f).replaceAll(path.sep,'/').replace(/index\.html$/,'')));
 for(const file of pageFiles){
  const route='/'+path.relative(root,file).replaceAll(path.sep,'/').replace(/index\.html$/,'');
  const lang=route.split('/')[1],translated=languages.includes(lang),home=translated&&route===`/${lang}/`;
  let html=await readFile(file,'utf8');html=html.replace(/<style data-localized-experience>[\s\S]*?<\/style>/g,'').replace(/ data-locale-edition="[^"]*"/g,'');const doc=parse(html),nodes=descendants(doc),edits=[];
  const updateOpen=(node,attributes)=>{let open=html.slice(node.loc[0].start,node.loc[0].end);for(const [name,value] of Object.entries(attributes)){const rx=new RegExp(`\\s${name}="[^"]*"`);open=rx.test(open)?open.replace(rx,` ${name}="${escape(value)}"`):open.replace(/>$/,` ${name}="${escape(value)}">`)}edits.push({start:node.loc[0].start,end:node.loc[0].end,value:open})};
  const remove=node=>edits.push({start:node.loc[0].start,end:node.loc[1].end,value:''});
  let hero=null;
  if(home){const h1=nodes.find(n=>n.name==='h1');assert.ok(h1,route+' needs a heading');hero=ancestors(h1).find(n=>['section','header'].includes(n.name)&&/(?:^|[ -])hero(?:[ -]|$)/.test(cls(n)))??ancestors(h1).find(n=>/candy-home|locale-home|home-page/.test(cls(n)))??ancestors(h1).find(n=>n.name==='article'||n.name==='section');assert.ok(hero,route+' needs a hero');
   const children=descendants(hero),copy=ancestors(h1).find(n=>/hero-(?:copy|content|inner|text)|hero-text/.test(cls(n))),art=children.find(n=>n.name==='img'&&/hero-image/.test(cls(n)));
   const background=!!(copy&&art&&children.includes(copy));
   updateOpen(hero,{'data-locale-hero':'','data-hero-kind':background?'portrait':'editorial'});
   if(background){updateOpen(copy,{'data-hero-copy':''});updateOpen(art,{'data-hero-artwork':''});}
  }
  const heroPromos=hero?descendants(hero).filter(promo):[];
  const extra=new Set(heroPromos.slice(1));
  if(hero&&!heroPromos.length){const heading=descendants(hero).find(n=>n.name==='h1'),lead=heading.parent.children.find(n=>n.name==='p')??heading;
   edits.push({start:lead.loc[1].end,end:lead.loc[1].end,value:`<p class="localized-primary-action"><a href="${config.domain==='playboxai.fun'?'https://www.playbox.com/?ref=zanderzou':'https://spicy-box.com/?utm_ref=c546b6e92223b411'}" target="_blank" rel="sponsored nofollow noopener noreferrer">${escape(calls[lang][choice])} <span aria-hidden="true">↗</span></a></p>`});
  }
  for(const node of nodes){if(extra.has(node)){remove(node);continue}
   if(translated&&promo(node)){
    // Preserve classes, destinations, icons and tracking attributes.
    const text=calls[lang][choice];
    const icon=(node.children??[]).find(n=>n.name==='svg');
    const iconMarkup=icon?html.slice(icon.loc[0].start,icon.loc[1].end):' <span aria-hidden="true">↗</span>';
    edits.push({start:node.loc[0].end,end:node.loc[1].start,value:escape(text)+' '+iconMarkup});
   }
   for(const name of ['href','value']){const value=node.attributes[name];if(!value)continue;
    let u;try{u=new URL(value,'https://'+config.domain)}catch{continue}if(u.hostname!==config.domain)continue;
    const m=u.pathname.match(/^\/(ja|ko|zh-hant|es|pt-br|ru|de|fr|ar)\/(about|contact|editorial-policy|privacy|terms)(?:\/index\.html|\/)?$/);
    if(m){const isLanguage=node.name==='option'||node.attributes.lang||ancestors(node).some(n=>/language|locale-switch/.test(cls(n))||n.attributes?.['data-release-language-menu']!==undefined);const next=isLanguage?`/${m[1]}/`:`/${m[2]}/`;updateOpen(node,{[name]:next+u.search+u.hash});}
    else if(/^\/(?:ja|ko|zh-hant|es|pt-br|ru|de|fr|ar)\//.test(u.pathname)&&!pageRoutes.has(u.pathname)&&(node.name==='option'||node.attributes.lang||ancestors(node).some(n=>/language|locale-switch/.test(cls(n))))){const code=u.pathname.split('/')[1];updateOpen(node,{[name]:`/${code}/${u.pathname.includes('/blog/')?'blog/':''}`});}
   }
   if(translated&&/promotion-disclosure/.test(cls(node))&&hero&&ancestors(node).includes(hero))remove(node);
  }
  edits.sort((a,b)=>b.start-a.start||b.end-a.end);let last=Infinity;
  for(const edit of edits){assert.ok(edit.end<=last,`Overlapping page repairs: ${route}`);html=html.slice(0,edit.start)+edit.value+html.slice(edit.end);last=edit.start;}
  if(translated){html=html.replace(/<html\b[^>]*>/,tag=>tag.replace(/\sdir="[^"]*"/,'').replace(/>$/,` dir="${lang==='ar'?'rtl':'ltr'}" data-locale-edition="${config.domain}">`));html=html.replace('</head>',`<style data-localized-experience>${await readFile(new URL('./localized-experience.css',import.meta.url),'utf8')}</style></head>`);}
  await writeFile(file,html);
 }
}
