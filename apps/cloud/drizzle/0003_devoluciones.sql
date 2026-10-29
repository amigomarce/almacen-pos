CREATE TABLE "sale_returns" (
	"id" text PRIMARY KEY NOT NULL,
	"owner_id" text NOT NULL,
	"sale_id" text NOT NULL,
	"register_id" text NOT NULL,
	"refund_clp" integer NOT NULL,
	"rounding_clp" integer DEFAULT 0 NOT NULL,
	"payment_method" text NOT NULL,
	"reason" text NOT NULL,
	"items" jsonb NOT NULL,
	"created_at" timestamp with time zone NOT NULL,
	CONSTRAINT "sale_returns_monto" CHECK ("sale_returns"."refund_clp" >= 0),
	CONSTRAINT "sale_returns_medio_pago" CHECK ("sale_returns"."payment_method" in ('EFECTIVO', 'DEBITO', 'CREDITO', 'TRANSFERENCIA'))
);
--> statement-breakpoint
CREATE INDEX "sale_returns_owner_fecha_idx" ON "sale_returns" USING btree ("owner_id","created_at");