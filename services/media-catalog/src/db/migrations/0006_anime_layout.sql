CREATE TABLE `anime_layouts` (
	`tv_media_id` integer PRIMARY KEY NOT NULL,
	`layout` text DEFAULT 'tmdb' NOT NULL,
	`version` text,
	`built_at` integer NOT NULL,
	FOREIGN KEY (`tv_media_id`) REFERENCES `tv_shows`(`media_id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE TABLE `anime_seasons` (
	`tv_media_id` integer NOT NULL,
	`season_number` integer NOT NULL,
	`anilist_id` integer,
	`name` text DEFAULT '' NOT NULL,
	`air_date` text,
	`poster` text,
	CONSTRAINT `anime_seasons_tv_media_id_season_number_pk` PRIMARY KEY(`tv_media_id`,`season_number`),
	FOREIGN KEY (`tv_media_id`) REFERENCES `tv_shows`(`media_id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE TABLE `anime_episodes` (
	`episode_media_id` integer PRIMARY KEY NOT NULL,
	`tv_media_id` integer NOT NULL,
	`season_number` integer NOT NULL,
	`episode_number` integer NOT NULL,
	FOREIGN KEY (`episode_media_id`) REFERENCES `episodes`(`media_id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`tv_media_id`) REFERENCES `tv_shows`(`media_id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `anime_episodes_number` ON `anime_episodes` (`tv_media_id`,`season_number`,`episode_number`);
