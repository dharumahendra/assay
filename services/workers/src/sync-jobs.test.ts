import { MarketJobSchema } from "@juri/shared";
import { describe, expect, it } from "vitest";
import { jobRow, keepJob } from "./sync-market.js";

const base = {
  jobId: "2a39386e-3619-4202-b4db-f43195e550e8",
  creatorAccountId: "9ba312b4-76f9-4c23-9a6b-c07ea5d322a5",
  title: "Gather top 3 marketplaces",
  description: "Search and retrieve data on the top 3 marketplaces, with features and adoption metrics.",
  tags: ["market-research"],
  budgetAmount: "3",
  budgetToken: "USDC",
  jobKind: "standard",
  status: "open",
  isPrivate: false,
  isTestRun: false,
  createdAt: "2026-11-14T13:52:30.086092Z",
  creator: { accountId: "9ba312b4-76f9-4c23-9a6b-c07ea5d322a5", displayName: "Some Person", avatarUrl: null },
};
const job = (over: Record<string, unknown> = {}) => MarketJobSchema.parse({ ...base, ...over });

describe("job board sync", () => {
  it("keeps real public jobs and drops test runs, private and placeholder jobs", () => {
    expect(keepJob(job())).toBe(true);
    expect(keepJob(job({ isTestRun: true }))).toBe(false);
    expect(keepJob(job({ isPrivate: true }))).toBe(false);
    expect(keepJob(job({ title: "J4", description: "d" }))).toBe(false);
  });

  it("stores the job without the creator's display name", () => {
    const row = jobRow(job(), "2026-11-14T00:00:00.000Z");
    expect(row).toMatchObject({ id: base.jobId, status: "open", budgetAmount: "3", budgetToken: "USDC", tagsJson: '["market-research"]' });
    expect(row.rawJson).not.toContain("Some Person");
    expect(JSON.parse(row.rawJson)).not.toHaveProperty("creator");
  });
});
