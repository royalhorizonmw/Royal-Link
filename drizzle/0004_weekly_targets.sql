ALTER TABLE "vehicles" ADD COLUMN "target_period" text DEFAULT 'DAY' NOT NULL;
--> statement-breakpoint
-- Owner's rule (Oct 2026): lorries are on a weekly target; buses stay daily.
UPDATE "vehicles" SET "target_period" = 'WEEK' WHERE "type" = 'LORRY';
