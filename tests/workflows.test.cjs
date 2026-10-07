'use strict';
// Static configuration guardrails, not a simulation of the GitHub Actions engine.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const root = path.resolve(__dirname, '..');
const read = (name) => fs.readFileSync(path.join(root, '.github/workflows', name), 'utf8');
const quality = read('quality.yml');
const pages = read('deploy-pizza-game-pages.yml');
const qualityJobs = quality.slice(quality.indexOf('\njobs:\n'));
const pagesJobs = pages.slice(pages.indexOf('\njobs:\n'));
const gate = pagesJobs.split('\n  quality:\n')[1]?.split('\n  deploy:\n')[0] || '';
const deploy = pagesJobs.split('\n  deploy:\n')[1] || '';

test('Pages calls the same-commit quality workflow with read-only permissions', () => {
  assert.match(quality, /^  workflow_call:\s*$/m);
  assert.match(gate, /^    uses: \.\/\.github\/workflows\/quality\.yml$/m);
  assert.match(gate, /permissions:\n      contents: read/);
  assert.doesNotMatch(gate, /secrets:|write|continue-on-error/);
});

test('publication requires quality success and the main branch', () => {
  assert.match(deploy, /^    needs: quality$/m);
  assert.match(deploy, /^    if: github\.ref == 'refs\/heads\/main'$/m);
  assert.match(gate, /^    if: github\.ref == 'refs\/heads\/main'$/m);
  assert.doesNotMatch(deploy, /always\(|continue-on-error|workflow_run/);
});

test('deployment checks out the tested SHA without persisting credentials', () => {
  assert.match(deploy, /ref: \$\{\{ github\.sha \}\}/);
  assert.match(deploy, /persist-credentials: false/);
});

test('publication permissions are not inherited by quality checks', () => {
  const top = pages.split('\njobs:\n')[0];
  assert.match(top, /permissions:\n  contents: read/);
  assert.doesNotMatch(top, /pages: write|id-token: write/);
  assert.match(deploy, /pages: write\n      id-token: write/);
  assert.doesNotMatch(quality, /pages: write|id-token: write|contents: write/);
});

test('standalone and reusable checks cannot cancel each other', () => {
  assert.match(quality, /group: quality-\$\{\{ github\.workflow \}\}-\$\{\{ github\.ref \}\}/);
  assert.match(pages, /group: pages\n  cancel-in-progress: false/);
});

test('quality retains rules, campaign and both browser engines without failure bypass', () => {
  assert.match(qualityJobs, /run: node --test tests\/\*\.test\.cjs/);
  assert.match(qualityJobs, /needs: rules/);
  assert.match(qualityJobs, /engine: \[chromium, webkit\]/);
  assert.match(qualityJobs, /run: python tests\/simulation\.py/);
  assert.match(qualityJobs, /run: xvfb-run -a python tests\/browser\.py/);
  assert.doesNotMatch(qualityJobs, /continue-on-error:\s*true|\|\|\s*true/);
});

test('Pages publication is explicitly invoked while quality checks run on code changes', () => {
  const triggers = pages.split('\npermissions:\n')[0];
  assert.match(triggers, /^  workflow_dispatch:\s*$/m);
  assert.doesNotMatch(triggers, /^  (?:push|pull_request|workflow_run|schedule):/m);
  assert.match(quality, /^  push:\n    branches: \[main\]/m);
  assert.match(quality, /^  pull_request:\n    branches: \[main\]/m);
});
