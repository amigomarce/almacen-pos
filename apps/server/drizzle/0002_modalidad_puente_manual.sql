PRAGMA foreign_keys=OFF;--> statement-breakpoint
CREATE TABLE `__new_store_settings` (
	`id` integer PRIMARY KEY DEFAULT 1 NOT NULL,
	`rut` text,
	`razon_social` text,
	`giro` text,
	`direccion` text,
	`comuna` text,
	`modelo_emision` text DEFAULT 'SOLO_NO_ELECTRONICOS' NOT NULL,
	`dte_provider` text DEFAULT 'PUENTE_MANUAL' NOT NULL,
	`cash_rounding_enabled` integer DEFAULT true NOT NULL,
	`updated_at` integer NOT NULL,
	`version` integer DEFAULT 1 NOT NULL,
	CONSTRAINT "store_settings_unica" CHECK("__new_store_settings"."id" = 1),
	CONSTRAINT "store_settings_modelo" CHECK("__new_store_settings"."modelo_emision" in ('SOLO_NO_ELECTRONICOS', 'TODO_MEDIO_PAGO')),
	CONSTRAINT "store_settings_provider" CHECK("__new_store_settings"."dte_provider" in ('MOCK', 'PUENTE_MANUAL', 'SII_DIRECTO', 'PROVEEDOR_EXTERNO'))
);
--> statement-breakpoint
INSERT INTO `__new_store_settings`("id", "rut", "razon_social", "giro", "direccion", "comuna", "modelo_emision", "dte_provider", "cash_rounding_enabled", "updated_at", "version") SELECT "id", "rut", "razon_social", "giro", "direccion", "comuna", "modelo_emision", "dte_provider", "cash_rounding_enabled", "updated_at", "version" FROM `store_settings`;--> statement-breakpoint
DROP TABLE `store_settings`;--> statement-breakpoint
ALTER TABLE `__new_store_settings` RENAME TO `store_settings`;--> statement-breakpoint
PRAGMA foreign_keys=ON;