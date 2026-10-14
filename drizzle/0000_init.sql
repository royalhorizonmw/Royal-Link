CREATE TYPE "public"."adjustment_type" AS ENUM('RECOVERY', 'WAIVER');--> statement-breakpoint
CREATE TYPE "public"."complaint_source" AS ENUM('PASSENGER', 'CLIENT', 'STAFF', 'DRIVER');--> statement-breakpoint
CREATE TYPE "public"."complaint_status" AS ENUM('NEW', 'IN_PROGRESS', 'RESOLVED');--> statement-breakpoint
CREATE TYPE "public"."day_status" AS ENUM('PENDING', 'PAID', 'SHORT', 'EXCUSED', 'REST_DAY');--> statement-breakpoint
CREATE TYPE "public"."doc_type" AS ENUM('COF', 'INSURANCE', 'ROAD_LICENCE', 'PSV_LICENCE', 'DRIVING_LICENCE', 'OPERATOR_PERMIT', 'OTHER');--> statement-breakpoint
CREATE TYPE "public"."driver_status" AS ENUM('ACTIVE', 'SUSPENDED', 'LEFT');--> statement-breakpoint
CREATE TYPE "public"."earning_mode" AS ENUM('DAILY_TARGET', 'PER_JOB', 'BOTH');--> statement-breakpoint
CREATE TYPE "public"."expense_category" AS ENUM('FUEL', 'STARTER_FUEL', 'REPAIRS_PARTS', 'TYRES', 'SERVICE', 'INSURANCE', 'COF_LICENCE', 'DRIVER_ALLOWANCE', 'TOLLS_LEVIES', 'LOAN_LEASE', 'SALARIES', 'OFFICE_ADMIN', 'MARKETING', 'OTHER');--> statement-breakpoint
CREATE TYPE "public"."job_status" AS ENUM('QUOTED', 'IN_TRANSIT', 'DELIVERED', 'INVOICED', 'PAID', 'CANCELLED');--> statement-breakpoint
CREATE TYPE "public"."pay_method" AS ENUM('CASH', 'AIRTEL_MONEY', 'TNM_MPAMBA', 'BANK', 'PAYROLL');--> statement-breakpoint
CREATE TYPE "public"."payroll_status" AS ENUM('DRAFT', 'APPROVED', 'PAID');--> statement-breakpoint
CREATE TYPE "public"."role" AS ENUM('MANAGER', 'OPERATIONS', 'FINANCE', 'DRIVER');--> statement-breakpoint
CREATE TYPE "public"."severity" AS ENUM('LOW', 'MEDIUM', 'HIGH');--> statement-breakpoint
CREATE TYPE "public"."vehicle_status" AS ENUM('ACTIVE', 'IN_GARAGE', 'PARKED', 'DISPOSED');--> statement-breakpoint
CREATE TYPE "public"."vehicle_type" AS ENUM('MINIBUS', 'BUS', 'LORRY');--> statement-breakpoint
CREATE TYPE "public"."work_order_status" AS ENUM('OPEN', 'IN_PROGRESS', 'DONE');--> statement-breakpoint
CREATE TABLE "activity_log" (
	"id" text PRIMARY KEY NOT NULL,
	"user_id" text,
	"action" text NOT NULL,
	"detail" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "assignments" (
	"id" text PRIMARY KEY NOT NULL,
	"driver_id" text NOT NULL,
	"vehicle_id" text NOT NULL,
	"start_date" date NOT NULL,
	"end_date" date
);
--> statement-breakpoint
CREATE TABLE "budgets" (
	"id" text PRIMARY KEY NOT NULL,
	"month" text NOT NULL,
	"category" "expense_category" NOT NULL,
	"vehicle_id" text,
	"amount" integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE "complaints" (
	"id" text PRIMARY KEY NOT NULL,
	"date" date NOT NULL,
	"source" "complaint_source" NOT NULL,
	"severity" "severity" DEFAULT 'MEDIUM' NOT NULL,
	"vehicle_id" text,
	"driver_id" text,
	"description" text NOT NULL,
	"contact_name" text,
	"contact_phone" text,
	"status" "complaint_status" DEFAULT 'NEW' NOT NULL,
	"assigned_to_id" text,
	"resolution" text,
	"resolved_at" date,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "compliance_docs" (
	"id" text PRIMARY KEY NOT NULL,
	"type" "doc_type" NOT NULL,
	"vehicle_id" text,
	"driver_id" text,
	"number" text,
	"issuer" text,
	"issue_date" date,
	"expiry_date" date NOT NULL,
	"cost" integer,
	"notes" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "daily_records" (
	"id" text PRIMARY KEY NOT NULL,
	"date" date NOT NULL,
	"vehicle_id" text NOT NULL,
	"driver_id" text,
	"target" integer NOT NULL,
	"amount_paid" integer DEFAULT 0 NOT NULL,
	"method" "pay_method",
	"reference" text,
	"status" "day_status" DEFAULT 'PENDING' NOT NULL,
	"excuse_reason" text,
	"approved_by_id" text,
	"recorded_by_id" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "driver_adjustments" (
	"id" text PRIMARY KEY NOT NULL,
	"driver_id" text NOT NULL,
	"type" "adjustment_type" NOT NULL,
	"amount" integer NOT NULL,
	"method" "pay_method",
	"date" date NOT NULL,
	"note" text,
	"payslip_id" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "drivers" (
	"id" text PRIMARY KEY NOT NULL,
	"full_name" text NOT NULL,
	"phone" text NOT NULL,
	"national_id" text,
	"licence_number" text,
	"address" text,
	"guarantor_name" text,
	"guarantor_phone" text,
	"start_date" date NOT NULL,
	"status" "driver_status" DEFAULT 'ACTIVE' NOT NULL,
	"starter_fuel_given" boolean DEFAULT false NOT NULL,
	"vehicle_id" text,
	"notes" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "expenses" (
	"id" text PRIMARY KEY NOT NULL,
	"date" date NOT NULL,
	"vehicle_id" text,
	"category" "expense_category" NOT NULL,
	"amount" integer NOT NULL,
	"description" text NOT NULL,
	"supplier" text,
	"litres" real,
	"odometer" integer,
	"work_order_id" text,
	"recorded_by_id" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "haulage_jobs" (
	"id" text PRIMARY KEY NOT NULL,
	"waybill_no" text NOT NULL,
	"date" date NOT NULL,
	"vehicle_id" text NOT NULL,
	"driver_id" text,
	"client" text NOT NULL,
	"client_phone" text,
	"cargo" text NOT NULL,
	"weight_tons" real,
	"origin" text NOT NULL,
	"destination" text NOT NULL,
	"rate" integer NOT NULL,
	"amount_paid" integer DEFAULT 0 NOT NULL,
	"status" "job_status" DEFAULT 'QUOTED' NOT NULL,
	"delivered_at" date,
	"paid_at" date,
	"notes" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "haulage_jobs_waybill_no_unique" UNIQUE("waybill_no")
);
--> statement-breakpoint
CREATE TABLE "income_targets" (
	"id" text PRIMARY KEY NOT NULL,
	"month" text NOT NULL,
	"amount" integer NOT NULL,
	CONSTRAINT "income_targets_month_unique" UNIQUE("month")
);
--> statement-breakpoint
CREATE TABLE "payroll_runs" (
	"id" text PRIMARY KEY NOT NULL,
	"month" text NOT NULL,
	"status" "payroll_status" DEFAULT 'DRAFT' NOT NULL,
	"prepared_by_id" text,
	"approved_by_id" text,
	"approved_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "payroll_runs_month_unique" UNIQUE("month")
);
--> statement-breakpoint
CREATE TABLE "payslips" (
	"id" text PRIMARY KEY NOT NULL,
	"run_id" text NOT NULL,
	"staff_id" text NOT NULL,
	"basic" integer NOT NULL,
	"bonus" integer DEFAULT 0 NOT NULL,
	"allowances" integer DEFAULT 0 NOT NULL,
	"gross" integer NOT NULL,
	"paye" integer NOT NULL,
	"pension_employee" integer NOT NULL,
	"pension_employer" integer NOT NULL,
	"shortfall_recovery" integer DEFAULT 0 NOT NULL,
	"other_deductions" integer DEFAULT 0 NOT NULL,
	"net" integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE "service_schedules" (
	"id" text PRIMARY KEY NOT NULL,
	"vehicle_id" text NOT NULL,
	"title" text NOT NULL,
	"interval_km" integer,
	"interval_days" integer,
	"last_done_km" integer,
	"last_done_date" date,
	"active" boolean DEFAULT true NOT NULL
);
--> statement-breakpoint
CREATE TABLE "settings" (
	"key" text PRIMARY KEY NOT NULL,
	"value" jsonb NOT NULL
);
--> statement-breakpoint
CREATE TABLE "staff" (
	"id" text PRIMARY KEY NOT NULL,
	"full_name" text NOT NULL,
	"job_title" text NOT NULL,
	"department" text NOT NULL,
	"phone" text,
	"basic_salary" integer NOT NULL,
	"bank_name" text,
	"bank_account" text,
	"start_date" date NOT NULL,
	"active" boolean DEFAULT true NOT NULL,
	"driver_id" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "staff_driver_id_unique" UNIQUE("driver_id")
);
--> statement-breakpoint
CREATE TABLE "users" (
	"id" text PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"email" text NOT NULL,
	"password_hash" text NOT NULL,
	"role" "role" NOT NULL,
	"active" boolean DEFAULT true NOT NULL,
	"driver_id" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "users_email_unique" UNIQUE("email"),
	CONSTRAINT "users_driver_id_unique" UNIQUE("driver_id")
);
--> statement-breakpoint
CREATE TABLE "vehicles" (
	"id" text PRIMARY KEY NOT NULL,
	"code" text NOT NULL,
	"reg_number" text NOT NULL,
	"type" "vehicle_type" NOT NULL,
	"make" text,
	"model" text,
	"year" integer,
	"seats" integer,
	"capacity_tons" real,
	"earning_mode" "earning_mode" DEFAULT 'DAILY_TARGET' NOT NULL,
	"daily_target" integer DEFAULT 0 NOT NULL,
	"status" "vehicle_status" DEFAULT 'ACTIVE' NOT NULL,
	"odometer" integer DEFAULT 0 NOT NULL,
	"purchase_date" date,
	"purchase_cost" integer,
	"notes" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "vehicles_code_unique" UNIQUE("code"),
	CONSTRAINT "vehicles_reg_number_unique" UNIQUE("reg_number")
);
--> statement-breakpoint
CREATE TABLE "work_orders" (
	"id" text PRIMARY KEY NOT NULL,
	"vehicle_id" text NOT NULL,
	"title" text NOT NULL,
	"details" text,
	"mechanic" text,
	"status" "work_order_status" DEFAULT 'OPEN' NOT NULL,
	"opened_at" date NOT NULL,
	"closed_at" date,
	"odometer" integer,
	"schedule_id" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "activity_log" ADD CONSTRAINT "activity_log_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "assignments" ADD CONSTRAINT "assignments_driver_id_drivers_id_fk" FOREIGN KEY ("driver_id") REFERENCES "public"."drivers"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "assignments" ADD CONSTRAINT "assignments_vehicle_id_vehicles_id_fk" FOREIGN KEY ("vehicle_id") REFERENCES "public"."vehicles"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "budgets" ADD CONSTRAINT "budgets_vehicle_id_vehicles_id_fk" FOREIGN KEY ("vehicle_id") REFERENCES "public"."vehicles"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "complaints" ADD CONSTRAINT "complaints_vehicle_id_vehicles_id_fk" FOREIGN KEY ("vehicle_id") REFERENCES "public"."vehicles"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "complaints" ADD CONSTRAINT "complaints_driver_id_drivers_id_fk" FOREIGN KEY ("driver_id") REFERENCES "public"."drivers"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "complaints" ADD CONSTRAINT "complaints_assigned_to_id_users_id_fk" FOREIGN KEY ("assigned_to_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "compliance_docs" ADD CONSTRAINT "compliance_docs_vehicle_id_vehicles_id_fk" FOREIGN KEY ("vehicle_id") REFERENCES "public"."vehicles"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "compliance_docs" ADD CONSTRAINT "compliance_docs_driver_id_drivers_id_fk" FOREIGN KEY ("driver_id") REFERENCES "public"."drivers"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "daily_records" ADD CONSTRAINT "daily_records_vehicle_id_vehicles_id_fk" FOREIGN KEY ("vehicle_id") REFERENCES "public"."vehicles"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "daily_records" ADD CONSTRAINT "daily_records_driver_id_drivers_id_fk" FOREIGN KEY ("driver_id") REFERENCES "public"."drivers"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "daily_records" ADD CONSTRAINT "daily_records_approved_by_id_users_id_fk" FOREIGN KEY ("approved_by_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "daily_records" ADD CONSTRAINT "daily_records_recorded_by_id_users_id_fk" FOREIGN KEY ("recorded_by_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "driver_adjustments" ADD CONSTRAINT "driver_adjustments_driver_id_drivers_id_fk" FOREIGN KEY ("driver_id") REFERENCES "public"."drivers"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "drivers" ADD CONSTRAINT "drivers_vehicle_id_vehicles_id_fk" FOREIGN KEY ("vehicle_id") REFERENCES "public"."vehicles"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "expenses" ADD CONSTRAINT "expenses_vehicle_id_vehicles_id_fk" FOREIGN KEY ("vehicle_id") REFERENCES "public"."vehicles"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "expenses" ADD CONSTRAINT "expenses_work_order_id_work_orders_id_fk" FOREIGN KEY ("work_order_id") REFERENCES "public"."work_orders"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "expenses" ADD CONSTRAINT "expenses_recorded_by_id_users_id_fk" FOREIGN KEY ("recorded_by_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "haulage_jobs" ADD CONSTRAINT "haulage_jobs_vehicle_id_vehicles_id_fk" FOREIGN KEY ("vehicle_id") REFERENCES "public"."vehicles"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "haulage_jobs" ADD CONSTRAINT "haulage_jobs_driver_id_drivers_id_fk" FOREIGN KEY ("driver_id") REFERENCES "public"."drivers"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "payroll_runs" ADD CONSTRAINT "payroll_runs_prepared_by_id_users_id_fk" FOREIGN KEY ("prepared_by_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "payroll_runs" ADD CONSTRAINT "payroll_runs_approved_by_id_users_id_fk" FOREIGN KEY ("approved_by_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "payslips" ADD CONSTRAINT "payslips_run_id_payroll_runs_id_fk" FOREIGN KEY ("run_id") REFERENCES "public"."payroll_runs"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "payslips" ADD CONSTRAINT "payslips_staff_id_staff_id_fk" FOREIGN KEY ("staff_id") REFERENCES "public"."staff"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "service_schedules" ADD CONSTRAINT "service_schedules_vehicle_id_vehicles_id_fk" FOREIGN KEY ("vehicle_id") REFERENCES "public"."vehicles"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "staff" ADD CONSTRAINT "staff_driver_id_drivers_id_fk" FOREIGN KEY ("driver_id") REFERENCES "public"."drivers"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "users" ADD CONSTRAINT "users_driver_id_drivers_id_fk" FOREIGN KEY ("driver_id") REFERENCES "public"."drivers"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "work_orders" ADD CONSTRAINT "work_orders_vehicle_id_vehicles_id_fk" FOREIGN KEY ("vehicle_id") REFERENCES "public"."vehicles"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "work_orders" ADD CONSTRAINT "work_orders_schedule_id_service_schedules_id_fk" FOREIGN KEY ("schedule_id") REFERENCES "public"."service_schedules"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "daily_vehicle_date" ON "daily_records" USING btree ("vehicle_id","date");--> statement-breakpoint
CREATE INDEX "daily_date" ON "daily_records" USING btree ("date");--> statement-breakpoint
CREATE INDEX "daily_driver" ON "daily_records" USING btree ("driver_id");--> statement-breakpoint
CREATE INDEX "expense_date" ON "expenses" USING btree ("date");--> statement-breakpoint
CREATE INDEX "expense_vehicle" ON "expenses" USING btree ("vehicle_id");--> statement-breakpoint
CREATE UNIQUE INDEX "payslip_run_staff" ON "payslips" USING btree ("run_id","staff_id");