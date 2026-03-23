import type { Express } from "express";
import type { Server } from "http";
import session from "express-session";
import MemoryStore from "memorystore";
import { z } from "zod";
import { storage } from "./storage";

declare module "express-session" {
  interface SessionData {
    staffId?: number;
    clientId?: number;
    role?: string;
  }
}

const loginSchema = z.object({
  username: z.string().trim().min(1, "請輸入帳號"),
  password: z.string().min(1, "請輸入密碼"),
});

const createClientPayloadSchema = z.object({
  clientType: z.enum(["institution", "social_welfare", "individual"]),
  orgName: z.string().trim().nullable().optional(),
  contactName: z.string().trim().min(1, "請輸入聯絡人姓名"),
  contactEmail: z.string().trim().email("Email 格式不正確"),
  contactPhone: z.string().trim().nullable().optional(),
  taxId: z.string().trim().nullable().optional(),
  address: z.string().trim().nullable().optional(),
  username: z.string().trim().min(3, "帳號至少需要 3 碼"),
  password: z.string().min(6, "密碼至少需要 6 碼"),
  status: z.enum(["pending", "active", "suspended", "cancelled"]).default("pending"),
  notes: z.string().trim().nullable().optional(),
  assignedTo: z.number().int().positive().nullable().optional(),
});

const createStaffPayloadSchema = z.object({
  username: z.string().trim().min(3, "帳號至少需要 3 碼"),
  password: z.string().min(6, "密碼至少需要 6 碼"),
  displayName: z.string().trim().min(1, "請輸入姓名"),
  role: z.enum(["superadmin", "sales", "finance", "support"]),
  email: z.string().trim().email("Email 格式不正確"),
  isActive: z.boolean().optional(),
});

const createSubscriptionPayloadSchema = z.object({
  clientId: z.coerce.number().int().positive(),
  planId: z.coerce.number().int().positive(),
  billingCycle: z.enum(["monthly", "annual"]),
  status: z.enum(["active", "expired", "cancelled", "trial"]).default("active"),
  elderCount: z.coerce.number().int().positive(),
  startDate: z.string().trim().min(1, "請輸入起始日"),
  endDate: z.string().trim().min(1, "請輸入結束日"),
  nextBillingDate: z.string().trim().min(1, "請輸入下次扣款日"),
  amount: z.coerce.number().nonnegative(),
});

const createInvoicePayloadSchema = z.object({
  clientId: z.coerce.number().int().positive(),
  subscriptionId: z.coerce.number().int().positive().nullable().optional(),
  issueDate: z.string().trim().min(1, "請輸入開立日期"),
  dueDate: z.string().trim().min(1, "請輸入到期日"),
  periodStart: z.string().trim().min(1, "請輸入計費起始日"),
  periodEnd: z.string().trim().min(1, "請輸入計費結束日"),
  subtotal: z.coerce.number().nonnegative(),
  tax: z.coerce.number().nonnegative(),
  total: z.coerce.number().nonnegative(),
  status: z.enum(["unpaid", "paid", "overdue", "cancelled"]).default("unpaid"),
  notes: z.string().trim().nullable().optional(),
});

const createPaymentPayloadSchema = z.object({
  invoiceId: z.coerce.number().int().positive(),
  clientId: z.coerce.number().int().positive(),
  amount: z.coerce.number().positive(),
  method: z.enum(["newebpay", "ecpay", "stripe", "bank_transfer", "manual"]),
  status: z.enum(["pending", "success", "failed", "refunded"]).default("pending"),
  transactionId: z.string().trim().nullable().optional(),
  paidAt: z.date().nullable().optional(),
  notes: z.string().trim().nullable().optional(),
});

const portalPaymentSchema = z.object({
  invoiceId: z.coerce.number().int().positive(),
  method: z.enum(["newebpay", "ecpay", "stripe", "bank_transfer", "manual"]),
});

const normalizeNullableText = (value?: string | null) => {
  if (value == null) {
    return null;
  }

  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
};

const parsePayload = <T>(schema: z.ZodType<T>, payload: unknown) => {
  const parsed = schema.safeParse(payload);
  if (!parsed.success) {
    return {
      ok: false as const,
      message: parsed.error.issues[0]?.message ?? "資料格式不正確",
    };
  }

  return { ok: true as const, data: parsed.data };
};

export async function registerRoutes(_httpServer: Server, app: Express) {
  const MStore = MemoryStore(session);
  app.use(session({
    secret: "huhu-saas-secret-2026",
    resave: false,
    saveUninitialized: false,
    store: new MStore({ checkPeriod: 86400000 }),
    cookie: { maxAge: 86400000 },
  }));

  const assertClientUniqueness = async (username: string, email: string) => {
    const [existingByUsername, existingByEmail] = await Promise.all([
      storage.getClientByUsername(username),
      storage.getClientByEmail(email),
    ]);

    if (existingByUsername) {
      return { status: 409, message: "這個帳號已經被使用" };
    }

    if (existingByEmail) {
      return { status: 409, message: "這個 Email 已經被使用" };
    }

    return null;
  };

  const assertStaffUniqueness = async (username: string) => {
    const existing = await storage.getStaffByUsername(username);
    if (existing) {
      return { status: 409, message: "這個員工帳號已經存在" };
    }

    return null;
  };

  const requireStaff = (req: any, res: any, next: any) => {
    if (!req.session.staffId) {
      return res.status(401).json({ message: "請先登入後台帳號" });
    }

    next();
  };

  const requireClient = (req: any, res: any, next: any) => {
    if (!req.session.clientId) {
      return res.status(401).json({ message: "請先登入客戶帳號" });
    }

    next();
  };

  app.post("/api/staff/login", async (req, res) => {
    const parsed = parsePayload(loginSchema, req.body);
    if (!parsed.ok) {
      return res.status(400).json({ message: parsed.message });
    }

    const staff = await storage.getStaffByUsername(parsed.data.username);
    if (!staff || staff.password !== parsed.data.password || !staff.isActive) {
      return res.status(401).json({ message: "帳號或密碼錯誤" });
    }

    req.session.staffId = staff.id;
    req.session.role = "staff";
    res.json({ id: staff.id, displayName: staff.displayName, role: staff.role, username: staff.username });
  });

  app.post("/api/client/login", async (req, res) => {
    const parsed = parsePayload(loginSchema, req.body);
    if (!parsed.ok) {
      return res.status(400).json({ message: parsed.message });
    }

    const client = await storage.getClientByUsername(parsed.data.username);
    if (!client || client.password !== parsed.data.password) {
      return res.status(401).json({ message: "帳號或密碼錯誤" });
    }

    if (client.status === "suspended") {
      return res.status(403).json({ message: "帳號已停用，請聯繫客服" });
    }

    req.session.clientId = client.id;
    req.session.role = "client";
    res.json({
      id: client.id,
      orgName: client.orgName,
      contactName: client.contactName,
      clientType: client.clientType,
      status: client.status,
    });
  });

  app.post("/api/client/register", async (req, res) => {
    const parsed = parsePayload(createClientPayloadSchema, {
      ...req.body,
      orgName: normalizeNullableText(req.body?.orgName),
      contactPhone: normalizeNullableText(req.body?.contactPhone),
      taxId: normalizeNullableText(req.body?.taxId),
      address: normalizeNullableText(req.body?.address),
      notes: null,
      assignedTo: null,
      status: "pending",
    });

    if (!parsed.ok) {
      return res.status(400).json({ message: parsed.message });
    }

    const duplicate = await assertClientUniqueness(parsed.data.username, parsed.data.contactEmail);
    if (duplicate) {
      return res.status(duplicate.status).json({ message: duplicate.message });
    }

    const client = await storage.createClient(parsed.data);
    res.json({ id: client.id, message: "申請已送出，等待後台審核開通" });
  });

  app.post("/api/logout", (req, res) => {
    req.session.destroy(() => {
      res.clearCookie("connect.sid");
      res.json({ ok: true });
    });
  });

  app.get("/api/me", async (req, res) => {
    if (req.session.staffId) {
      const staff = await storage.getStaff(req.session.staffId);
      if (!staff) {
        return res.status(401).json({ message: "Unauthorized" });
      }

      return res.json({ type: "staff", id: staff.id, displayName: staff.displayName, role: staff.role, username: staff.username });
    }

    if (req.session.clientId) {
      const client = await storage.getClient(req.session.clientId);
      if (!client) {
        return res.status(401).json({ message: "Unauthorized" });
      }

      return res.json({
        type: "client",
        id: client.id,
        orgName: client.orgName,
        contactName: client.contactName,
        clientType: client.clientType,
        status: client.status,
      });
    }

    res.status(401).json({ message: "Unauthorized" });
  });

  app.get("/api/plans", async (_req, res) => {
    const plans = await storage.getAllPlans();
    res.json(plans.filter((plan) => plan.isActive));
  });

  app.get("/api/staff/clients", requireStaff, async (_req, res) => {
    res.json(await storage.getAllClients());
  });

  app.get("/api/staff/clients/:id", requireStaff, async (req, res) => {
    const client = await storage.getClient(Number(req.params.id));
    if (!client) {
      return res.status(404).json({ message: "找不到客戶" });
    }

    res.json(client);
  });

  app.post("/api/staff/clients", requireStaff, async (req, res) => {
    const parsed = parsePayload(createClientPayloadSchema, {
      ...req.body,
      orgName: normalizeNullableText(req.body?.orgName),
      contactPhone: normalizeNullableText(req.body?.contactPhone),
      taxId: normalizeNullableText(req.body?.taxId),
      address: normalizeNullableText(req.body?.address),
      notes: normalizeNullableText(req.body?.notes),
      assignedTo: req.body?.assignedTo ? Number(req.body.assignedTo) : null,
      status: req.body?.status ?? "pending",
    });

    if (!parsed.ok) {
      return res.status(400).json({ message: parsed.message });
    }

    const duplicate = await assertClientUniqueness(parsed.data.username, parsed.data.contactEmail);
    if (duplicate) {
      return res.status(duplicate.status).json({ message: duplicate.message });
    }

    if (parsed.data.assignedTo != null) {
      const staff = await storage.getStaff(parsed.data.assignedTo);
      if (!staff) {
        return res.status(404).json({ message: "指定的員工不存在" });
      }
    }

    const client = await storage.createClient(parsed.data);
    res.json(client);
  });

  app.patch("/api/staff/clients/:id", requireStaff, async (req, res) => {
    const client = await storage.updateClient(Number(req.params.id), req.body);
    if (!client) {
      return res.status(404).json({ message: "找不到客戶" });
    }

    res.json(client);
  });

  app.post("/api/staff/clients/:id/activate", requireStaff, async (req, res) => {
    const client = await storage.updateClient(Number(req.params.id), { status: "active", activatedAt: new Date() });
    if (!client) {
      return res.status(404).json({ message: "找不到客戶" });
    }

    res.json(client);
  });

  app.post("/api/staff/clients/:id/suspend", requireStaff, async (req, res) => {
    const client = await storage.updateClient(Number(req.params.id), { status: "suspended" });
    if (!client) {
      return res.status(404).json({ message: "找不到客戶" });
    }

    res.json(client);
  });

  app.get("/api/staff/members", requireStaff, async (_req, res) => {
    const all = await storage.getAllStaff();
    res.json(all.map((staff) => ({ ...staff, password: undefined })));
  });

  app.post("/api/staff/members", requireStaff, async (req, res) => {
    const parsed = parsePayload(createStaffPayloadSchema, req.body);
    if (!parsed.ok) {
      return res.status(400).json({ message: parsed.message });
    }

    const duplicate = await assertStaffUniqueness(parsed.data.username);
    if (duplicate) {
      return res.status(duplicate.status).json({ message: duplicate.message });
    }

    const staff = await storage.createStaff({
      ...parsed.data,
      isActive: parsed.data.isActive ?? true,
    });
    res.json({ ...staff, password: undefined });
  });

  app.get("/api/staff/subscriptions", requireStaff, async (_req, res) => {
    res.json(await storage.getAllSubscriptions());
  });

  app.post("/api/staff/subscriptions", requireStaff, async (req, res) => {
    const parsed = parsePayload(createSubscriptionPayloadSchema, req.body);
    if (!parsed.ok) {
      return res.status(400).json({ message: parsed.message });
    }

    const [client, plan] = await Promise.all([
      storage.getClient(parsed.data.clientId),
      storage.getPlan(parsed.data.planId),
    ]);

    if (!client) {
      return res.status(404).json({ message: "找不到客戶" });
    }

    if (!plan) {
      return res.status(404).json({ message: "找不到方案" });
    }

    const subscription = await storage.createSubscription(parsed.data);
    res.json(subscription);
  });

  app.patch("/api/staff/subscriptions/:id", requireStaff, async (req, res) => {
    const subscription = await storage.updateSubscription(Number(req.params.id), req.body);
    if (!subscription) {
      return res.status(404).json({ message: "找不到訂閱" });
    }

    res.json(subscription);
  });

  app.get("/api/staff/invoices", requireStaff, async (_req, res) => {
    res.json(await storage.getAllInvoices());
  });

  app.post("/api/staff/invoices", requireStaff, async (req, res) => {
    const parsed = parsePayload(createInvoicePayloadSchema, {
      ...req.body,
      subscriptionId: req.body?.subscriptionId ? Number(req.body.subscriptionId) : null,
      notes: normalizeNullableText(req.body?.notes),
    });

    if (!parsed.ok) {
      return res.status(400).json({ message: parsed.message });
    }

    const client = await storage.getClient(parsed.data.clientId);
    if (!client) {
      return res.status(404).json({ message: "找不到客戶" });
    }

    if (parsed.data.subscriptionId != null) {
      const subscription = await storage.getSubscription(parsed.data.subscriptionId);
      if (!subscription) {
        return res.status(404).json({ message: "找不到訂閱" });
      }

      if (subscription.clientId !== parsed.data.clientId) {
        return res.status(400).json({ message: "訂閱與客戶不一致" });
      }
    }

    const allInvoices = await storage.getAllInvoices();
    const year = new Date().getFullYear();
    const sequence = String(allInvoices.length + 1).padStart(4, "0");
    const invoiceNo = `INV-${year}-${sequence}`;

    const invoice = await storage.createInvoice({ ...parsed.data, invoiceNo });
    res.json(invoice);
  });

  app.patch("/api/staff/invoices/:id", requireStaff, async (req, res) => {
    const invoice = await storage.updateInvoice(Number(req.params.id), req.body);
    if (!invoice) {
      return res.status(404).json({ message: "找不到帳單" });
    }

    res.json(invoice);
  });

  app.get("/api/staff/payments", requireStaff, async (_req, res) => {
    res.json(await storage.getAllPayments());
  });

  app.post("/api/staff/payments", requireStaff, async (req, res) => {
    const parsed = parsePayload(createPaymentPayloadSchema, {
      ...req.body,
      paidAt: req.body?.paidAt ? new Date(req.body.paidAt) : new Date(),
      notes: normalizeNullableText(req.body?.notes),
    });

    if (!parsed.ok) {
      return res.status(400).json({ message: parsed.message });
    }

    const invoice = await storage.getInvoice(parsed.data.invoiceId);
    if (!invoice) {
      return res.status(404).json({ message: "找不到帳單" });
    }

    if (invoice.clientId !== parsed.data.clientId) {
      return res.status(400).json({ message: "付款客戶與帳單不一致" });
    }

    const payment = await storage.createPayment(parsed.data);
    if (payment.status === "success") {
      await storage.updateInvoice(payment.invoiceId, { status: "paid" });
    }

    res.json(payment);
  });

  app.patch("/api/staff/payments/:id", requireStaff, async (req, res) => {
    const payment = await storage.updatePayment(Number(req.params.id), req.body);
    if (!payment) {
      return res.status(404).json({ message: "找不到付款" });
    }

    if (payment.status === "success") {
      await storage.updateInvoice(payment.invoiceId, { status: "paid" });
    }

    res.json(payment);
  });

  app.get("/api/staff/service-records", requireStaff, async (_req, res) => {
    res.json(await storage.getAllServiceRecords());
  });

  app.post("/api/staff/service-records", requireStaff, async (req, res) => {
    const serviceRecord = await storage.createServiceRecord(req.body);
    res.json(serviceRecord);
  });

  app.get("/api/staff/stats", requireStaff, async (_req, res) => {
    const [clients, subscriptions, invoices] = await Promise.all([
      storage.getAllClients(),
      storage.getAllSubscriptions(),
      storage.getAllInvoices(),
    ]);

    const activeClients = clients.filter((client) => client.status === "active").length;
    const pendingClients = clients.filter((client) => client.status === "pending").length;
    const activeSubscriptions = subscriptions.filter((subscription) => subscription.status === "active").length;
    const unpaidInvoices = invoices.filter((invoice) => invoice.status === "unpaid" || invoice.status === "overdue");
    const unpaidAmount = unpaidInvoices.reduce((sum, invoice) => sum + invoice.total, 0);
    const paidAmount = invoices
      .filter((invoice) => invoice.status === "paid")
      .reduce((sum, invoice) => sum + invoice.total, 0);
    const mrr = subscriptions
      .filter((subscription) => subscription.status === "active")
      .reduce((sum, subscription) => sum + (subscription.billingCycle === "annual" ? subscription.amount / 12 : subscription.amount), 0);

    res.json({
      activeClients,
      pendingClients,
      activeSubscriptions,
      unpaidInvoices: unpaidInvoices.length,
      unpaidAmount,
      paidAmount,
      mrr,
    });
  });

  app.get("/api/portal/me", requireClient, async (req, res) => {
    const client = await storage.getClient(req.session.clientId!);
    res.json(client);
  });

  app.get("/api/portal/subscriptions", requireClient, async (req, res) => {
    res.json(await storage.getSubscriptionsByClient(req.session.clientId!));
  });

  app.get("/api/portal/invoices", requireClient, async (req, res) => {
    res.json(await storage.getInvoicesByClient(req.session.clientId!));
  });

  app.get("/api/portal/service-records", requireClient, async (req, res) => {
    res.json(await storage.getServiceRecordsByClient(req.session.clientId!));
  });

  app.post("/api/portal/pay", requireClient, async (req, res) => {
    const parsed = parsePayload(portalPaymentSchema, req.body);
    if (!parsed.ok) {
      return res.status(400).json({ message: parsed.message });
    }

    const invoice = await storage.getInvoice(parsed.data.invoiceId);
    if (!invoice) {
      return res.status(404).json({ message: "找不到帳單" });
    }

    if (invoice.clientId !== req.session.clientId) {
      return res.status(403).json({ message: "沒有這張帳單的付款權限" });
    }

    if (invoice.status === "paid") {
      return res.status(400).json({ message: "這張帳單已經付款" });
    }

    const transactionId = `${parsed.data.method.toUpperCase()}-${Date.now()}`;
    const payment = await storage.createPayment({
      invoiceId: parsed.data.invoiceId,
      clientId: req.session.clientId!,
      amount: invoice.total,
      method: parsed.data.method,
      status: "success",
      transactionId,
      paidAt: new Date(),
      notes: "mock gateway success",
    });

    await storage.updateInvoice(parsed.data.invoiceId, { status: "paid" });
    res.json({ success: true, transactionId, payment });
  });
}
