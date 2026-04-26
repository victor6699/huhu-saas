import type { Express } from "express";
import type { Server } from "http";
import { z } from "zod";
import { extractUser, requireAuth, requireStaff, supabaseAdmin } from "./auth-middleware";
import { pool } from "./db";

// ═══════════════════════════════════════════════════════════════
// Validation Schemas
// ═══════════════════════════════════════════════════════════════

const createOrganizationSchema = z.object({
  orgType: z.enum(["individual_family", "care_institution", "gov_welfare_bureau"]),
  name: z.string().trim().min(1, "請填寫機構名稱"),
  legalName: z.string().trim().nullable().optional(),
  taxId: z.string().trim().nullable().optional(),
  address: z.string().trim().nullable().optional(),
  phone: z.string().trim().nullable().optional(),
  email: z.string().trim().email().nullable().optional(),
});

const createSubscriptionPayloadSchema = z.object({
  organizationId: z.string().uuid(),
  planId: z.string().uuid(),
  billingCycle: z.enum(["monthly", "annual"]),
  status: z.enum(["active", "expired", "cancelled", "trial"]).default("active"),
  elderCount: z.coerce.number().int().positive(),
  startDate: z.string().trim().min(1, "請填開始日"),
  endDate: z.string().trim().min(1, "請填結束日"),
  nextBillingDate: z.string().trim().min(1, "請填下次扣款日"),
  amount: z.coerce.number().nonnegative(),
});

const createInvoicePayloadSchema = z.object({
  organizationId: z.string().uuid(),
  subscriptionId: z.string().uuid().nullable().optional(),
  issueDate: z.string().trim().min(1),
  dueDate: z.string().trim().min(1),
  periodStart: z.string().trim().min(1),
  periodEnd: z.string().trim().min(1),
  subtotal: z.coerce.number().nonnegative(),
  tax: z.coerce.number().nonnegative(),
  total: z.coerce.number().nonnegative(),
  status: z.enum(["unpaid", "paid", "overdue", "cancelled"]).default("unpaid"),
  notes: z.string().trim().nullable().optional(),
});

const createPaymentPayloadSchema = z.object({
  invoiceId: z.string().uuid(),
  organizationId: z.string().uuid(),
  amount: z.coerce.number().positive(),
  method: z.enum(["newebpay", "ecpay", "stripe", "bank_transfer", "manual"]),
  status: z.enum(["pending", "success", "failed", "refunded"]).default("pending"),
  transactionId: z.string().trim().nullable().optional(),
  notes: z.string().trim().nullable().optional(),
});

const parsePayload = <T>(schema: z.ZodType<T>, payload: unknown) => {
  const parsed = schema.safeParse(payload);
  if (!parsed.success) {
    return { ok: false as const, message: parsed.error.issues[0]?.message ?? "資料格式錯誤" };
  }
  return { ok: true as const, data: parsed.data };
};

// ═══════════════════════════════════════════════════════════════
// Routes
// ═══════════════════════════════════════════════════════════════

import { tappayRouter } from "./tappay";

export async function registerRoutes(_httpServer: Server, app: Express) {
  // Apply Supabase auth middleware globally
  app.use(extractUser);

  // Mount TapPay routes
  app.use("/api/tappay", tappayRouter);

  // ── Auth ────────────────────────────────────────────────────
  app.get("/api/me", requireAuth, async (req, res) => {
    const userId = req.supabaseUser!.id;

    // Get person profile
    const { data: profile } = await supabaseAdmin
      .from("person_profiles")
      .select("*")
      .eq("user_id", userId)
      .single();

    // Get organization memberships (without FK join — fetch org details separately)
    const { data: rawMembers } = await supabaseAdmin
      .from("organization_members")
      .select("organization_id, role_code, title")
      .eq("user_id", userId)
      .eq("status", "active");

    // Enrich with organization info
    const memberships = [];
    for (const m of rawMembers || []) {
      const { data: org } = await supabaseAdmin
        .from("organizations")
        .select("name, org_type")
        .eq("id", m.organization_id)
        .single();
      memberships.push({
        ...m,
        organizations: org || null,
      });
    }

    res.json({
      id: userId,
      email: req.supabaseUser!.email,
      profile,
      memberships,
      role: req.supabaseUser!.role,
    });
  });

  app.post("/api/logout", async (req, res) => {
    // Client-side handles signOut; this is a no-op endpoint for backward compatibility
    res.json({ ok: true });
  });

  // ── Organizations ──────────────────────────────────────────
  app.get("/api/organizations", requireAuth, async (req, res) => {
    const { data, error } = await supabaseAdmin
      .from("organizations")
      .select("*")
      .order("created_at", { ascending: false });

    if (error) return res.status(500).json({ message: error.message });
    res.json(data);
  });

  app.post("/api/organizations", requireAuth, async (req, res) => {
    const parsed = parsePayload(createOrganizationSchema, req.body);
    if (!parsed.ok) return res.status(400).json({ message: parsed.message });

    const { data, error } = await supabaseAdmin
      .from("organizations")
      .insert(parsed.data)
      .select()
      .single();

    if (error) return res.status(500).json({ message: error.message });

    // Auto-add the creator as admin
    await supabaseAdmin.from("organization_members").insert({
      organization_id: data.id,
      user_id: req.supabaseUser!.id,
      role_code: "admin",
    });

    res.json(data);
  });

  // ── Organization Members ───────────────────────────────────
  app.get("/api/organizations/:orgId/members", requireAuth, async (req, res) => {
    const { data, error } = await supabaseAdmin
      .from("organization_members")
      .select("*, person_profiles(full_name, email, avatar_url)")
      .eq("organization_id", req.params.orgId);

    if (error) return res.status(500).json({ message: error.message });
    res.json(data);
  });

  // ── Plans ──────────────────────────────────────────────────
  app.get("/api/plans", async (_req, res) => {
    const { data, error } = await supabaseAdmin
      .from("plans")
      .select("*")
      .eq("is_active", true)
      .order("monthly_price");

    if (error) return res.status(500).json({ message: error.message });
    res.json(data);
  });

  // ── Subscriptions ──────────────────────────────────────────
  app.get("/api/subscriptions", requireAuth, async (_req, res) => {
    const { data, error } = await supabaseAdmin
      .from("subscriptions")
      .select("*, organizations(name), plans(name)")
      .order("created_at", { ascending: false });

    if (error) return res.status(500).json({ message: error.message });
    res.json(data);
  });

  app.post("/api/subscriptions", requireAuth, async (req, res) => {
    const parsed = parsePayload(createSubscriptionPayloadSchema, req.body);
    if (!parsed.ok) return res.status(400).json({ message: parsed.message });

    const { data, error } = await supabaseAdmin
      .from("subscriptions")
      .insert({
        organization_id: parsed.data.organizationId,
        plan_id: parsed.data.planId,
        billing_cycle: parsed.data.billingCycle,
        status: parsed.data.status,
        elder_count: parsed.data.elderCount,
        start_date: parsed.data.startDate,
        end_date: parsed.data.endDate,
        next_billing_date: parsed.data.nextBillingDate,
        amount: parsed.data.amount,
      })
      .select()
      .single();

    if (error) return res.status(500).json({ message: error.message });
    res.json(data);
  });

  // ── Invoices ───────────────────────────────────────────────
  app.get("/api/invoices", requireAuth, async (_req, res) => {
    const { data, error } = await supabaseAdmin
      .from("invoices")
      .select("*, organizations(name)")
      .order("created_at", { ascending: false });

    if (error) return res.status(500).json({ message: error.message });
    res.json(data);
  });

  app.post("/api/invoices", requireAuth, async (req, res) => {
    const parsed = parsePayload(createInvoicePayloadSchema, req.body);
    if (!parsed.ok) return res.status(400).json({ message: parsed.message });

    const { data, error } = await supabaseAdmin
      .from("invoices")
      .insert({ ...parsed.data, invoice_no: `INV-${Date.now()}` })
      .select()
      .single();

    if (error) return res.status(500).json({ message: error.message });
    res.json(data);
  });

  // ── Payments ───────────────────────────────────────────────
  app.get("/api/payments", requireAuth, async (_req, res) => {
    const { data, error } = await supabaseAdmin
      .from("payments")
      .select("*, organizations(name), invoices(invoice_no)")
      .order("created_at", { ascending: false });

    if (error) return res.status(500).json({ message: error.message });
    res.json(data);
  });

  app.post("/api/payments", requireAuth, async (req, res) => {
    const parsed = parsePayload(createPaymentPayloadSchema, req.body);
    if (!parsed.ok) return res.status(400).json({ message: parsed.message });

    const { data, error } = await supabaseAdmin
      .from("payments")
      .insert(parsed.data)
      .select()
      .single();

    if (error) return res.status(500).json({ message: error.message });
    res.json(data);
  });

  // ── Service Records ────────────────────────────────────────
  app.get("/api/service-records", requireAuth, async (_req, res) => {
    const { data, error } = await supabaseAdmin
      .from("service_records")
      .select("*, organizations(name)")
      .order("created_at", { ascending: false });

    if (error) return res.status(500).json({ message: error.message });
    res.json(data);
  });

  // ── Portal endpoints (for client organizations) ────────────
  app.get("/api/portal/subscriptions", requireAuth, async (req, res) => {
    // Get user's organization
    const { data: membership } = await supabaseAdmin
      .from("organization_members")
      .select("organization_id")
      .eq("user_id", req.supabaseUser!.id)
      .eq("status", "active")
      .limit(1)
      .single();

    if (!membership) return res.json([]);

    const { data, error } = await supabaseAdmin
      .from("subscriptions")
      .select("*, plans(name, features)")
      .eq("organization_id", membership.organization_id);

    if (error) return res.status(500).json({ message: error.message });
    res.json(data);
  });

  app.get("/api/portal/invoices", requireAuth, async (req, res) => {
    const { data: membership } = await supabaseAdmin
      .from("organization_members")
      .select("organization_id")
      .eq("user_id", req.supabaseUser!.id)
      .eq("status", "active")
      .limit(1)
      .single();

    if (!membership) return res.json([]);

    const { data, error } = await supabaseAdmin
      .from("invoices")
      .select("*")
      .eq("organization_id", membership.organization_id)
      .order("issue_date", { ascending: false });

    if (error) return res.status(500).json({ message: error.message });
    res.json(data);
  });

  app.get("/api/portal/service-records", requireAuth, async (req, res) => {
    const { data: membership } = await supabaseAdmin
      .from("organization_members")
      .select("organization_id")
      .eq("user_id", req.supabaseUser!.id)
      .eq("status", "active")
      .limit(1)
      .single();

    if (!membership) return res.json([]);

    const { data, error } = await supabaseAdmin
      .from("service_records")
      .select("*")
      .eq("organization_id", membership.organization_id)
      .order("month", { ascending: false });

    if (error) return res.status(500).json({ message: error.message });
    res.json(data);
  });

  app.get("/api/portal/family", requireAuth, async (req, res) => {
    try {
      const userId = req.supabaseUser!.id;

      // Strategy 1: via care_relationships (B2C family → elder)
      // Use separate queries to avoid Supabase FK join failure
      const { data: personProfile } = await supabaseAdmin
        .from("person_profiles").select("id").eq("user_id", userId).single();

      if (personProfile) {
        const { data: rels } = await supabaseAdmin
          .from("care_relationships")
          .select("care_recipient_id, relationship_type")
          .eq("related_person_id", personProfile.id)
          .eq("status", "active");

        if (rels && rels.length > 0) {
          const members = [];
          for (const r of rels) {
            const { data: cr } = await supabaseAdmin
              .from("care_recipients")
              .select("*")
              .eq("id", r.care_recipient_id)
              .single();
            if (!cr) continue;
            const { data: profile } = await supabaseAdmin
              .from("person_profiles")
              .select("*")
              .eq("id", cr.person_profile_id)
              .single();
            members.push({
              ...cr,
              person_profiles: profile || null,
              relationship_type: r.relationship_type,
            });
          }
          if (members.length > 0) return res.json(members);
        }
      }

      // Strategy 2: via organization (institution → care_recipients)
      const { data: membership } = await supabaseAdmin
        .from("organization_members")
        .select("organization_id")
        .eq("user_id", userId)
        .eq("status", "active")
        .limit(1)
        .single();

      if (!membership) return res.json([]);

      // Also use separate queries here
      const { data: recipients } = await supabaseAdmin
        .from("care_recipients")
        .select("*")
        .eq("primary_org_id", membership.organization_id)
        .order("created_at", { ascending: false });

      const results = [];
      for (const cr of recipients || []) {
        const { data: profile } = await supabaseAdmin
          .from("person_profiles")
          .select("*")
          .eq("id", cr.person_profile_id)
          .single();
        results.push({ ...cr, person_profiles: profile || null });
      }
      res.json(results);
    } catch (err) {
      console.error("[portal/family] error:", err);
      res.json([]);
    }
  });

  app.get("/api/portal/health/:recipientId", requireAuth, async (req, res) => {
    try {
      const { recipientId } = req.params;
      
      const { rows: metrics } = await pool.query(
        'SELECT * FROM weekly_metrics WHERE user_id = $1 ORDER BY week_start ASC LIMIT 12',
        [recipientId]
      );

      const { rows: phq2 } = await pool.query(
        'SELECT * FROM phq2_screenings WHERE user_id = $1 ORDER BY screening_date ASC LIMIT 12',
        [recipientId]
      );

      res.json({ weeklyMetrics: metrics, phq2Screenings: phq2 });
    } catch (err) {
      console.error("[portal/health] error:", err);
      res.status(500).json({ message: "無法取得健康數據" });
    }
  });

  // ═══════════════════════════════════════════════════════════════
  // Org Admin API — /api/org/:orgId/*
  // 機構管理員專用，只能操作自己所屬的機構
  // ═══════════════════════════════════════════════════════════════

  // Helper: 確認當前使用者是該機構的 org_admin
  async function assertOrgAdmin(userId: string, orgId: string): Promise<boolean> {
    const { data } = await supabaseAdmin
      .from("organization_members")
      .select("role_code")
      .eq("user_id", userId)
      .eq("organization_id", orgId)
      .eq("status", "active")
      .single();
    return !!data && ["org_admin", "case_manager"].includes(data.role_code);
  }

  // GET /api/org/:orgId/info — 機構基本資訊
  app.get("/api/org/:orgId/info", requireAuth, async (req, res) => {
    const { orgId } = req.params;
    if (!await assertOrgAdmin(req.supabaseUser!.id, orgId)) {
      return res.status(403).json({ message: "無權限" });
    }
    const { data, error } = await supabaseAdmin.from("organizations").select("*").eq("id", orgId).single();
    if (error) return res.status(500).json({ message: error.message });
    res.json(data);
  });

  // GET /api/org/:orgId/members — 照護員列表
  app.get("/api/org/:orgId/members", requireAuth, async (req, res) => {
    const { orgId } = req.params;
    if (!await assertOrgAdmin(req.supabaseUser!.id, orgId)) {
      return res.status(403).json({ message: "無權限" });
    }
    const { data, error } = await supabaseAdmin
      .from("organization_members")
      .select("*, person_profiles(full_name, email, avatar_url)")
      .eq("organization_id", orgId)
      .order("created_at", { ascending: false });
    if (error) return res.status(500).json({ message: error.message });
    res.json(data);
  });

  // POST /api/org/:orgId/invite-member — 邀請照護員（建立 Supabase 帳號 + 加入機構）
  app.post("/api/org/:orgId/invite-member", requireAuth, async (req, res) => {
    const { orgId } = req.params;
    if (!await assertOrgAdmin(req.supabaseUser!.id, orgId)) {
      return res.status(403).json({ message: "無權限" });
    }
    const { email, full_name, role_code = "caregiver", title } = req.body;
    if (!email) return res.status(400).json({ message: "缺少 email" });

    // 建立或找到 Supabase user
    let userId: string;
    const { data: existing } = await supabaseAdmin.auth.admin.listUsers();
    const existingUser = existing?.users?.find((u: any) => u.email === email);

    if (existingUser) {
      userId = existingUser.id;
    } else {
      // 邀請新使用者
      const { data: invited, error: inviteErr } = await supabaseAdmin.auth.admin.inviteUserByEmail(email, {
        data: { full_name },
      });
      if (inviteErr) return res.status(500).json({ message: inviteErr.message });
      userId = invited.user.id;
    }

    // 確保 person_profile 存在
    const { data: existingProfile } = await supabaseAdmin
      .from("person_profiles").select("id").eq("user_id", userId).single();
    if (!existingProfile) {
      await supabaseAdmin.from("person_profiles").insert({
        user_id: userId, full_name: full_name || email.split("@")[0], email,
      });
    }

    // 加入機構（若已是成員則更新角色）
    const { data: existingMember } = await supabaseAdmin
      .from("organization_members").select("id").eq("user_id", userId).eq("organization_id", orgId).single();
    if (existingMember) {
      await supabaseAdmin.from("organization_members")
        .update({ role_code, title, status: "active" }).eq("id", existingMember.id);
    } else {
      await supabaseAdmin.from("organization_members").insert({
        user_id: userId, organization_id: orgId, role_code, title, status: "active",
      });
    }

    res.json({ ok: true });
  });

  // DELETE /api/org/:orgId/members/:memberId — 移除照護員
  app.delete("/api/org/:orgId/members/:memberId", requireAuth, async (req, res) => {
    const { orgId, memberId } = req.params;
    if (!await assertOrgAdmin(req.supabaseUser!.id, orgId)) {
      return res.status(403).json({ message: "無權限" });
    }
    const { error } = await supabaseAdmin
      .from("organization_members")
      .update({ status: "inactive" })
      .eq("id", memberId)
      .eq("organization_id", orgId);
    if (error) return res.status(500).json({ message: error.message });
    res.json({ ok: true });
  });

  // GET /api/org/:orgId/recipients — 被照護者列表
  app.get("/api/org/:orgId/recipients", requireAuth, async (req, res) => {
    const { orgId } = req.params;
    if (!await assertOrgAdmin(req.supabaseUser!.id, orgId)) {
      return res.status(403).json({ message: "無權限" });
    }
    const { data, error } = await supabaseAdmin
      .from("care_recipients")
      .select("*, person_profiles(full_name, nickname, phone, email)")
      .eq("primary_org_id", orgId)
      .order("created_at", { ascending: false });
    if (error) return res.status(500).json({ message: error.message });
    res.json(data);
  });

  // POST /api/org/:orgId/recipients — 新增被照護者
  app.post("/api/org/:orgId/recipients", requireAuth, async (req, res) => {
    const { orgId } = req.params;
    if (!await assertOrgAdmin(req.supabaseUser!.id, orgId)) {
      return res.status(403).json({ message: "無權限" });
    }
    const { full_name, nickname, phone, email } = req.body;
    if (!full_name) return res.status(400).json({ message: "缺少姓名" });

    // 建立 person_profile
    const { data: profile, error: profileErr } = await supabaseAdmin
      .from("person_profiles").insert({ full_name, nickname, phone, email }).select().single();
    if (profileErr) return res.status(500).json({ message: profileErr.message });

    // 建立 care_recipient
    const { data, error } = await supabaseAdmin
      .from("care_recipients")
      .insert({ person_profile_id: profile.id, primary_org_id: orgId, status: "active" })
      .select().single();
    if (error) return res.status(500).json({ message: error.message });
    res.json(data);
  });

  // PATCH /api/org/:orgId/recipients/:recipientId — 編輯被照護者資料
  app.patch("/api/org/:orgId/recipients/:recipientId", requireAuth, async (req, res) => {
    const { orgId, recipientId } = req.params;
    if (!await assertOrgAdmin(req.supabaseUser!.id, orgId)) {
      return res.status(403).json({ message: "無權限" });
    }
    const { full_name, nickname, phone, email } = req.body;

    // First find the person_profile_id for this recipient
    const { data: recipient } = await supabaseAdmin
      .from("care_recipients")
      .select("person_profile_id")
      .eq("id", recipientId)
      .eq("primary_org_id", orgId)
      .single();
    if (!recipient) return res.status(404).json({ message: "找不到被照護者" });

    const updates: any = {};
    if (full_name !== undefined) updates.full_name = full_name;
    if (nickname !== undefined) updates.nickname = nickname;
    if (phone !== undefined) updates.phone = phone;
    if (email !== undefined) updates.email = email;

    const { error } = await supabaseAdmin
      .from("person_profiles")
      .update(updates)
      .eq("id", recipient.person_profile_id);
    if (error) return res.status(500).json({ message: error.message });
    res.json({ ok: true });
  });

  // PATCH /api/org/:orgId/members/:memberId — 編輯照護員角色/職稱
  app.patch("/api/org/:orgId/members/:memberId", requireAuth, async (req, res) => {
    const { orgId, memberId } = req.params;
    if (!await assertOrgAdmin(req.supabaseUser!.id, orgId)) {
      return res.status(403).json({ message: "無權限" });
    }
    const { role_code, title } = req.body;
    const updates: any = {};
    if (role_code) updates.role_code = role_code;
    if (title !== undefined) updates.title = title;

    const { error } = await supabaseAdmin
      .from("organization_members")
      .update(updates)
      .eq("id", memberId)
      .eq("organization_id", orgId);
    if (error) return res.status(500).json({ message: error.message });
    res.json({ ok: true });
  });

  // GET /api/org/:orgId/subscriptions — 訂閱資訊
  app.get("/api/org/:orgId/subscriptions", requireAuth, async (req, res) => {
    const { orgId } = req.params;
    if (!await assertOrgAdmin(req.supabaseUser!.id, orgId)) {
      return res.status(403).json({ message: "無權限" });
    }
    const { data, error } = await supabaseAdmin
      .from("subscriptions").select("*, plans(name, features)").eq("organization_id", orgId);
    if (error) return res.status(500).json({ message: error.message });
    res.json(data);
  });

  // GET /api/org/:orgId/invoices — 帳單列表
  app.get("/api/org/:orgId/invoices", requireAuth, async (req, res) => {
    const { orgId } = req.params;
    if (!await assertOrgAdmin(req.supabaseUser!.id, orgId)) {
      return res.status(403).json({ message: "無權限" });
    }
    const { data, error } = await supabaseAdmin
      .from("invoices").select("*").eq("organization_id", orgId)
      .order("issue_date", { ascending: false });
    if (error) return res.status(500).json({ message: error.message });
    res.json(data);
  });

  // ── Update Organization Status (activate / suspend) ───────
  app.patch("/api/organizations/:id", requireAuth, async (req, res) => {
    const { id } = req.params;
    const { data, error } = await supabaseAdmin
      .from("organizations")
      .update({ ...req.body, updated_at: new Date().toISOString() })
      .eq("id", id)
      .select()
      .single();

    if (error) return res.status(500).json({ message: error.message });
    res.json(data);
  });

  // ── Staff Members (HuHu internal team) ────────────────────
  app.get("/api/staff/members", requireAuth, async (_req, res) => {
    const staffRoles = ["admin", "superadmin", "sales", "finance", "support"];
    const { data, error } = await supabaseAdmin
      .from("organization_members")
      .select("id, user_id, role_code, title, person_profiles(full_name, email, avatar_url)")
      .in("role_code", staffRoles)
      .eq("status", "active");

    if (error) return res.status(500).json({ message: error.message });
    res.json(data);
  });

  app.post("/api/staff/members", requireAuth, async (req, res) => {
    const { email, displayName, role, password } = req.body;
    if (!email || !displayName || !role)
      return res.status(400).json({ message: "email、displayName、role 為必填" });

    // Try to create a new Supabase Auth user
    let authUserId: string;
    const { data: authData, error: authError } = await supabaseAdmin.auth.admin.createUser({
      email,
      password: password || Math.random().toString(36).slice(-10) + "A1!",
      email_confirm: true,
      user_metadata: { full_name: displayName, role },
    });

    if (authError) {
      // If user already exists, look them up by email instead
      if (authError.message.toLowerCase().includes("already been registered") ||
          authError.message.toLowerCase().includes("already exists")) {
        const { data: { users }, error: listErr } = await supabaseAdmin.auth.admin.listUsers();
        const existing = users?.find(u => u.email?.toLowerCase() === email.toLowerCase());
        if (!existing) return res.status(400).json({ message: "找不到此 Email 的現有帳號，請確認 Email 是否正確" });
        authUserId = existing.id;
      } else {
        return res.status(500).json({ message: authError.message });
      }
    } else {
      authUserId = authData.user!.id;
    }

    // Upsert person_profile (create if not exists)
    const { data: profile, error: profileError } = await supabaseAdmin
      .from("person_profiles")
      .upsert({ user_id: authUserId, full_name: displayName, email }, { onConflict: "user_id" })
      .select("id")
      .single();
    if (profileError) return res.status(500).json({ message: profileError.message });

    // Look up HuHu org (where staff live — first org or org named HuHu)
    const { data: huhuOrg } = await supabaseAdmin
      .from("organizations")
      .select("id")
      .order("created_at", { ascending: true })
      .limit(1)
      .single();

    // Upsert the organization_member entry
    if (huhuOrg) {
      await supabaseAdmin
        .from("organization_members")
        .upsert({
          user_id: authUserId,
          organization_id: huhuOrg.id,
          role_code: role,
          status: "active",
        }, { onConflict: "user_id,organization_id" });
    }

    res.json({ userId: authUserId, profile, linked: !authData });
  });


  // ── Update Staff Member (role / title) ─────────────────────
  app.patch("/api/staff/members/:id", requireAuth, async (req, res) => {
    const { id } = req.params;
    const { role_code, title } = req.body;
    const update: Record<string, any> = {};
    if (role_code) update.role_code = role_code;
    if (title !== undefined) update.title = title;
    const { data, error } = await supabaseAdmin
      .from("organization_members")
      .update(update)
      .eq("id", id)
      .select()
      .single();
    if (error) return res.status(500).json({ message: error.message });
    res.json(data);
  });

  // ── Debug / Health Check ────────────────────────────────────
  app.get("/api/debug/health", async (req, res) => {
    const envOk = !!process.env.SUPABASE_URL && !!(process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_ANON_KEY);
    let dbOk = false;
    let tables: string[] = [];
    try {
      // Quick test: can supabaseAdmin reach DB?
      const { data, error } = await supabaseAdmin.from("organizations").select("id").limit(1);
      dbOk = !error;
      if (error) tables.push(`organizations: ${error.message}`);
      // Check critical tables exist
      for (const t of ["person_profiles", "organization_members", "plans", "subscriptions", "invoices", "payments", "service_records"]) {
        const { error: e } = await supabaseAdmin.from(t).select("id").limit(1);
        tables.push(`${t}: ${e ? "ERROR - " + e.message : "OK"}`);
      }
    } catch (e: any) {
      tables.push(`connection_error: ${e.message}`);
    }

    // Check auth state if token provided
    let authInfo = null;
    const authHeader = req.headers.authorization;
    if (authHeader?.startsWith("Bearer ")) {
      try {
        const { data: { user }, error } = await supabaseAdmin.auth.getUser(authHeader.slice(7));
        authInfo = error ? { error: error.message } : { id: user?.id, email: user?.email };
      } catch (e: any) {
        authInfo = { error: e.message };
      }
    }

    res.json({
      ok: envOk && dbOk,
      env: {
        SUPABASE_URL: process.env.SUPABASE_URL ? "set" : "MISSING",
        SUPABASE_SERVICE_ROLE_KEY: process.env.SUPABASE_SERVICE_ROLE_KEY ? "set" : "MISSING",
      },
      db: dbOk,
      tables,
      auth: authInfo,
      timestamp: new Date().toISOString(),
    });
  });

  // ═══════════════════════════════════════════════════════════════
  // CRM — 使用者管理 (all registered users across huhu-care & saas)
  // ═══════════════════════════════════════════════════════════════

  // GET /api/crm/users — List all Supabase auth users with profiles & memberships
  app.get("/api/crm/users", requireAuth, async (_req, res) => {
    try {
      // Fetch all auth users (paginated — up to 1000)
      const allUsers: any[] = [];
      let page = 1;
      while (true) {
        const { data: { users }, error } = await supabaseAdmin.auth.admin.listUsers({ page, perPage: 100 });
        if (error || !users || users.length === 0) break;
        allUsers.push(...users);
        if (users.length < 100) break;
        page++;
        if (page > 10) break; // safety cap
      }

      // Fetch all person_profiles (tags & notes columns may not exist yet — graceful fallback)
      let profiles: any[] | null = null;
      const { data: profileData, error: profileErr } = await supabaseAdmin
        .from("person_profiles")
        .select("id, user_id, full_name, nickname, phone, email, avatar_url, created_at");
      profiles = profileData;

      // Fetch all organization_members
      const { data: memberships } = await supabaseAdmin
        .from("organization_members")
        .select("user_id, organization_id, role_code, title, status");

      // Fetch all organizations (for names)
      const { data: orgs } = await supabaseAdmin
        .from("organizations")
        .select("id, name, org_type");

      // Fetch care_recipients (to identify elders)
      const { data: careRecipients } = await supabaseAdmin
        .from("care_recipients")
        .select("id, person_profile_id, primary_org_id, status");

      // Fetch care_relationships (to show family → elder links)
      const { data: careRels } = await supabaseAdmin
        .from("care_relationships")
        .select("id, care_recipient_id, related_person_id, relationship_type, status");

      const profileMap = new Map((profiles || []).map(p => [p.user_id, p]));
      const orgMap = new Map((orgs || []).map(o => [o.id, o]));

      const result = allUsers.map(u => {
        const profile = profileMap.get(u.id);
        const userMemberships = (memberships || [])
          .filter(m => m.user_id === u.id)
          .map(m => ({
            ...m,
            org_name: orgMap.get(m.organization_id)?.name,
            org_type: orgMap.get(m.organization_id)?.org_type,
          }));

        // Is this user an elder (care_recipient)?
        const elderRecord = profile
          ? (careRecipients || []).find(cr => cr.person_profile_id === profile.id)
          : null;

        // Care relationships involving this user
        const relationsAsFamily = profile
          ? (careRels || []).filter(r => r.related_person_id === profile.id)
          : [];
        const relationsAsElder = elderRecord
          ? (careRels || []).filter(r => r.care_recipient_id === elderRecord.id)
          : [];

        // Determine user type from metadata / memberships
        const role = u.user_metadata?.role || "unknown";
        const staffRoles = ["admin", "superadmin", "sales", "finance", "support"];
        const isStaff = userMemberships.some(m => staffRoles.includes(m.role_code));

        let userType = role; // family, caregiver, user (elder)
        if (isStaff) userType = "staff";
        if (elderRecord) userType = "elder";

        return {
          id: u.id,
          email: u.email,
          fullName: profile?.full_name || u.user_metadata?.full_name || "",
          nickname: profile?.nickname || "",
          phone: profile?.phone || u.phone || "",
          avatarUrl: profile?.avatar_url || "",
          role,
          userType,
          tags: [],
          notes: "",
          personProfileId: profile?.id || null,
          memberships: userMemberships,
          elderRecord: elderRecord || null,
          careRelationships: {
            asFamily: relationsAsFamily.length,
            asElder: relationsAsElder.length,
          },
          createdAt: u.created_at,
          lastSignInAt: u.last_sign_in_at,
          emailConfirmed: !!u.email_confirmed_at,
          source: u.app_metadata?.provider || "email",
        };
      });

      // Sort: newest first
      result.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());

      res.json(result);
    } catch (err: any) {
      console.error("[crm/users] error:", err);
      res.status(500).json({ message: err.message || "無法取得使用者列表" });
    }
  });

  // PATCH /api/crm/users/:userId — Update user metadata (role, fullName, phone)
  app.patch("/api/crm/users/:userId", requireAuth, async (req, res) => {
    const { userId } = req.params;
    const { role, fullName, phone } = req.body;

    // Update auth metadata if role changed
    if (role) {
      await supabaseAdmin.auth.admin.updateUserById(userId, {
        user_metadata: { role },
      });
    }

    // Update person_profile
    const updateData: any = {};
    if (fullName) updateData.full_name = fullName;
    if (phone !== undefined) updateData.phone = phone;

    if (Object.keys(updateData).length > 0) {
      const { error } = await supabaseAdmin
        .from("person_profiles")
        .update(updateData)
        .eq("user_id", userId);

      if (error) return res.status(500).json({ message: error.message });
    }

    res.json({ ok: true });
  });

  // POST /api/crm/batch-import — Batch create users from uploaded data
  app.post("/api/crm/batch-import", requireAuth, async (req, res) => {
    const { rows } = req.body; // Array of { email, password?, fullName, phone?, role?, orgName?, orgType? }
    if (!Array.isArray(rows) || rows.length === 0) {
      return res.status(400).json({ message: "請提供至少一筆資料" });
    }
    if (rows.length > 200) {
      return res.status(400).json({ message: "單次最多匯入 200 筆" });
    }

    const results: { email: string; status: string; message?: string }[] = [];

    for (const row of rows) {
      try {
        const email = (row.email || "").trim().toLowerCase();
        if (!email) {
          results.push({ email: "(空)", status: "error", message: "缺少 Email" });
          continue;
        }

        const fullName = (row.fullName || row.full_name || row.name || email.split("@")[0]).trim();
        const phone = (row.phone || "").trim();
        const role = (row.role || "user").trim();
        const password = (row.password || "").trim() || `Huhu${Math.random().toString(36).slice(-6)}!`;

        // Check if user already exists
        const { data: existing } = await supabaseAdmin.auth.admin.listUsers();
        const existingUser = existing?.users?.find((u: any) => u.email === email);

        let userId: string;
        if (existingUser) {
          userId = existingUser.id;
          results.push({ email, status: "skipped", message: "帳號已存在" });
        } else {
          // Create auth user
          const { data: authData, error: authErr } = await supabaseAdmin.auth.admin.createUser({
            email,
            password,
            email_confirm: true,
            user_metadata: { full_name: fullName, role },
          });
          if (authErr) {
            results.push({ email, status: "error", message: authErr.message });
            continue;
          }
          userId = authData.user!.id;

          // Create person_profile
          await supabaseAdmin.from("person_profiles").insert({
            user_id: userId,
            full_name: fullName,
            phone: phone || null,
            email,
          });

          // If org info provided, create or link organization
          const orgName = (row.orgName || row.org_name || "").trim();
          const orgType = (row.orgType || row.org_type || "individual_family").trim();
          if (orgName) {
            // Check if org exists
            const { data: existingOrg } = await supabaseAdmin
              .from("organizations")
              .select("id")
              .eq("name", orgName)
              .single();

            const orgId = existingOrg?.id;
            if (orgId) {
              // Add as member
              await supabaseAdmin.from("organization_members").insert({
                user_id: userId,
                organization_id: orgId,
                role_code: role === "org_admin" ? "org_admin" : "member",
                status: "active",
              });
            } else {
              // Create new org and add as admin
              const { data: newOrg } = await supabaseAdmin
                .from("organizations")
                .insert({ name: orgName, org_type: orgType, status: "active" })
                .select("id")
                .single();
              if (newOrg) {
                await supabaseAdmin.from("organization_members").insert({
                  user_id: userId,
                  organization_id: newOrg.id,
                  role_code: "org_admin",
                  status: "active",
                });
              }
            }
          }

          results.push({ email, status: "created" });
        }
      } catch (err: any) {
        results.push({ email: row.email || "?", status: "error", message: err.message });
      }
    }

    const created = results.filter(r => r.status === "created").length;
    const skipped = results.filter(r => r.status === "skipped").length;
    const errors = results.filter(r => r.status === "error").length;

    res.json({ total: rows.length, created, skipped, errors, results });
  });

  // ── Audit Logs ─────────────────────────────────────────────
  app.get("/api/audit-logs", requireAuth, async (_req, res) => {
    const { data, error } = await supabaseAdmin
      .from("audit_logs")
      .select("*")
      .order("created_at", { ascending: false })
      .limit(100);

    if (error) return res.status(500).json({ message: error.message });
    res.json(data);
  });
}
