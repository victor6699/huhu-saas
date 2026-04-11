import type { Express } from "express";
import type { Server } from "http";
import { z } from "zod";
import { extractUser, requireAuth, requireStaff, supabaseAdmin } from "./auth-middleware";

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

export async function registerRoutes(_httpServer: Server, app: Express) {
  // Apply Supabase auth middleware globally
  app.use(extractUser);

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
      .insert(parsed.data)
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
    const { data: membership } = await supabaseAdmin
      .from("organization_members")
      .select("organization_id")
      .eq("user_id", req.supabaseUser!.id)
      .eq("status", "active")
      .limit(1)
      .single();

    if (!membership) return res.json([]);

    const { data, error } = await supabaseAdmin
      .from("care_recipients")
      .select("*, person_profiles(*)")
      .eq("primary_org_id", membership.organization_id)
      .order("created_at", { ascending: false });

    if (error) return res.status(500).json({ message: error.message });
    res.json(data);
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

    // Create Supabase Auth user
    const { data: authData, error: authError } = await supabaseAdmin.auth.admin.createUser({
      email,
      password: password || Math.random().toString(36).slice(-10) + "A1!",
      email_confirm: true,
      user_metadata: { full_name: displayName, role },
    });
    if (authError) return res.status(500).json({ message: authError.message });

    // Create person_profile
    const { data: profile, error: profileError } = await supabaseAdmin
      .from("person_profiles")
      .insert({ user_id: authData.user!.id, full_name: displayName, email })
      .select("id")
      .single();
    if (profileError) return res.status(500).json({ message: profileError.message });

    res.json({ user: authData.user, profile });
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
