CREATE TABLE "backups" (
	"id" text PRIMARY KEY NOT NULL,
	"owner_id" text NOT NULL,
	"installation_id" text NOT NULL,
	"filename" text NOT NULL,
	"object_key" text NOT NULL,
	"size_bytes" integer NOT NULL,
	"sha256" text,
	"created_at" timestamp with time zone NOT NULL,
	CONSTRAINT "backups_tamano" CHECK ("backups"."size_bytes" >= 0)
);
--> statement-breakpoint
CREATE INDEX "backups_dueno_idx" ON "backups" USING btree ("owner_id","installation_id","created_at");--> statement-breakpoint
CREATE UNIQUE INDEX "backups_objeto_uq" ON "backups" USING btree ("object_key");