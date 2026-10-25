CREATE TABLE `caf_ranges` (
	`id` text PRIMARY KEY NOT NULL,
	`dte_type` integer NOT NULL,
	`folio_from` integer NOT NULL,
	`folio_to` integer NOT NULL,
	`next_folio` integer NOT NULL,
	`xml_encrypted` text NOT NULL,
	`expires_at` integer,
	CONSTRAINT "caf_ranges_tipo" CHECK("caf_ranges"."dte_type" in (39, 41)),
	CONSTRAINT "caf_ranges_folios" CHECK("caf_ranges"."folio_from" <= "caf_ranges"."folio_to" and "caf_ranges"."next_folio" between "caf_ranges"."folio_from" and "caf_ranges"."folio_to" + 1)
);
--> statement-breakpoint
CREATE TABLE `cash_sessions` (
	`id` text PRIMARY KEY NOT NULL,
	`register_id` text NOT NULL,
	`opened_by` text NOT NULL,
	`opened_at` integer NOT NULL,
	`opening_cash` integer NOT NULL,
	`closed_by` text,
	`closed_at` integer,
	`counted_cash` integer,
	FOREIGN KEY (`register_id`) REFERENCES `registers`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`opened_by`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`closed_by`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action,
	CONSTRAINT "cash_sessions_apertura" CHECK("cash_sessions"."opening_cash" >= 0)
);
--> statement-breakpoint
CREATE TABLE `categories` (
	`id` text PRIMARY KEY NOT NULL,
	`name` text NOT NULL,
	`parent_id` text,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	`version` integer DEFAULT 1 NOT NULL,
	`deleted_at` integer,
	FOREIGN KEY (`parent_id`) REFERENCES `categories`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE TABLE `outbox` (
	`id` text PRIMARY KEY NOT NULL,
	`entity` text NOT NULL,
	`entity_id` text NOT NULL,
	`op` text NOT NULL,
	`payload` text NOT NULL,
	`created_at` integer NOT NULL,
	`synced_at` integer,
	CONSTRAINT "outbox_op" CHECK("outbox"."op" in ('INSERT', 'UPDATE', 'DELETE'))
);
--> statement-breakpoint
CREATE INDEX `outbox_pendientes_idx` ON `outbox` (`synced_at`);--> statement-breakpoint
CREATE TABLE `price_history` (
	`id` text PRIMARY KEY NOT NULL,
	`product_id` text NOT NULL,
	`old_price` integer NOT NULL,
	`new_price` integer NOT NULL,
	`changed_by` text,
	`device` text,
	`at` integer NOT NULL,
	FOREIGN KEY (`product_id`) REFERENCES `products`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`changed_by`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `price_history_producto_idx` ON `price_history` (`product_id`);--> statement-breakpoint
CREATE TABLE `product_barcodes` (
	`barcode` text PRIMARY KEY NOT NULL,
	`product_id` text NOT NULL,
	FOREIGN KEY (`product_id`) REFERENCES `products`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE TABLE `products` (
	`id` text PRIMARY KEY NOT NULL,
	`barcode` text,
	`name` text NOT NULL,
	`brand` text,
	`format` text,
	`unit` text DEFAULT 'UN' NOT NULL,
	`category_id` text,
	`price_clp` integer NOT NULL,
	`cost_clp` integer,
	`tax_type` text DEFAULT 'AFECTO' NOT NULL,
	`extra_tax_code` text,
	`stock_qty_milli` integer DEFAULT 0 NOT NULL,
	`stock_min_milli` integer,
	`active` integer DEFAULT true NOT NULL,
	`source` text DEFAULT 'LOCAL' NOT NULL,
	`seed_ref` text,
	`scale_code` text,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	`version` integer DEFAULT 1 NOT NULL,
	`deleted_at` integer,
	FOREIGN KEY (`category_id`) REFERENCES `categories`(`id`) ON UPDATE no action ON DELETE no action,
	CONSTRAINT "products_precio" CHECK("products"."price_clp" >= 0),
	CONSTRAINT "products_costo" CHECK("products"."cost_clp" is null or "products"."cost_clp" >= 0),
	CONSTRAINT "products_unidad" CHECK("products"."unit" in ('UN', 'KG')),
	CONSTRAINT "products_impuesto" CHECK("products"."tax_type" in ('AFECTO', 'EXENTO')),
	CONSTRAINT "products_origen" CHECK("products"."source" in ('SEED', 'LOCAL'))
);
--> statement-breakpoint
CREATE UNIQUE INDEX `products_barcode_unique` ON `products` (`barcode`);--> statement-breakpoint
CREATE UNIQUE INDEX `products_scale_code_unique` ON `products` (`scale_code`);--> statement-breakpoint
CREATE INDEX `products_nombre_idx` ON `products` (`name`);--> statement-breakpoint
CREATE INDEX `products_categoria_idx` ON `products` (`category_id`);--> statement-breakpoint
CREATE TABLE `promotions` (
	`id` text PRIMARY KEY NOT NULL,
	`product_id` text NOT NULL,
	`pack_qty` integer NOT NULL,
	`pack_price_clp` integer NOT NULL,
	`active` integer DEFAULT true NOT NULL,
	`starts_at` integer,
	`ends_at` integer,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	`version` integer DEFAULT 1 NOT NULL,
	`deleted_at` integer,
	FOREIGN KEY (`product_id`) REFERENCES `products`(`id`) ON UPDATE no action ON DELETE no action,
	CONSTRAINT "promotions_pack" CHECK("promotions"."pack_qty" >= 2),
	CONSTRAINT "promotions_precio" CHECK("promotions"."pack_price_clp" >= 0)
);
--> statement-breakpoint
CREATE INDEX `promotions_producto_idx` ON `promotions` (`product_id`);--> statement-breakpoint
CREATE TABLE `quick_buttons` (
	`id` text PRIMARY KEY NOT NULL,
	`label` text NOT NULL,
	`product_id` text,
	`position` integer NOT NULL,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	`version` integer DEFAULT 1 NOT NULL,
	`deleted_at` integer,
	FOREIGN KEY (`product_id`) REFERENCES `products`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE TABLE `registers` (
	`id` text PRIMARY KEY NOT NULL,
	`name` text NOT NULL,
	`active` integer DEFAULT true NOT NULL
);
--> statement-breakpoint
CREATE TABLE `sale_items` (
	`id` text PRIMARY KEY NOT NULL,
	`sale_id` text NOT NULL,
	`product_id` text,
	`name_snapshot` text NOT NULL,
	`unit` text NOT NULL,
	`qty_milli` integer NOT NULL,
	`unit_price_clp` integer NOT NULL,
	`tax_type` text NOT NULL,
	`discount_clp` integer DEFAULT 0 NOT NULL,
	`line_total_clp` integer NOT NULL,
	FOREIGN KEY (`sale_id`) REFERENCES `sales`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`product_id`) REFERENCES `products`(`id`) ON UPDATE no action ON DELETE no action,
	CONSTRAINT "sale_items_cantidad" CHECK("sale_items"."qty_milli" > 0),
	CONSTRAINT "sale_items_montos" CHECK("sale_items"."unit_price_clp" >= 0 and "sale_items"."discount_clp" >= 0 and "sale_items"."line_total_clp" >= 0),
	CONSTRAINT "sale_items_unidad" CHECK("sale_items"."unit" in ('UN', 'KG')),
	CONSTRAINT "sale_items_impuesto" CHECK("sale_items"."tax_type" in ('AFECTO', 'EXENTO'))
);
--> statement-breakpoint
CREATE INDEX `sale_items_venta_idx` ON `sale_items` (`sale_id`);--> statement-breakpoint
CREATE TABLE `sales` (
	`id` text PRIMARY KEY NOT NULL,
	`number` integer NOT NULL,
	`register_id` text NOT NULL,
	`cash_session_id` text,
	`cashier_id` text NOT NULL,
	`status` text DEFAULT 'OK' NOT NULL,
	`total_clp` integer NOT NULL,
	`rounding_clp` integer DEFAULT 0 NOT NULL,
	`payment_method` text NOT NULL,
	`paid_clp` integer NOT NULL,
	`change_clp` integer DEFAULT 0 NOT NULL,
	`voided_at` integer,
	`voided_by` text,
	`void_reason` text,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`register_id`) REFERENCES `registers`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`cash_session_id`) REFERENCES `cash_sessions`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`cashier_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`voided_by`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action,
	CONSTRAINT "sales_estado" CHECK("sales"."status" in ('OK', 'ANULADA')),
	CONSTRAINT "sales_medio_pago" CHECK("sales"."payment_method" in ('EFECTIVO', 'DEBITO', 'CREDITO', 'TRANSFERENCIA')),
	CONSTRAINT "sales_total" CHECK("sales"."total_clp" >= 0),
	CONSTRAINT "sales_redondeo" CHECK("sales"."rounding_clp" between -5 and 4),
	CONSTRAINT "sales_pagado" CHECK("sales"."paid_clp" >= 0 and "sales"."change_clp" >= 0)
);
--> statement-breakpoint
CREATE UNIQUE INDEX `sales_caja_numero_uq` ON `sales` (`register_id`,`number`);--> statement-breakpoint
CREATE INDEX `sales_fecha_idx` ON `sales` (`created_at`);--> statement-breakpoint
CREATE TABLE `stock_movements` (
	`id` text PRIMARY KEY NOT NULL,
	`product_id` text NOT NULL,
	`qty_milli` integer NOT NULL,
	`type` text NOT NULL,
	`ref_id` text,
	`user_id` text,
	`at` integer NOT NULL,
	FOREIGN KEY (`product_id`) REFERENCES `products`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action,
	CONSTRAINT "stock_movements_tipo" CHECK("stock_movements"."type" in ('VENTA', 'RECEPCION', 'AJUSTE', 'MERMA', 'ANULACION'))
);
--> statement-breakpoint
CREATE INDEX `stock_movements_producto_idx` ON `stock_movements` (`product_id`);--> statement-breakpoint
CREATE TABLE `store_settings` (
	`id` integer PRIMARY KEY DEFAULT 1 NOT NULL,
	`rut` text,
	`razon_social` text,
	`giro` text,
	`direccion` text,
	`comuna` text,
	`modelo_emision` text DEFAULT 'SOLO_NO_ELECTRONICOS' NOT NULL,
	`dte_provider` text DEFAULT 'MOCK' NOT NULL,
	`cash_rounding_enabled` integer DEFAULT true NOT NULL,
	`updated_at` integer NOT NULL,
	`version` integer DEFAULT 1 NOT NULL,
	CONSTRAINT "store_settings_unica" CHECK("store_settings"."id" = 1),
	CONSTRAINT "store_settings_modelo" CHECK("store_settings"."modelo_emision" in ('SOLO_NO_ELECTRONICOS', 'TODO_MEDIO_PAGO')),
	CONSTRAINT "store_settings_provider" CHECK("store_settings"."dte_provider" in ('MOCK', 'PUENTE_MANUAL', 'SII_DIRECTO', 'PROVEEDOR_EXTERNO'))
);
--> statement-breakpoint
CREATE TABLE `tax_documents` (
	`id` text PRIMARY KEY NOT NULL,
	`sale_id` text NOT NULL,
	`provider` text NOT NULL,
	`dte_type` integer,
	`folio` integer,
	`folio_externo` text,
	`entrega` text DEFAULT 'IMPRESA' NOT NULL,
	`total_clp` integer NOT NULL,
	`neto_clp` integer NOT NULL,
	`iva_clp` integer NOT NULL,
	`exento_clp` integer DEFAULT 0 NOT NULL,
	`xml` text,
	`ted` text,
	`track_id` text,
	`sii_status` text DEFAULT 'NO_APLICA' NOT NULL,
	`sent_at` integer,
	`attempts` integer DEFAULT 0 NOT NULL,
	`last_error` text,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`sale_id`) REFERENCES `sales`(`id`) ON UPDATE no action ON DELETE no action,
	CONSTRAINT "tax_documents_tipo" CHECK("tax_documents"."dte_type" is null or "tax_documents"."dte_type" in (39, 41)),
	CONSTRAINT "tax_documents_provider" CHECK("tax_documents"."provider" in ('MOCK', 'PUENTE_MANUAL', 'SII_DIRECTO', 'PROVEEDOR_EXTERNO')),
	CONSTRAINT "tax_documents_entrega" CHECK("tax_documents"."entrega" in ('IMPRESA', 'VIRTUAL')),
	CONSTRAINT "tax_documents_estado" CHECK("tax_documents"."sii_status" in ('NO_APLICA', 'PENDIENTE', 'ENVIADO', 'ACEPTADO', 'RECHAZADO', 'REPARO')),
	CONSTRAINT "tax_documents_cuadre" CHECK("tax_documents"."neto_clp" + "tax_documents"."iva_clp" + "tax_documents"."exento_clp" = "tax_documents"."total_clp")
);
--> statement-breakpoint
CREATE UNIQUE INDEX `tax_documents_folio_uq` ON `tax_documents` (`dte_type`,`folio`);--> statement-breakpoint
CREATE INDEX `tax_documents_venta_idx` ON `tax_documents` (`sale_id`);--> statement-breakpoint
CREATE INDEX `tax_documents_estado_idx` ON `tax_documents` (`sii_status`);--> statement-breakpoint
CREATE TABLE `users` (
	`id` text PRIMARY KEY NOT NULL,
	`name` text NOT NULL,
	`role` text NOT NULL,
	`pin_hash` text NOT NULL,
	`active` integer DEFAULT true NOT NULL,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	`version` integer DEFAULT 1 NOT NULL,
	`deleted_at` integer,
	CONSTRAINT "users_role" CHECK("users"."role" in ('DUENO', 'CAJERO'))
);
