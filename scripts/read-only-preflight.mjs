import assert from 'node:assert/strict';
import {execFileSync} from 'node:child_process';
import {readFileSync} from 'node:fs';
const {subject:s}=JSON.parse(readFileSync(new URL('../trust.json',import.meta.url)));
assert.equal(process.env.GITHUB_REPOSITORY,'AyobamiH/agentproof-release-canary');
const get=path=>JSON.parse(execFileSync('gh',['api','--method','GET',
  'repos/AyobamiH/agentproof-release-canary'+path],{encoding:'utf8',
  env:{PATH:process.env.PATH,GH_TOKEN:process.env.GH_TOKEN},stdio:['ignore','pipe','pipe']}));
const repo=get(''),tag=get('/git/ref/tags/'+s.tagName);
assert.equal(repo.id,s.repositoryId);assert.equal(repo.owner.id,s.ownerId);
assert.equal(repo.private,false);assert.equal(tag.object.type,'commit');assert.equal(tag.object.sha,s.tagCommit);
console.log(JSON.stringify({readOnly:true,repositoryId:repo.id,tagCommit:tag.object.sha,draftMetadataClaimed:false}));
