CREATE TABLE "categories" (
	"id" text PRIMARY KEY NOT NULL,
	"owner_id" text NOT NULL,
	"name" text NOT NULL,
	"parent_id" text,
	"created_at" timestamp with time zone NOT NULL,
	"updated_at" timestamp with time zone NOT NULL,
	"version" integer DEFAULT 1 NOT NULL,
	"deleted_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "installations" (
	"id" text PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"token_hash" text NOT NULL,
	"owner_id" text,
	"linked_at" timestamp with time zone,
	"created_at" timestamp with time zone NOT NULL,
	"updated_at" timestamp with time zone NOT NULL
);
--> statement-breakpoint
CREATE TABLE "outbox" (
	"id" text PRIMARY KEY NOT NULL,
	"owner_id" text NOT NULL,
	"entity" text NOT NULL,
	"entity_id" text NOT NULL,
	"op" text NOT NULL,
	"payload" jsonb NOT NULL,
	"created_at" timestamp with time zone NOT NULL,
	"synced_at" timestamp with time zone,
	CONSTRAINT "outbox_op" CHECK ("outbox"."op" in ('INSERT', 'UPDATE', 'DELETE'))
);
--> statement-breakpoint
CREATE TABLE "products" (
	"id" text PRIMARY KEY NOT NULL,
	"owner_id" text NOT NULL,
	"barcode" text,
	"name" text NOT NULL,
	"brand" text,
	"format" text,
	"unit" text DEFAULT 'UN' NOT NULL,
	"category_id" text,
	"price_clp" integer NOT NULL,
	"cost_clp" integer,
	"tax_type" text DEFAULT 'AFECTO' NOT NULL,
	"extra_tax_code" text,
	"stock_min_milli" integer,
	"active" boolean DEFAULT true NOT NULL,
	"source" text DEFAULT 'LOCAL' NOT NULL,
	"seed_ref" text,
	"scale_code" text,
	"created_at" timestamp with time zone NOT NULL,
	"updated_at" timestamp with time zone NOT NULL,
	"version" integer DEFAULT 1 NOT NULL,
	"deleted_at" timestamp with time zone,
	CONSTRAINT "products_precio" CHECK ("products"."price_clp" >= 0),
	CONSTRAINT "products_costo" CHECK ("products"."cost_clp" is null or "products"."cost_clp" >= 0),
	CONSTRAINT "products_unidad" CHECK ("products"."unit" in ('UN', 'KG')),
	CONSTRAINT "products_impuesto" CHECK ("products"."tax_type" in ('AFECTO', 'EXENTO')),
	CONSTRAINT "products_origen" CHECK ("products"."source" in ('SEED', 'LOCAL'))
);
--> statement-breakpoint
CREATE TABLE "sale_items" (
	"id" text PRIMARY KEY NOT NULL,
	"sale_id" text NOT NULL,
	"product_id" text,
	"name_snapshot" text NOT NULL,
	"unit" text NOT NULL,
	"qty_milli" integer NOT NULL,
	"unit_price_clp" integer NOT NULL,
	"tax_type" text NOT NULL,
	"discount_clp" integer DEFAULT 0 NOT NULL,
	"line_total_clp" integer NOT NULL,
	CONSTRAINT "sale_items_cantidad" CHECK ("sale_items"."qty_milli" > 0),
	CONSTRAINT "sale_items_montos" CHECK ("sale_items"."unit_price_clp" >= 0 and "sale_items"."discount_clp" >= 0 and "sale_items"."line_total_clp" >= 0),
	CONSTRAINT "sale_items_unidad" CHECK ("sale_items"."unit" in ('UN', 'KG')),
	CONSTRAINT "sale_items_impuesto" CHECK ("sale_items"."tax_type" in ('AFECTO', 'EXENTO'))
);
--> statement-breakpoint
CREATE TABLE "sales" (
	"id" text PRIMARY KEY NOT NULL,
	"owner_id" text NOT NULL,
	"number" integer NOT NULL,
	"register_id" text NOT NULL,
	"register_name" text,
	"cashier_name" text,
	"status" text DEFAULT 'OK' NOT NULL,
	"total_clp" integer NOT NULL,
	"rounding_clp" integer DEFAULT 0 NOT NULL,
	"payment_method" text NOT NULL,
	"voided_at" timestamp with time zone,
	"created_at" timestamp with time zone NOT NULL,
	CONSTRAINT "sales_estado" CHECK ("sales"."status" in ('OK', 'ANULADA')),
	CONSTRAINT "sales_medio_pago" CHECK ("sales"."payment_method" in ('EFECTIVO', 'DEBITO', 'CREDITO', 'TRANSFERENCIA')),
	CONSTRAINT "sales_total" CHECK ("sales"."total_clp" >= 0),
	CONSTRAINT "sales_redondeo" CHECK ("sales"."rounding_clp" between -5 and 4)
);
--> statement-breakpoint
CREATE TABLE "stock_movements" (
	"id" text PRIMARY KEY NOT NULL,
	"owner_id" text NOT NULL,
	"product_id" text NOT NULL,
	"qty_milli" integer NOT NULL,
	"type" text NOT NULL,
	"ref_id" text,
	"user_id" text,
	"at" timestamp with time zone NOT NULL,
	CONSTRAINT "stock_movements_tipo" CHECK ("stock_movements"."type" in ('VENTA', 'RECEPCION', 'AJUSTE', 'MERMA', 'ANULACION'))
);
--> statement-breakpoint
CREATE INDEX "categories_owner_idx" ON "categories" USING btree ("owner_id");--> statement-breakpoint
CREATE INDEX "categories_nombre_idx" ON "categories" USING btree ("name");--> statement-breakpoint
CREATE UNIQUE INDEX "installations_token_hash_uq" ON "installations" USING btree ("token_hash");--> statement-breakpoint
CREATE INDEX "outbox_pendientes_idx" ON "outbox" USING btree ("owner_id","synced_at");--> statement-breakpoint
CREATE UNIQUE INDEX "products_barcode_uq" ON "products" USING btree ("owner_id","barcode");--> statement-breakpoint
CREATE UNIQUE INDEX "products_scale_code_uq" ON "products" USING btree ("owner_id","scale_code");--> statement-breakpoint
CREATE INDEX "products_owner_idx" ON "products" USING btree ("owner_id");--> statement-breakpoint
CREATE INDEX "products_nombre_idx" ON "products" USING btree ("name");--> statement-breakpoint
CREATE INDEX "products_marca_idx" ON "products" USING btree ("owner_id","brand");--> statement-breakpoint
CREATE INDEX "sale_items_venta_idx" ON "sale_items" USING btree ("sale_id");--> statement-breakpoint
CREATE UNIQUE INDEX "sales_registro_numero_uq" ON "sales" USING btree ("owner_id","register_id","number");--> statement-breakpoint
CREATE INDEX "sales_owner_fecha_idx" ON "sales" USING btree ("owner_id","created_at");--> statement-breakpoint
CREATE INDEX "stock_movements_owner_idx" ON "stock_movements" USING btree ("owner_id");--> statement-breakpoint
CREATE INDEX "stock_movements_producto_idx" ON "stock_movements" USING btree ("product_id");