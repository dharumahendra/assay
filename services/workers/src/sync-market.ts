import {
  MarketAgentListSchema,
  MarketAgentSchema,
  MarketJobSchema,
  MarketReputationSchema,
  PlatformStatsSchema,
  type MarketAgent,
  type MarketJob,
} from "@juri/shared";
import { and, isNotNull, lt, or, isNull, gt, sql } from "drizzle-orm";
import { z } from "zod";
import type { Db } from "./db/index.js";
import { marketAgents, marketJobs, marketReputation, platformStats } from "./db/schema.js";
import { getJson, HttpError } from "./http.js";
import { tracked } from "./sync-state.js";

/**
 * FR-A1, adapted to market API v2 + decision 1a: only public, documented endpoints at low
 * volume (ToS §9.2). Idempotent: upserts by primary key.
 * Jobs: one page of the job board (needs the Assay agent token, MARKET_API_KEY). Bids stay
 * private to each job's creator, so they are never synced.
 */
const BASE = process.env.MARKET_API_BASE ?? "https://market.near.ai/v1";
const PAGE = 50;
const MIN_INTERVAL_MS = 1000; // 05 §3.1: max 1 req/s
/** Reputation is refreshed at most once a day, and only for agents that have delivered work. */
const REPUTATION_TTL_MS = 24 * 3600 * 1000;

const headers = (): Record<string, string> =>
  process.env.MARKET_API_KEY ? { authorization: `Bearer ${process.env.MARKET_API_KEY}` } : {};
const get = <T>(path: string) => getJson<T>(`${BASE}${path}`, { minIntervalMs: MIN_INTERVAL_MS, headers: headers() });

export function upsertAgent(db: Db, a: MarketAgent, fetchedAt: string): void {
  const row = {
    id: a.agent_id,
    handle: a.handle,
    name: a.name,
    ownerAccountId: a.owner_account_id,
    category: a.category ?? null,
    deliveredJobs: a.delivered_jobs ?? null,
    successRate: a.success_rate ?? null,
    createdAt: a.created_at,
    rawJson: JSON.stringify(a),
    fetchedAt,
  };
  const { id: _id, ...set } = row;
  db.insert(marketAgents).values(row).onConflictDoUpdate({ target: marketAgents.id, set }).run();
}

export async function syncAgents(db: Db, log = console.log): Promise<number> {
  return tracked(db, "market:agents", async () => {
    const fetchedAt = new Date().toISOString();
    let offset = 0;
    let total = 0;
    for (;;) {
      const raw = await get<unknown>(`/agents?limit=${PAGE}&offset=${offset}&sort=newest`);
      const { agents } = MarketAgentListSchema.parse(raw);
      let bad = 0;
      db.transaction(() =>
        agents.forEach((item) => {
          const r = MarketAgentSchema.safeParse(item);
          if (r.success) upsertAgent(db, r.data, fetchedAt);
          else {
            bad++;
            log(`  skip agent ${(item as { agent_id?: string })?.agent_id}: ${r.error.issues.map((i) => i.path.join(".")).join(", ")}`);
          }
        }),
      );
      total += agents.length - bad;
      log(`  agents: +${agents.length - bad} (offset ${offset}${bad ? `, ${bad} skipped` : ""})`);
      if (agents.length < PAGE) break;
      offset += PAGE;
      if (offset > 10_000) throw new Error("agents pagination runaway");
    }
    return total;
  });
}

export async function syncReputation(db: Db, log = console.log, limit = Infinity): Promise<number> {
  return tracked(db, "market:reputation", async () => {
    const staleBefore = new Date(Date.now() - REPUTATION_TTL_MS).toISOString();
    const due = db
      .select({ id: marketAgents.id })
      .from(marketAgents)
      .leftJoin(marketReputation, sql`${marketReputation.agentId} = ${marketAgents.id}`)
      .where(
        and(
          isNotNull(marketAgents.deliveredJobs),
          gt(marketAgents.deliveredJobs, 0),
          or(isNull(marketReputation.fetchedAt), lt(marketReputation.fetchedAt, staleBefore)),
        ),
      )
      .all()
      .slice(0, limit);
    log(`  reputation: ${due.length} agents due`);
    let n = 0;
    for (const { id } of due) {
      let raw: unknown;
      try {
        raw = await get<unknown>(`/agents/${id}/reputation`);
      } catch (e) {
        if (e instanceof HttpError && e.status === 404) continue;
        throw e;
      }
      const parsed = MarketReputationSchema.safeParse(raw);
      if (!parsed.success) {
        log(`  skip reputation ${id}: ${parsed.error.issues.map((i) => `${i.path.join(".")} ${i.message}`).join("; ")}`);
        continue;
      }
      const r = parsed.data;
      const row = {
        agentId: id,
        overall: r.overall,
        axesJson: JSON.stringify(r.axes),
        jobsCounted: r.jobs_counted,
        computedAt: r.computed_at,
        rawJson: JSON.stringify(r),
        fetchedAt: new Date().toISOString(),
      };
      const { agentId: _a, ...set } = row;
      db.insert(marketReputation).values(row).onConflictDoUpdate({ target: marketReputation.agentId, set }).run();
      n++;
      if (n % 25 === 0) log(`  reputation: ${n}/${due.length}`);
    }
    return n;
  });
}

export async function syncPlatformStats(db: Db): Promise<void> {
  await tracked(db, "market:platform_stats", async () => {
    const s = PlatformStatsSchema.parse(await get<unknown>("/platform/stats"));
    db.insert(platformStats)
      .values({
        fetchedAt: new Date().toISOString(),
        liveAgents: s.live_agents,
        jobsTotal: s.jobs_total,
        jobsThisWeek: s.jobs_this_week,
        activeHires: s.active_hires,
        deliveredJobs: s.delivered_jobs,
        rawJson: JSON.stringify(s),
      })
      .run();
  });
}

/** One board page only: a small, recent sample, not a crawl (ToS §9.2). */
export const JOB_BOARD_LIMIT = 50;
/** Skip test runs and placeholder jobs ("J4" / "d"): nothing a jury could check. */
const MIN_DESCRIPTION = 40;

/** Job row without the creator's display name/avatar (personal data the app never shows). */
export function jobRow(j: MarketJob, fetchedAt: string) {
  const { creator: _creator, ...raw } = j as MarketJob & { creator?: unknown };
  return {
    id: j.jobId,
    title: j.title,
    description: j.description,
    status: j.status,
    budgetAmount: j.budgetAmount ?? null,
    budgetToken: j.budgetToken,
    tagsJson: JSON.stringify(j.tags),
    creatorId: j.creatorAccountId,
    awardedAgentId: null,
    createdAt: j.createdAt,
    rawJson: JSON.stringify(raw),
    fetchedAt,
  };
}

export const keepJob = (j: MarketJob) =>
  !j.isPrivate && (j as { isTestRun?: boolean }).isTestRun !== true && j.description.trim().length >= MIN_DESCRIPTION;

export async function syncJobs(db: Db, log = console.log): Promise<number> {
  if (!process.env.MARKET_API_KEY) {
    log("  jobs: skipped (MARKET_API_KEY not set; the job board needs an agent token)");
    return 0;
  }
  return tracked(db, "market:jobs", async () => {
    const fetchedAt = new Date().toISOString();
    const { jobs } = z.object({ jobs: z.array(z.unknown()) }).passthrough().parse(await get<unknown>(`/jobs/board?limit=${JOB_BOARD_LIMIT}`));
    let n = 0;
    db.transaction(() => {
      for (const item of jobs) {
        const r = MarketJobSchema.safeParse(item);
        if (!r.success || !keepJob(r.data)) continue;
        const row = jobRow(r.data, fetchedAt);
        const { id: _id, ...set } = row;
        db.insert(marketJobs).values(row).onConflictDoUpdate({ target: marketJobs.id, set }).run();
        n++;
      }
    });
    log(`  jobs: ${n} of ${jobs.length} board jobs kept`);
    return n;
  });
}

export async function syncMarket(db: Db, log = console.log): Promise<void> {
  log("sync:market");
  await syncPlatformStats(db);
  const n = await syncAgents(db, log);
  const r = await syncReputation(db, log);
  const j = await syncJobs(db, log);
  log(`sync:market done: ${n} agents, ${r} reputations refreshed, ${j} jobs`);
}
