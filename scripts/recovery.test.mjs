import test from 'node:test';
import assert from 'node:assert/strict';
import { resumeUnexecuted, readExistingAuthorisation, retryPreparation, readServiceResponse } from './recovery.mjs';
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
  assert.deepEqual(calls.map(x=>x.path),['/v1/prepare','/v1/recover','/v1/activate']);
  assert.deepEqual(saved,['recovery-reservation','recovery-activation']);
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


test('same-attempt lost responses retry each preparation operation without execution',async()=>{
  const predecessor={githubRunId:'100',workflowSha:'a'.repeat(40),runId:'1'.repeat(36),transactionId:'2'.repeat(36)};
  const run={status:'AUTHORISED',runId:predecessor.runId,transactionId:predecessor.transactionId,
    githubRunId:'101',recoveryAuthorisation:{signed:true},authorisationHistory:[{githubRunId:'100'}]};
  const count={}, saved=[], bodies={};
  const successful=async(role,path,body)=>{
    assert(['/v1/prepare','/v1/recover','/v1/activate'].includes(path));
    count[path]=(count[path]||0)+1;
    if(bodies[path]) assert.deepEqual(body,bodies[path]);else bodies[path]=structuredClone(body);
    // The service durably saved the response, but the caller lost it.
    if(count[path]===1)throw new TypeError('fetch failed');
    if(path==='/v1/prepare')return {state:'reserved',request:{...body.seed,approval:{}},reservation:{signed:true}};
    if(path==='/v1/recover')return run;
    return {state:'reserved',recoveryAuthorisationDigest:'a'.repeat(64)};
  };
  assert.deepEqual(await resumeUnexecuted({predecessor,subject:{releaseId:416342082},githubRunId:'101',successful,
    save:async(name)=>{assert(!saved.includes(name));saved.push(name);}}),run);
  assert.deepEqual(count,{'/v1/prepare':2,'/v1/recover':2,'/v1/activate':2});
  assert.equal(saved.filter(n=>n.startsWith('retry-')).length,3);
});
test('retries are bounded, policy denials and execute never retry',async()=>{
  let count=0;
  await assert.rejects(retryPreparation(async()=>{count++;throw Object.assign(new Error('outage'),{status:503});},
    async()=>{},'approval','/v1/prepare',{}),/outage/);assert.equal(count,3);
  count=0;
  await assert.rejects(retryPreparation(async()=>{count++;throw Object.assign(new Error('denied'),{status:403});},
    async()=>{},'donestate','/v1/recover',{}),/denied/);assert.equal(count,1);
  await assert.rejects(retryPreparation(async()=>{count++;},async()=>{},'approval','/v1/execute',{}));
  assert.equal(count,1);
});


test('plain-text and HTML 5xx preserve retry status; malformed success does not retry',async()=>{
  let calls=0;
  const result=await retryPreparation(async()=>{
    calls++;
    const response=calls===1?new Response('<html>unavailable</html>',{status:502}):
      calls===2?new Response('temporarily unavailable',{status:503}):
      new Response('{"state":"reserved"}',{status:200});
    return (await readServiceResponse(response)).body;
  },async()=>{},'approval','/v1/prepare',{});
  assert.equal(calls,3);assert.deepEqual(result,{state:'reserved'});
  calls=0;
  await assert.rejects(retryPreparation(async()=>{calls++;
    return readServiceResponse(new Response('malformed success',{status:200}));
  },async()=>{},'approval','/v1/activate',{}),SyntaxError);
  assert.equal(calls,1);
});

test('untrusted intermediary text is absent from propagated parse failures',async()=>{
  for(const status of [200,502,503]){
    await assert.rejects(readServiceResponse(new Response('UNTRUSTED_RESPONSE_SENTINEL',{status})),error=>{
      assert.equal(error.status,status);
      assert(error instanceof SyntaxError);
      assert(!error.message.includes('UNTRUSTED_RESPONSE_SENTINEL'));
      assert.equal(error.message,'malformed_service_response');
      return true;
    });
  }
});
