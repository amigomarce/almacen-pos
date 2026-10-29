ALTER TABLE `products` ADD `label_price_clp` integer;--> statement-breakpoint
-- Los productos existentes parten con su fleje al día: solo los cambios posteriores quedan pendientes.
UPDATE `products` SET `label_price_clp` = `price_clp`;
