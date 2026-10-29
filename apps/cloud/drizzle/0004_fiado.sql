CREATE TABLE "customer_ledger" (
	"id" text PRIMARY KEY NOT NULL,
	"owner_id" text NOT NULL,
	"customer_id" text NOT NULL,
	"type" text NOT NULL,
	"amount_clp" integer NOT NULL,
	"sale_id" text,
	"return_id" text,
	"payment_method" text,
	"reason" text,
	"created_at" timestamp with time zone NOT NULL,
	CONSTRAINT "customer_ledger_monto" CHECK ("customer_ledger"."amount_clp" <> 0)
);
--> statement-breakpoint
CREATE TABLE "customers" (
	"id" text PRIMARY KEY NOT NULL,
	"owner_id" text NOT NULL,
	"name" text NOT NULL,
	"phone" text,
	"note" text,
	"credit_limit_clp" integer,
	"active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone NOT NULL,
	"updated_at" timestamp with time zone NOT NULL,
	"version" integer DEFAULT 1 NOT NULL,
	"deleted_at" timestamp with time zone
);
--> statement-breakpoint
ALTER TABLE "sale_returns" DROP CONSTRAINT "sale_returns_medio_pago";--> statement-breakpoint
ALTER TABLE "sales" DROP CONSTRAINT "sales_medio_pago";--> statement-breakpoint
CREATE INDEX "customer_ledger_owner_cliente_idx" ON "customer_ledger" USING btree ("owner_id","customer_id");--> statement-breakpoint
CREATE INDEX "customers_owner_idx" ON "customers" USING btree ("owner_id");--> statement-breakpoint
ALTER TABLE "sale_returns" ADD CONSTRAINT "sale_returns_medio_pago" CHECK ("sale_returns"."payment_method" in ('EFECTIVO', 'DEBITO', 'CREDITO', 'TRANSFERENCIA', 'FIADO'));--> statement-breakpoint
ALTER TABLE "sales" ADD CONSTRAINT "sales_medio_pago" CHECK ("sales"."payment_method" in ('EFECTIVO', 'DEBITO', 'CREDITO', 'TRANSFERENCIA', 'FIADO'));