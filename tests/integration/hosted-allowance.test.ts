import { spawnSync } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { expect, it } from 'vitest';

it('synthetic hosted allowance survives restart and refuses expired/capped requests before fetch', () => {
 const dir = mkdtempSync(join(tmpdir(), 'hosted-allowance-'));
 const path = join(dir, 'allowance.json');
 const run = (tail: string, overrides: NodeJS.ProcessEnv = {}) => spawnSync(process.execPath, ['--input-type=module', '-e', `let calls=0;globalThis.fetch=async()=>{calls++;return new Response(JSON.stringify({usage:{prompt_tokens:10,completion_tokens:20}}));};await import(${JSON.stringify(resolve('scripts/hosted-model-guard.mjs'))});try{await fetch('https://synthetic.modal.direct/v1/chat/completions',{method:'POST',body:JSON.stringify({model:'nvidia/GLM-5.3-Flash-NVFP4',max_tokens:6000,stream:false})});console.log('sent:'+calls)}catch{console.log('refused:'+calls)}${tail}`], { env: { ...process.env, MODEL_PROVIDER: 'modal', MODAL_BASE_URL: 'https://synthetic.modal.direct/v1', MODAL_MODEL: 'nvidia/GLM-5.3-Flash-NVFP4', HOSTED_MODEL_ALLOWANCE_FILE: path, ...overrides }, encoding: 'utf8' });
 try {
  writeFileSync(path, JSON.stringify({limitUsd:0.25,reservedUsd:0,deadline:new Date(Date.now()+60_000).toISOString(),requests:[]}));
  expect(run('').stdout).toContain('sent:1');
  expect(run('').stdout).toContain('sent:1');
  const value=JSON.parse(readFileSync(path,'utf8'));expect(value.requests).toHaveLength(2);expect(value.reservedUsd).toBeGreaterThan(0);
  value.deadline='2020-01-01T00:00:00Z';writeFileSync(path,JSON.stringify(value));
  expect(run('').stdout).toContain('refused:0');
  expect(JSON.parse(readFileSync(path,'utf8')).requests).toHaveLength(2);
  expect(run('',{MODAL_MODEL:'synthetic-other-model'}).stderr).toContain('requires the audited GLM model');
  value.deadline=new Date(Date.now()+60_000).toISOString();value.requests=[];value.reservedUsd=0.249;writeFileSync(path,JSON.stringify(value));
  expect(run('').stdout).toContain('refused:0');
  expect(JSON.parse(readFileSync(path,'utf8')).requests).toHaveLength(0);
  value.deadline=new Date(Date.now()+60_000).toISOString();value.requests=Array.from({length:10},()=>({}));writeFileSync(path,JSON.stringify(value));
  expect(run('').stdout).toContain('refused:0');
 } finally {rmSync(dir,{recursive:true,force:true});}
});
