-- The language each title was made in. Null until the row's details are fetched again: the
-- hydrator treats a null as stale, so existing titles fill it in on their next read.
ALTER TABLE `movies` ADD `original_language` text;--> statement-breakpoint
ALTER TABLE `tv_shows` ADD `original_language` text;
