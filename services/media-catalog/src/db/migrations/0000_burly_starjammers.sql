CREATE TABLE `api_cache` (
	`key` text PRIMARY KEY NOT NULL,
	`value` text NOT NULL,
	`expires_at` integer NOT NULL
);
--> statement-breakpoint
CREATE INDEX `api_cache_expiry` ON `api_cache` (`expires_at`);--> statement-breakpoint
CREATE TABLE `episodes` (
	`media_id` integer PRIMARY KEY NOT NULL,
	`season_media_id` integer NOT NULL,
	`episode_number` integer NOT NULL,
	`name` text DEFAULT '' NOT NULL,
	`overview` text DEFAULT '' NOT NULL,
	`air_date` text,
	`still` text,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	FOREIGN KEY (`season_media_id`) REFERENCES `seasons`(`media_id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `episodes_season_number` ON `episodes` (`season_media_id`,`episode_number`);--> statement-breakpoint
CREATE TABLE `genres` (
	`id` integer PRIMARY KEY NOT NULL
);
--> statement-breakpoint
CREATE TABLE `media_genres` (
	`media_type` text NOT NULL,
	`media_id` integer NOT NULL,
	`genre_id` integer NOT NULL,
	PRIMARY KEY(`media_type`, `media_id`, `genre_id`)
);
--> statement-breakpoint
CREATE TABLE `meta` (
	`key` text PRIMARY KEY NOT NULL,
	`value` text NOT NULL
);
--> statement-breakpoint
CREATE TABLE `movies` (
	`media_id` integer PRIMARY KEY NOT NULL,
	`imdb_id` text,
	`title` text DEFAULT '' NOT NULL,
	`overview` text DEFAULT '' NOT NULL,
	`tagline` text DEFAULT '' NOT NULL,
	`release_date` text DEFAULT '' NOT NULL,
	`runtime` integer DEFAULT 0 NOT NULL,
	`poster` text DEFAULT '' NOT NULL,
	`backdrop` text DEFAULT '' NOT NULL,
	`logo` text DEFAULT '' NOT NULL,
	`popularity` real DEFAULT 0 NOT NULL,
	`rating` real DEFAULT 0 NOT NULL,
	`details_synced_at` integer,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `movies_imdb` ON `movies` (`imdb_id`) WHERE imdb_id IS NOT NULL;--> statement-breakpoint
CREATE TABLE `seasons` (
	`media_id` integer PRIMARY KEY NOT NULL,
	`tv_media_id` integer NOT NULL,
	`season_number` integer NOT NULL,
	`name` text DEFAULT '' NOT NULL,
	`overview` text DEFAULT '' NOT NULL,
	`air_date` text,
	`poster` text,
	`synced` integer DEFAULT 0 NOT NULL,
	`episodes_synced_at` integer,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	FOREIGN KEY (`tv_media_id`) REFERENCES `tv_shows`(`media_id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `seasons_tv_number` ON `seasons` (`tv_media_id`,`season_number`);--> statement-breakpoint
CREATE TABLE `sync_state` (
	`name` text PRIMARY KEY NOT NULL,
	`last_sync` integer
);
--> statement-breakpoint
CREATE TABLE `translations` (
	`entity_type` text NOT NULL,
	`entity_id` integer NOT NULL,
	`language` text NOT NULL,
	`title` text DEFAULT '' NOT NULL,
	`overview` text DEFAULT '' NOT NULL,
	`tagline` text DEFAULT '' NOT NULL,
	PRIMARY KEY(`entity_type`, `entity_id`, `language`)
);
--> statement-breakpoint
CREATE TABLE `tv_shows` (
	`media_id` integer PRIMARY KEY NOT NULL,
	`imdb_id` text,
	`name` text DEFAULT '' NOT NULL,
	`overview` text DEFAULT '' NOT NULL,
	`tagline` text DEFAULT '' NOT NULL,
	`first_air_date` text DEFAULT '' NOT NULL,
	`poster` text DEFAULT '' NOT NULL,
	`backdrop` text DEFAULT '' NOT NULL,
	`status` text DEFAULT '' NOT NULL,
	`type` text DEFAULT '' NOT NULL,
	`in_production` integer DEFAULT 0 NOT NULL,
	`episode_run_time` text DEFAULT '[]' NOT NULL,
	`popularity` real DEFAULT 0 NOT NULL,
	`rating` real DEFAULT 0 NOT NULL,
	`watching` integer DEFAULT 0 NOT NULL,
	`details_synced_at` integer,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL
);
