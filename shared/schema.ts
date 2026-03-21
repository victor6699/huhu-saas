import { pgTable, text, serial, integer, boolean, timestamp, json, real } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod";

// Users table — supports 4 roles: user (elder), family, caregiver, admin
export const users = pgTable("users", {
  id: serial("id").primaryKey(),
  username: text("username").notNull().unique(),
  password: text("password").notNull(),
  displayName: text("display_name").notNull(),
  role: text("role").notNull().default("user"), // user | family | caregiver | admin
  elderlyId: integer("elderly_id"), // family/caregiver links to elder's user id
  avatar: text("avatar"),
  age: integer("age"),
  location: text("location"),
  emergencyContact: text("emergency_contact"),
  medicationReminder: text("medication_reminder"),
});

// Conversations / Chat sessions
export const conversations = pgTable("conversations", {
  id: serial("id").primaryKey(),
  userId: integer("user_id").notNull(),
  message: text("message").notNull(),
  sender: text("sender").notNull(), // "user" | "ai"
  emotionScore: integer("emotion_score"), // 1-5: 1=very sad, 5=very happy
  riskLevel: text("risk_level"), // "green" | "yellow" | "red"
  timestamp: timestamp("timestamp").defaultNow(),
});

// Emotion log — daily emotional tracking
export const emotionLogs = pgTable("emotion_logs", {
  id: serial("id").primaryKey(),
  userId: integer("user_id").notNull(),
  date: text("date").notNull(), // YYYY-MM-DD
  score: integer("score").notNull(), // 1-5
  notes: text("notes"),
  hrv: integer("hrv"), // Heart Rate Variability from wearable
  interactions: integer("interactions").default(0), // number of chats that day
});

// Memory bank — AI's memory of the elder
export const memories = pgTable("memories", {
  id: serial("id").primaryKey(),
  userId: integer("user_id").notNull(),
  category: text("category").notNull(), // "family" | "food" | "hobby" | "health" | "event"
  title: text("title").notNull(),
  content: text("content").notNull(),
  createdAt: timestamp("created_at").defaultNow(),
});

// Risk alerts — triggered by L2/L3 detection
export const alerts = pgTable("alerts", {
  id: serial("id").primaryKey(),
  userId: integer("user_id").notNull(),
  level: text("level").notNull(), // "yellow" | "red"
  trigger: text("trigger").notNull(), // what triggered it
  summary: text("summary").notNull(),
  handled: boolean("handled").default(false),
  handledBy: integer("handled_by"),
  createdAt: timestamp("created_at").defaultNow(),
});

// Personality settings — adjustable by caregiver/family
export const personalitySettings = pgTable("personality_settings", {
  id: serial("id").primaryKey(),
  userId: integer("user_id").notNull().unique(),
  tone: text("tone").default("warm"), // "warm" | "humorous" | "calm" | "encouraging"
  callFrequency: text("call_frequency").default("daily"), // "daily" | "twice_daily" | "weekly"
  language: text("language").default("zh-TW"),
  specialTopics: text("special_topics").array(),
});

// Scan records — uploaded documents (medication, appointment, events)
export const scanRecords = pgTable("scan_records", {
  id: serial("id").primaryKey(),
  elderlyId: integer("elderly_id").notNull(),
  uploadedBy: integer("uploaded_by").notNull(), // family or caregiver user id
  type: text("type").notNull(), // "medication" | "appointment" | "event" | "invitation"
  title: text("title").notNull(),
  content: text("content").notNull(), // parsed/OCR text or manual input
  imageDataUrl: text("image_data_url"), // base64 preview (demo only)
  reminderDate: text("reminder_date"), // YYYY-MM-DD
  reminderTime: text("reminder_time"), // HH:mm
  reminderNote: text("reminder_note"),
  isAcknowledged: boolean("is_acknowledged").default(false),
  createdAt: timestamp("created_at").defaultNow(),
});

// Households — family container (PRD §5.2)
export const households = pgTable("households", {
  id: serial("id").primaryKey(),
  name: text("name").notNull(),
  primaryContactId: integer("primary_contact_id"),
  status: text("status").default("active"), // active | archived
  createdAt: timestamp("created_at").defaultNow(),
});

// Episodes — care event tracking (PRD §7.3)
export const episodes = pgTable("episodes", {
  id: serial("id").primaryKey(),
  personId: integer("person_id").notNull(),
  category: text("category").notNull(), // missed_medication | loneliness | sleep | mood_decline | fall_risk | caregiver_burden
  status: text("status").notNull().default("open"), // open | in_progress | resolved | closed
  summary: text("summary").notNull(),
  caregiverId: integer("caregiver_id"),
  openedAt: timestamp("opened_at").defaultNow(),
  closedAt: timestamp("closed_at"),
});

// Tasks — action items (PRD §5.2)
export const tasks = pgTable("tasks", {
  id: serial("id").primaryKey(),
  ownerId: integer("owner_id"), // who is assigned
  ownerRole: text("owner_role").notNull(), // family_primary | caregiver | admin
  personId: integer("person_id").notNull(), // which care subject
  type: text("type").notNull(), // family_callback | medication_check | visit | follow_up | appointment
  title: text("title").notNull(),
  dueAt: text("due_at"), // ISO date string
  status: text("status").notNull().default("pending"), // pending | claimed | completed | cancelled
  priority: text("priority").default("normal"), // low | normal | high | urgent
  createdAt: timestamp("created_at").defaultNow(),
  completedAt: timestamp("completed_at"),
});

// Audit Logs — append-only access trail (PRD §6)
export const auditLogs = pgTable("audit_logs", {
  id: serial("id").primaryKey(),
  actorId: integer("actor_id").notNull(),
  actorRole: text("actor_role").notNull(),
  action: text("action").notNull(), // view | export | update | create | delete | login | alert_handle
  objectType: text("object_type").notNull(), // conversation | alert | person | episode | task | scan_record
  objectId: text("object_id"),
  detail: text("detail"),
  ip: text("ip"),
  createdAt: timestamp("created_at").defaultNow(),
});

// Insert schemas
export const insertUserSchema = createInsertSchema(users).omit({ id: true });
export const insertConversationSchema = createInsertSchema(conversations).omit({ id: true, timestamp: true });
export const insertEmotionLogSchema = createInsertSchema(emotionLogs).omit({ id: true });
export const insertMemorySchema = createInsertSchema(memories).omit({ id: true, createdAt: true });
export const insertAlertSchema = createInsertSchema(alerts).omit({ id: true, createdAt: true });
export const insertPersonalitySettingsSchema = createInsertSchema(personalitySettings).omit({ id: true });
export const insertScanRecordSchema = createInsertSchema(scanRecords).omit({ id: true, createdAt: true });
export const insertHouseholdSchema = createInsertSchema(households).omit({ id: true, createdAt: true });
export const insertEpisodeSchema = createInsertSchema(episodes).omit({ id: true, openedAt: true });
export const insertTaskSchema = createInsertSchema(tasks).omit({ id: true, createdAt: true, completedAt: true });
export const insertAuditLogSchema = createInsertSchema(auditLogs).omit({ id: true, createdAt: true });

// Types
export type User = typeof users.$inferSelect;
export type InsertUser = z.infer<typeof insertUserSchema>;
export type Conversation = typeof conversations.$inferSelect;
export type InsertConversation = z.infer<typeof insertConversationSchema>;
export type EmotionLog = typeof emotionLogs.$inferSelect;
export type InsertEmotionLog = z.infer<typeof insertEmotionLogSchema>;
export type Memory = typeof memories.$inferSelect;
export type InsertMemory = z.infer<typeof insertMemorySchema>;
export type Alert = typeof alerts.$inferSelect;
export type InsertAlert = z.infer<typeof insertAlertSchema>;
export type PersonalitySettings = typeof personalitySettings.$inferSelect;
export type InsertPersonalitySettings = z.infer<typeof insertPersonalitySettingsSchema>;
export type ScanRecord = typeof scanRecords.$inferSelect;
export type InsertScanRecord = z.infer<typeof insertScanRecordSchema>;
export type Household = typeof households.$inferSelect;
export type InsertHousehold = z.infer<typeof insertHouseholdSchema>;
export type Episode = typeof episodes.$inferSelect;
export type InsertEpisode = z.infer<typeof insertEpisodeSchema>;
export type Task = typeof tasks.$inferSelect;
export type InsertTask = z.infer<typeof insertTaskSchema>;
export type AuditLog = typeof auditLogs.$inferSelect;
export type InsertAuditLog = z.infer<typeof insertAuditLogSchema>;

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
