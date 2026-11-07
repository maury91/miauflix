-- Season names chose AniDB aliases ("tr s3") over full titles: rebuild every layout. Numbering
-- comes out the same, so the version (and the backend's numbering) does not change.
DELETE FROM `anime_episodes`;--> statement-breakpoint
DELETE FROM `anime_seasons`;--> statement-breakpoint
DELETE FROM `anime_layouts`;
