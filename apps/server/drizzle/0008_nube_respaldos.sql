ALTER TABLE `store_settings` ADD `cloud_url` text;--> statement-breakpoint
ALTER TABLE `store_settings` ADD `cloud_backup_enabled` integer DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE `store_settings` ADD `cloud_backup_retention` integer DEFAULT 7 NOT NULL;