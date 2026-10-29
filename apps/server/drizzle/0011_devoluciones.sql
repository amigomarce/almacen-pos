CREATE TABLE `sale_return_items` (
	`id` text PRIMARY KEY NOT NULL,
	`return_id` text NOT NULL,
	`sale_item_id` text NOT NULL,
	`qty_milli` integer NOT NULL,
	`amount_clp` integer NOT NULL,
	FOREIGN KEY (`return_id`) REFERENCES `sale_returns`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`sale_item_id`) REFERENCES `sale_items`(`id`) ON UPDATE no action ON DELETE no action,
	CONSTRAINT "sale_return_items_cantidad" CHECK("sale_return_items"."qty_milli" > 0),
	CONSTRAINT "sale_return_items_monto" CHECK("sale_return_items"."amount_clp" >= 0)
);
--> statement-breakpoint
CREATE INDEX `sale_return_items_devolucion_idx` ON `sale_return_items` (`return_id`);--> statement-breakpoint
CREATE INDEX `sale_return_items_linea_idx` ON `sale_return_items` (`sale_item_id`);--> statement-breakpoint
CREATE TABLE `sale_returns` (
	`id` text PRIMARY KEY NOT NULL,
	`sale_id` text NOT NULL,
	`cash_session_id` text NOT NULL,
	`refund_clp` integer NOT NULL,
	`rounding_clp` integer DEFAULT 0 NOT NULL,
	`payment_method` text NOT NULL,
	`reason` text NOT NULL,
	`authorized_by` text NOT NULL,
	`user_id` text NOT NULL,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`sale_id`) REFERENCES `sales`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`cash_session_id`) REFERENCES `cash_sessions`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`authorized_by`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action,
	CONSTRAINT "sale_returns_monto" CHECK("sale_returns"."refund_clp" >= 0),
	CONSTRAINT "sale_returns_medio_pago" CHECK("sale_returns"."payment_method" in ('EFECTIVO', 'DEBITO', 'CREDITO', 'TRANSFERENCIA'))
);
--> statement-breakpoint
CREATE INDEX `sale_returns_venta_idx` ON `sale_returns` (`sale_id`);--> statement-breakpoint
CREATE INDEX `sale_returns_sesion_idx` ON `sale_returns` (`cash_session_id`);