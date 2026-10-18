import assert from 'node:assert/strict';
export async function resumeUnexecuted({predecessor,subject,githubRunId,successful,save}) {
  assert.match(githubRunId,/^[1-9]\d+$/);assert.notEqual(githubRunId,predecessor.githubRunId);
  assert.match(predecessor.workflowSha,/^[a-f0-9]{40}$/);
  assert.match(predecessor.runId,/^[a-f0-9-]{36}$/);
  assert.match(predecessor.transactionId,/^[a-f0-9-]{36}$/);
  const seed={stateDirectory:'/tmp/agentproof-release-canary-'+githubRunId,
    transactionId:predecessor.transactionId,nonce:'release-canary:'+githubRunId,
    idempotencyKey:'release-canary:'+githubRunId,subject};
  const prepared=await successful('approval','/v1/prepare',{seed},{publisher:true});
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
  assert(run.recoveryAuthorisation);
  const activation={request:prepared.request,recoveryAuthorisation:run.recoveryAuthorisation};
  const active=await successful('approval','/v1/activate',activation,{publisher:true});
  assert.equal(active.state,'reserved');assert.match(active.recoveryAuthorisationDigest,/^[a-f0-9]{64}$/);
  assert.deepEqual(await successful('approval','/v1/activate',activation,{publisher:true}),active);
  await save('recovery-activation',active);
  return run;
}

// A rerun may read existing authority; it cannot mint/activate a grant for
// another producing attempt or spend an unexecuted first-attempt grant.
export async function readExistingAuthorisation({githubRunId,call,save}) {
  const observed=await call('donestate','/v1/status',{});
  await save('recovery-authorisation-readback',observed);
  if ([403,409].includes(observed.status) ||
      (observed.status===200 && (observed.body.githubRunId!==githubRunId ||
        !observed.body.recoveryAuthorisation))) {
    await save('recovery-blocked',{state:'BLOCKED_REAUTHORISATION',
      reason:'first_attempt_authorisation_incomplete',githubRunId,publicationRequests:0});
    throw Error('BLOCKED_REAUTHORISATION: incomplete original recovery requires separately reviewed authority');
  }
  assert.equal(observed.status,200,'existing authority unavailable: no mutation permitted');
  return observed.body;
}
