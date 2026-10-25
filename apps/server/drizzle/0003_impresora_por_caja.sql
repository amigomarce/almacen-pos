ALTER TABLE `registers` ADD `printer_transport` text DEFAULT 'DESACTIVADA' NOT NULL;--> statement-breakpoint
ALTER TABLE `registers` ADD `printer_target` text;--> statement-breakpoint
ALTER TABLE `registers` ADD `printer_width_mm` integer DEFAULT 80 NOT NULL;--> statement-breakpoint
ALTER TABLE `registers` ADD `printer_columns` integer;--> statement-breakpoint
ALTER TABLE `registers` ADD `printer_codepage` text DEFAULT 'CP858' NOT NULL;--> statement-breakpoint
ALTER TABLE `registers` ADD `printer_cut` integer DEFAULT true NOT NULL;--> statement-breakpoint
ALTER TABLE `registers` ADD `printer_drawer` integer DEFAULT true NOT NULL;