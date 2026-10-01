CREATE TABLE `backdrop_focus` (
	`provider` text NOT NULL,
	`image_key` text NOT NULL,
	`algorithm_version` text NOT NULL,
	`state` text NOT NULL,
	`focus_x` real,
	`focus_y` real,
	`analyzed_at` integer NOT NULL,
	`retry_after` integer,
	`error_code` text,
	PRIMARY KEY(`provider`, `image_key`, `algorithm_version`)
);
--> statement-breakpoint
CREATE INDEX `backdrop_focus_retry` ON `backdrop_focus` (`retry_after`);
