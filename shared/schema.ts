import { pgTable, pgSchema, text, uuid, integer, boolean, timestamp, jsonb, real, date, time, inet, numeric, uniqueIndex } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod";

// ── Reference to Supabase auth.users ──────────────────────────
const authSchema = pgSchema("auth");

export const authUsers = authSchema.table("users", {
  id: uuid("id").primaryKey(),
});

// ═══════════════════════════════════════════════════════════════
// Module 1: 組織與租戶
// ═══════════════════════════════════════════════════════════════

export const organizations = pgTable("organizations", {
  id: uuid("id").defaultRandom().primaryKey(),
  orgType: text("org_type").notNull(), // individual_family, care_institution, gov_welfare_bureau
  name: text("name").notNull(),
  legalName: text("legal_name"),
  taxId: text("tax_id"),
  parentOrgId: uuid("parent_org_id").references((): any => organizations.id),
  address: text("address"),
  phone: text("phone"),
  email: text("email"),
  status: text("status").notNull().default("active"),
  metadata: jsonb("metadata").default({}),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

export const organizationMembers = pgTable("organization_members", {
  id: uuid("id").defaultRandom().primaryKey(),
  organizationId: uuid("organization_id").notNull().references(() => organizations.id, { onDelete: "cascade" }),
  userId: uuid("user_id").notNull().references(() => authUsers.id, { onDelete: "cascade" }),
  personProfileId: uuid("person_profile_id").references(() => personProfiles.id),
  roleCode: text("role_code").notNull(), // admin, case_manager, caregiver, family_member, gov_officer, sales, finance, support
  title: text("title"),
  status: text("status").notNull().default("active"),
  joinedAt: timestamp("joined_at", { withTimezone: true }).notNull().defaultNow(),
});

// ═══════════════════════════════════════════════════════════════
// Module 2: 使用者與身份
// ═══════════════════════════════════════════════════════════════

export const personProfiles = pgTable("person_profiles", {
  id: uuid("id").defaultRandom().primaryKey(),
  userId: uuid("user_id").references(() => authUsers.id, { onDelete: "set null" }),
  fullName: text("full_name").notNull(),
  nickname: text("nickname"),
  gender: text("gender"),
  birthDate: date("birth_date"),
  nationalIdHash: text("national_id_hash"),
  phone: text("phone"),
  email: text("email"),
  address: text("address"),
  avatarUrl: text("avatar_url"),
  emergencyContact: jsonb("emergency_contact"),
  metadata: jsonb("metadata").default({}),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

// ═══════════════════════════════════════════════════════════════
// Module 3: 照護主體與關係
// ═══════════════════════════════════════════════════════════════

export const careRecipients = pgTable("care_recipients", {
  id: uuid("id").defaultRandom().primaryKey(),
  personProfileId: uuid("person_profile_id").notNull().references(() => personProfiles.id, { onDelete: "cascade" }),
  primaryOrgId: uuid("primary_org_id").references(() => organizations.id),
  careLevel: text("care_level"),
  disabilityGrade: text("disability_grade"),
  dementiaStage: text("dementia_stage"),
  communicationStyle: text("communication_style"),
  riskFlags: jsonb("risk_flags").default([]),
  preferences: jsonb("preferences").default({}),
  aiSummary: text("ai_summary"),
  status: text("status").notNull().default("active"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

export const careRelationships = pgTable("care_relationships", {
  id: uuid("id").defaultRandom().primaryKey(),
  careRecipientId: uuid("care_recipient_id").notNull().references(() => careRecipients.id, { onDelete: "cascade" }),
  relatedPersonId: uuid("related_person_id").references(() => personProfiles.id),
  relatedOrgId: uuid("related_org_id").references(() => organizations.id),
  relationshipType: text("relationship_type").notNull(),
  permissionScope: jsonb("permission_scope").notNull().default({
    view_profile: true,
    view_chat: true,
    send_message: true,
    view_events: true,
    manage_events: false,
    view_health_notes: false,
    manage_care_team: false,
  }),
  isPrimary: boolean("is_primary").default(false),
  priorityLevel: integer("priority_level").default(0),
  startDate: date("start_date"),
  endDate: date("end_date"),
  status: text("status").notNull().default("active"),
  notes: text("notes"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

export const households = pgTable("households", {
  id: uuid("id").defaultRandom().primaryKey(),
  name: text("name").notNull(),
  organizationId: uuid("organization_id").references(() => organizations.id),
  primaryContactId: uuid("primary_contact_id").references(() => personProfiles.id),
  status: text("status").notNull().default("active"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

// ═══════════════════════════════════════════════════════════════
// Module 4: 聊天系統
// ═══════════════════════════════════════════════════════════════

export const conversations = pgTable("conversations", {
  id: uuid("id").defaultRandom().primaryKey(),
  organizationId: uuid("organization_id").references(() => organizations.id),
  careRecipientId: uuid("care_recipient_id").references(() => careRecipients.id),
  initiatedByUserId: uuid("initiated_by_user_id").references(() => authUsers.id),
  channel: text("channel").notNull().default("app"),
  conversationType: text("conversation_type").notNull().default("care_chat"),
  title: text("title"),
  status: text("status").notNull().default("active"),
  startedAt: timestamp("started_at", { withTimezone: true }).notNull().defaultNow(),
  lastMessageAt: timestamp("last_message_at", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const conversationParticipants = pgTable("conversation_participants", {
  id: uuid("id").defaultRandom().primaryKey(),
  conversationId: uuid("conversation_id").notNull().references(() => conversations.id, { onDelete: "cascade" }),
  userId: uuid("user_id").references(() => authUsers.id),
  personProfileId: uuid("person_profile_id").references(() => personProfiles.id),
  participantRole: text("participant_role").notNull(),
  joinedAt: timestamp("joined_at", { withTimezone: true }).notNull().defaultNow(),
});

export const messages = pgTable("messages", {
  id: uuid("id").defaultRandom().primaryKey(),
  conversationId: uuid("conversation_id").notNull().references(() => conversations.id, { onDelete: "cascade" }),
  senderType: text("sender_type").notNull(), // user, ai, system
  senderUserId: uuid("sender_user_id").references(() => authUsers.id),
  senderProfileId: uuid("sender_profile_id").references(() => personProfiles.id),
  content: text("content").notNull(),
  contentType: text("content_type").notNull().default("text"),
  messageMetadata: jsonb("message_metadata").default({}),
  aiIntent: text("ai_intent"),
  sentimentScore: numeric("sentiment_score", { precision: 5, scale: 2 }),
  emotionScore: integer("emotion_score"),
  riskLevel: text("risk_level"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

// ═══════════════════════════════════════════════════════════════
// Module 5: AI 記憶
// ═══════════════════════════════════════════════════════════════

export const memoryItems = pgTable("memory_items", {
  id: uuid("id").defaultRandom().primaryKey(),
  careRecipientId: uuid("care_recipient_id").references(() => careRecipients.id, { onDelete: "cascade" }),
  conversationId: uuid("conversation_id").references(() => conversations.id),
  sourceMessageId: uuid("source_message_id").references(() => messages.id),
  memoryType: text("memory_type").notNull(),
  category: text("category"),
  key: text("key"),
  title: text("title"),
  valueText: text("value_text"),
  valueJson: jsonb("value_json"),
  importanceScore: integer("importance_score").default(0),
  confidenceScore: numeric("confidence_score", { precision: 5, scale: 2 }),
  validFrom: timestamp("valid_from", { withTimezone: true }),
  validTo: timestamp("valid_to", { withTimezone: true }),
  isActive: boolean("is_active").notNull().default(true),
  createdBy: text("created_by").notNull().default("ai"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

export const conversationSummaries = pgTable("conversation_summaries", {
  id: uuid("id").defaultRandom().primaryKey(),
  conversationId: uuid("conversation_id").notNull().references(() => conversations.id, { onDelete: "cascade" }),
  careRecipientId: uuid("care_recipient_id").references(() => careRecipients.id),
  summaryType: text("summary_type").notNull(),
  summaryText: text("summary_text").notNull(),
  summaryJson: jsonb("summary_json"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const personalitySettings = pgTable("personality_settings", {
  id: uuid("id").defaultRandom().primaryKey(),
  careRecipientId: uuid("care_recipient_id").notNull().references(() => careRecipients.id, { onDelete: "cascade" }).unique(),
  tone: text("tone").default("warm"),
  callFrequency: text("call_frequency").default("daily"),
  language: text("language").default("zh-TW"),
  specialTopics: text("special_topics").array(),
  metadata: jsonb("metadata").default({}),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

export const emotionLogs = pgTable("emotion_logs", {
  id: uuid("id").defaultRandom().primaryKey(),
  careRecipientId: uuid("care_recipient_id").notNull().references(() => careRecipients.id, { onDelete: "cascade" }),
  date: date("date").notNull(),
  score: integer("score").notNull(),
  notes: text("notes"),
  hrv: integer("hrv"),
  interactions: integer("interactions").default(0),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const emotionAssessments = pgTable("emotion_assessments", {
  id: uuid("id").defaultRandom().primaryKey(),
  careRecipientId: uuid("care_recipient_id").references(() => careRecipients.id),
  assessedByUserId: uuid("assessed_by_user_id").references(() => authUsers.id),
  assessmentDate: date("assessment_date").notNull(),
  assessmentType: text("assessment_type").notNull().default("ai_auto"),
  overallScore: numeric("overall_score", { precision: 5, scale: 2 }),
  assessmentData: jsonb("assessment_data").default({}),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});


// ═══════════════════════════════════════════════════════════════
// Module 6: 事件與提醒
// ═══════════════════════════════════════════════════════════════

export const careEvents = pgTable("care_events", {
  id: uuid("id").defaultRandom().primaryKey(),
  careRecipientId: uuid("care_recipient_id").notNull().references(() => careRecipients.id, { onDelete: "cascade" }),
  createdByUserId: uuid("created_by_user_id").references(() => authUsers.id),
  eventType: text("event_type").notNull(),
  title: text("title").notNull(),
  description: text("description"),
  eventStartAt: timestamp("event_start_at", { withTimezone: true }).notNull(),
  eventEndAt: timestamp("event_end_at", { withTimezone: true }),
  isAllDay: boolean("is_all_day").notNull().default(false),
  priority: text("priority").notNull().default("normal"),
  status: text("status").notNull().default("scheduled"),
  metadata: jsonb("metadata").default({}),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

export const eventAssignees = pgTable("event_assignees", {
  id: uuid("id").defaultRandom().primaryKey(),
  eventId: uuid("event_id").notNull().references(() => careEvents.id, { onDelete: "cascade" }),
  userId: uuid("user_id").references(() => authUsers.id),
  personProfileId: uuid("person_profile_id").references(() => personProfiles.id),
  organizationId: uuid("organization_id").references(() => organizations.id),
  assigneeRole: text("assignee_role"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const reminders = pgTable("reminders", {
  id: uuid("id").defaultRandom().primaryKey(),
  eventId: uuid("event_id").notNull().references(() => careEvents.id, { onDelete: "cascade" }),
  reminderType: text("reminder_type").notNull(),
  remindAt: timestamp("remind_at", { withTimezone: true }),
  recurrenceRule: text("recurrence_rule"),
  channel: text("channel").notNull(),
  status: text("status").notNull().default("active"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const notificationLogs = pgTable("notification_logs", {
  id: uuid("id").defaultRandom().primaryKey(),
  reminderId: uuid("reminder_id").references(() => reminders.id),
  careEventId: uuid("care_event_id").references(() => careEvents.id),
  recipientUserId: uuid("recipient_user_id").references(() => authUsers.id),
  channel: text("channel").notNull(),
  deliveryStatus: text("delivery_status").notNull(),
  sentAt: timestamp("sent_at", { withTimezone: true }),
  readAt: timestamp("read_at", { withTimezone: true }),
  payload: jsonb("payload"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

// ═══════════════════════════════════════════════════════════════
// Module 7: 照護紀錄與風險
// ═══════════════════════════════════════════════════════════════

export const careNotes = pgTable("care_notes", {
  id: uuid("id").defaultRandom().primaryKey(),
  careRecipientId: uuid("care_recipient_id").notNull().references(() => careRecipients.id, { onDelete: "cascade" }),
  authorUserId: uuid("author_user_id").references(() => authUsers.id),
  noteType: text("note_type").notNull(),
  noteText: text("note_text").notNull(),
  noteJson: jsonb("note_json"),
  visibilityLevel: text("visibility_level").notNull().default("restricted"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

export const healthObservations = pgTable("health_observations", {
  id: uuid("id").defaultRandom().primaryKey(),
  careRecipientId: uuid("care_recipient_id").notNull().references(() => careRecipients.id, { onDelete: "cascade" }),
  observedByUserId: uuid("observed_by_user_id").references(() => authUsers.id),
  observationType: text("observation_type").notNull(),
  valueText: text("value_text"),
  valueNum: numeric("value_num", { precision: 10, scale: 2 }),
  unit: text("unit"),
  confidence: real("confidence"),
  source: text("source").notNull().default("ai"),
  observedAt: timestamp("observed_at", { withTimezone: true }).notNull(),
  metadata: jsonb("metadata").default({}),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const alerts = pgTable("alerts", {
  id: uuid("id").defaultRandom().primaryKey(),
  careRecipientId: uuid("care_recipient_id").notNull().references(() => careRecipients.id, { onDelete: "cascade" }),
  level: text("level").notNull(),
  triggerReason: text("trigger_reason").notNull(),
  summary: text("summary").notNull(),
  handled: boolean("handled").default(false),
  handledByUserId: uuid("handled_by_user_id").references(() => authUsers.id),
  alertStatus: text("alert_status").default("open"),
  reasonCode: text("reason_code"),
  episodeId: uuid("episode_id"),
  sourceRiskEventId: uuid("source_risk_event_id"),
  ownerId: uuid("owner_id").references(() => authUsers.id),
  slaAt: timestamp("sla_at", { withTimezone: true }),
  escalationStage: integer("escalation_stage").default(0),
  createdBy: text("created_by").default("system"),
  acknowledgedAt: timestamp("acknowledged_at", { withTimezone: true }),
  resolvedAt: timestamp("resolved_at", { withTimezone: true }),
  closureReason: text("closure_reason"),
  closedByUserId: uuid("closed_by_user_id").references(() => authUsers.id),
  closedAt: timestamp("closed_at", { withTimezone: true }),
  actionTaken: text("action_taken"),
  outcome: text("outcome"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const riskEventLog = pgTable("risk_event_log", {
  id: uuid("id").defaultRandom().primaryKey(),
  messageId: uuid("message_id").references(() => messages.id),
  careRecipientId: uuid("care_recipient_id").notNull().references(() => careRecipients.id, { onDelete: "cascade" }),
  episodeId: uuid("episode_id"),
  inputRiskCandidate: text("input_risk_candidate"),
  finalRiskLevel: text("final_risk_level").notNull(),
  riskReasons: jsonb("risk_reasons"),
  decisionSource: text("decision_source").default("rule_engine"),
  policyTrace: jsonb("policy_trace"),
  needsHumanReview: boolean("needs_human_review").default(false),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const episodes = pgTable("episodes", {
  id: uuid("id").defaultRandom().primaryKey(),
  careRecipientId: uuid("care_recipient_id").notNull().references(() => careRecipients.id, { onDelete: "cascade" }),
  category: text("category").notNull(),
  status: text("status").notNull().default("open"),
  summary: text("summary").notNull(),
  caregiverId: uuid("caregiver_id").references(() => authUsers.id),
  openedAt: timestamp("opened_at", { withTimezone: true }).notNull().defaultNow(),
  closedAt: timestamp("closed_at", { withTimezone: true }),
});

export const tasks = pgTable("tasks", {
  id: uuid("id").defaultRandom().primaryKey(),
  ownerId: uuid("owner_id").references(() => authUsers.id),
  ownerRole: text("owner_role").notNull(),
  careRecipientId: uuid("care_recipient_id").notNull().references(() => careRecipients.id, { onDelete: "cascade" }),
  taskType: text("task_type").notNull(),
  title: text("title").notNull(),
  dueAt: timestamp("due_at", { withTimezone: true }),
  status: text("status").notNull().default("pending"),
  priority: text("priority").default("normal"),
  riskLevel: text("risk_level"),
  episodeId: uuid("episode_id").references(() => episodes.id),
  sourceRiskEventId: uuid("source_risk_event_id").references(() => riskEventLog.id),
  slaAt: timestamp("sla_at", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  completedAt: timestamp("completed_at", { withTimezone: true }),
});

// ═══════════════════════════════════════════════════════════════
// Module 8: 掃描與附件
// ═══════════════════════════════════════════════════════════════

export const scanRecords = pgTable("scan_records", {
  id: uuid("id").defaultRandom().primaryKey(),
  careRecipientId: uuid("care_recipient_id").notNull().references(() => careRecipients.id, { onDelete: "cascade" }),
  uploadedByUserId: uuid("uploaded_by_user_id").notNull().references(() => authUsers.id),
  scanType: text("scan_type").notNull(),
  status: text("status").notNull().default("confirmed"),
  title: text("title").notNull(),
  content: text("content").notNull(),
  imageUrl: text("image_url"),
  rawText: text("raw_text"),
  aiConfidence: real("ai_confidence"),
  aiUncertainties: jsonb("ai_uncertainties"),
  reminderDate: date("reminder_date"),
  reminderTime: time("reminder_time"),
  reminderNote: text("reminder_note"),
  isAcknowledged: boolean("is_acknowledged").default(false),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const attachments = pgTable("attachments", {
  id: uuid("id").defaultRandom().primaryKey(),
  careRecipientId: uuid("care_recipient_id").references(() => careRecipients.id),
  uploadedByUserId: uuid("uploaded_by_user_id").references(() => authUsers.id),
  fileName: text("file_name").notNull(),
  fileType: text("file_type").notNull(),
  mimeType: text("mime_type"),
  fileSize: integer("file_size"),
  storagePath: text("storage_path").notNull(),
  relatedTable: text("related_table"),
  relatedId: uuid("related_id"),
  metadata: jsonb("metadata").default({}),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const webauthnCredentials = pgTable("webauthn_credentials", {
  id: uuid("id").defaultRandom().primaryKey(),
  userId: uuid("user_id").notNull().references(() => authUsers.id, { onDelete: "cascade" }),
  credentialId: text("credential_id").notNull().unique(),
  publicKey: text("public_key").notNull(),
  counter: integer("counter").notNull().default(0),
  transports: jsonb("transports"),
  deviceType: text("device_type"),
  backedUp: boolean("backed_up").default(false),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  lastUsedAt: timestamp("last_used_at", { withTimezone: true }),
});

// ═══════════════════════════════════════════════════════════════
// Module 9: SaaS 帳務
// ═══════════════════════════════════════════════════════════════

export const plans = pgTable("plans", {
  id: uuid("id").defaultRandom().primaryKey(),
  name: text("name").notNull(),
  description: text("description"),
  monthlyPrice: real("monthly_price").notNull(),
  annualPrice: real("annual_price").notNull(),
  maxElders: integer("max_elders").notNull(),
  features: jsonb("features").notNull().default([]),
  isActive: boolean("is_active").notNull().default(true),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

export const subscriptions = pgTable("subscriptions", {
  id: uuid("id").defaultRandom().primaryKey(),
  organizationId: uuid("organization_id").notNull().references(() => organizations.id, { onDelete: "cascade" }),
  planId: uuid("plan_id").notNull().references(() => plans.id),
  billingCycle: text("billing_cycle").notNull(),
  status: text("status").notNull().default("active"),
  elderCount: integer("elder_count").notNull().default(1),
  startDate: date("start_date").notNull(),
  endDate: date("end_date").notNull(),
  nextBillingDate: date("next_billing_date").notNull(),
  amount: real("amount").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const invoices = pgTable("invoices", {
  id: uuid("id").defaultRandom().primaryKey(),
  invoiceNo: text("invoice_no").notNull().unique(),
  organizationId: uuid("organization_id").notNull().references(() => organizations.id),
  subscriptionId: uuid("subscription_id").references(() => subscriptions.id),
  issueDate: date("issue_date").notNull(),
  dueDate: date("due_date").notNull(),
  periodStart: date("period_start").notNull(),
  periodEnd: date("period_end").notNull(),
  subtotal: real("subtotal").notNull(),
  tax: real("tax").notNull().default(0),
  total: real("total").notNull(),
  status: text("status").notNull().default("unpaid"),
  notes: text("notes"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const payments = pgTable("payments", {
  id: uuid("id").defaultRandom().primaryKey(),
  invoiceId: uuid("invoice_id").notNull().references(() => invoices.id),
  organizationId: uuid("organization_id").notNull().references(() => organizations.id),
  amount: real("amount").notNull(),
  method: text("method").notNull(),
  status: text("status").notNull().default("pending"),
  transactionId: text("transaction_id"),
  paidAt: timestamp("paid_at", { withTimezone: true }),
  notes: text("notes"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const serviceRecords = pgTable("service_records", {
  id: uuid("id").defaultRandom().primaryKey(),
  organizationId: uuid("organization_id").notNull().references(() => organizations.id),
  subscriptionId: uuid("subscription_id").notNull().references(() => subscriptions.id),
  month: text("month").notNull(),
  elderCount: integer("elder_count").notNull(),
  conversationCount: integer("conversation_count").notNull().default(0),
  alertCount: integer("alert_count").notNull().default(0),
  activeElders: integer("active_elders").notNull().default(0),
  notes: text("notes"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

// ═══════════════════════════════════════════════════════════════
// Module 10: 稽核與進階
// ═══════════════════════════════════════════════════════════════

export const auditLogs = pgTable("audit_logs", {
  id: uuid("id").defaultRandom().primaryKey(),
  actorUserId: uuid("actor_user_id").references(() => authUsers.id),
  actorRole: text("actor_role").notNull(),
  actionType: text("action_type").notNull(),
  targetTable: text("target_table").notNull(),
  targetId: uuid("target_id"),
  organizationId: uuid("organization_id").references(() => organizations.id),
  careRecipientId: uuid("care_recipient_id").references(() => careRecipients.id),
  changeSummary: jsonb("change_summary"),
  detail: text("detail"),
  ipAddress: text("ip_address"), // Using text instead of inet for Drizzle compatibility
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const carePlans = pgTable("care_plans", {
  id: uuid("id").defaultRandom().primaryKey(),
  careRecipientId: uuid("care_recipient_id").notNull().references(() => careRecipients.id, { onDelete: "cascade" }),
  createdByUserId: uuid("created_by_user_id").references(() => authUsers.id),
  planType: text("plan_type").notNull(),
  title: text("title").notNull(),
  description: text("description"),
  goals: jsonb("goals").default([]),
  schedule: jsonb("schedule").default({}),
  status: text("status").notNull().default("active"),
  startDate: date("start_date"),
  endDate: date("end_date"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

export const benefitCases = pgTable("benefit_cases", {
  id: uuid("id").defaultRandom().primaryKey(),
  careRecipientId: uuid("care_recipient_id").notNull().references(() => careRecipients.id, { onDelete: "cascade" }),
  organizationId: uuid("organization_id").references(() => organizations.id),
  caseOfficerId: uuid("case_officer_id").references(() => authUsers.id),
  caseType: text("case_type").notNull(),
  caseNumber: text("case_number"),
  status: text("status").notNull().default("pending"),
  appliedAt: date("applied_at"),
  approvedAt: date("approved_at"),
  expiresAt: date("expires_at"),
  benefitAmount: real("benefit_amount"),
  benefitDetails: jsonb("benefit_details").default({}),
  notes: text("notes"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

export const aiRiskAlerts = pgTable("ai_risk_alerts", {
  id: uuid("id").defaultRandom().primaryKey(),
  careRecipientId: uuid("care_recipient_id").notNull().references(() => careRecipients.id, { onDelete: "cascade" }),
  alertType: text("alert_type").notNull(),
  severity: text("severity").notNull(),
  confidenceScore: numeric("confidence_score", { precision: 5, scale: 2 }),
  description: text("description").notNull(),
  recommendation: text("recommendation"),
  sourceData: jsonb("source_data").default({}),
  status: text("status").notNull().default("pending"),
  reviewedByUserId: uuid("reviewed_by_user_id").references(() => authUsers.id),
  reviewedAt: timestamp("reviewed_at", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

// ═══════════════════════════════════════════════════════════════
// Insert Schemas (Zod validation)
// ═══════════════════════════════════════════════════════════════

export const insertOrganizationSchema = createInsertSchema(organizations).omit({ id: true, createdAt: true, updatedAt: true });
export const insertPersonProfileSchema = createInsertSchema(personProfiles).omit({ id: true, createdAt: true, updatedAt: true });
export const insertOrganizationMemberSchema = createInsertSchema(organizationMembers).omit({ id: true, joinedAt: true });
export const insertCareRecipientSchema = createInsertSchema(careRecipients).omit({ id: true, createdAt: true, updatedAt: true });
export const insertCareRelationshipSchema = createInsertSchema(careRelationships).omit({ id: true, createdAt: true, updatedAt: true });
export const insertHouseholdSchema = createInsertSchema(households).omit({ id: true, createdAt: true, updatedAt: true });
export const insertConversationSchema = createInsertSchema(conversations).omit({ id: true, createdAt: true, startedAt: true });
export const insertConversationParticipantSchema = createInsertSchema(conversationParticipants).omit({ id: true, joinedAt: true });
export const insertMessageSchema = createInsertSchema(messages).omit({ id: true, createdAt: true });
export const insertMemoryItemSchema = createInsertSchema(memoryItems).omit({ id: true, createdAt: true, updatedAt: true });
export const insertConversationSummarySchema = createInsertSchema(conversationSummaries).omit({ id: true, createdAt: true });
export const insertPersonalitySettingsSchema = createInsertSchema(personalitySettings).omit({ id: true, createdAt: true, updatedAt: true });
export const insertEmotionAssessmentSchema = createInsertSchema(emotionAssessments).omit({ id: true, createdAt: true });
export const insertEmotionLogSchema = createInsertSchema(emotionLogs).omit({ id: true, createdAt: true });
export const insertCareEventSchema = createInsertSchema(careEvents).omit({ id: true, createdAt: true, updatedAt: true });
export const insertEventAssigneeSchema = createInsertSchema(eventAssignees).omit({ id: true, createdAt: true });
export const insertReminderSchema = createInsertSchema(reminders).omit({ id: true, createdAt: true });
export const insertNotificationLogSchema = createInsertSchema(notificationLogs).omit({ id: true, createdAt: true });
export const insertCareNoteSchema = createInsertSchema(careNotes).omit({ id: true, createdAt: true, updatedAt: true });
export const insertHealthObservationSchema = createInsertSchema(healthObservations).omit({ id: true, createdAt: true });
export const insertAlertSchema = createInsertSchema(alerts).omit({ id: true, createdAt: true });
export const insertRiskEventSchema = createInsertSchema(riskEventLog).omit({ id: true, createdAt: true });
export const insertEpisodeSchema = createInsertSchema(episodes).omit({ id: true, openedAt: true });
export const insertTaskSchema = createInsertSchema(tasks).omit({ id: true, createdAt: true, completedAt: true });
export const insertScanRecordSchema = createInsertSchema(scanRecords).omit({ id: true, createdAt: true });
export const insertAttachmentSchema = createInsertSchema(attachments).omit({ id: true, createdAt: true });
export const insertWebAuthnCredentialSchema = createInsertSchema(webauthnCredentials).omit({ id: true, createdAt: true });
export const insertPlanSchema = createInsertSchema(plans).omit({ id: true, createdAt: true, updatedAt: true });
export const insertSubscriptionSchema = createInsertSchema(subscriptions).omit({ id: true, createdAt: true });
export const insertInvoiceSchema = createInsertSchema(invoices).omit({ id: true, createdAt: true });
export const insertPaymentSchema = createInsertSchema(payments).omit({ id: true, createdAt: true });
export const insertServiceRecordSchema = createInsertSchema(serviceRecords).omit({ id: true, createdAt: true });
export const insertAuditLogSchema = createInsertSchema(auditLogs).omit({ id: true, createdAt: true });
export const insertCarePlanSchema = createInsertSchema(carePlans).omit({ id: true, createdAt: true, updatedAt: true });
export const insertBenefitCaseSchema = createInsertSchema(benefitCases).omit({ id: true, createdAt: true, updatedAt: true });
export const insertAiRiskAlertSchema = createInsertSchema(aiRiskAlerts).omit({ id: true, createdAt: true });

// ═══════════════════════════════════════════════════════════════
// TypeScript Types
// ═══════════════════════════════════════════════════════════════

// Module 1: 組織
export type Organization = typeof organizations.$inferSelect;
export type InsertOrganization = z.infer<typeof insertOrganizationSchema>;
export type OrganizationMember = typeof organizationMembers.$inferSelect;
export type InsertOrganizationMember = z.infer<typeof insertOrganizationMemberSchema>;

// Module 2: 身份
export type PersonProfile = typeof personProfiles.$inferSelect;
export type InsertPersonProfile = z.infer<typeof insertPersonProfileSchema>;

// Module 3: 照護
export type CareRecipient = typeof careRecipients.$inferSelect;
export type InsertCareRecipient = z.infer<typeof insertCareRecipientSchema>;
export type CareRelationship = typeof careRelationships.$inferSelect;
export type InsertCareRelationship = z.infer<typeof insertCareRelationshipSchema>;
export type Household = typeof households.$inferSelect;
export type InsertHousehold = z.infer<typeof insertHouseholdSchema>;

// Module 4: 聊天
export type Conversation = typeof conversations.$inferSelect;
export type InsertConversation = z.infer<typeof insertConversationSchema>;
export type ConversationParticipant = typeof conversationParticipants.$inferSelect;
export type InsertConversationParticipant = z.infer<typeof insertConversationParticipantSchema>;
export type Message = typeof messages.$inferSelect;
export type InsertMessage = z.infer<typeof insertMessageSchema>;

// Module 5: AI 記憶
export type MemoryItem = typeof memoryItems.$inferSelect;
export type InsertMemoryItem = z.infer<typeof insertMemoryItemSchema>;
export type ConversationSummary = typeof conversationSummaries.$inferSelect;
export type InsertConversationSummary = z.infer<typeof insertConversationSummarySchema>;
export type PersonalitySettings = typeof personalitySettings.$inferSelect;
export type InsertPersonalitySettings = z.infer<typeof insertPersonalitySettingsSchema>;
export type EmotionLog = typeof emotionLogs.$inferSelect;
export type EmotionAssessment = typeof emotionAssessments.$inferSelect;
export type InsertEmotionAssessment = z.infer<typeof insertEmotionAssessmentSchema>;
export type InsertEmotionLog = z.infer<typeof insertEmotionLogSchema>;

// Module 6: 事件
export type CareEvent = typeof careEvents.$inferSelect;
export type InsertCareEvent = z.infer<typeof insertCareEventSchema>;
export type EventAssignee = typeof eventAssignees.$inferSelect;
export type InsertEventAssignee = z.infer<typeof insertEventAssigneeSchema>;
export type Reminder = typeof reminders.$inferSelect;
export type InsertReminder = z.infer<typeof insertReminderSchema>;
export type NotificationLog = typeof notificationLogs.$inferSelect;
export type InsertNotificationLog = z.infer<typeof insertNotificationLogSchema>;

// Module 7: 照護紀錄
export type CareNote = typeof careNotes.$inferSelect;
export type InsertCareNote = z.infer<typeof insertCareNoteSchema>;
export type HealthObservation = typeof healthObservations.$inferSelect;
export type InsertHealthObservation = z.infer<typeof insertHealthObservationSchema>;
export type Alert = typeof alerts.$inferSelect;
export type InsertAlert = z.infer<typeof insertAlertSchema>;
export type RiskEvent = typeof riskEventLog.$inferSelect;
export type InsertRiskEvent = z.infer<typeof insertRiskEventSchema>;
export type Episode = typeof episodes.$inferSelect;
export type InsertEpisode = z.infer<typeof insertEpisodeSchema>;
export type Task = typeof tasks.$inferSelect;
export type InsertTask = z.infer<typeof insertTaskSchema>;

// Module 8: 掃描與附件
export type ScanRecord = typeof scanRecords.$inferSelect;
export type InsertScanRecord = z.infer<typeof insertScanRecordSchema>;
export type Attachment = typeof attachments.$inferSelect;
export type InsertAttachment = z.infer<typeof insertAttachmentSchema>;
export type WebAuthnCredential = typeof webauthnCredentials.$inferSelect;
export type InsertWebAuthnCredential = z.infer<typeof insertWebAuthnCredentialSchema>;

// Module 9: SaaS 帳務
export type Plan = typeof plans.$inferSelect;
export type InsertPlan = z.infer<typeof insertPlanSchema>;
export type Subscription = typeof subscriptions.$inferSelect;
export type InsertSubscription = z.infer<typeof insertSubscriptionSchema>;
export type Invoice = typeof invoices.$inferSelect;
export type InsertInvoice = z.infer<typeof insertInvoiceSchema>;
export type Payment = typeof payments.$inferSelect;
export type InsertPayment = z.infer<typeof insertPaymentSchema>;
export type ServiceRecord = typeof serviceRecords.$inferSelect;
export type InsertServiceRecord = z.infer<typeof insertServiceRecordSchema>;

// Module 10: 稽核與進階
export type AuditLog = typeof auditLogs.$inferSelect;
export type InsertAuditLog = z.infer<typeof insertAuditLogSchema>;
export type CarePlan = typeof carePlans.$inferSelect;
export type InsertCarePlan = z.infer<typeof insertCarePlanSchema>;
export type BenefitCase = typeof benefitCases.$inferSelect;
export type InsertBenefitCase = z.infer<typeof insertBenefitCaseSchema>;
export type AiRiskAlert = typeof aiRiskAlerts.$inferSelect;
export type InsertAiRiskAlert = z.infer<typeof insertAiRiskAlertSchema>;
