import assert from 'node:assert/strict';
import {readFile,writeFile,readdir,mkdir,copyFile,unlink,access} from 'node:fs/promises';
import path from 'node:path';
import {spawn} from 'node:child_process';
import {createHash} from 'node:crypto';
import {makeEditorialWorker} from './editorial-release-runtime.mjs';
const root=path.resolve(import.meta.dirname,'..');
const schedule=JSON.parse(await readFile(path.join(root,'src/data/editorialSchedule.json'),'utf8'));
const pkg=JSON.parse(await readFile(path.join(root,'package.json'),'utf8'));
const content=path.join(root,schedule.contentDirectory??'src/content/blog');
const drafts=path.join(root,'src/editorial-drafts');
const baselinePhase=schedule.baselinePhase??1;
const exists=async f=>{try{await access(f);return true}catch{return false}};
const hash=b=>createHash('sha256').update(b.toString('utf8').replace(/\r\n/g,'\n')).digest('hex');
async function walk(dir,prefix=''){const result=[];for(const e of await readdir(dir,{withFileTypes:true})){if(e.name==='.astro')continue;if(e.isDirectory())result.push(...await walk(path.join(dir,e.name),prefix+e.name+'/'));else result.push(prefix+e.name)}return result}
const runScript=(name,phase)=>new Promise((resolve,reject)=>{const win=process.platform==='win32';const p=spawn(win?'cmd.exe':'npm',win?['/d','/c','npm.cmd','run',name]:['run',name],{cwd:root,windowsHide:true,stdio:'inherit',env:{...process.env,ASTRO_TELEMETRY_DISABLED:'1',EDITORIAL_BUILD_PHASE:String(phase)}});p.on('error',reject);p.on('exit',c=>c===0?resolve():reject(Error(name+' failed ('+c+')')))});
const types={'.html':'text/html; charset=utf-8','.xml':'application/xml; charset=utf-8','.txt':'text/plain; charset=utf-8','.json':'application/json; charset=utf-8'};
const routeFor=f=>f==='index.html'?'/':f.endsWith('/index.html')?'/'+f.slice(0,-10):'/'+f;
const approved=schedule.articles.filter(a=>a.approved).sort((a,b)=>a.order-b.order);
assert.deepEqual(approved.map(a=>a.order),approved.map((_,i)=>i+1),'Approvals must be sequential');
assert.ok(approved.length>baselinePhase,'At least one future release is required');
for(const [i,a]of approved.entries()){
 assert.match(a.slug,/^[a-z0-9-]+$/);assert.equal(a.language,'en');assert.ok(Number.isFinite(Date.parse(a.releaseAt)));
 if(i)assert.ok(Date.parse(a.releaseAt)>Date.parse(approved[i-1].releaseAt),'Release dates must increase');
 const reviewedBytes=await readFile(path.join(drafts,a.slug+'.md'));
 // Preserve existing review hashes that were calculated with CRLF; only line endings may differ.
 const legacyCrlf=baselinePhase>=1&&i<3?createHash('sha256').update(reviewedBytes.toString('utf8').replace(/\r\n/g,'\n').replace(/\n/g,'\r\n')).digest('hex'):null;
 assert.ok(hash(reviewedBytes)===a.reviewedSha256||legacyCrlf===a.reviewedSha256,'Content changed since review: '+a.slug);
}
const original=new Map();
for(const a of schedule.articles){const f=path.join(content,a.slug+'.md');if(await exists(f))original.set(a.slug,await readFile(f))}
const nativeSources=new Map();
if(schedule.requiresGeography)for(const locale of ['zh','zh-Hant']){const dir=path.join(root,'src/content/blog',locale);if(await exists(dir))for(const f of await walk(dir)){const target=path.join(dir,f);nativeSources.set(target,await readFile(target))}}
const versions={},snapshots=[];let out,baseFiles,baseWorker='',baseRoutes={version:1,include:[],exclude:[]},securityHeaders={};
async function setPhase(phase){for(const a of schedule.articles){const f=path.join(content,a.slug+'.md');if(a.approved&&a.order<=phase){await mkdir(path.dirname(f),{recursive:true});await copyFile(path.join(drafts,a.slug+'.md'),f)}else if(await exists(f)){assert.ok(!original.has(a.slug),'Refusing to remove an existing future publication: '+a.slug);await unlink(f)}}}
async function rawBuild(phase){if(pkg.scripts['build:static:preflight'])await runScript('build:static:preflight',phase);else if(pkg.scripts.prebuild)await runScript('prebuild',phase);await runScript('build:static',phase);if(pkg.scripts['build:static:finalize'])await runScript('build:static:finalize',phase);out=path.join(root,await exists(path.join(root,'dist/client/index.html'))?'dist/client':'dist')}
async function snapshot(phase){await setPhase(phase);await rawBuild(phase);const files=(await walk(out)).filter(f=>!f.startsWith('private-')&&!f.startsWith('_editorial'));const records={};for(const f of files)records[f]=await readFile(path.join(out,f));const paths=[];
 if(phase===baselinePhase){baseFiles=records;baseWorker=records['_worker.js']?.toString('utf8')??'';if(records['_routes.json'])baseRoutes=JSON.parse(records['_routes.json']);const header=records['_headers']?.toString('utf8')??'';const global=header.split(/^\/\*\s*$/m).at(-1);for(const line of global.split(/\r?\n/)){const m=line.match(/^\s+([^:]+):\s*(.+)$/);if(m)securityHeaders[m[1]]=m[2]}}
 else{const mapped={};for(const [f,b]of Object.entries(records)){if(baseFiles[f]?.equals(b))continue;const route=routeFor(f);assert.ok(!/^\/(?:zh|ja|ko|zh-hant|es|pt-br|ru|de|fr|ar|it)(?:\/|$)/i.test(route),'Existing non-English output changed: '+route);if(f.startsWith('_')||f==='content-index.json'&&schedule.ignoreContentIndex)continue;if(!types[path.extname(f)]){assert.fail('Unexpected asset change: '+f)}mapped[route]={body:b.toString('utf8'),type:types[path.extname(f)],status:f==='404.html'?404:200};paths.push(route)}versions[String(phase)]=mapped}
 snapshots.push({phase,htmlPages:files.filter(f=>f.endsWith('.html')).length,changedPaths:paths});
}
let succeeded=false;
try{await snapshot(baselinePhase);for(const a of approved.filter(a=>a.order>baselinePhase))await snapshot(a.order);succeeded=true}
finally{try{for(const a of schedule.articles){const f=path.join(content,a.slug+'.md');if(original.has(a.slug))await writeFile(f,original.get(a.slug));else if(await exists(f))await unlink(f)}if(succeeded)await rawBuild(baselinePhase)}finally{for(const [f,bytes]of nativeSources)await writeFile(f,bytes)}}
const worker=makeEditorialWorker({schedule:schedule.articles,versions,originalWorker:baseWorker,securityHeaders,articlePrefix:schedule.articlePrefix??'/blog/'});
assert.ok(Buffer.byteLength(worker)<2_500_000,'Worker exceeds conservative size limit');
await writeFile(path.join(out,'_worker.js'),worker);
const includes=[...new Set([...baseRoutes.include,schedule.articlePrefix?.slice(0,-1)??'/blog',(schedule.articlePrefix??'/blog/')+'*',...Object.values(versions).flatMap(v=>Object.keys(v))])];
const compact=includes.includes('/*')?['/*']:includes.filter(p=>!p.startsWith(schedule.articlePrefix??'/blog/')||p===(schedule.articlePrefix??'/blog/')+'*');
const routes={version:1,include:compact,exclude:baseRoutes.exclude.filter(p=>p!=='/*'&&!compact.includes(p)&&!includes.some(q=>q===p||p.endsWith('*')&&q.startsWith(p.slice(0,-1))))};
assert.ok(routes.include.length+routes.exclude.length<=100,'Too many worker routes');
await writeFile(path.join(out,'_routes.json'),JSON.stringify(routes,null,2)+'\n');
await mkdir(path.join(root,'artifacts'),{recursive:true});
await writeFile(path.join(root,'artifacts/editorial-build.json'),JSON.stringify({builtAt:new Date().toISOString(),domain:schedule.domain,out:path.relative(root,out),baselinePhase,scheduled:approved.length-baselinePhase,snapshots,workerBytes:Buffer.byteLength(worker)},null,2)+'\n');
console.log(schedule.domain+': '+approved.length+' reviewed releases; source restored to phase '+baselinePhase);
