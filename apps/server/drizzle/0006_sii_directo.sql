ALTER TABLE `store_settings` ADD `sii_ambiente` text;--> statement-breakpoint
ALTER TABLE `store_settings` ADD `sii_rut_envia` text;--> statement-breakpoint
ALTER TABLE `store_settings` ADD `sii_fch_resol` text;--> statement-breakpoint
ALTER TABLE `store_settings` ADD `sii_nro_resol` integer;--> statement-breakpoint
ALTER TABLE `store_settings` ADD `sii_credenciales` text;--> statement-breakpoint
ALTER TABLE `store_settings` ADD `sii_certificado_hasta` integer;--> statement-breakpoint
ALTER TABLE `tax_documents` ADD `last_attempt_at` integer;--> statement-breakpoint
CREATE INDEX `tax_documents_pendientes_idx` ON `tax_documents` (`provider`,`sii_status`,`last_attempt_at`);