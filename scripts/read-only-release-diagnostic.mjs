import assert from 'node:assert/strict';
import {readFile,writeFile,mkdir} from 'node:fs/promises';
import {GitHubReleaseV1Provider} from '../vendor/agentproof/dist/release-v1-github.js';
const trust=JSON.parse(await readFile(new URL('../trust.json',import.meta.url),'utf8'));
assert.equal(trust.subject.releaseId,416342082);
assert.equal(trust.sources.agentproof,'d89f6d54709830ff49373ab7c2797c927ced8ac9');
const base='https://api.github.com/repos/AyobamiH/agentproof-release-canary';
const permitted=new Set([base,base+'/git/ref/tags/'+trust.subject.tagName,base+'/releases/416342082']);
const calls=[],originalFetch=globalThis.fetch;
// Enforce GET-only independently of the imported adapter; deny any other URL.
globalThis.fetch=async(url,options={})=>{
  assert.equal(options.method ?? 'GET','GET');assert(permitted.has(String(url)));
  const response=await originalFetch(url,options);
  calls.push({path:new URL(url).pathname,status:response.status,
    contentType:response.headers.get('content-type'),requestId:response.headers.get('x-github-request-id')});
  return response;
};
const evidence={at:new Date().toISOString(),source:trust.sources.agentproof,
  githubRunId:process.env.GITHUB_RUN_ID,workflowSha:process.env.GITHUB_SHA,
  permittedMethods:['GET'],publicationRequests:0,calls};
try {
  assert(process.env.READ_ONLY_GITHUB_TOKEN);
  const provider=new GitHubReleaseV1Provider(trust.subject,{getToken:async()=>process.env.READ_ONLY_GITHUB_TOKEN});
  evidence.observation=await provider.observe(trust.subject);
  evidence.status='OBSERVED';
} catch(error) {
  evidence.status='REFUSED';
  evidence.code=/^release_v1:[a-z0-9_]+$/.test(error.message)?error.message:'diagnostic_failed';
  process.exitCode=1;
} finally {
  globalThis.fetch=originalFetch;
  await mkdir('evidence',{recursive:true});
  await writeFile('evidence/read-only-release-diagnostic.json',JSON.stringify(evidence,null,2)+'\n',{flag:'wx'});
}
