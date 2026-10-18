import test from 'node:test';
import assert from 'node:assert/strict';
import { resumeUnexecuted, readExistingAuthorisation } from './recovery.mjs';
const predecessor={githubRunId:'100',workflowSha:'a'.repeat(40),runId:'1'.repeat(36),transactionId:'2'.repeat(36)};
test('recovery reserves inside publisher scope, preserves predecessor, never invokes execution',async()=>{
  const calls=[],saved=[],subject={releaseId:416342082};
  const run={status:'AUTHORISED',runId:predecessor.runId,transactionId:predecessor.transactionId,
    githubRunId:'101',recoveryAuthorisation:{signed:true},authorisationHistory:[{githubRunId:'100'}]};
  const successful=async(role,path,body,options)=>{
    calls.push({role,path,options});
    if(path==='/v1/prepare') {assert.equal(role,'approval');assert.deepEqual(options,{publisher:true});
      return {state:'reserved',request:{...body.seed,approval:{}},reservation:{signed:true}};}
    if(path==='/v1/activate'){assert.equal(role,'approval');assert.deepEqual(options,{publisher:true});return {state:'reserved',recoveryAuthorisationDigest:'a'.repeat(64)};}
    assert.equal(role,'donestate');assert.equal(path,'/v1/recover');assert.equal(options,undefined);
    assert.equal(body.runId,predecessor.runId);assert.equal(body.previousGithubRunId,'100');return run;
  };
  assert.deepEqual(await resumeUnexecuted({predecessor,subject,githubRunId:'101',successful,save:async(name)=>saved.push(name)}),run);
  assert.deepEqual(calls.map(x=>x.path),['/v1/prepare','/v1/recover','/v1/recover','/v1/activate','/v1/activate']);
  assert.deepEqual(saved,['recovery-reservation','recovery-duplicate','recovery-activation']);
});
test('attempted, missing or wrong-seed reservation stops before DoneState recovery',async()=>{
  for(const mode of ['attempted','missing','wrong']){
    let count=0;
    await assert.rejects(resumeUnexecuted({predecessor,subject:{releaseId:416342082},githubRunId:'101',
      successful:async(role,path,{seed})=>{count++;assert.equal(path,'/v1/prepare');
        return {state:mode==='attempted'?'attempted':'reserved',reservation:mode==='missing'?null:{},
          request:{...seed,transactionId:mode==='wrong'?'foreign':seed.transactionId,approval:{}}};},save:async()=>{}}));
    assert.equal(count,1);
  }
});

test('reruns inspect durable authority without issuing or activating a new grant',async()=>{
  for(const response of [
    {status:409,body:{error:'release_already_claimed'}},
    {status:200,body:{githubRunId:'101',recoveryAuthorisation:null}},
    {status:200,body:{githubRunId:'100',recoveryAuthorisation:{signed:true}}}
  ]) {
    const paths=[],saved=[];
    await assert.rejects(readExistingAuthorisation({githubRunId:'101',
      call:async(role,path,body)=>{assert.equal(role,'donestate');assert.deepEqual(body,{});
        paths.push(path);return response;},save:async(name)=>saved.push(name)}),/BLOCKED_REAUTHORISATION/);
    assert.deepEqual(paths,['/v1/status']);assert(saved.includes('recovery-blocked'));
  }
  const run={githubRunId:'101',recoveryAuthorisation:{signed:true}};
  const result=await readExistingAuthorisation({githubRunId:'101',
    call:async(role,path)=>{assert.equal(path,'/v1/status');return{status:200,body:run};},save:async()=>{}});
  assert.deepEqual(result,run);
});
