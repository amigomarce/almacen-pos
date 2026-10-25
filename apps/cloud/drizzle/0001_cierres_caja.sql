CREATE TABLE "cash_closes" (
	"id" text PRIMARY KEY NOT NULL,
	"owner_id" text NOT NULL,
	"register_id" text NOT NULL,
	"register_name" text,
	"closed_at" timestamp with time zone NOT NULL,
	"counted_cash_clp" integer NOT NULL,
	"expected_cash_clp" integer NOT NULL,
	"difference_clp" integer NOT NULL,
	"total_ventas_clp" integer NOT NULL,
	"cantidad_ventas" integer NOT NULL
);
--> statement-breakpoint
CREATE INDEX "cash_closes_owner_idx" ON "cash_closes" USING btree ("owner_id","closed_at");