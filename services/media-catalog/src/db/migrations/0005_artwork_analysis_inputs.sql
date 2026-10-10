ALTER TABLE `media_artwork` ADD `image_key` text DEFAULT '' NOT NULL;
--> statement-breakpoint
ALTER TABLE `media_artwork` ADD `backdrop_url` text DEFAULT '' NOT NULL;
--> statement-breakpoint
ALTER TABLE `media_artwork` ADD `display_backdrop` text DEFAULT '' NOT NULL;
--> statement-breakpoint
ALTER TABLE `media_artwork` ADD `measurements` text DEFAULT '[]' NOT NULL;
--> statement-breakpoint
ALTER TABLE `media_artwork` ADD `cursor` integer DEFAULT 0 NOT NULL;
--> statement-breakpoint
ALTER TABLE `media_artwork` ADD `popularity` real DEFAULT 0 NOT NULL;
--> statement-breakpoint
ALTER TABLE `media_artwork` ADD `priority` integer DEFAULT 0 NOT NULL;
--> statement-breakpoint
ALTER TABLE `media_artwork` ADD `status` text DEFAULT 'pending' NOT NULL;
--> statement-breakpoint
UPDATE `media_artwork` SET `input_signature` = 'legacy:' || `input_signature`, `status` = 'ready';
--> statement-breakpoint
ALTER TABLE `artwork_backdrop_cache` ADD `luminance` text DEFAULT '' NOT NULL;
--> statement-breakpoint
CREATE TABLE `artwork_logo_assets` (
	`asset_url` text NOT NULL,
	`algorithm_version` text NOT NULL,
	`decoded_png` text,
	`width` integer,
	`height` integer,
	`failed_at` integer,
	`updated_at` integer NOT NULL,
	CONSTRAINT `artwork_logo_assets_asset_url_algorithm_version_pk` PRIMARY KEY(`asset_url`,`algorithm_version`)
);
