// Royal Link OS — database schema (Drizzle ORM, PostgreSQL).
// All money values are whole Malawi Kwacha (MWK) integers.
import {
  pgTable, pgEnum, text, integer, boolean, timestamp, date, real, jsonb, uniqueIndex, index,
} from "drizzle-orm/pg-core";
import { relations } from "drizzle-orm";

const id = () => text("id").primaryKey().$defaultFn(() => crypto.randomUUID());
const createdAt = () => timestamp("created_at", { withTimezone: true }).defaultNow().notNull();

export const roleEnum = pgEnum("role", ["MANAGER", "OPERATIONS", "FINANCE", "DRIVER"]);
export const vehicleTypeEnum = pgEnum("vehicle_type", ["MINIBUS", "BUS", "LORRY"]);
export const earningModeEnum = pgEnum("earning_mode", ["DAILY_TARGET", "PER_JOB", "BOTH"]);
export const vehicleStatusEnum = pgEnum("vehicle_status", ["ACTIVE", "IN_GARAGE", "PARKED", "DISPOSED"]);
export const driverStatusEnum = pgEnum("driver_status", ["ACTIVE", "SUSPENDED", "LEFT"]);
export const payMethodEnum = pgEnum("pay_method", ["CASH", "AIRTEL_MONEY", "TNM_MPAMBA", "BANK", "PAYROLL"]);
export const dayStatusEnum = pgEnum("day_status", ["PENDING", "PAID", "SHORT", "EXCUSED", "REST_DAY"]);
export const expenseCategoryEnum = pgEnum("expense_category", [
  "FUEL", "STARTER_FUEL", "REPAIRS_PARTS", "TYRES", "SERVICE", "INSURANCE", "COF_LICENCE",
  "DRIVER_ALLOWANCE", "TOLLS_LEVIES", "LOAN_LEASE", "SALARIES", "OFFICE_ADMIN", "MARKETING", "OTHER",
]);
export const jobStatusEnum = pgEnum("job_status", ["QUOTED", "IN_TRANSIT", "DELIVERED", "INVOICED", "PAID", "CANCELLED"]);
export const workOrderStatusEnum = pgEnum("work_order_status", ["OPEN", "IN_PROGRESS", "DONE"]);
export const docTypeEnum = pgEnum("doc_type", [
  "COF", "INSURANCE", "ROAD_LICENCE", "PSV_LICENCE", "DRIVING_LICENCE", "OPERATOR_PERMIT", "OTHER",
]);
export const complaintSourceEnum = pgEnum("complaint_source", ["PASSENGER", "CLIENT", "STAFF", "DRIVER"]);
export const severityEnum = pgEnum("severity", ["LOW", "MEDIUM", "HIGH"]);
export const complaintStatusEnum = pgEnum("complaint_status", ["NEW", "IN_PROGRESS", "RESOLVED"]);
export const payrollStatusEnum = pgEnum("payroll_status", ["DRAFT", "APPROVED", "PAID"]);
export const adjustmentTypeEnum = pgEnum("adjustment_type", ["RECOVERY", "WAIVER"]);

export const users = pgTable("users", {
  id: id(),
  name: text("name").notNull(),
  email: text("email").notNull().unique(),
  passwordHash: text("password_hash").notNull(),
  role: roleEnum("role").notNull(),
  active: boolean("active").default(true).notNull(),
  driverId: text("driver_id").unique().references(() => drivers.id),
  /** Set when a temporary password was issued; forces a new password at next sign-in. */
  mustChangePassword: boolean("must_change_password").default(false).notNull(),
  /** Receive reminder emails. */
  notify: boolean("notify").default(true).notNull(),
  lastLoginAt: timestamp("last_login_at", { withTimezone: true }),
  createdAt: createdAt(),
});

/** Every email the system sends (or tries to send). */
export const emailLog = pgTable("email_log", {
  id: id(),
  userId: text("user_id").references(() => users.id),
  toEmail: text("to_email").notNull(),
  kind: text("kind").notNull(), // welcome | reminder | test
  subject: text("subject").notNull(),
  status: text("status").notNull(), // sent | failed | skipped
  error: text("error"),
  createdAt: createdAt(),
}, (t) => [index("email_log_created").on(t.createdAt)]);

export const vehicles = pgTable("vehicles", {
  id: id(),
  code: text("code").notNull().unique(), // BUS-01, LRY-01
  regNumber: text("reg_number").notNull().unique(),
  type: vehicleTypeEnum("type").notNull(),
  make: text("make"),
  model: text("model"),
  year: integer("year"),
  seats: integer("seats"),
  capacityTons: real("capacity_tons"),
  earningMode: earningModeEnum("earning_mode").default("DAILY_TARGET").notNull(),
  /** Target amount per period (see targetPeriod). Column name kept for compatibility. */
  dailyTarget: integer("daily_target").default(0).notNull(),
  /** DAY = target due every day (buses); WEEK = one target per Monday–Sunday week (lorries). */
  targetPeriod: text("target_period").$type<"DAY" | "WEEK">().default("DAY").notNull(),
  status: vehicleStatusEnum("status").default("ACTIVE").notNull(),
  odometer: integer("odometer").default(0).notNull(),
  purchaseDate: date("purchase_date"),
  purchaseCost: integer("purchase_cost"),
  notes: text("notes"),
  createdAt: createdAt(),
});

export const drivers = pgTable("drivers", {
  id: id(),
  fullName: text("full_name").notNull(),
  phone: text("phone").notNull(),
  nationalId: text("national_id"),
  licenceNumber: text("licence_number"),
  address: text("address"),
  guarantorName: text("guarantor_name"),
  guarantorPhone: text("guarantor_phone"),
  startDate: date("start_date").notNull(),
  status: driverStatusEnum("status").default("ACTIVE").notNull(),
  starterFuelGiven: boolean("starter_fuel_given").default(false).notNull(),
  vehicleId: text("vehicle_id").references(() => vehicles.id),
  notes: text("notes"),
  createdAt: createdAt(),
});

export const assignments = pgTable("assignments", {
  id: id(),
  driverId: text("driver_id").notNull().references(() => drivers.id),
  vehicleId: text("vehicle_id").notNull().references(() => vehicles.id),
  startDate: date("start_date").notNull(),
  endDate: date("end_date"),
});

/** One row per vehicle per day: the daily target ledger. */
export const dailyRecords = pgTable("daily_records", {
  id: id(),
  date: date("date").notNull(),
  vehicleId: text("vehicle_id").notNull().references(() => vehicles.id),
  driverId: text("driver_id").references(() => drivers.id),
  target: integer("target").notNull(),
  amountPaid: integer("amount_paid").default(0).notNull(),
  method: payMethodEnum("method"),
  reference: text("reference"),
  status: dayStatusEnum("status").default("PENDING").notNull(),
  excuseReason: text("excuse_reason"),
  approvedById: text("approved_by_id").references(() => users.id),
  recordedById: text("recorded_by_id").references(() => users.id),
  createdAt: createdAt(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
}, (t) => [uniqueIndex("daily_vehicle_date").on(t.vehicleId, t.date), index("daily_date").on(t.date), index("daily_driver").on(t.driverId)]);

/** Payments against old shortfalls (RECOVERY) or write-offs (WAIVER). */
export const driverAdjustments = pgTable("driver_adjustments", {
  id: id(),
  driverId: text("driver_id").notNull().references(() => drivers.id),
  type: adjustmentTypeEnum("type").notNull(),
  amount: integer("amount").notNull(),
  method: payMethodEnum("method"),
  date: date("date").notNull(),
  note: text("note"),
  payslipId: text("payslip_id"),
  createdAt: createdAt(),
});

export const expenses = pgTable("expenses", {
  id: id(),
  date: date("date").notNull(),
  vehicleId: text("vehicle_id").references(() => vehicles.id),
  category: expenseCategoryEnum("category").notNull(),
  amount: integer("amount").notNull(),
  description: text("description").notNull(),
  supplier: text("supplier"),
  litres: real("litres"),
  odometer: integer("odometer"),
  workOrderId: text("work_order_id").references(() => workOrders.id),
  recordedById: text("recorded_by_id").references(() => users.id),
  createdAt: createdAt(),
}, (t) => [index("expense_date").on(t.date), index("expense_vehicle").on(t.vehicleId)]);

/** Lorry haulage jobs with a digital waybill. */
export const haulageJobs = pgTable("haulage_jobs", {
  id: id(),
  waybillNo: text("waybill_no").notNull().unique(),
  date: date("date").notNull(),
  vehicleId: text("vehicle_id").notNull().references(() => vehicles.id),
  driverId: text("driver_id").references(() => drivers.id),
  client: text("client").notNull(),
  clientPhone: text("client_phone"),
  cargo: text("cargo").notNull(),
  weightTons: real("weight_tons"),
  origin: text("origin").notNull(),
  destination: text("destination").notNull(),
  rate: integer("rate").notNull(),
  amountPaid: integer("amount_paid").default(0).notNull(),
  status: jobStatusEnum("status").default("QUOTED").notNull(),
  deliveredAt: date("delivered_at"),
  paidAt: date("paid_at"),
  notes: text("notes"),
  createdAt: createdAt(),
});

export const serviceSchedules = pgTable("service_schedules", {
  id: id(),
  vehicleId: text("vehicle_id").notNull().references(() => vehicles.id),
  title: text("title").notNull(),
  intervalKm: integer("interval_km"),
  intervalDays: integer("interval_days"),
  lastDoneKm: integer("last_done_km"),
  lastDoneDate: date("last_done_date"),
  active: boolean("active").default(true).notNull(),
  /** A planned one-time job (e.g. a full service on a chosen date); switches itself off once done. */
  oneOff: boolean("one_off").default(false).notNull(),
});

export const workOrders = pgTable("work_orders", {
  id: id(),
  vehicleId: text("vehicle_id").notNull().references(() => vehicles.id),
  title: text("title").notNull(),
  details: text("details"),
  mechanic: text("mechanic"),
  status: workOrderStatusEnum("status").default("OPEN").notNull(),
  openedAt: date("opened_at").notNull(),
  closedAt: date("closed_at"),
  odometer: integer("odometer"),
  scheduleId: text("schedule_id").references(() => serviceSchedules.id),
  createdAt: createdAt(),
});

export const complianceDocs = pgTable("compliance_docs", {
  id: id(),
  type: docTypeEnum("type").notNull(),
  vehicleId: text("vehicle_id").references(() => vehicles.id),
  driverId: text("driver_id").references(() => drivers.id),
  number: text("number"),
  issuer: text("issuer"),
  issueDate: date("issue_date"),
  expiryDate: date("expiry_date").notNull(),
  cost: integer("cost"),
  notes: text("notes"),
  createdAt: createdAt(),
});

export const complaints = pgTable("complaints", {
  id: id(),
  date: date("date").notNull(),
  source: complaintSourceEnum("source").notNull(),
  severity: severityEnum("severity").default("MEDIUM").notNull(),
  vehicleId: text("vehicle_id").references(() => vehicles.id),
  driverId: text("driver_id").references(() => drivers.id),
  description: text("description").notNull(),
  contactName: text("contact_name"),
  contactPhone: text("contact_phone"),
  status: complaintStatusEnum("status").default("NEW").notNull(),
  assignedToId: text("assigned_to_id").references(() => users.id),
  resolution: text("resolution"),
  resolvedAt: date("resolved_at"),
  createdAt: createdAt(),
});

/** Anyone on payroll: office, garage and (optionally) drivers. */
export const staff = pgTable("staff", {
  id: id(),
  fullName: text("full_name").notNull(),
  jobTitle: text("job_title").notNull(),
  department: text("department").notNull(),
  phone: text("phone"),
  basicSalary: integer("basic_salary").notNull(),
  bankName: text("bank_name"),
  bankAccount: text("bank_account"),
  startDate: date("start_date").notNull(),
  active: boolean("active").default(true).notNull(),
  driverId: text("driver_id").unique().references(() => drivers.id),
  createdAt: createdAt(),
});

export const payrollRuns = pgTable("payroll_runs", {
  id: id(),
  month: text("month").notNull().unique(), // YYYY-MM
  status: payrollStatusEnum("status").default("DRAFT").notNull(),
  preparedById: text("prepared_by_id").references(() => users.id),
  approvedById: text("approved_by_id").references(() => users.id),
  approvedAt: timestamp("approved_at", { withTimezone: true }),
  createdAt: createdAt(),
});

export const payslips = pgTable("payslips", {
  id: id(),
  runId: text("run_id").notNull().references(() => payrollRuns.id, { onDelete: "cascade" }),
  staffId: text("staff_id").notNull().references(() => staff.id),
  basic: integer("basic").notNull(),
  bonus: integer("bonus").default(0).notNull(),
  allowances: integer("allowances").default(0).notNull(),
  gross: integer("gross").notNull(),
  paye: integer("paye").notNull(),
  pensionEmployee: integer("pension_employee").notNull(),
  pensionEmployer: integer("pension_employer").notNull(),
  shortfallRecovery: integer("shortfall_recovery").default(0).notNull(),
  otherDeductions: integer("other_deductions").default(0).notNull(),
  net: integer("net").notNull(),
}, (t) => [uniqueIndex("payslip_run_staff").on(t.runId, t.staffId)]);

/** Monthly budget lines; vehicleId null = company-wide. */
export const budgets = pgTable("budgets", {
  id: id(),
  month: text("month").notNull(),
  category: expenseCategoryEnum("category").notNull(),
  vehicleId: text("vehicle_id").references(() => vehicles.id),
  amount: integer("amount").notNull(),
});

/** Company-wide monthly income target (on top of per-vehicle daily targets). */
export const incomeTargets = pgTable("income_targets", {
  id: id(),
  month: text("month").notNull().unique(),
  amount: integer("amount").notNull(),
});

export const settings = pgTable("settings", {
  key: text("key").primaryKey(),
  value: jsonb("value").notNull(),
});

export const activityLog = pgTable("activity_log", {
  id: id(),
  userId: text("user_id").references(() => users.id),
  action: text("action").notNull(),
  detail: text("detail"),
  createdAt: createdAt(),
});

// Relations (for relational queries)
export const vehiclesRelations = relations(vehicles, ({ many }) => ({
  drivers: many(drivers),
  days: many(dailyRecords),
  expenses: many(expenses),
  jobs: many(haulageJobs),
  schedules: many(serviceSchedules),
  workOrders: many(workOrders),
  documents: many(complianceDocs),
}));
export const driversRelations = relations(drivers, ({ one, many }) => ({
  vehicle: one(vehicles, { fields: [drivers.vehicleId], references: [vehicles.id] }),
  days: many(dailyRecords),
  adjustments: many(driverAdjustments),
}));
export const dailyRecordsRelations = relations(dailyRecords, ({ one }) => ({
  vehicle: one(vehicles, { fields: [dailyRecords.vehicleId], references: [vehicles.id] }),
  driver: one(drivers, { fields: [dailyRecords.driverId], references: [drivers.id] }),
}));
export const expensesRelations = relations(expenses, ({ one }) => ({
  vehicle: one(vehicles, { fields: [expenses.vehicleId], references: [vehicles.id] }),
}));
export const jobsRelations = relations(haulageJobs, ({ one }) => ({
  vehicle: one(vehicles, { fields: [haulageJobs.vehicleId], references: [vehicles.id] }),
  driver: one(drivers, { fields: [haulageJobs.driverId], references: [drivers.id] }),
}));
export const schedulesRelations = relations(serviceSchedules, ({ one }) => ({
  vehicle: one(vehicles, { fields: [serviceSchedules.vehicleId], references: [vehicles.id] }),
}));
export const workOrdersRelations = relations(workOrders, ({ one, many }) => ({
  vehicle: one(vehicles, { fields: [workOrders.vehicleId], references: [vehicles.id] }),
  expenses: many(expenses),
}));
export const docsRelations = relations(complianceDocs, ({ one }) => ({
  vehicle: one(vehicles, { fields: [complianceDocs.vehicleId], references: [vehicles.id] }),
  driver: one(drivers, { fields: [complianceDocs.driverId], references: [drivers.id] }),
}));
export const complaintsRelations = relations(complaints, ({ one }) => ({
  vehicle: one(vehicles, { fields: [complaints.vehicleId], references: [vehicles.id] }),
  driver: one(drivers, { fields: [complaints.driverId], references: [drivers.id] }),
  assignedTo: one(users, { fields: [complaints.assignedToId], references: [users.id] }),
}));
export const staffRelations = relations(staff, ({ one, many }) => ({
  driver: one(drivers, { fields: [staff.driverId], references: [drivers.id] }),
  payslips: many(payslips),
}));
export const payrollRunsRelations = relations(payrollRuns, ({ many }) => ({
  payslips: many(payslips),
}));
export const payslipsRelations = relations(payslips, ({ one }) => ({
  run: one(payrollRuns, { fields: [payslips.runId], references: [payrollRuns.id] }),
  staff: one(staff, { fields: [payslips.staffId], references: [staff.id] }),
}));

export type Role = (typeof roleEnum.enumValues)[number];
export type ExpenseCategory = (typeof expenseCategoryEnum.enumValues)[number];
