import assert from 'node:assert/strict';
const sourceRoles = { approval: 'agentproof', receipt: 'agentproof', opstruth: 'opstruth', donestate: 'donestate' };
const identities = { approval: 'agentproof-release-canary', receipt: 'agentproof-release-canary',
  opstruth: 'opstruth-release-verifier', donestate: 'donestate-isolated-release-controller' };
export function validateHealth(role, health, workflowSha, sources) {
  assert(Object.hasOwn(sourceRoles, role));
  assert.equal(health.enabled, true);
  assert.equal(health.service, identities[role]);
  assert.equal(health.trustedWorkflowCommit, workflowSha, 'caller workflow revision mismatch');
  assert.equal(role === 'donestate' ? health.sourceCommit : health.serviceSourceCommit,
    sources[sourceRoles[role]], 'deployed service revision mismatch');
  if (role === 'approval' || role === 'receipt')
    assert.equal(health.role, role === 'approval' ? 'approval' : 'signing');
  if (role === 'opstruth') assert.equal(health.readOnly, true);
}
