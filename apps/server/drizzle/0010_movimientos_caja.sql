CREATE TABLE `cash_movements` (
	`id` text PRIMARY KEY NOT NULL,
	`cash_session_id` text NOT NULL,
	`type` text NOT NULL,
	`amount_clp` integer NOT NULL,
	`reason` text NOT NULL,
	`user_id` text NOT NULL,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`cash_session_id`) REFERENCES `cash_sessions`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action,
	CONSTRAINT "cash_movements_tipo" CHECK("cash_movements"."type" in ('RETIRO', 'INGRESO')),
	CONSTRAINT "cash_movements_monto" CHECK("cash_movements"."amount_clp" > 0)
);
--> statement-breakpoint
CREATE INDEX `cash_movements_sesion_idx` ON `cash_movements` (`cash_session_id`);