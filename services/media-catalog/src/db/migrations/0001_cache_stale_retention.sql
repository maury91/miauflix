ALTER TABLE `api_cache` ADD COLUMN `stale_until` integer NOT NULL DEFAULT 0;
--> statement-breakpoint
UPDATE `api_cache` SET `stale_until` = `expires_at`;
--> statement-breakpoint
CREATE INDEX `api_cache_stale` ON `api_cache` (`stale_until`);
