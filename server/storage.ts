import {
  staff, clients, plans, subscriptions, invoices, payments, serviceRecords,
  type Staff, type InsertStaff,
  type Client, type InsertClient,
  type Plan, type InsertPlan,
  type Subscription, type InsertSubscription,
  type Invoice, type InsertInvoice,
  type Payment, type InsertPayment,
  type ServiceRecord, type InsertServiceRecord,
} from "@shared/schema";
import { db } from "./db";
import { eq, and } from "drizzle-orm";

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

export class DatabaseStorage implements IStorage {
  // Staff
  async getStaff(id: number) { const [r] = await db.select().from(staff).where(eq(staff.id, id)); return r; }
  async getStaffByUsername(u: string) { const [r] = await db.select().from(staff).where(eq(staff.username, u)); return r; }
  async getAllStaff() { return await db.select().from(staff); }
  async createStaff(data: InsertStaff) { const [r] = await db.insert(staff).values(data).returning(); return r; }
  async updateStaff(id: number, data: Partial<Staff>) { const [r] = await db.update(staff).set(data).where(eq(staff.id, id)).returning(); return r; }

  // Clients
  async getClient(id: number) { const [r] = await db.select().from(clients).where(eq(clients.id, id)); return r; }
  async getClientByUsername(u: string) { const [r] = await db.select().from(clients).where(eq(clients.username, u)); return r; }
  async getClientByEmail(e: string) { const [r] = await db.select().from(clients).where(eq(clients.contactEmail, e)); return r; }
  async getAllClients() { return await db.select().from(clients); }
  async createClient(data: InsertClient) { const [r] = await db.insert(clients).values(data).returning(); return r; }
  async updateClient(id: number, data: Partial<Client>) { const [r] = await db.update(clients).set(data).where(eq(clients.id, id)).returning(); return r; }

  // Plans
  async getPlan(id: number) { const [r] = await db.select().from(plans).where(eq(plans.id, id)); return r; }
  async getAllPlans() { return await db.select().from(plans); }
  async createPlan(data: InsertPlan) { const [r] = await db.insert(plans).values(data).returning(); return r; }
  async updatePlan(id: number, data: Partial<Plan>) { const [r] = await db.update(plans).set(data).where(eq(plans.id, id)).returning(); return r; }

  // Subscriptions
  async getSubscription(id: number) { const [r] = await db.select().from(subscriptions).where(eq(subscriptions.id, id)); return r; }
  async getSubscriptionsByClient(clientId: number) { return await db.select().from(subscriptions).where(eq(subscriptions.clientId, clientId)); }
  async getAllSubscriptions() { return await db.select().from(subscriptions); }
  async createSubscription(data: InsertSubscription) { const [r] = await db.insert(subscriptions).values(data).returning(); return r; }
  async updateSubscription(id: number, data: Partial<Subscription>) { const [r] = await db.update(subscriptions).set(data).where(eq(subscriptions.id, id)).returning(); return r; }

  // Invoices
  async getInvoice(id: number) { const [r] = await db.select().from(invoices).where(eq(invoices.id, id)); return r; }
  async getInvoicesByClient(clientId: number) { return await db.select().from(invoices).where(eq(invoices.clientId, clientId)); }
  async getAllInvoices() { return await db.select().from(invoices); }
  async createInvoice(data: InsertInvoice) { const [r] = await db.insert(invoices).values(data).returning(); return r; }
  async updateInvoice(id: number, data: Partial<Invoice>) { const [r] = await db.update(invoices).set(data).where(eq(invoices.id, id)).returning(); return r; }

  // Payments
  async getPayment(id: number) { const [r] = await db.select().from(payments).where(eq(payments.id, id)); return r; }
  async getPaymentsByInvoice(invoiceId: number) { return await db.select().from(payments).where(eq(payments.invoiceId, invoiceId)); }
  async getAllPayments() { return await db.select().from(payments); }
  async createPayment(data: InsertPayment) { const [r] = await db.insert(payments).values(data).returning(); return r; }
  async updatePayment(id: number, data: Partial<Payment>) { const [r] = await db.update(payments).set(data).where(eq(payments.id, id)).returning(); return r; }

  // Service Records
  async getServiceRecord(id: number) { const [r] = await db.select().from(serviceRecords).where(eq(serviceRecords.id, id)); return r; }
  async getServiceRecordsByClient(clientId: number) { return await db.select().from(serviceRecords).where(eq(serviceRecords.clientId, clientId)); }
  async getAllServiceRecords() { return await db.select().from(serviceRecords); }
  async createServiceRecord(data: InsertServiceRecord) { const [r] = await db.insert(serviceRecords).values(data).returning(); return r; }
  async updateServiceRecord(id: number, data: Partial<ServiceRecord>) { const [r] = await db.update(serviceRecords).set(data).where(eq(serviceRecords.id, id)).returning(); return r; }
}

export const storage = new DatabaseStorage();
