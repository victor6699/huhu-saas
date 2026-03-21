import { pgTable, text, integer, boolean, timestamp, real } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod";

// ── Staff (internal company users) ──────────────────────────
export const staff = pgTable("staff", {
  id: integer("id").primaryKey(),
  username: text("username").notNull().unique(),
  password: text("password").notNull(),
  displayName: text("display_name").notNull(),
  role: text("role").notNull(), // "superadmin" | "sales" | "finance" | "support"
  email: text("email").notNull(),
  isActive: boolean("is_active").notNull().default(true),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

export const insertStaffSchema = createInsertSchema(staff).omit({ id: true, createdAt: true });
export type InsertStaff = z.infer<typeof insertStaffSchema>;
export type Staff = typeof staff.$inferSelect;

// ── Clients (buying organisations / social welfare orgs / individuals) ──
export const clients = pgTable("clients", {
  id: integer("id").primaryKey(),
  clientType: text("client_type").notNull(), // "institution" | "social_welfare" | "individual"
  orgName: text("org_name"),          // 機構/社會局名稱
  contactName: text("contact_name").notNull(),
  contactEmail: text("contact_email").notNull().unique(),
  contactPhone: text("contact_phone"),
  taxId: text("tax_id"),              // 統一編號
  address: text("address"),
  username: text("username").notNull().unique(),
  password: text("password").notNull(),
  status: text("status").notNull().default("pending"), // "pending"|"active"|"suspended"|"cancelled"
  notes: text("notes"),
  assignedTo: integer("assigned_to"),  // staff id
  createdAt: timestamp("created_at").notNull().defaultNow(),
  activatedAt: timestamp("activated_at"),
});

export const insertClientSchema = createInsertSchema(clients).omit({ id: true, createdAt: true, activatedAt: true });
export type InsertClient = z.infer<typeof insertClientSchema>;
export type Client = typeof clients.$inferSelect;

// ── Plans (service tiers) ────────────────────────────────────
export const plans = pgTable("plans", {
  id: integer("id").primaryKey(),
  name: text("name").notNull(),
  description: text("description"),
  monthlyPrice: real("monthly_price").notNull(),
  annualPrice: real("annual_price").notNull(),
  maxElders: integer("max_elders").notNull(),
  features: text("features").notNull(), // JSON string array
  isActive: boolean("is_active").notNull().default(true),
});

export const insertPlanSchema = createInsertSchema(plans).omit({ id: true });
export type InsertPlan = z.infer<typeof insertPlanSchema>;
export type Plan = typeof plans.$inferSelect;

// ── Subscriptions ────────────────────────────────────────────
export const subscriptions = pgTable("subscriptions", {
  id: integer("id").primaryKey(),
  clientId: integer("client_id").notNull(),
  planId: integer("plan_id").notNull(),
  billingCycle: text("billing_cycle").notNull(), // "monthly" | "annual"
  status: text("status").notNull().default("active"), // "active"|"expired"|"cancelled"|"trial"
  elderCount: integer("elder_count").notNull().default(1),
  startDate: text("start_date").notNull(),
  endDate: text("end_date").notNull(),
  nextBillingDate: text("next_billing_date").notNull(),
  amount: real("amount").notNull(),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

export const insertSubscriptionSchema = createInsertSchema(subscriptions).omit({ id: true, createdAt: true });
export type InsertSubscription = z.infer<typeof insertSubscriptionSchema>;
export type Subscription = typeof subscriptions.$inferSelect;

// ── Invoices ─────────────────────────────────────────────────
export const invoices = pgTable("invoices", {
  id: integer("id").primaryKey(),
  invoiceNo: text("invoice_no").notNull().unique(),
  clientId: integer("client_id").notNull(),
  subscriptionId: integer("subscription_id"),
  issueDate: text("issue_date").notNull(),
  dueDate: text("due_date").notNull(),
  periodStart: text("period_start").notNull(),
  periodEnd: text("period_end").notNull(),
  subtotal: real("subtotal").notNull(),
  tax: real("tax").notNull().default(0),
  total: real("total").notNull(),
  status: text("status").notNull().default("unpaid"), // "unpaid"|"paid"|"overdue"|"cancelled"
  notes: text("notes"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

export const insertInvoiceSchema = createInsertSchema(invoices).omit({ id: true, createdAt: true });
export type InsertInvoice = z.infer<typeof insertInvoiceSchema>;
export type Invoice = typeof invoices.$inferSelect;

// ── Payments ─────────────────────────────────────────────────
export const payments = pgTable("payments", {
  id: integer("id").primaryKey(),
  invoiceId: integer("invoice_id").notNull(),
  clientId: integer("client_id").notNull(),
  amount: real("amount").notNull(),
  method: text("method").notNull(), // "newebpay"|"ecpay"|"stripe"|"bank_transfer"|"manual"
  status: text("status").notNull().default("pending"), // "pending"|"success"|"failed"|"refunded"
  transactionId: text("transaction_id"),
  paidAt: timestamp("paid_at"),
  notes: text("notes"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

export const insertPaymentSchema = createInsertSchema(payments).omit({ id: true, createdAt: true });
export type InsertPayment = z.infer<typeof insertPaymentSchema>;
export type Payment = typeof payments.$inferSelect;

// ── Service Records (usage logs) ─────────────────────────────
export const serviceRecords = pgTable("service_records", {
  id: integer("id").primaryKey(),
  clientId: integer("client_id").notNull(),
  subscriptionId: integer("subscription_id").notNull(),
  month: text("month").notNull(), // "2026-03"
  elderCount: integer("elder_count").notNull(),
  conversationCount: integer("conversation_count").notNull().default(0),
  alertCount: integer("alert_count").notNull().default(0),
  activeElders: integer("active_elders").notNull().default(0),
  notes: text("notes"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

export const insertServiceRecordSchema = createInsertSchema(serviceRecords).omit({ id: true, createdAt: true });
export type InsertServiceRecord = z.infer<typeof insertServiceRecordSchema>;
export type ServiceRecord = typeof serviceRecords.$inferSelect;
