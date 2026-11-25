import type { Env } from '../lib/env';
import { jsonResponse } from '../lib/json';
import { footprintsNeedsWrite, waitingFootprints } from './footprints-publish';
import { waitingGenetMusic } from './genet-publish';
import { waitingSubscriberMilestones } from './subscriber-milestones-publish';

/**
 * What the sidebar shows beside each data that publishes (#277's decision
 * 4, #285): how many of its rows are drafts, and whether its public JSON
 * needs 「本番に反映」 - the same rule the message above each list follows
 * (`canPublishFootprints`, `canPublishGenet`, `canPublishMilestones`), so the
 * mark and the band cannot disagree.
 */
export interface DataDrafts {
  drafts: number;
  /** Whether 「本番に反映」 would write the public JSON: something is waiting, it may be behind, or it is outdated. */
  needsPublish: boolean;
}

async function footprintsDrafts(env: Env): Promise<DataDrafts> {
  const [row, waiting, needsWrite] = await Promise.all([
    env.DB.prepare(`SELECT count(*) AS n FROM footprints_event WHERE status = 'draft'`).first<{ n: number }>(),
    waitingFootprints(env),
    footprintsNeedsWrite(env),
  ]);

  return { drafts: row?.n ?? 0, needsPublish: waiting.length > 0 || needsWrite };
}

async function milestonesDrafts(env: Env): Promise<DataDrafts> {
  const [row, waiting] = await Promise.all([
    env.DB.prepare(`SELECT count(*) AS n FROM subscriber_milestone WHERE status = 'draft'`).first<{ n: number }>(),
    waitingSubscriberMilestones(env),
  ]);

  return { drafts: row?.n ?? 0, needsPublish: waiting.needsBuild };
}

async function genetDrafts(env: Env): Promise<DataDrafts> {
  const [row, waiting] = await Promise.all([
    env.DB.prepare(`SELECT count(*) AS n FROM genet_stream WHERE status = 'draft'`).first<{ n: number }>(),
    waitingGenetMusic(env),
  ]);

  return { drafts: row?.n ?? 0, needsPublish: waiting.pending.length > 0 || waiting.shapeOutdated || waiting.behind };
}

/**
 * GET /admin/api/drafts. Each data is read on its own: one that fails is
 * null, so the sidebar leaves out its count and mark rather than the others'.
 * That includes あしあと's JSON in R2 that cannot be read, since whether it
 * is outdated is then unknown.
 */
export async function listDrafts(env: Env): Promise<Response> {
  const [footprints, milestones, genet] = await Promise.all([
    footprintsDrafts(env).catch(() => null),
    milestonesDrafts(env).catch(() => null),
    genetDrafts(env).catch(() => null),
  ]);

  return jsonResponse({ footprints, milestones, genet });
}
