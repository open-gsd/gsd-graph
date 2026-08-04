// gsd-graph — npm release workflow and trusted-publishing contract

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

const root = join(__dirname, '..');

function read(path: string): string {
  return readFileSync(join(root, path), 'utf8');
}

function readJson(path: string): Record<string, unknown> {
  return JSON.parse(read(path)) as Record<string, unknown>;
}

describe('npm publish workflow', () => {
  it('uses release-triggered OIDC publishing without a long-lived npm token', () => {
    const path = '.github/workflows/publish.yml';
    assert.equal(existsSync(join(root, path)), true, `${path} missing`);
    const workflow = read(path);

    assert.match(workflow, /release:\s*\n\s*types:\s*\[published\]/);
    assert.match(workflow, /workflow_dispatch:/);
    assert.match(workflow, /contents:\s*read/);
    assert.match(workflow, /id-token:\s*write/);
    assert.doesNotMatch(workflow, /NPM_TOKEN|NODE_AUTH_TOKEN/);
    assert.match(workflow, /if:\s*github\.event_name == 'release'/);
    assert.match(workflow, /npm publish --access public --tag/);
  });

  it('validates, tests, and packs the exact release before publishing', () => {
    const workflow = read('.github/workflows/publish.yml');

    assert.match(workflow, /actions\/checkout@v7/);
    assert.match(workflow, /actions\/setup-node@v7/);
    assert.match(workflow, /node-version:\s*24/);
    assert.match(workflow, /package-manager-cache:\s*false/);
    assert.match(workflow, /npm ci/);
    assert.match(workflow, /npm test/);
    assert.match(workflow, /npm pack --dry-run/);
    assert.match(workflow, /RELEASE_TAG/);
    assert.match(workflow, /v\$\{PACKAGE_VERSION\}/);
    assert.match(workflow, /IS_PRERELEASE/);
    assert.match(workflow, /name=next/);
    assert.match(workflow, /name=latest/);
  });

  it('keeps CI actions current and package metadata pack-safe', () => {
    const ci = read('.github/workflows/ci.yml');
    assert.match(ci, /actions\/checkout@v7/);
    assert.match(ci, /actions\/setup-node@v7/);
    assert.match(ci, /permissions:\s*\n\s*contents:\s*read/);

    const pkg = readJson('package.json');
    const scripts = pkg.scripts as Record<string, string> | undefined;
    assert.equal(scripts?.prepack, 'npm run build');

    const lock = readJson('package-lock.json');
    const packages = lock.packages as Record<string, Record<string, unknown>>;
    const rootPackage = packages[''];
    const bins = rootPackage?.bin as Record<string, string> | undefined;
    assert.equal(bins?.['gsd-graph'], 'bin/gsd-graph.js');
    assert.equal(bins?.['gsd-graph-mcp'], 'bin/gsd-graph-mcp.js');
  });

  it('documents trusted-publisher setup and the release procedure', () => {
    const guide = read('docs/PUBLISHING.md');

    assert.match(guide, /Trusted Publisher/i);
    assert.match(guide, /open-gsd/);
    assert.match(guide, /gsd-graph/);
    assert.match(guide, /publish\.yml/);
    assert.match(guide, /v<version>/);
    assert.match(guide, /npm token/i);
    assert.match(guide, /provenance/i);
    assert.match(guide, /workflow_dispatch/);
  });
});
