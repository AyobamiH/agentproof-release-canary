import assert from 'node:assert/strict';
export async function resumeUnexecuted({predecessor,subject,githubRunId,successful,save}) {
  assert.match(githubRunId,/^[1-9]\d+$/);assert.notEqual(githubRunId,predecessor.githubRunId);
  assert.match(predecessor.workflowSha,/^[a-f0-9]{40}$/);
  assert.match(predecessor.runId,/^[a-f0-9-]{36}$/);
  assert.match(predecessor.transactionId,/^[a-f0-9-]{36}$/);
  const seed={stateDirectory:'/tmp/agentproof-release-canary-'+githubRunId,
    transactionId:predecessor.transactionId,nonce:'release-canary:'+githubRunId,
    idempotencyKey:'release-canary:'+githubRunId,subject};
  const prepared=await successful('approval','/v1/prepare',{seed},{observer:true});
  assert.equal(prepared.state,'reserved');assert(prepared.reservation);
  assert.deepEqual({...prepared.request,approval:undefined},{...seed,approval:undefined});
  await save('recovery-reservation',prepared);
  const body={runId:predecessor.runId,previousGithubRunId:predecessor.githubRunId,
    request:prepared.request,reservation:prepared.reservation};
  const run=await successful('donestate','/v1/recover',body);
  assert.equal(run.status,'AUTHORISED');assert.equal(run.runId,predecessor.runId);
  assert.equal(run.transactionId,predecessor.transactionId);assert.equal(run.githubRunId,githubRunId);
  assert.equal(run.authorisationHistory.length,1);
  assert.equal(run.authorisationHistory[0].githubRunId,predecessor.githubRunId);
  assert.deepEqual(await successful('donestate','/v1/recover',body),run);
  await save('recovery-duplicate',{identical:true});
  return run;
}
