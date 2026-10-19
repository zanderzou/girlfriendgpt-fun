export function selectRelease(schedule, now) {
  return schedule.filter(s => s.approved && Date.parse(s.releaseAt) <= now).sort((a,b) => a.order-b.order).at(-1)?.order ?? 0;
}

export function makeEditorialWorker({schedule, versions, originalWorker='', securityHeaders={}, articlePrefix='/blog/'}) {
  if (originalWorker && !/export\s+default\s+/.test(originalWorker)) throw Error('Unsupported baseline worker export');
  const baseline=originalWorker ? originalWorker.replace(/export\s+default\s+/, 'const baselineWorker = ') : 'const baselineWorker = {fetch(request,env){return env.ASSETS.fetch(request)}};';
  return `${baseline}
const releaseSchedule=${JSON.stringify(schedule)};
const releaseVersions=${JSON.stringify(versions)};
const releaseHeaders=${JSON.stringify(securityHeaders)};
const articlePrefix=${JSON.stringify(articlePrefix)};
const changingPaths=new Set(Object.values(releaseVersions).flatMap(v=>Object.keys(v)));
function releasePath(raw){
 let p;try{p=decodeURIComponent(raw)}catch{return null}
 if(p.includes('\\\\')||p.includes('\\0')||/%[a-f0-9]{2}/i.test(p)||p.includes('//'))return null;
 if(p.endsWith('/index.html'))p=p.slice(0,-10);
 if(p==='/index.html')p='/';
 if(p.startsWith(articlePrefix)&&!p.endsWith('/')&&!/\\.[^/]+$/.test(p))p+='/';
 return p;
}
function releaseMissing(request){return new Response(request.method==='HEAD'?null:'Not found\\n',{status:404,headers:{...releaseHeaders,'Content-Type':'text/plain; charset=utf-8','Cache-Control':'no-store','X-Robots-Tag':'noindex'}})}
export default {async fetch(request,env,ctx){
 const base=await baselineWorker.fetch(request,env,ctx);
 // Geographic, access and host restrictions run before any scheduled content.
 if(!['GET','HEAD'].includes(request.method)||[401,403,410,429,451,503].includes(base.status))return base;
 const url=new URL(request.url), p=releasePath(url.pathname);
 if(p===null)return releaseMissing(request);
 const now=Date.now(),phase=releaseSchedule.filter(s=>s.approved&&Date.parse(s.releaseAt)<=now).sort((a,b)=>a.order-b.order).at(-1)?.order??0;
 const item=releaseSchedule.find(s=>articlePrefix+s.slug+'/'===p);
 if(item&&(!item.approved||Date.parse(item.releaseAt)>now))return releaseMissing(request);
 // Keep baseline host canonicalization; static directory aliases may be served directly.
 if(base.status>=300&&base.status<400){const to=base.headers.get('Location');if(to&&new URL(to,url).hostname!==url.hostname)return base;}
 const entry=releaseVersions[String(phase)]?.[p];
 if(entry){
  const headers=new Headers(releaseHeaders);
  for(const [k,v]of base.headers)if(!(k.toLowerCase()==='x-robots-tag'&&base.status===404&&!url.hostname.endsWith('.pages.dev'))&&!['content-type','content-length','content-encoding','etag','last-modified','location','cache-control'].includes(k.toLowerCase()))headers.set(k,v);
  headers.set('Content-Type',entry.type);headers.set('Cache-Control','no-store');headers.set('X-Editorial-Release',String(phase));
  return new Response(request.method==='HEAD'?null:entry.body,{status:entry.status??200,headers});
 }
 if(changingPaths.has(p)||item){const response=new Response(request.method==='HEAD'?null:base.body,base);response.headers.set('Cache-Control','no-store');return response;}
 return base;
}};
`;
}
