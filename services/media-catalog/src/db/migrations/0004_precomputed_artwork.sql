ALTER TABLE `movies` ADD `logo_candidates` text;
--> statement-breakpoint
ALTER TABLE `tv_shows` ADD `logo_candidates` text;
--> statement-breakpoint
CREATE TABLE `media_artwork` (
  `media_type` text NOT NULL,
  `media_id` integer NOT NULL,
  `input_signature` text NOT NULL,
  `candidates` text NOT NULL,
  `card_logo` text,
  `hero_logo` text,
  `card_complete` integer DEFAULT false NOT NULL,
  `hero_complete` integer DEFAULT false NOT NULL,
  `card_status` text NOT NULL,
  `hero_status` text NOT NULL,
  `revision` integer DEFAULT 1 NOT NULL,
  `attempts` integer DEFAULT 0 NOT NULL,
  `retry_after` integer,
  `queued_at` integer NOT NULL,
  `updated_at` integer NOT NULL,
  CONSTRAINT `media_artwork_media_type_media_id_pk` PRIMARY KEY(`media_type`,`media_id`)
);
--> statement-breakpoint
CREATE INDEX `media_artwork_queue` ON `media_artwork` (`retry_after`,`queued_at`);
--> statement-breakpoint
CREATE TABLE `artwork_backdrop_cache` (
  `image_key` text NOT NULL,
  `algorithm_version` text NOT NULL,
  `pixels` text NOT NULL,
  `pixel_bytes` integer NOT NULL,
  `created_at` integer NOT NULL,
  CONSTRAINT `artwork_backdrop_cache_image_key_algorithm_version_pk` PRIMARY KEY(`image_key`,`algorithm_version`)
);
--> statement-breakpoint
CREATE TABLE `artwork_logo_cache` (
  `image_key` text NOT NULL,
  `logo_url` text NOT NULL,
  `algorithm_version` text NOT NULL,
  `card_pass` integer,
  `card_coverage` real,
  `card_median` real,
	`hero_pass` integer,
	`hero_coverage` real,
	`hero_median` real,
	`created_at` integer NOT NULL,
  CONSTRAINT `artwork_logo_cache_image_key_logo_url_algorithm_version_pk` PRIMARY KEY(`image_key`,`logo_url`,`algorithm_version`)
);
