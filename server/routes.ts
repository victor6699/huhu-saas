import type { Express } from "express";
import type { Server } from "http";
import session from "express-session";
import MemoryStore from "memorystore";
import { storage } from "./storage";

declare module "express-session" {
  interface SessionData { staffId?: number; clientId?: number; role?: string; }
}

export async function registerRoutes(httpServer: Server, app: Express) {
  const MStore = MemoryStore(session);
  app.use(session({
    secret: "huhu-saas-secret-2026",
    resave: false,
    saveUninitialized: false,
    store: new MStore({ checkPeriod: 86400000 }),
    cookie: { maxAge: 86400000 },
  }));

  // ── Auth ────────────────────────────────────────────────────

  // Staff login
  app.post("/api/staff/login", async (req, res) => {
    const { username, password } = req.body;
    const s = await storage.getStaffByUsername(username);
    if (!s || s.password !== password || !s.isActive) return res.status(401).json({ message: "帳號或密碼錯誤" });
    req.session.staffId = s.id;
    req.session.role = "staff";
    res.json({ id: s.id, displayName: s.displayName, role: s.role, username: s.username });
  });

  // Client login
  app.post("/api/client/login", async (req, res) => {
    const { username, password } = req.body;
    const c = await storage.getClientByUsername(username);
    if (!c || c.password !== password) return res.status(401).json({ message: "帳號或密碼錯誤" });
    if (c.status === "suspended") return res.status(403).json({ message: "帳號已停用，請聯絡客服" });
    req.session.clientId = c.id;
    req.session.role = "client";
    res.json({ id: c.id, orgName: c.orgName, contactName: c.contactName, clientType: c.clientType, status: c.status });
  });

  // Client self-register
  app.post("/api/client/register", async (req, res) => {
    const { username, password, contactName, contactEmail, clientType, orgName, contactPhone, taxId, address } = req.body;
    const existing = await storage.getClientByUsername(username);
    if (existing) return res.status(400).json({ message: "此帳號已存在" });
    const emailEx = await storage.getClientByEmail(contactEmail);
    if (emailEx) return res.status(400).json({ message: "此Email已註冊" });
    const c = await storage.createClient({ username, password, contactName, contactEmail, clientType, orgName: orgName || null, contactPhone: contactPhone || null, taxId: taxId || null, address: address || null, status: "pending", notes: null, assignedTo: null });
    res.json({ id: c.id, message: "註冊成功，等待審核開通" });
  });

  // Logout
  app.post("/api/logout", (req, res) => {
    req.session.destroy(() => {
      res.clearCookie("connect.sid");
      res.json({ ok: true });
    });
  });

  // Whoami
  app.get("/api/me", async (req, res) => {
    if (req.session.staffId) {
      const s = await storage.getStaff(req.session.staffId);
      if (!s) return res.status(401).json({ message: "Unauthorized" });
      return res.json({ type: "staff", id: s.id, displayName: s.displayName, role: s.role, username: s.username });
    }
    if (req.session.clientId) {
      const c = await storage.getClient(req.session.clientId);
      if (!c) return res.status(401).json({ message: "Unauthorized" });
      return res.json({ type: "client", id: c.id, orgName: c.orgName, contactName: c.contactName, clientType: c.clientType, status: c.status });
    }
    res.status(401).json({ message: "Unauthorized" });
  });

  // ── Staff-only middleware ────────────────────────────────────
  const requireStaff = (req: any, res: any, next: any) => {
    if (!req.session.staffId) return res.status(401).json({ message: "需要員工登入" });
    next();
  };

  // ── Client-only middleware ───────────────────────────────────
  const requireClient = (req: any, res: any, next: any) => {
    if (!req.session.clientId) return res.status(401).json({ message: "需要客戶登入" });
    next();
  };

  // ── Plans (public) ──────────────────────────────────────────
  app.get("/api/plans", async (_req, res) => {
    const plans = await storage.getAllPlans();
    res.json(plans.filter(p => p.isActive));
  });

  // ── Staff APIs ──────────────────────────────────────────────

  // Clients management
  app.get("/api/staff/clients", requireStaff, async (_req, res) => {
    res.json(await storage.getAllClients());
  });
  app.get("/api/staff/clients/:id", requireStaff, async (req, res) => {
    const c = await storage.getClient(Number(req.params.id));
    if (!c) return res.status(404).json({ message: "Not found" });
    res.json(c);
  });
  app.post("/api/staff/clients", requireStaff, async (req, res) => {
    const c = await storage.createClient(req.body);
    res.json(c);
  });
  app.patch("/api/staff/clients/:id", requireStaff, async (req, res) => {
    const c = await storage.updateClient(Number(req.params.id), req.body);
    if (!c) return res.status(404).json({ message: "Not found" });
    res.json(c);
  });
  // Activate client
  app.post("/api/staff/clients/:id/activate", requireStaff, async (req, res) => {
    const c = await storage.updateClient(Number(req.params.id), { status: "active", activatedAt: new Date() });
    res.json(c);
  });
  // Suspend client
  app.post("/api/staff/clients/:id/suspend", requireStaff, async (req, res) => {
    const c = await storage.updateClient(Number(req.params.id), { status: "suspended" });
    res.json(c);
  });

  // Staff management
  app.get("/api/staff/members", requireStaff, async (_req, res) => {
    const all = await storage.getAllStaff();
    res.json(all.map(s => ({ ...s, password: undefined })));
  });
  app.post("/api/staff/members", requireStaff, async (req, res) => {
    const s = await storage.createStaff(req.body);
    res.json({ ...s, password: undefined });
  });

  // Subscriptions (staff)
  app.get("/api/staff/subscriptions", requireStaff, async (_req, res) => {
    res.json(await storage.getAllSubscriptions());
  });
  app.post("/api/staff/subscriptions", requireStaff, async (req, res) => {
    const s = await storage.createSubscription(req.body);
    res.json(s);
  });
  app.patch("/api/staff/subscriptions/:id", requireStaff, async (req, res) => {
    const s = await storage.updateSubscription(Number(req.params.id), req.body);
    if (!s) return res.status(404).json({ message: "Not found" });
    res.json(s);
  });

  // Invoices (staff)
  app.get("/api/staff/invoices", requireStaff, async (_req, res) => {
    res.json(await storage.getAllInvoices());
  });
  app.post("/api/staff/invoices", requireStaff, async (req, res) => {
    // Auto-generate invoice number
    const all = await storage.getAllInvoices();
    const year = new Date().getFullYear();
    const seq = String(all.length + 1).padStart(4, "0");
    const invoiceNo = `INV-${year}-${seq}`;
    const inv = await storage.createInvoice({ ...req.body, invoiceNo });
    res.json(inv);
  });
  app.patch("/api/staff/invoices/:id", requireStaff, async (req, res) => {
    const inv = await storage.updateInvoice(Number(req.params.id), req.body);
    if (!inv) return res.status(404).json({ message: "Not found" });
    res.json(inv);
  });

  // Payments (staff)
  app.get("/api/staff/payments", requireStaff, async (_req, res) => {
    res.json(await storage.getAllPayments());
  });
  app.post("/api/staff/payments", requireStaff, async (req, res) => {
    const p = await storage.createPayment(req.body);
    // Mark invoice as paid
    if (p.status === "success") {
      await storage.updateInvoice(p.invoiceId, { status: "paid" });
    }
    res.json(p);
  });
  app.patch("/api/staff/payments/:id", requireStaff, async (req, res) => {
    const p = await storage.updatePayment(Number(req.params.id), req.body);
    if (!p) return res.status(404).json({ message: "Not found" });
    if (p.status === "success") await storage.updateInvoice(p.invoiceId, { status: "paid" });
    res.json(p);
  });

  // Service records (staff)
  app.get("/api/staff/service-records", requireStaff, async (_req, res) => {
    res.json(await storage.getAllServiceRecords());
  });
  app.post("/api/staff/service-records", requireStaff, async (req, res) => {
    const s = await storage.createServiceRecord(req.body);
    res.json(s);
  });

  // Dashboard stats (staff)
  app.get("/api/staff/stats", requireStaff, async (_req, res) => {
    const [clients, subscriptions, invoices, payments] = await Promise.all([
      storage.getAllClients(),
      storage.getAllSubscriptions(),
      storage.getAllInvoices(),
      storage.getAllPayments(),
    ]);
    const activeClients = clients.filter(c => c.status === "active").length;
    const pendingClients = clients.filter(c => c.status === "pending").length;
    const activeSubscriptions = subscriptions.filter(s => s.status === "active").length;
    const unpaidInvoices = invoices.filter(i => i.status === "unpaid" || i.status === "overdue");
    const unpaidAmount = unpaidInvoices.reduce((sum, i) => sum + i.total, 0);
    const paidAmount = invoices.filter(i => i.status === "paid").reduce((sum, i) => sum + i.total, 0);
    const mrr = subscriptions
      .filter(s => s.status === "active")
      .reduce((sum, s) => sum + (s.billingCycle === "annual" ? s.amount / 12 : s.amount), 0);
    res.json({ activeClients, pendingClients, activeSubscriptions, unpaidInvoices: unpaidInvoices.length, unpaidAmount, paidAmount, mrr });
  });

  // ── Client Portal APIs ───────────────────────────────────────

  app.get("/api/portal/me", requireClient, async (req, res) => {
    const c = await storage.getClient(req.session.clientId!);
    res.json(c);
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

  // Simulate payment (NewebPay / ECPay / Stripe mock)
  app.post("/api/portal/pay", requireClient, async (req, res) => {
    const { invoiceId, method } = req.body;
    const invoice = await storage.getInvoice(invoiceId);
    if (!invoice) return res.status(404).json({ message: "帳單不存在" });
    if (invoice.clientId !== req.session.clientId) return res.status(403).json({ message: "無權限" });
    if (invoice.status === "paid") return res.status(400).json({ message: "此帳單已付款" });

    // Mock payment gateway response
    const txId = `${method.toUpperCase()}-${Date.now()}`;
    const payment = await storage.createPayment({
      invoiceId, clientId: req.session.clientId!, amount: invoice.total,
      method, status: "success", transactionId: txId, paidAt: new Date(), notes: "線上付款成功（模擬）",
    });
    await storage.updateInvoice(invoiceId, { status: "paid" });
    res.json({ success: true, transactionId: txId, payment });
  });

}
