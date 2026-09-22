import {readFileSync,writeFileSync,readdirSync,existsSync} from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const siteSource=readFileSync(path.join(root,'src/data/site.ts'),'utf8');
const value=(key)=>{const m=siteSource.match(new RegExp('(?:"'+key+'"|\\b'+key+')\\s*:\\s*("(?:[^"\\\\]|\\\\.)*")'));return m?JSON.parse(m[1]):null};
const name=value('name'),url=value('url'),description=value('description');
if(!name||!url||!description||!url.startsWith('https://'))throw Error('Missing site metadata');
const origin=new URL(url).origin;
const pages=path.join(root,'src/pages');
const blog=path.join(root,'src/content/blog');
const articles=readdirSync(blog).filter(f=>f.endsWith('.md')).sort().map(f=>{
 const source=readFileSync(path.join(blog,f),'utf8');
 const match=source.match(/^title:\s*(.+)$/m);if(!match)throw Error('Missing title: '+f);
 let title=match[1].trim();if(title.startsWith('"'))title=JSON.parse(title);else if(title.startsWith("'"))title=title.slice(1,-1).replaceAll("''","'");
 return {title,slug:f.slice(0,-3)};
});
const label=s=>s.replace(/[\[\]]/g,'');
const links=[['Homepage','/','Overview and practical decision guidance.'],['Blog and comparisons','/blog/','Browse the editorial article collection.']];
const optional=[['About','about'],['Editorial policy','editorial-policy'],['Contact','contact'],['Privacy policy','privacy'],['Terms','terms']].filter(([,slug])=>existsSync(path.join(pages,slug+'.astro'))||existsSync(path.join(pages,slug,'index.astro')));
const text=[`# ${name}`,'',`> ${description}`,'',`Canonical publication: ${origin}/`,'','This is an independent editorial publication, not the official provider. Articles distinguish published provider information from suggested evaluation methods. Examples and proposed tests are not measured benchmark results. Check dated sources and live provider terms for changing features and prices.','',
 '## Main pages','',...links.map(([title,route,note])=>`- [${title}](${origin}${route}): ${note}`),'',
 '## Comparisons','',...articles.map(a=>`- [${label(a.title)}](${origin}/blog/${a.slug}/)`),'',
 '## Publication information','',...optional.map(([title,slug])=>`- [${title}](${origin}/${slug}/)`),'',
 '## Optional','',`- [XML sitemap](${origin}/sitemap-index.xml): Canonical page inventory.`,`- [RSS feed](${origin}/rss.xml): Published article updates.`,`- [Robots policy](${origin}/robots.txt): Crawler access directives.`,''].join('\n');
const destination=path.join(root,'public/llms.txt');
if(process.argv.includes('--check')){
 if(!existsSync(destination)||readFileSync(destination,'utf8')!==text)throw Error('llms.txt is missing or stale; run npm run generate:llms');
 const out=existsSync(path.join(root,'dist/client/index.html'))?path.join(root,'dist/client'):path.join(root,'dist');
 if(!existsSync(path.join(out,'llms.txt'))||readFileSync(path.join(out,'llms.txt'),'utf8')!==text)throw Error('Build does not contain current llms.txt');
 for(const match of text.matchAll(/\]\((https:\/\/[^)]+)\)/g)){
  const link=new URL(match[1]);if(link.origin!==origin)throw Error('Unexpected external link');
  const route=decodeURIComponent(link.pathname);const file=path.join(out,route.endsWith('/')?route+'index.html':route);
  if(!existsSync(file))throw Error('Broken llms.txt link: '+link.href);
 }
 console.log(`${new URL(origin).hostname}: llms.txt current, ${articles.length} article links verified`);
}else{writeFileSync(destination,text);console.log(`Generated llms.txt for ${name}`);}
