import { resumeUnexecuted } from './recovery.mjs';
import { validateHealth } from './health.mjs';
import { reconcilePublication } from './publication.mjs';
import assert from 'node:assert/strict';
import { createHash, createPublicKey } from 'node:crypto';
import { mkdir, readFile, writeFile, readdir } from 'node:fs/promises';
import { resolve, dirname } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const evidence = resolve(process.env.EVIDENCE_DIRECTORY || 'evidence');
const canonical = v => v === null || typeof v !== 'object' ? JSON.stringify(v) :
  Array.isArray(v) ? '[' + v.map(canonical).join(',') + ']' :
  '{' + Object.keys(v).sort().map(k => JSON.stringify(k) + ':' + canonical(v[k])).join(',') + '}';
const sha = bytes => createHash('sha256').update(bytes).digest('hex');
const trust = JSON.parse(await readFile(resolve(root, 'trust.json'), 'utf8'));
const endpoints = Object.freeze({
  approval: 'https://agentproof-release-approval.woeinvests.workers.dev',
  receipt: 'https://agentproof-release-sign.woeinvests.workers.dev',
  opstruth: 'https://opstruth-release-verify.woeinvests.workers.dev',
  donestate: 'https://donestate-release-canary.woeinvests.workers.dev',
});
function validate() {
  const s = trust.subject;
  assert.equal(s.owner, 'AyobamiH'); assert.equal(s.repository, 'agentproof-release-canary');
  assert.equal(s.ownerId, 47716486); assert.equal(s.repositoryId, 1423718326);
  assert.equal(s.releaseId, 416342082); assert.equal(s.tagName, 'v0.0.0-rc.2026101801');
  assert.equal(s.tagCommit, '1231076c12485a02fae3c38b0b850a25274985d5');
  assert.equal(s.prerelease, true); assert.equal(s.makeLatest, false);
  const pins = [];
  for (const role of ['approval', 'receipt', 'opstruth', 'provenance', 'handoff']) {
    const key = createPublicKey(trust.keys[role].publicKeyPem);
    assert.equal(key.asymmetricKeyType, 'ed25519');
    const fp = 'sha256:' + sha(key.export({ type: 'spki', format: 'der' }));
    assert.equal(fp, trust.keys[role].fingerprint); pins.push(fp);
  }
  assert.equal(new Set(pins).size, 5);
  for (const commit of Object.values(trust.sources)) assert.match(commit, /^[a-f0-9]{40}$/);
  for (const k of ['packageDigest', 'provenanceDigest']) assert.match(s[k], /^sha256:[a-f0-9]{64}$/);
  assert.equal(trust.subjectDigest, sha(canonical(s)));
}
async function save(name, data) {
  await mkdir(evidence, { recursive: true });
  await writeFile(resolve(evidence, name + '.json'), JSON.stringify(data, null, 2) + '\n', { flag: 'wx' });
}
const load = async name => JSON.parse(await readFile(resolve(evidence, name + '.json'), 'utf8'));
async function oidc(role) {
  const url = new URL(process.env.ACTIONS_ID_TOKEN_REQUEST_URL);
  assert.equal(url.protocol, 'https:'); url.searchParams.set('audience', endpoints[role]);
  const response = await fetch(url, { headers: {
    authorization: 'Bearer ' + process.env.ACTIONS_ID_TOKEN_REQUEST_TOKEN,
  }, redirect: 'error', signal: AbortSignal.timeout(15000) });
  assert.equal(response.status, 200, 'OIDC acquisition failed');
  const value = (await response.json()).value; assert.equal(typeof value, 'string'); return value;
}
async function call(role, path, body, { publisher = false, observer = false, anonymous = false, audience = role } = {}) {
  assert(!publisher || role === 'approval', 'publisher credential crossed authority boundary');
  assert(!observer || (!publisher && role === 'approval' && path === '/v1/prepare'), 'observer credential crossed read boundary');
  const headers = { 'content-type': 'application/json' };
  if (!anonymous) headers.authorization = 'Bearer ' + await oidc(audience);
  if (publisher) {
    assert(process.env.PUBLISHER_TOKEN, 'publisher credential unavailable');
    headers['x-github-token'] = process.env.PUBLISHER_TOKEN;
  }
  if (observer) {
    assert(process.env.OBSERVER_TOKEN, 'read credential unavailable');
    headers['x-github-token'] = process.env.OBSERVER_TOKEN;
  }
  const response = await fetch(endpoints[role] + path, {
    method: 'POST', headers, body: JSON.stringify(body), redirect: 'error',
    signal: AbortSignal.timeout(45000),
  });
  const raw = await response.text(); assert(raw.length <= 300000, 'oversized service response');
  return { status: response.status, body: JSON.parse(raw) };
}
async function successful(role, path, body, options) {
  const r = await call(role, path, body, options);
  assert.equal(r.status, 200, role + ' refused: ' + r.body.error); return r.body;
}
async function health() {
  const result = {};
  for (const [role, base] of Object.entries(endpoints)) {
    const r = await fetch(base + '/health', { redirect: 'error', signal: AbortSignal.timeout(15000) });
    assert.equal(r.status, 200); result[role] = await r.json();
    validateHealth(role, result[role], process.env.GITHUB_SHA, trust.sources);
  }
  await save('deployed-health', result);
}
async function authorize() {
  assert(!process.env.PUBLISHER_TOKEN, 'authorizer must not hold publisher token');
  await health();
  const denied = [];
  for (const [role, path] of [['donestate','/v1/start'],['approval','/v1/prepare'],['receipt','/v1/sign'],['opstruth','/v1/verify']]) {
    const r = await call(role, path, {}, { anonymous: true });
    assert.equal(r.status, 401); denied.push({ role, test: 'anonymous', ...r });
  }
  const cross = await call('donestate', '/v1/start', {}, { audience: 'approval' });
  assert.equal(cross.status, 401); denied.push({ role: 'donestate', test: 'wrong_audience', ...cross });
  await save('identity-denials', denied);
  const recovery = process.env.GITHUB_RUN_ATTEMPT !== '1';
  const run = recovery ? await successful('donestate', '/v1/status', {}) :
    await resumeUnexecuted({ predecessor: trust.recovery, subject: trust.subject,
      githubRunId: process.env.GITHUB_RUN_ID, successful, save });
  if (!recovery) assert.equal(run.status, 'AUTHORISED'); assert.equal(run.githubRunId, process.env.GITHUB_RUN_ID);
  assert.deepEqual(run.subject, trust.subject); assert.equal(run.subjectDigest, trust.subjectDigest);
  await save('authorised', run);
  assert.deepEqual(await successful('donestate', '/v1/start', {}), run);
  await save('authorisation-duplicate', { identical: true, runId: run.runId });
}
async function publish() {
  const run = await load('authorised'); assert.equal(run.githubRunId, process.env.GITHUB_RUN_ID);
  const seed = { stateDirectory: '/tmp/agentproof-release-canary-' + run.githubRunId,
    transactionId: run.transactionId, nonce: 'release-canary:' + run.githubRunId,
    idempotencyKey: 'release-canary:' + run.githubRunId, subject: trust.subject };
  const wrong = await call('approval', '/v1/prepare', {
    seed: { ...seed, subject: { ...seed.subject, releaseId: seed.subject.releaseId + 1 } },
  }, { publisher: true });
  assert.equal(wrong.status, 403); await save('wrong-target-denial', wrong);
  const prepared = await successful('approval', '/v1/prepare', { seed }, { publisher: true });
  if (process.env.GITHUB_RUN_ATTEMPT === '1') assert.equal(prepared.state, 'reserved');
  await save('prepared', prepared);
  const { request } = prepared;
  if (process.env.GITHUB_RUN_ATTEMPT === '1') {
    const modified = structuredClone(request); modified.approval.subjectDigest = '0'.repeat(64);
    const denied = await call('approval', '/v1/execute', { request: modified }, { publisher: true });
    assert.equal(denied.status, 403); await save('tampered-approval-denial', denied);
  }
  const reconciled = await reconcilePublication({ attempt: Number(process.env.GITHUB_RUN_ATTEMPT), request,
    intent: { runId: run.runId, transactionId: run.transactionId, subjectDigest: trust.subjectDigest },
    invoke: (path, body) => call('approval', path, body, { publisher: true }), save });
  await save('completion', reconciled.completion);
  await save('github-publication-response', reconciled.publicationResponse ?? null);
  const signed = await successful('receipt', '/v1/sign', { request, completion: reconciled.completion });
  assert.equal(signed.state, 'signed'); await save('receipt', signed.receipt);
  assert.deepEqual(await successful('receipt', '/v1/sign', { request, completion: reconciled.completion }), signed);
  await save('receipt-duplicate', { identical: true });
}
async function verify() {
  assert(!process.env.PUBLISHER_TOKEN, 'verifier must not hold publisher token');
  const run = await load('authorised'), receipt = await load('receipt');
  const { verifyReleaseReceiptV2 } = await import(pathToFileURL(resolve('vendor/agentproof/dist/release-v1-receipt.js')));
  const { classifyReleaseV1Outcome } = await import(pathToFileURL(resolve('vendor/donestate/dist/release-v1-evidence.js')));
  const { verifyReleaseV1Handoff } = await import(pathToFileURL(resolve('vendor/donestate/dist/release-v1-handoff.js')));
  const checked = verifyReleaseReceiptV2(receipt, { subject: trust.subject,
    issuer: 'agentproof.release-canary.authority.v1', authorityFingerprints: [trust.keys.approval.fingerprint],
    signerFingerprint: trust.keys.receipt.fingerprint, signerKeyId: 'agentproof.release-canary.receipts.v1' });
  assert.equal(checked.trusted, true); await save('offline-receipt-verification', checked);
  const policy = { runId: run.runId, transactionId: run.transactionId, subjectDigest: trust.subjectDigest,
    trustedApprovalFingerprint: trust.keys.approval.fingerprint,
    trustedAgentProofSignerFingerprint: trust.keys.receipt.fingerprint,
    trustedOpsTruthVerifierFingerprint: trust.keys.opstruth.fingerprint,
    trustedProvenanceSignerFingerprint: trust.keys.provenance.fingerprint };
  assert.equal(classifyReleaseV1Outcome({ policy, receipt }).status, 'AWAITING_INDEPENDENT_VERIFICATION');
  const tampered = structuredClone(receipt); tampered.payload.subject.releaseId++;
  const denial = await call('donestate', '/v1/receipt', { runId: run.runId, receipt: tampered });
  assert([403,409].includes(denial.status)); await save('tampered-receipt-denial', denial);
  let pending = await successful('donestate', '/v1/receipt', { runId: run.runId, receipt });
  if (pending.status === 'AWAITING_INDEPENDENT_VERIFICATION' && Date.parse(pending.handoff.expiresAt) <= Date.now())
    pending = await successful('donestate', '/v1/refresh', { runId: run.runId, receiptPayloadDigest: receipt.proof.payloadDigest });
  assert(['AWAITING_INDEPENDENT_VERIFICATION','VERIFIED','CONTRADICTED','UNPROVEN'].includes(pending.status));
  await save('pending', pending);
  const verificationNow = pending.decision ? Date.parse(pending.decision.observedAt) : Date.now();
  verifyReleaseV1Handoff(pending.handoff, { runId: run.runId, transactionId: run.transactionId,
    subjectDigest: trust.subjectDigest, receiptPayloadDigest: receipt.proof.payloadDigest,
    githubRunId: run.githubRunId, trustedHandoffFingerprint: trust.keys.handoff.fingerprint,
    now: verificationNow, otherRoleFingerprints: ['approval','receipt','opstruth','provenance'].map(r => trust.keys[r].fingerprint) });
  const verified = pending.decision ? { state: pending.status, signed: true, report: pending.decision } :
    await successful('opstruth', '/v1/verify', { handoff: pending.handoff, receipt,
    runId: run.runId, transactionId: run.transactionId });
  await save('independent-opstruth-response', verified);
  assert.equal(verified.state, 'VERIFIED'); assert.equal(verified.signed, true);
  const offline = classifyReleaseV1Outcome({ policy, receipt, signedOpsTruthDecision: verified.report, now: verificationNow });
  assert.equal(offline.status, 'VERIFIED'); assert.equal(offline.independentlySignedDecision, true);
  await save('offline-outcome-verification', offline);
  const altered = structuredClone(verified.report); altered.runId = '00000000-0000-0000-0000-000000000000';
  const wrong = await call('donestate', '/v1/settle', { runId: run.runId, decision: altered });
  assert([403,409].includes(wrong.status)); await save('wrong-verdict-run-denial', wrong);
  const final = await successful('donestate', '/v1/settle', { runId: run.runId, decision: verified.report });
  assert.equal(final.status, 'VERIFIED'); assert(final.audit.length >= 3); await save('terminal', final);
  assert.deepEqual(await successful('donestate', '/v1/status', {}), final);
  assert.deepEqual(await successful('donestate', '/v1/settle', { runId: run.runId, decision: verified.report }), final);
  for (let i = 0; i < final.audit.length; i++) {
    const { digest, ...entry } = final.audit[i]; assert.equal(digest, sha(canonical(entry)));
    assert.equal(entry.previousDigest, i ? final.audit[i-1].digest : null);
  }
  await save('durable-recovery', { identical: true, duplicateSettlementIdentical: true, auditChainValid: true });
}
validate();
const mode = process.argv[2];
if (mode !== 'validate') {
  assert.equal(process.env.GITHUB_REPOSITORY, 'AyobamiH/agentproof-release-canary');
  assert.equal(process.env.GITHUB_EVENT_NAME, 'workflow_dispatch');
  assert.equal(process.env.GITHUB_REF, 'refs/heads/main');
  assert.match(process.env.GITHUB_RUN_ATTEMPT, /^[1-9]\d{0,3}$/);
  assert.match(process.env.GITHUB_SHA, /^[a-f0-9]{40}$/);
  assert.match(process.env.GITHUB_RUN_ID, /^[1-9]\d+$/);
  try {
    assert(['authorize','publish','verify'].includes(mode));
    await ({ authorize, publish, verify })[mode]();
  } catch (error) {
    await save(mode + '-failure', { at: new Date().toISOString(), error: error.message }); throw error;
  } finally {
    const hashes = {};
    for (const name of (await readdir(evidence)).sort()) {
      if (name.endsWith('.json')) hashes[name] = sha(await readFile(resolve(evidence, name)));
    }
    await save(mode + '-manifest', { githubRunId: process.env.GITHUB_RUN_ID,
      workflowSha: process.env.GITHUB_SHA, sources: trust.sources, hashes });
  }
}
