import test from 'node:test';
import assert from 'node:assert/strict';
import { validateHealth } from './health.mjs';
const sources = { agentproof: 'a'.repeat(40), opstruth: 'b'.repeat(40), donestate: 'c'.repeat(40) };
const workflow = 'd'.repeat(40);
const fixtures = {
  approval: { service: 'agentproof-release-canary', role: 'approval', serviceSourceCommit: sources.agentproof },
  receipt: { service: 'agentproof-release-canary', role: 'signing', serviceSourceCommit: sources.agentproof },
  opstruth: { service: 'opstruth-release-verifier', readOnly: true, serviceSourceCommit: sources.opstruth },
  donestate: { service: 'donestate-isolated-release-controller', sourceCommit: sources.donestate },
};
for (const [role, values] of Object.entries(fixtures)) {
  test(role + ': service build and permitted workflow must independently match', () => {
    const h = { ...values, enabled: true, trustedWorkflowCommit: workflow };
    validateHealth(role, h, workflow, sources);
    assert.throws(() => validateHealth(role, { ...h, trustedWorkflowCommit: sources.agentproof }, workflow, sources));
    const field = role === 'donestate' ? 'sourceCommit' : 'serviceSourceCommit';
    assert.throws(() => validateHealth(role, { ...h, [field]: workflow }, workflow, sources));
    assert.throws(() => validateHealth(role, { ...h, [field]: null }, workflow, sources));
    assert.throws(() => validateHealth(role, { ...h, enabled: false }, workflow, sources));
    assert.throws(() => validateHealth(role, { ...h, service: 'foreign' }, workflow, sources));
  });
}
test('matching revisions cannot excuse a mutating verifier identity', () => {
  assert.throws(() => validateHealth('opstruth', { ...fixtures.opstruth, enabled: true,
    trustedWorkflowCommit: workflow, readOnly: false }, workflow, sources));
});
