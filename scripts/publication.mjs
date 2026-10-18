import assert from 'node:assert/strict';
export async function reconcilePublication({ attempt, request, intent, invoke, save,
  wait = ms => new Promise(resolve => setTimeout(resolve, ms)) }) {
  assert(Number.isInteger(attempt) && attempt >= 1 && attempt <= 9999);
  if (attempt === 1) {
    await save('publication-intent', { ...intent, authorisedMutationRequests: 1, at: new Date().toISOString() });
    let response;
    try { response = await invoke('/v1/execute', { request }); }
    catch { response = { state: 'AMBIGUOUS_EFFECT', responseReceived: false }; }
    await save('execution-response', response);
  } else {
    await save('recovery-only', { githubRunAttempt: attempt, publicationRequests: 0 });
  }
  // No execution response, successful or ambiguous, authorises a second write.
  // Settlement deliberately uses only the read-only reconciliation result.
  let reconciled;
  for (let n = 0; n < 4; n++) {
    const result = await invoke('/v1/reconcile', { request });
    await save('reconciliation-' + n, result);
    assert.equal(result.status, 200, 'read-only reconciliation refused');
    reconciled = result.body;
    if (reconciled.state === 'reserved') {
      await save('recovery-blocked', { state: 'BLOCKED_REAUTHORISATION',
        reason: 'reservation_unattempted', githubRunAttempt: attempt,
        additionalPublicationRequests: 0, ...intent });
      throw Error('BLOCKED_REAUTHORISATION: unattempted reservation requires separately reviewed authority; no publication retry');
    }
    if (reconciled.state === 'verified') break;
    await wait(2000);
  }
  assert.equal(reconciled.state, 'verified', 'ambiguous publication: no mutation retry permitted');
  assert(reconciled.completion);
  return reconciled;
}
