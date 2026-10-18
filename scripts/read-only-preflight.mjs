import assert from 'node:assert/strict';
import {execFileSync} from 'node:child_process';
import {readFileSync} from 'node:fs';
const {subject:s}=JSON.parse(readFileSync(new URL('../trust.json',import.meta.url)));
assert.equal(process.env.GITHUB_REPOSITORY,'AyobamiH/agentproof-release-canary');
// gh uses the CI job's explicitly contents-read token. No OIDC or Worker call.
const release=JSON.parse(execFileSync('gh',['api','--method','GET',
  'repos/AyobamiH/agentproof-release-canary/releases/'+s.releaseId],{encoding:'utf8',
  env:{PATH:process.env.PATH,GH_TOKEN:process.env.GH_TOKEN},stdio:['ignore','pipe','pipe']}));
assert.equal(release.id,s.releaseId);assert.equal(release.tag_name,s.tagName);
assert.equal(release.prerelease,true);assert.equal(release.assets.length,2);
for(const [id,digest] of [['packageAssetId','packageDigest'],['provenanceAssetId','provenanceDigest']])
  assert.equal(release.assets.find(a=>a.id===s[id])?.digest,s[digest]);
console.log(JSON.stringify({readOnly:true,releaseId:release.id,draft:release.draft,exactAssetMetadata:true}));
