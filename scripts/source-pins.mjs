import { readFile, appendFile } from 'node:fs/promises';
import assert from 'node:assert/strict';
const { sources } = JSON.parse(await readFile(new URL('../trust.json', import.meta.url), 'utf8'));
for (const role of ['agentproof', 'donestate']) {
  assert.match(sources[role], /^[a-f0-9]{40}$/);
  await appendFile(process.env.GITHUB_OUTPUT, role + '=' + sources[role] + '\n');
}
