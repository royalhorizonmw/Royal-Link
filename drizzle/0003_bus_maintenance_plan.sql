-- Standard maintenance plan (owner's instruction, Oct 2026):
--   Buses/minibuses: brake pads every 3 weeks, oil every month.
--   All vehicles: no automatic full service (it is planned as a one-off when needed).

-- 1. Switch off automatic full services on every vehicle
UPDATE "service_schedules" SET "active" = false
WHERE "title" = 'Full service' AND "one_off" = false;
--> statement-breakpoint

-- 2. Buses: oil becomes monthly (by date only)
UPDATE "service_schedules" s SET "interval_km" = NULL, "interval_days" = 30
FROM "vehicles" v
WHERE s."vehicle_id" = v."id" AND v."type" IN ('MINIBUS', 'BUS') AND s."title" = 'Oil & filter change';
--> statement-breakpoint

-- 3. Buses: add the 3-weekly brake pad check where it is missing
INSERT INTO "service_schedules" ("id", "vehicle_id", "title", "interval_km", "interval_days", "last_done_km", "last_done_date", "active", "one_off")
SELECT gen_random_uuid()::text, v."id", 'Brake pads', NULL, 21, v."odometer", CURRENT_DATE, true, false
FROM "vehicles" v
WHERE v."type" IN ('MINIBUS', 'BUS') AND v."status" <> 'DISPOSED'
  AND NOT EXISTS (
    SELECT 1 FROM "service_schedules" s
    WHERE s."vehicle_id" = v."id" AND s."title" = 'Brake pads' AND s."active" = true
  );
--> statement-breakpoint

-- 4. Buses: add the monthly oil change where a bus has none
INSERT INTO "service_schedules" ("id", "vehicle_id", "title", "interval_km", "interval_days", "last_done_km", "last_done_date", "active", "one_off")
SELECT gen_random_uuid()::text, v."id", 'Oil & filter change', NULL, 30, v."odometer", CURRENT_DATE, true, false
FROM "vehicles" v
WHERE v."type" IN ('MINIBUS', 'BUS') AND v."status" <> 'DISPOSED'
  AND NOT EXISTS (
    SELECT 1 FROM "service_schedules" s
    WHERE s."vehicle_id" = v."id" AND s."title" = 'Oil & filter change' AND s."active" = true
  );
