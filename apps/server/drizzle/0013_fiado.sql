CREATE TABLE `customer_ledger` (
	`id` text PRIMARY KEY NOT NULL,
	`customer_id` text NOT NULL,
	`type` text NOT NULL,
	`amount_clp` integer NOT NULL,
	`sale_id` text,
	`return_id` text,
	`payment_method` text,
	`cash_session_id` text,
	`reason` text,
	`user_id` text NOT NULL,
	`authorized_by` text,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`customer_id`) REFERENCES `customers`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`cash_session_id`) REFERENCES `cash_sessions`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`authorized_by`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action,
	CONSTRAINT "customer_ledger_tipo" CHECK("customer_ledger"."type" in ('VENTA', 'ABONO', 'ANULACION', 'DEVOLUCION', 'AJUSTE')),
	CONSTRAINT "customer_ledger_monto" CHECK("customer_ledger"."amount_clp" <> 0)
);
--> statement-breakpoint
CREATE INDEX `customer_ledger_cliente_idx` ON `customer_ledger` (`customer_id`);--> statement-breakpoint
CREATE INDEX `customer_ledger_sesion_idx` ON `customer_ledger` (`cash_session_id`);--> statement-breakpoint
CREATE TABLE `customers` (
	`id` text PRIMARY KEY NOT NULL,
	`name` text NOT NULL,
	`phone` text,
	`note` text,
	`credit_limit_clp` integer,
	`active` integer DEFAULT true NOT NULL,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	`version` integer DEFAULT 1 NOT NULL,
	`deleted_at` integer,
	CONSTRAINT "customers_limite" CHECK("customers"."credit_limit_clp" is null or "customers"."credit_limit_clp" >= 0)
);
--> statement-breakpoint
CREATE INDEX `customers_nombre_idx` ON `customers` (`name`);--> statement-breakpoint
PRAGMA foreign_keys=OFF;--> statement-breakpoint
CREATE TABLE `__new_sale_returns` (
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
	CONSTRAINT "sale_returns_monto" CHECK("__new_sale_returns"."refund_clp" >= 0),
	CONSTRAINT "sale_returns_medio_pago" CHECK("__new_sale_returns"."payment_method" in ('EFECTIVO', 'DEBITO', 'CREDITO', 'TRANSFERENCIA', 'FIADO'))
);
--> statement-breakpoint
INSERT INTO `__new_sale_returns`("id", "sale_id", "cash_session_id", "refund_clp", "rounding_clp", "payment_method", "reason", "authorized_by", "user_id", "created_at") SELECT "id", "sale_id", "cash_session_id", "refund_clp", "rounding_clp", "payment_method", "reason", "authorized_by", "user_id", "created_at" FROM `sale_returns`;--> statement-breakpoint
DROP TABLE `sale_returns`;--> statement-breakpoint
ALTER TABLE `__new_sale_returns` RENAME TO `sale_returns`;--> statement-breakpoint
PRAGMA foreign_keys=ON;--> statement-breakpoint
CREATE INDEX `sale_returns_venta_idx` ON `sale_returns` (`sale_id`);--> statement-breakpoint
CREATE INDEX `sale_returns_sesion_idx` ON `sale_returns` (`cash_session_id`);--> statement-breakpoint
CREATE TABLE `__new_sales` (
	`id` text PRIMARY KEY NOT NULL,
	`number` integer NOT NULL,
	`register_id` text NOT NULL,
	`cash_session_id` text,
	`cashier_id` text NOT NULL,
	`status` text DEFAULT 'OK' NOT NULL,
	`total_clp` integer NOT NULL,
	`rounding_clp` integer DEFAULT 0 NOT NULL,
	`payment_method` text NOT NULL,
	`customer_id` text,
	`paid_clp` integer NOT NULL,
	`change_clp` integer DEFAULT 0 NOT NULL,
	`voided_at` integer,
	`voided_by` text,
	`void_reason` text,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`register_id`) REFERENCES `registers`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`cash_session_id`) REFERENCES `cash_sessions`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`cashier_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`customer_id`) REFERENCES `customers`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`voided_by`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action,
	CONSTRAINT "sales_estado" CHECK("__new_sales"."status" in ('OK', 'ANULADA')),
	CONSTRAINT "sales_medio_pago" CHECK("__new_sales"."payment_method" in ('EFECTIVO', 'DEBITO', 'CREDITO', 'TRANSFERENCIA', 'FIADO')),
	CONSTRAINT "sales_total" CHECK("__new_sales"."total_clp" >= 0),
	CONSTRAINT "sales_redondeo" CHECK("__new_sales"."rounding_clp" between -5 and 4),
	CONSTRAINT "sales_pagado" CHECK("__new_sales"."paid_clp" >= 0 and "__new_sales"."change_clp" >= 0)
);
--> statement-breakpoint
INSERT INTO `__new_sales`("id", "number", "register_id", "cash_session_id", "cashier_id", "status", "total_clp", "rounding_clp", "payment_method", "paid_clp", "change_clp", "voided_at", "voided_by", "void_reason", "created_at") SELECT "id", "number", "register_id", "cash_session_id", "cashier_id", "status", "total_clp", "rounding_clp", "payment_method", "paid_clp", "change_clp", "voided_at", "voided_by", "void_reason", "created_at" FROM `sales`;--> statement-breakpoint
DROP TABLE `sales`;--> statement-breakpoint
ALTER TABLE `__new_sales` RENAME TO `sales`;--> statement-breakpoint
CREATE UNIQUE INDEX `sales_caja_numero_uq` ON `sales` (`register_id`,`number`);--> statement-breakpoint
CREATE INDEX `sales_fecha_idx` ON `sales` (`created_at`);