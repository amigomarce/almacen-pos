CREATE TABLE `unexpected_shutdowns` (
	`id` text PRIMARY KEY NOT NULL,
	`cash_session_id` text NOT NULL,
	`detected_at` integer NOT NULL,
	FOREIGN KEY (`cash_session_id`) REFERENCES `cash_sessions`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `unexpected_shutdowns_sesion_idx` ON `unexpected_shutdowns` (`cash_session_id`);