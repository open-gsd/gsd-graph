// gsd-graph — dual-write ordered publish (v1 rename first)
// Copyright (c) 2026 Jeremy McSpadden <jeremy@fluxlabs.net>

import fs from 'node:fs';
import { GSD_GRAPH_REASON, GraphError } from '../errors';
import {
  formatAjvErrors,
  validateGraphV1,
} from '../schema/validators';
import { confineUnderRoot, ensureStoreRoot } from './paths';
import { writeJsonAtomicTemp } from './safe-json';

/**
 * Product default for store.write_projection (research discretion).
 * Projection is disposable; prefer false until a viewer needs it (D-04).
 */
export const DEFAULT_WRITE_PROJECTION = false;

export interface PublishPlan {
  storeRoot: string;
  /** graph.v1 document object (validated before write). */
  graphV1: object;
  /** Optional disposable projection document. */
  projection?: object | null;
  /** Optional sidecar JSON docs keyed by basename. */
  sidecars?: Record<string, object>;
  /** When true and projection provided, write graph.json after v1. */
  writeProjection: boolean;
  /**
   * Test-only hook: called after v1 rename and before projection rename.
   * Throw to simulate mid-protocol crash for STORE-03 order proof.
   */
  _afterV1Rename?: () => void;
  /**
   * Test-only rename override; defaults to fs.renameSync.
   * Records call order for STORE-03 spy tests.
   */
  _renameSync?: (from: string, to: string) => void;
}

let tmpCounter = 0;

function nextTmpName(finalName: string): string {
  tmpCounter += 1;
  return `${finalName}.tmp-${process.pid}-${tmpCounter}`;
}

function bestEffortUnlink(p: string): void {
  try {
    if (fs.existsSync(p)) fs.unlinkSync(p);
  } catch {
    // ignore cleanup failures
  }
}

function writeStatus(
  storeRoot: string,
  status: 'ok' | 'failed',
  reason: string,
): void {
  try {
    const statusPath = confineUnderRoot(storeRoot, '.last-build-status.json');
    writeJsonAtomicTemp(statusPath, {
      status,
      reason,
      finished_at: new Date().toISOString(),
    });
  } catch {
    // best-effort status write
  }
}

/**
 * Dual-write publish protocol (DESIGN dual-write, D-06, STORE-03).
 *
 * Does **not** acquire `.build.lock` — caller holds lock (single responsibility).
 * Usage: acquireBuildLock → publishGraphFiles → release.
 *
 * Order:
 * 1. validate graphV1
 * 2. write graph.v1.json.tmp → fsync
 * 3. optional graph.json.tmp → fsync
 * 4. sidecar temps
 * 5. rename v1 FIRST
 * 6. then projection, then sidecars
 * 7. write .last-build-status.json ok
 * On failure: unlink temps; status failed; rethrow.
 */
export function publishGraphFiles(plan: PublishPlan): void {
  const storeRoot = ensureStoreRoot(plan.storeRoot);
  const rename = plan._renameSync ?? fs.renameSync.bind(fs);

  const temps: string[] = [];

  try {
    if (!validateGraphV1(plan.graphV1)) {
      throw new GraphError(
        GSD_GRAPH_REASON.SCHEMA_INVALID,
        `graph.v1 schema invalid: ${formatAjvErrors(validateGraphV1.errors)}`,
        { errors: validateGraphV1.errors },
      );
    }

    const v1Final = confineUnderRoot(storeRoot, 'graph.v1.json');
    const v1Tmp = confineUnderRoot(storeRoot, nextTmpName('graph.v1.json'));
    temps.push(v1Tmp);
    writeJsonAtomicTemp(v1Tmp, plan.graphV1);

    let projFinal: string | null = null;
    let projTmp: string | null = null;
    if (plan.writeProjection && plan.projection != null) {
      projFinal = confineUnderRoot(storeRoot, 'graph.json');
      projTmp = confineUnderRoot(storeRoot, nextTmpName('graph.json'));
      temps.push(projTmp);
      writeJsonAtomicTemp(projTmp, plan.projection);
    }

    const sidecarTemps: Array<{ tmp: string; final: string }> = [];
    if (plan.sidecars) {
      for (const [name, value] of Object.entries(plan.sidecars)) {
        // basename only — confinement rejects escapes
        if (name.includes('/') || name.includes('\\') || name.includes('..')) {
          throw new GraphError(
            GSD_GRAPH_REASON.PATH_ESCAPE,
            `invalid sidecar basename: ${name}`,
          );
        }
        const finalPath = confineUnderRoot(storeRoot, name);
        const tmpPath = confineUnderRoot(storeRoot, nextTmpName(name));
        temps.push(tmpPath);
        writeJsonAtomicTemp(tmpPath, value);
        sidecarTemps.push({ tmp: tmpPath, final: finalPath });
      }
    }

    // e. rename v1 FIRST (STORE-03)
    rename(v1Tmp, v1Final);
    // remove v1 tmp from cleanup list (already renamed)
    const v1Idx = temps.indexOf(v1Tmp);
    if (v1Idx >= 0) temps.splice(v1Idx, 1);

    if (plan._afterV1Rename) {
      plan._afterV1Rename();
    }

    // f. projection then sidecars
    if (projTmp && projFinal) {
      rename(projTmp, projFinal);
      const pIdx = temps.indexOf(projTmp);
      if (pIdx >= 0) temps.splice(pIdx, 1);
    }

    for (const { tmp, final } of sidecarTemps) {
      rename(tmp, final);
      const sIdx = temps.indexOf(tmp);
      if (sIdx >= 0) temps.splice(sIdx, 1);
    }

    writeStatus(storeRoot, 'ok', GSD_GRAPH_REASON.OK);
  } catch (err) {
    for (const t of temps) bestEffortUnlink(t);
    const reason =
      err instanceof GraphError ? err.reason : GSD_GRAPH_REASON.BUILD_FAILED;
    writeStatus(storeRoot, 'failed', reason);
    throw err;
  }
}

/** @internal exposed for tests that need tmp counter reset — not part of public API */
export function _resetTmpCounterForTests(): void {
  tmpCounter = 0;
}
