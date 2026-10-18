import test from 'node:test';
import assert from 'node:assert/strict';
import { reconcilePublication } from './publication.mjs';
function fixture({ attempt = 1, lost = false, ambiguous = false, intentFailure = false } = {}) {
  let mutations = 0; const calls = [], saved = new Map();
  const args = { attempt, request: { approval: 'fixture' }, intent: { subjectDigest: 'fixture' },
    wait: async () => {},
    save: async (name, data) => {
      if (intentFailure && name === 'publication-intent') throw Error('intent storage unavailable');
      assert(!saved.has(name)); saved.set(name, data);
    },
    invoke: async (path, body) => {
      assert.deepEqual(body, { request: args.request }); calls.push(path);
      if (path === '/v1/execute') {
        assert(saved.has('publication-intent')); mutations++;
        if (lost) throw Error('response lost after effect');
        return { status: 200, body: { state: 'verified' } };
      }
      assert.equal(path, '/v1/reconcile');
      return { status: 200, body: ambiguous ? { state: 'attempted', completion: null } :
        { state: 'verified', completion: { exact: true } } };
    } };
  return { args, calls, saved, mutations: () => mutations };
}
test('a successful response is archived but settlement comes from read-only recovery', async () => {
  const f = fixture(); const result = await reconcilePublication(f.args);
  assert.equal(result.completion.exact, true); assert.equal(f.mutations(), 1);
  assert.deepEqual(f.calls, ['/v1/execute', '/v1/reconcile']);
});
test('loss after effect causes no second mutation', async () => {
  const f = fixture({ lost: true }); await reconcilePublication(f.args);
  assert.equal(f.mutations(), 1); assert.equal(f.saved.get('execution-response').responseReceived, false);
});
test('same-run recovery attempts never execute publication', async () => {
  const f = fixture({ attempt: 2 }); await reconcilePublication(f.args);
  assert.equal(f.mutations(), 0); assert.deepEqual(f.calls, ['/v1/reconcile']);
  assert.equal(f.saved.get('recovery-only').publicationRequests, 0);
});
test('permanent ambiguity retains every read and refuses a mutation retry', async () => {
  const f = fixture({ lost: true, ambiguous: true });
  await assert.rejects(reconcilePublication(f.args), /ambiguous publication/);
  assert.equal(f.mutations(), 1); assert.equal(f.calls.filter(p => p === '/v1/reconcile').length, 4);
});
test('failed durable intent capture prevents execution', async () => {
  const f = fixture({ intentFailure: true });
  await assert.rejects(reconcilePublication(f.args), /intent storage/);
  assert.equal(f.mutations(), 0); assert.deepEqual(f.calls, []);
});
