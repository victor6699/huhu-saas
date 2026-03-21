// @ts-nocheck
import type {
  Staff, InsertStaff,
  Client, InsertClient,
  Plan, InsertPlan,
  Subscription, InsertSubscription,
  Invoice, InsertInvoice,
  Payment, InsertPayment,
  ServiceRecord, InsertServiceRecord,
} from "@shared/schema";

export interface IStorage {
  // Staff
  getStaff(id: number): Promise<Staff | undefined>;
  getStaffByUsername(username: string): Promise<Staff | undefined>;
  getAllStaff(): Promise<Staff[]>;
  createStaff(data: InsertStaff): Promise<Staff>;
  updateStaff(id: number, data: Partial<Staff>): Promise<Staff | undefined>;

  // Clients
  getClient(id: number): Promise<Client | undefined>;
  getClientByUsername(username: string): Promise<Client | undefined>;
  getClientByEmail(email: string): Promise<Client | undefined>;
  getAllClients(): Promise<Client[]>;
  createClient(data: InsertClient): Promise<Client>;
  updateClient(id: number, data: Partial<Client>): Promise<Client | undefined>;

  // Plans
  getPlan(id: number): Promise<Plan | undefined>;
  getAllPlans(): Promise<Plan[]>;
  createPlan(data: InsertPlan): Promise<Plan>;
  updatePlan(id: number, data: Partial<Plan>): Promise<Plan | undefined>;

  // Subscriptions
  getSubscription(id: number): Promise<Subscription | undefined>;
  getSubscriptionsByClient(clientId: number): Promise<Subscription[]>;
  getAllSubscriptions(): Promise<Subscription[]>;
  createSubscription(data: InsertSubscription): Promise<Subscription>;
  updateSubscription(id: number, data: Partial<Subscription>): Promise<Subscription | undefined>;

  // Invoices
  getInvoice(id: number): Promise<Invoice | undefined>;
  getInvoicesByClient(clientId: number): Promise<Invoice[]>;
  getAllInvoices(): Promise<Invoice[]>;
  createInvoice(data: InsertInvoice): Promise<Invoice>;
  updateInvoice(id: number, data: Partial<Invoice>): Promise<Invoice | undefined>;

  // Payments
  getPayment(id: number): Promise<Payment | undefined>;
  getPaymentsByInvoice(invoiceId: number): Promise<Payment[]>;
  getAllPayments(): Promise<Payment[]>;
  createPayment(data: InsertPayment): Promise<Payment>;
  updatePayment(id: number, data: Partial<Payment>): Promise<Payment | undefined>;

  // Service Records
  getServiceRecord(id: number): Promise<ServiceRecord | undefined>;
  getServiceRecordsByClient(clientId: number): Promise<ServiceRecord[]>;
  getAllServiceRecords(): Promise<ServiceRecord[]>;
  createServiceRecord(data: InsertServiceRecord): Promise<ServiceRecord>;
  updateServiceRecord(id: number, data: Partial<ServiceRecord>): Promise<ServiceRecord | undefined>;
}

export class MemStorage implements IStorage {
  private staffMap = new Map<number, Staff>();
  private clientsMap = new Map<number, Client>();
  private plansMap = new Map<number, Plan>();
  private subscriptionsMap = new Map<number, Subscription>();
  private invoicesMap = new Map<number, Invoice>();
  private paymentsMap = new Map<number, Payment>();
  private serviceRecordsMap = new Map<number, ServiceRecord>();
  private nextId = { staff: 1, client: 1, plan: 1, sub: 1, inv: 1, pay: 1, svc: 1 };

  constructor() {
    this.seed();
  }

  private seed() {
    // ── Staff ──────────────────────────────────────────────
    const staffData = [
      { id: this.nextId.staff++, username: "admin", password: "admin123", displayName: "系統管理員", role: "superadmin", email: "admin@huhu.ai", isActive: true as const, createdAt: new Date("2025-01-01") },
      { id: this.nextId.staff++, username: "sales_chen", password: "demo123", displayName: "陳業務", role: "sales", email: "sales@huhu.ai", isActive: true as const, createdAt: new Date("2025-03-01") },
      { id: this.nextId.staff++, username: "finance_lin", password: "demo123", displayName: "林財務", role: "finance", email: "finance@huhu.ai", isActive: true as const, createdAt: new Date("2025-03-01") },
    ];
    staffData.forEach((s: any) => this.staffMap.set(s.id, s as Staff));

    // ── Plans ──────────────────────────────────────────────
    const planData = [
      {
        id: this.nextId.plan++, name: "個人方案", description: "適合個人家庭使用",
        monthlyPrice: 990, annualPrice: 9900, maxElders: 1,
        features: JSON.stringify(["AI語音陪伴", "情緒監測", "家屬通知", "每日健康報告"]),
        isActive: true,
      },
      {
        id: this.nextId.plan++, name: "小型機構方案", description: "適合小型安養機構（≤10位長輩）",
        monthlyPrice: 6800, annualPrice: 68000, maxElders: 10,
        features: JSON.stringify(["AI語音陪伴", "情緒監測", "家屬通知", "每日健康報告", "照護員後台", "月報告匯出", "優先客服"]),
        isActive: true,
      },
      {
        id: this.nextId.plan++, name: "機構標準方案", description: "適合中型安養機構（≤30位長輩）",
        monthlyPrice: 18000, annualPrice: 180000, maxElders: 30,
        features: JSON.stringify(["AI語音陪伴", "情緒監測", "家屬通知", "每日健康報告", "照護員後台", "月報告匯出", "優先客服", "API整合", "自訂問候語", "機構Logo客製"]),
        isActive: true,
      },
      {
        id: this.nextId.plan++, name: "政府/社福方案", description: "社會局、社福機構專屬優惠方案",
        monthlyPrice: 12000, annualPrice: 120000, maxElders: 50,
        features: JSON.stringify(["AI語音陪伴", "情緒監測", "家屬通知", "每日健康報告", "照護員後台", "月報告匯出", "優先客服", "API整合", "政府採購報表", "無上限擴充"]),
        isActive: true,
      },
    ];
    planData.forEach((p: any) => this.plansMap.set(p.id, p as Plan));

    // ── Clients ────────────────────────────────────────────
    const now = new Date();
    const fmt = (d: Date) => d.toISOString().split("T")[0];
    const addDays = (d: Date, n: number) => { const r = new Date(d); r.setDate(r.getDate() + n); return r; };
    const addMonths = (d: Date, n: number) => { const r = new Date(d); r.setMonth(r.getMonth() + n); return r; };

    const clientData = [
      {
        id: this.nextId.client++, clientType: "institution", orgName: "慈愛老人養護中心",
        contactName: "王院長", contactEmail: "wang@cirai.org.tw", contactPhone: "02-2345-6789",
        taxId: "22334455", address: "台北市內湖區內湖路一段123號" as string | null,
        username: "cirai_org", password: "demo123",
        status: "active", notes: "2025年3月簽約，首批機構客戶", assignedTo: 2,
        createdAt: new Date("2025-03-15"), activatedAt: new Date("2025-03-20"),
      },
      {
        id: this.nextId.client++, clientType: "social_welfare", orgName: "台北市社會局長照科",
        contactName: "李科長", contactEmail: "li@taipei.gov.tw", contactPhone: "02-2720-8889",
        taxId: "01234567", address: "台北市信義區市府路1號" as string | null,
        username: "taipei_welfare", password: "demo123",
        status: "active", notes: "政府採購標案，年付優惠", assignedTo: 2,
        createdAt: new Date("2025-06-01"), activatedAt: new Date("2025-06-10"),
      },
      {
        id: this.nextId.client++, clientType: "individual", orgName: null,
        contactName: "陳小華", contactEmail: "hua@gmail.com", contactPhone: "0912-345-678",
        taxId: null, address: "新北市板橋區中山路二段88號" as string | null,
        username: "chen_hua", password: "demo123",
        status: "active", notes: "為母親購買個人方案", assignedTo: 3,
        createdAt: new Date("2025-09-01"), activatedAt: new Date("2025-09-01"),
      },
      {
        id: this.nextId.client++, clientType: "institution", orgName: "安心居家照護有限公司",
        contactName: "張主任", contactEmail: "chang@anxin.com.tw", contactPhone: "04-2233-4455",
        taxId: "55667788", address: "台中市西屯區台灣大道三段100號",
        username: "anxin_care", password: "demo123",
        status: "pending", notes: "評估中，待簽約", assignedTo: 2,
        createdAt: new Date("2026-02-20"), activatedAt: null,
      },
    ];
    clientData.forEach((c: any) => this.clientsMap.set(c.id, c as Client));

    // ── Subscriptions ──────────────────────────────────────
    const subData = [
      {
        id: this.nextId.sub++, clientId: 1, planId: 2, billingCycle: "annual",
        status: "active", elderCount: 8,
        startDate: "2025-03-20", endDate: "2026-03-19",
        nextBillingDate: "2026-03-20", amount: 68000,
        createdAt: new Date("2025-03-20"),
      },
      {
        id: this.nextId.sub++, clientId: 2, planId: 4, billingCycle: "annual",
        status: "active", elderCount: 35,
        startDate: "2025-06-10", endDate: "2026-06-09",
        nextBillingDate: "2026-06-10", amount: 120000,
        createdAt: new Date("2025-06-10"),
      },
      {
        id: this.nextId.sub++, clientId: 3, planId: 1, billingCycle: "monthly",
        status: "active", elderCount: 1,
        startDate: "2025-09-01", endDate: fmt(addMonths(now, 1)),
        nextBillingDate: fmt(addMonths(now, 1)), amount: 990,
        createdAt: new Date("2025-09-01"),
      },
    ];
    subData.forEach((s: any) => this.subscriptionsMap.set(s.id, s as Subscription));

    // ── Invoices ───────────────────────────────────────────
    const invData = [
      {
        id: this.nextId.inv++, invoiceNo: "INV-2025-0001", clientId: 1, subscriptionId: 1,
        issueDate: "2025-03-20", dueDate: "2025-04-04",
        periodStart: "2025-03-20", periodEnd: "2026-03-19",
        subtotal: 68000, tax: 3400, total: 71400,
        status: "paid", notes: "年繳方案，含5%營業稅",
        createdAt: new Date("2025-03-20"),
      },
      {
        id: this.nextId.inv++, invoiceNo: "INV-2025-0002", clientId: 2, subscriptionId: 2,
        issueDate: "2025-06-10", dueDate: "2025-06-25",
        periodStart: "2025-06-10", periodEnd: "2026-06-09",
        subtotal: 120000, tax: 6000, total: 126000,
        status: "paid", notes: "政府採購，含5%營業稅",
        createdAt: new Date("2025-06-10"),
      },
      {
        id: this.nextId.inv++, invoiceNo: "INV-2025-0003", clientId: 3, subscriptionId: 3,
        issueDate: fmt(addDays(now, -5)), dueDate: fmt(addDays(now, 10)),
        periodStart: fmt(now), periodEnd: fmt(addMonths(now, 1)),
        subtotal: 990, tax: 50, total: 1040,
        status: "unpaid", notes: "個人月繳",
        createdAt: addDays(now, -5),
      },
      {
        id: this.nextId.inv++, invoiceNo: "INV-2026-0001", clientId: 1, subscriptionId: 1,
        issueDate: fmt(addDays(now, -2)), dueDate: fmt(addDays(now, 13)),
        periodStart: fmt(addDays(now, -2)), periodEnd: fmt(addMonths(now, 1)),
        subtotal: 68000, tax: 3400, total: 71400,
        status: "unpaid", notes: "續約帳單",
        createdAt: addDays(now, -2),
      },
    ];
    invData.forEach((i: any) => this.invoicesMap.set(i.id, i as Invoice));

    // ── Payments ───────────────────────────────────────────
    const payData = [
      {
        id: this.nextId.pay++, invoiceId: 1, clientId: 1, amount: 71400,
        method: "bank_transfer", status: "success",
        transactionId: "BT20250322001", paidAt: new Date("2025-03-22"),
        notes: "匯款確認", createdAt: new Date("2025-03-22"),
      },
      {
        id: this.nextId.pay++, invoiceId: 2, clientId: 2, amount: 126000,
        method: "bank_transfer", status: "success",
        transactionId: "BT20250615002", paidAt: new Date("2025-06-15"),
        notes: "政府撥款", createdAt: new Date("2025-06-15"),
      },
    ];
    payData.forEach((p: any) => this.paymentsMap.set(p.id, p as Payment));

    // ── Service Records ────────────────────────────────────
    const svcData = [
      { id: this.nextId.svc++, clientId: 1, subscriptionId: 1, month: "2026-01", elderCount: 8, conversationCount: 1240, alertCount: 3, activeElders: 8, notes: null, createdAt: new Date("2026-02-01") },
      { id: this.nextId.svc++, clientId: 1, subscriptionId: 1, month: "2026-02", elderCount: 8, conversationCount: 1380, alertCount: 1, activeElders: 7, notes: null, createdAt: new Date("2026-03-01") },
      { id: this.nextId.svc++, clientId: 2, subscriptionId: 2, month: "2026-01", elderCount: 35, conversationCount: 5200, alertCount: 7, activeElders: 32, notes: null, createdAt: new Date("2026-02-01") },
      { id: this.nextId.svc++, clientId: 2, subscriptionId: 2, month: "2026-02", elderCount: 35, conversationCount: 4980, alertCount: 5, activeElders: 33, notes: null, createdAt: new Date("2026-03-01") },
      { id: this.nextId.svc++, clientId: 3, subscriptionId: 3, month: "2026-02", elderCount: 1, conversationCount: 145, alertCount: 0, activeElders: 1, notes: null, createdAt: new Date("2026-03-01") },
    ];
    svcData.forEach((s: any) => this.serviceRecordsMap.set(s.id, s as ServiceRecord));
  }

  // Staff
  async getStaff(id: number) { return this.staffMap.get(id); }
  async getStaffByUsername(username: string) { return Array.from(this.staffMap.values()).find(s => s.username === username); }
  async getAllStaff() { return Array.from(this.staffMap.values()); }
  async createStaff(data: InsertStaff): Promise<Staff> {
    const s: Staff = { ...data, id: this.nextId.staff++, createdAt: new Date() };
    this.staffMap.set(s.id, s); return s;
  }
  async updateStaff(id: number, data: Partial<Staff>) {
    const s = this.staffMap.get(id); if (!s) return undefined;
    const updated = { ...s, ...data }; this.staffMap.set(id, updated); return updated;
  }

  // Clients
  async getClient(id: number) { return this.clientsMap.get(id); }
  async getClientByUsername(u: string) { return Array.from(this.clientsMap.values()).find(c => c.username === u); }
  async getClientByEmail(e: string) { return Array.from(this.clientsMap.values()).find(c => c.contactEmail === e); }
  async getAllClients() { return Array.from(this.clientsMap.values()); }
  async createClient(data: InsertClient): Promise<Client> {
    const c: Client = { ...data, id: this.nextId.client++, createdAt: new Date(), activatedAt: null };
    this.clientsMap.set(c.id, c); return c;
  }
  async updateClient(id: number, data: Partial<Client>) {
    const c = this.clientsMap.get(id); if (!c) return undefined;
    const updated = { ...c, ...data }; this.clientsMap.set(id, updated); return updated;
  }

  // Plans
  async getPlan(id: number) { return this.plansMap.get(id); }
  async getAllPlans() { return Array.from(this.plansMap.values()); }
  async createPlan(data: InsertPlan): Promise<Plan> {
    const p: Plan = { ...data, id: this.nextId.plan++ };
    this.plansMap.set(p.id, p); return p;
  }
  async updatePlan(id: number, data: Partial<Plan>) {
    const p = this.plansMap.get(id); if (!p) return undefined;
    const updated = { ...p, ...data }; this.plansMap.set(id, updated); return updated;
  }

  // Subscriptions
  async getSubscription(id: number) { return this.subscriptionsMap.get(id); }
  async getSubscriptionsByClient(clientId: number) { return Array.from(this.subscriptionsMap.values()).filter(s => s.clientId === clientId); }
  async getAllSubscriptions() { return Array.from(this.subscriptionsMap.values()); }
  async createSubscription(data: InsertSubscription): Promise<Subscription> {
    const s: Subscription = { ...data, id: this.nextId.sub++, createdAt: new Date() };
    this.subscriptionsMap.set(s.id, s); return s;
  }
  async updateSubscription(id: number, data: Partial<Subscription>) {
    const s = this.subscriptionsMap.get(id); if (!s) return undefined;
    const updated = { ...s, ...data }; this.subscriptionsMap.set(id, updated); return updated;
  }

  // Invoices
  async getInvoice(id: number) { return this.invoicesMap.get(id); }
  async getInvoicesByClient(clientId: number) { return Array.from(this.invoicesMap.values()).filter(i => i.clientId === clientId); }
  async getAllInvoices() { return Array.from(this.invoicesMap.values()); }
  async createInvoice(data: InsertInvoice): Promise<Invoice> {
    const inv: Invoice = { ...data, id: this.nextId.inv++, createdAt: new Date() };
    this.invoicesMap.set(inv.id, inv); return inv;
  }
  async updateInvoice(id: number, data: Partial<Invoice>) {
    const inv = this.invoicesMap.get(id); if (!inv) return undefined;
    const updated = { ...inv, ...data }; this.invoicesMap.set(id, updated); return updated;
  }

  // Payments
  async getPayment(id: number) { return this.paymentsMap.get(id); }
  async getPaymentsByInvoice(invoiceId: number) { return Array.from(this.paymentsMap.values()).filter(p => p.invoiceId === invoiceId); }
  async getAllPayments() { return Array.from(this.paymentsMap.values()); }
  async createPayment(data: InsertPayment): Promise<Payment> {
    const p: Payment = { ...data, id: this.nextId.pay++, createdAt: new Date() };
    this.paymentsMap.set(p.id, p); return p;
  }
  async updatePayment(id: number, data: Partial<Payment>) {
    const p = this.paymentsMap.get(id); if (!p) return undefined;
    const updated = { ...p, ...data }; this.paymentsMap.set(id, updated); return updated;
  }

  // Service Records
  async getServiceRecord(id: number) { return this.serviceRecordsMap.get(id); }
  async getServiceRecordsByClient(clientId: number) { return Array.from(this.serviceRecordsMap.values()).filter(s => s.clientId === clientId); }
  async getAllServiceRecords() { return Array.from(this.serviceRecordsMap.values()); }
  async createServiceRecord(data: InsertServiceRecord): Promise<ServiceRecord> {
    const s: ServiceRecord = { ...data, id: this.nextId.svc++, createdAt: new Date() };
    this.serviceRecordsMap.set(s.id, s); return s;
  }
  async updateServiceRecord(id: number, data: Partial<ServiceRecord>) {
    const s = this.serviceRecordsMap.get(id); if (!s) return undefined;
    const updated = { ...s, ...data }; this.serviceRecordsMap.set(id, updated); return updated;
  }
}

export const storage = new MemStorage();
