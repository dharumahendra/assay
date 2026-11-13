CREATE TABLE `source_facts` (
	`key` text PRIMARY KEY NOT NULL,
	`value_json` text NOT NULL,
	`source` text NOT NULL,
	`updated_at` text NOT NULL
);
