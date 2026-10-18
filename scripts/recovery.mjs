import assert from 'node:assert/strict';

export async function readServiceResponse(response) {
  try {
    const raw=await response.text();
    assert(raw.length<=300000,'oversized service response');
    return {status:response.status,body:JSON.parse(raw)};
  } catch (error) {
    // Intermediary 5xx bodies need not be JSON. Preserve status for the
    // preparation-only retry policy without retaining an untrusted error body.
    error.status=response.status;
    throw error;
  }
}


// Retry only idempotent preparation operations within the current attempt.
// Execute is deliberately absent from this allowlist.
export async function retryPreparation(successful, save, role, path, body, options) {
  assert(['approval:/v1/prepare','donestate:/v1/recover','approval:/v1/activate'].includes(role+':'+path));
  for (let attempt=1; attempt<=3; attempt++) {
    try { return await successful(role,path,body,options); }
    catch (error) {
      const transient = error.status >= 500 ||
        ['TypeError','AbortError','TimeoutError'].includes(error.name);
      if (!transient || attempt===3) throw error;
      await save('retry-'+path.slice(4)+'-'+attempt, {operation:path,attempt,
        status:error.status ?? null,reason:error.name});
    }
  }
}

export async function resumeUnexecuted({predecessor,subject,githubRunId,successful,save}) {
  assert.match(githubRunId,/^[1-9]\d+$/);assert.notEqual(githubRunId,predecessor.githubRunId);
  assert.match(predecessor.workflowSha,/^[a-f0-9]{40}$/);
  assert.match(predecessor.runId,/^[a-f0-9-]{36}$/);
  assert.match(predecessor.transactionId,/^[a-f0-9-]{36}$/);
  const seed={stateDirectory:'/tmp/agentproof-release-canary-'+githubRunId,
    transactionId:predecessor.transactionId,nonce:'release-canary:'+githubRunId,
    idempotencyKey:'release-canary:'+githubRunId,subject};
  const prepare=(role,path,body,options)=>retryPreparation(successful,save,role,path,body,options);
  const prepared=await prepare('approval','/v1/prepare',{seed},{publisher:true});
  assert.equal(prepared.state,'reserved');assert(prepared.reservation);
  assert.deepEqual({...prepared.request,approval:undefined},{...seed,approval:undefined});
  await save('recovery-reservation',prepared);
  const body={runId:predecessor.runId,previousGithubRunId:predecessor.githubRunId,
    request:prepared.request,reservation:prepared.reservation};
  const run=await prepare('donestate','/v1/recover',body);
  assert.equal(run.status,'AUTHORISED');assert.equal(run.runId,predecessor.runId);
  assert.equal(run.transactionId,predecessor.transactionId);assert.equal(run.githubRunId,githubRunId);
  assert.equal(run.authorisationHistory.length,1);
  assert.equal(run.authorisationHistory[0].githubRunId,predecessor.githubRunId);
  assert(run.recoveryAuthorisation);
  const activation={request:prepared.request,recoveryAuthorisation:run.recoveryAuthorisation};
  const active=await prepare('approval','/v1/activate',activation,{publisher:true});
  assert.equal(active.state,'reserved');assert.match(active.recoveryAuthorisationDigest,/^[a-f0-9]{64}$/);
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
