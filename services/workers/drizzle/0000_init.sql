CREATE TABLE `account_funders` (
	`account` text PRIMARY KEY NOT NULL,
	`funder` text,
	`first_tx_hash` text,
	`ts` text,
	`excluded` integer DEFAULT false NOT NULL
);
--> statement-breakpoint
CREATE TABLE `blobs` (
	`sha256` text PRIMARY KEY NOT NULL,
	`kind` text NOT NULL,
	`size` integer NOT NULL,
	`content_type` text NOT NULL,
	`path` text NOT NULL,
	`created_at` text NOT NULL
);
--> statement-breakpoint
CREATE TABLE `criteria_docs` (
	`id` text PRIMARY KEY NOT NULL,
	`blob_sha256` text NOT NULL,
	`market_job_id` text,
	`created_at` text NOT NULL
);
--> statement-breakpoint
CREATE TABLE `escrow_transfers` (
	`id` text PRIMARY KEY NOT NULL,
	`tx_hash` text NOT NULL,
	`ts` text NOT NULL,
	`intent_type` text NOT NULL,
	`from_account` text NOT NULL,
	`to_account` text,
	`token` text NOT NULL,
	`amount` text NOT NULL,
	`succeeded` integer,
	`kind` text NOT NULL,
	`kind_method` text NOT NULL,
	`memo` text
);
--> statement-breakpoint
CREATE INDEX `escrow_transfers_kind` ON `escrow_transfers` (`kind`);--> statement-breakpoint
CREATE INDEX `escrow_transfers_to` ON `escrow_transfers` (`to_account`);--> statement-breakpoint
CREATE TABLE `escrow_txns` (
	`tx_hash` text PRIMARY KEY NOT NULL,
	`nb_id` text NOT NULL,
	`block_height` integer NOT NULL,
	`ts` text NOT NULL,
	`signer` text NOT NULL,
	`receiver` text NOT NULL,
	`method` text,
	`succeeded` integer,
	`raw_json` text NOT NULL
);
--> statement-breakpoint
CREATE INDEX `escrow_txns_ts` ON `escrow_txns` (`ts`);--> statement-breakpoint
CREATE TABLE `market_agents` (
	`id` text PRIMARY KEY NOT NULL,
	`handle` text NOT NULL,
	`name` text,
	`owner_account_id` text,
	`category` text,
	`delivered_jobs` integer,
	`success_rate` real,
	`created_at` text,
	`near_account` text,
	`mapping_method` text DEFAULT 'unknown' NOT NULL,
	`raw_json` text NOT NULL,
	`fetched_at` text NOT NULL
);
--> statement-breakpoint
CREATE TABLE `market_bids` (
	`id` text PRIMARY KEY NOT NULL,
	`job_id` text NOT NULL,
	`agent_id` text NOT NULL,
	`amount` text,
	`eta_seconds` integer,
	`status` text,
	`created_at` text,
	`proposal` text,
	`raw_json` text NOT NULL
);
--> statement-breakpoint
CREATE TABLE `market_jobs` (
	`id` text PRIMARY KEY NOT NULL,
	`title` text,
	`description` text,
	`status` text,
	`budget_amount` text,
	`budget_token` text,
	`tags_json` text,
	`creator_id` text,
	`awarded_agent_id` text,
	`created_at` text,
	`raw_json` text NOT NULL,
	`fetched_at` text NOT NULL
);
--> statement-breakpoint
CREATE TABLE `market_reputation` (
	`agent_id` text PRIMARY KEY NOT NULL,
	`overall` real,
	`axes_json` text NOT NULL,
	`jobs_counted` integer NOT NULL,
	`computed_at` text NOT NULL,
	`raw_json` text NOT NULL,
	`fetched_at` text NOT NULL
);
--> statement-breakpoint
CREATE TABLE `metrics` (
	`id` text NOT NULL,
	`window` text NOT NULL,
	`value` real,
	`numerator` real,
	`denominator` real,
	`unit` text,
	`note` text,
	`computed_at` text NOT NULL,
	`sources_json` text NOT NULL,
	PRIMARY KEY(`id`, `window`)
);
--> statement-breakpoint
CREATE TABLE `pattern_edges` (
	`a` text NOT NULL,
	`b` text NOT NULL,
	`type` text NOT NULL,
	`co_jobs` integer,
	`twin_jobs` integer,
	`evidence_json` text NOT NULL,
	PRIMARY KEY(`a`, `b`, `type`)
);
--> statement-breakpoint
CREATE TABLE `patterns` (
	`id` text PRIMARY KEY NOT NULL,
	`members_json` text NOT NULL,
	`size` integer NOT NULL,
	`edge_count` integer NOT NULL,
	`computed_at` text NOT NULL
);
--> statement-breakpoint
CREATE TABLE `platform_stats` (
	`fetched_at` text PRIMARY KEY NOT NULL,
	`live_agents` integer NOT NULL,
	`jobs_total` integer NOT NULL,
	`jobs_this_week` integer NOT NULL,
	`active_hires` integer NOT NULL,
	`delivered_jobs` integer NOT NULL,
	`raw_json` text NOT NULL
);
--> statement-breakpoint
CREATE TABLE `runner_state` (
	`job_id` text NOT NULL,
	`verifier` text NOT NULL,
	`phase` text NOT NULL,
	`salt` text,
	`evidence_sha` text,
	`attestation_sha` text,
	`commit_tx` text,
	`reveal_tx` text,
	`error` text,
	`updated_at` text NOT NULL,
	PRIMARY KEY(`job_id`, `verifier`)
);
--> statement-breakpoint
CREATE TABLE `snapshots` (
	`id` text PRIMARY KEY NOT NULL,
	`file` text NOT NULL,
	`sha256` text NOT NULL,
	`taken_at` text NOT NULL
);
--> statement-breakpoint
CREATE TABLE `sync_state` (
	`source` text PRIMARY KEY NOT NULL,
	`cursor` text,
	`last_run_at` text,
	`last_ok_at` text,
	`error` text
);
--> statement-breakpoint
CREATE TABLE `trust_scores` (
	`agent_id` text NOT NULL,
	`algo_version` text NOT NULL,
	`score` real,
	`band` text NOT NULL,
	`components_json` text NOT NULL,
	`inputs_json` text NOT NULL,
	`computed_at` text NOT NULL,
	`snapshot_id` text,
	PRIMARY KEY(`agent_id`, `algo_version`)
);
