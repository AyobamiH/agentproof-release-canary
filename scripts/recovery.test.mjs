import test from 'node:test';
import assert from 'node:assert/strict';
import { resumeUnexecuted } from './recovery.mjs';
const predecessor={githubRunId:'100',workflowSha:'a'.repeat(40),runId:'1'.repeat(36),transactionId:'2'.repeat(36)};
test('recovery reserves with read credential, preserves predecessor, never invokes execution',async()=>{
  const calls=[],saved=[],subject={releaseId:416342082};
  const run={status:'AUTHORISED',runId:predecessor.runId,transactionId:predecessor.transactionId,
    githubRunId:'101',authorisationHistory:[{githubRunId:'100'}]};
  const successful=async(role,path,body,options)=>{
    calls.push({role,path,options});
    if(path==='/v1/prepare') {assert.equal(role,'approval');assert.deepEqual(options,{observer:true});
      return {state:'reserved',request:{...body.seed,approval:{}},reservation:{signed:true}};}
    assert.equal(role,'donestate');assert.equal(path,'/v1/recover');assert.equal(options,undefined);
    assert.equal(body.runId,predecessor.runId);assert.equal(body.previousGithubRunId,'100');return run;
  };
  assert.deepEqual(await resumeUnexecuted({predecessor,subject,githubRunId:'101',successful,save:async(name)=>saved.push(name)}),run);
  assert.deepEqual(calls.map(x=>x.path),['/v1/prepare','/v1/recover','/v1/recover']);
  assert.deepEqual(saved,['recovery-reservation','recovery-duplicate']);
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
