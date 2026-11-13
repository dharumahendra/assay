PRAGMA foreign_keys=OFF;--> statement-breakpoint
CREATE TABLE `__new_market_reputation` (
	`agent_id` text PRIMARY KEY NOT NULL,
	`overall` real,
	`axes_json` text NOT NULL,
	`jobs_counted` integer NOT NULL,
	`computed_at` text,
	`raw_json` text NOT NULL,
	`fetched_at` text NOT NULL
);
--> statement-breakpoint
INSERT INTO `__new_market_reputation`("agent_id", "overall", "axes_json", "jobs_counted", "computed_at", "raw_json", "fetched_at") SELECT "agent_id", "overall", "axes_json", "jobs_counted", "computed_at", "raw_json", "fetched_at" FROM `market_reputation`;--> statement-breakpoint
DROP TABLE `market_reputation`;--> statement-breakpoint
ALTER TABLE `__new_market_reputation` RENAME TO `market_reputation`;--> statement-breakpoint
PRAGMA foreign_keys=ON;