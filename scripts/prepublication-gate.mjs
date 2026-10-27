// Draft shared implementation. No website is changed by importing this file.
import fs from 'node:fs';
import path from 'node:path';
import {createHash} from 'node:crypto';
const HOUR=3600000;
const sha=b=>createHash('sha256').update(b).digest('hex');
const canonical=v=>Array.isArray(v)?v.map(canonical):v&&typeof v==='object'?Object.fromEntries(Object.keys(v).sort().map(k=>[k,canonical(v[k])])):v;
export function certificateDigest(c){const copy=structuredClone(c);delete copy.certificateDigest;return sha(JSON.stringify(canonical(copy)));}
const nonempty=v=>typeof v==='string'&&v.trim().length>0;
const within=(file,root)=>{const p=path.relative(root,file);return p===''||!p.startsWith('..'+path.sep)&&p!=='..'&&!path.isAbsolute(p);};
function artifactsValid(refs,{evidenceBase,evidenceRoot}){if(!Array.isArray(refs)||!refs.length)return false;return refs.every(ref=>{try{if(!ref||!nonempty(ref.path)||path.isAbsolute(ref.path)||!/^[a-f0-9]{64}$/.test(ref.sha256??''))return false;const full=path.resolve(evidenceBase,ref.path),root=path.resolve(evidenceRoot);if(!within(full,root)||!within(fs.realpathSync(full),fs.realpathSync(root))||!['.png','.jpg','.jpeg','.webp','.svg','.json','.csv','.txt','.log','.md','.html','.pdf','.mjs','.js','.py'].includes(path.extname(full).toLowerCase()))return false;const stat=fs.lstatSync(full);return stat.isFile()&&!stat.isSymbolicLink()&&stat.size>0&&stat.size<=25*1024*1024&&sha(fs.readFileSync(full))===ref.sha256;}catch{return false}});}
export function selectGatePhase(schedule,gate,now){
 if(!gate||gate.version!==1||!Number.isFinite(now))return 0;
 let phase=0;
 for(const item of [...schedule].sort((a,b)=>a.order-b.order)){
  if(item.order!==phase+1||!item.approved||!Number.isFinite(Date.parse(item.releaseAt))||Date.parse(item.releaseAt)>now)break;
  const grandfather=(gate.grandfathered??[]).find(p=>p.slug===item.slug&&p.order===item.order&&p.releaseAt===item.releaseAt&&Number.isFinite(Date.parse(p.liveVerifiedAt)));
  if(grandfather){phase=item.order;continue;}
  const c=(gate.clearances??[]).find(p=>p.slug===item.slug&&p.order===item.order&&p.releaseAt===item.releaseAt);
  const basic=c?.reviewStandard==='portfolio-basic-quality-20261027'&&c.editorialApproved===true;
  const activation=Date.parse(c?.activationAt),facts=Date.parse(c?.factsCheckedAt);
  if(!c||c.validated!==true||c.skillVersion!=='1.5'||!/^[a-f0-9]{64}$/.test(c.certificateDigest??'')||!c.contentSha256||c.contentSha256!==gate.contentHashes?.[item.slug]||(!basic&&![1,2].includes(c.observationsCount))||!Number.isFinite(activation)||!Number.isFinite(facts)||activation<Date.parse(item.releaseAt)||Number.isFinite(Date.parse(item.notBefore))&&activation<Date.parse(item.notBefore)||facts>activation||(!basic&&activation-facts>86400000)||now<activation)break;
  phase=item.order;
 }
 return phase;
}
export function compilePrepublicationGate(schedule,config,contentHashes,buildNow=Date.now(),options={}){
 if(!config||config.version!==1||config.domain!==schedule.domain)throw Error('Missing or mismatched mandatory prepublication gate');
 const evidenceBase=path.resolve(options.evidenceBase??process.cwd()),evidenceRoot=path.resolve(options.evidenceRoot??path.join(evidenceBase,'private-editorial-evidence')),artifactOptions={evidenceBase,evidenceRoot};
 const baselinePhase=schedule.baselinePhase??1;
 const grandfathered=[];
 for(const g of config.grandfathered??[]){const a=schedule.articles.find(a=>a.order===g.order&&a.slug===g.slug);if(!a||a.releaseAt!==g.releaseAt||g.status!==200||!Number.isFinite(Date.parse(g.liveVerifiedAt))||Date.parse(g.liveVerifiedAt)<Date.parse(a.releaseAt)||Date.parse(g.liveVerifiedAt)>buildNow)throw Error('Invalid published-article grandfather proof: '+g.slug);grandfathered.push({order:g.order,slug:g.slug,releaseAt:g.releaseAt,liveVerifiedAt:g.liveVerifiedAt});}
 const orders=grandfathered.map(g=>g.order).sort((a,b)=>a-b);if(orders.some((n,i)=>n!==i+1)||orders.length<baselinePhase)throw Error('Grandfather proof must be a live-verified prefix including the original static baseline');
 const clearances=[],pending=[];
 for(const a of schedule.articles){if(grandfathered.some(g=>g.slug===a.slug))continue;const c=config.certificates?.[a.slug];const basic=c?.reviewStandard==='portfolio-basic-quality-20261027';let reason;
  if(!c)reason='missing-certificate';
  else if(c.schemaVersion!==1||c.skill?.name!=='write-tested-seo'||c.skill.version!=='1.5'||c.status!=='validated'||c.domain!==schedule.domain||c.slug!==a.slug||c.order!==a.order||c.releaseAt!==a.releaseAt)reason='identity-or-policy-mismatch';
  else if(c.contentSha256!==contentHashes[a.slug])reason='content-hash-mismatch';
  else if(c.certificateDigest!==certificateDigest(c))reason='certificate-digest-mismatch';
  else if(!Number.isFinite(Date.parse(c.activationAt))||Date.parse(c.activationAt)<Date.parse(a.releaseAt)||Number.isFinite(Date.parse(a.notBefore))&&Date.parse(c.activationAt)<Date.parse(a.notBefore))reason='invalid-activation';
  else if(!Number.isFinite(Date.parse(c.reviewedAt))||Date.parse(c.reviewedAt)>buildNow||Date.parse(c.reviewedAt)>Date.parse(c.activationAt))reason='missing-valid-independent-review-time';
  else if(!Number.isFinite(Date.parse(c.factsCheckedAt))||Date.parse(c.factsCheckedAt)>buildNow||Date.parse(c.factsCheckedAt)>Date.parse(c.activationAt)||!basic&&Date.parse(c.activationAt)-Date.parse(c.factsCheckedAt)>24*HOUR)reason='invalid-fact-review-time';
  else if(basic&&(c.editorialReview?.readable!==true||c.editorialReview?.useful!==true||c.editorialReview?.factual!==true||!['none','supported'].includes(c.editorialReview?.experienceClaims)))reason='basic-editorial-review-incomplete';
  else if(!basic&&(!Array.isArray(c.observations)||![1,2].includes(c.observations.length)||new Set(c.observations.map(o=>o.id)).size!==c.observations.length||c.observations.some(o=>o.kind!=='hands-on'||!nonempty(o.id)||!nonempty(o.task)||!o.conditions||!nonempty(o.result)||!nonempty(o.readerImpact)||!nonempty(o.limits)||!Array.isArray(o.inputs)||!o.inputs.length||!Number.isFinite(Date.parse(o.testedAt))||Date.parse(o.testedAt)>buildNow||Date.parse(o.testedAt)>Date.parse(c.reviewedAt)||!Array.isArray(o.steps)||o.steps.length<2||o.steps.some(s=>!nonempty(s))||!artifactsValid(o.evidence,artifactOptions))))reason='missing-real-relevant-observation-or-valid-artifact';
  else if(!Array.isArray(c.officialSources)||!c.officialSources.length||c.officialSources.some(s=>!/^https:\/\//.test(s.url??'')||!['content-retrieved','verified',200].includes(s.status)||!Number.isFinite(Date.parse(s.checkedAt))||Date.parse(s.checkedAt)>buildNow||!basic&&Date.parse(c.activationAt)-Date.parse(s.checkedAt)>24*HOUR||Date.parse(s.checkedAt)>Date.parse(c.activationAt)||!artifactsValid(s.evidence??(s.evidencePath?[{path:s.evidencePath,sha256:s.evidenceSha256}]:[]),artifactOptions)))reason='missing-current-official-fact-check-or-valid-artifact';
  else if(!/^[a-f0-9]{64}$/.test(c.certificateDigest??''))reason='missing-validated-evidence-digest';
  if(!reason&&!basic&&Date.parse(c.activationAt)<buildNow){const receipt=config.activationReceipts?.[a.slug];if(!receipt||receipt.domain!==schedule.domain||receipt.slug!==a.slug||receipt.contentSha256!==c.contentSha256||receipt.certificateDigest!==c.certificateDigest||receipt.releaseAt!==c.releaseAt||receipt.activationAt!==c.activationAt||!Number.isFinite(Date.parse(receipt.deployedAt))||Date.parse(receipt.deployedAt)>Date.parse(c.activationAt)||Date.parse(receipt.deployedAt)>buildNow||!Number.isFinite(Date.parse(receipt.productionVerifiedAt))||Date.parse(receipt.productionVerifiedAt)<Date.parse(c.activationAt)||Date.parse(receipt.productionVerifiedAt)>buildNow||!artifactsValid(receipt.evidence,artifactOptions))reason='missed-first-activation-needs-fresh-review-or-verified-prior-deployment';}
  // Hashes and structured fields establish traceability, not truthful experience.
  // An editor must inspect evidence before marking a certificate validated.
  if(reason){pending.push({slug:a.slug,order:a.order,reason});continue;}
  clearances.push({slug:a.slug,order:a.order,releaseAt:a.releaseAt,activationAt:c.activationAt,factsCheckedAt:c.factsCheckedAt,contentSha256:c.contentSha256,skillVersion:'1.5',observationsCount:c.observations?.length??0,certificateDigest:c.certificateDigest,validated:true,...(basic?{reviewStandard:c.reviewStandard,editorialApproved:true}:{})});
 }
 return {version:1,domain:schedule.domain,baselinePhase,grandfathered,clearances,contentHashes,pending};
}
// This function is for in-memory audit fixtures only, never production writing.
export function makeAllReadyTestGate(schedule,gate){return {...gate,grandfathered:[],clearances:schedule.map(a=>{const effective=Math.max(Date.parse(a.releaseAt),Date.parse(a.notBefore)||0);return{slug:a.slug,order:a.order,releaseAt:a.releaseAt,activationAt:new Date(effective).toISOString(),factsCheckedAt:new Date(effective-3600000).toISOString(),contentSha256:gate.contentHashes[a.slug],skillVersion:'1.5',observationsCount:1,certificateDigest:'0'.repeat(64),validated:true}})};}
