import cron from "node-cron";
import crypto from "crypto";
import { supabaseAdmin } from "./auth-middleware";

// Respect TAPPAY_ENV: default sandbox unless explicitly set to production
const isSandbox = (process.env.TAPPAY_ENV ?? "sandbox") !== "production";
const TAPPAY_TOKEN_API_URL = isSandbox
  ? "https://sandbox.tappaysdk.com/tpc/payment/pay-by-token"
  : "https://prod.tappaysdk.com/tpc/payment/pay-by-token";

export function startCronJobs() {
  // 每天 UTC 02:00 = 台灣時間 10:00 AM
  cron.schedule("0 2 * * *", async () => {
    console.log("[Cron] Running daily TapPay recurring billing job...");

    try {
      // 尋找所有需要扣款的訂閱
      const today = new Date().toISOString().split('T')[0];
      const { data: subscriptions, error } = await supabaseAdmin
        .from("subscriptions")
        .select("*")
        .eq("status", "active")
        .lte("next_billing_date", today)
        .not("tappay_card_token", "is", null)
        .not("tappay_card_key", "is", null);

      if (error) {
        console.error("[Cron] Error fetching subscriptions:", error);
        return;
      }

      console.log(`[Cron] Found ${subscriptions.length} subscriptions due for billing.`);

      for (const sub of subscriptions) {
        console.log(`[Cron] Processing subscription ${sub.id} for amount ${sub.amount}`);

        // 1. Send request to TapPay
        const partnerKey = process.env.TAPPAY_PARTNER_KEY;
        const merchantId = process.env.TAPPAY_MERCHANT_ID;
        
        if (!partnerKey || !merchantId) {
          console.error("[Cron] Missing TapPay keys in environment.");
          continue;
        }

        const response = await fetch(TAPPAY_TOKEN_API_URL, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "x-api-key": partnerKey,
          },
          body: JSON.stringify({
            card_key: sub.tappay_card_key,
            card_token: sub.tappay_card_token,
            partner_key: partnerKey,
            merchant_id: merchantId,
            details: "HuHu SaaS 自動定期扣款",
            amount: sub.amount,
            currency: "TWD",
          })
        });

        const tappayData = await response.json() as any;

        // 2. Determine next billing date
        const nextBillingDate = new Date(sub.next_billing_date);
        if (sub.billing_cycle === "annual") {
          nextBillingDate.setFullYear(nextBillingDate.getFullYear() + 1);
        } else {
          nextBillingDate.setMonth(nextBillingDate.getMonth() + 1);
        }
        const nextBillingDateStr = nextBillingDate.toISOString().split('T')[0];
        
        // 3. Create Invoice
        const periodStart = today;
        const periodEnd = nextBillingDateStr;
        
        const { data: invoice, error: invoiceError } = await supabaseAdmin
          .from("invoices")
          .insert({
            organization_id: sub.organization_id,
            subscription_id: sub.id,
            invoice_no: `INV-${today.replace(/-/g, "")}-${crypto.randomUUID().slice(0, 6).toUpperCase()}`,
            issue_date: today,
            due_date: today,
            period_start: periodStart,
            period_end: periodEnd,
            subtotal: sub.amount,
            tax: 0,
            total: sub.amount,
            status: tappayData.status === 0 ? "paid" : "unpaid",
          })
          .select()
          .single();

        if (invoiceError) {
          console.error(`[Cron] Error creating invoice for sub ${sub.id}:`, invoiceError);
        }

        // 4. Create Payment record
        if (invoice) {
           await supabaseAdmin
            .from("payments")
            .insert({
              invoice_id: invoice.id,
              organization_id: sub.organization_id,
              amount: sub.amount,
              method: "tappay",
              status: tappayData.status === 0 ? "success" : "failed",
              transaction_id: tappayData.rec_trade_id || null,
              notes: tappayData.status !== 0 ? tappayData.msg : "TapPay 自動扣款",
              paid_at: tappayData.status === 0 ? new Date().toISOString() : null,
            });
        }

        // 5. Update subscription
        if (tappayData.status === 0) {
          await supabaseAdmin
            .from("subscriptions")
            .update({
              next_billing_date: nextBillingDateStr,
              end_date: nextBillingDateStr,
            })
            .eq("id", sub.id);
          console.log(`[Cron] Subscription ${sub.id} renewed successfully.`);
        } else {
           console.error(`[Cron] Subscription ${sub.id} charge failed:`, tappayData.msg);
           // Optional: You could update status to "past_due" if needed
        }
      }
    } catch (err) {
      console.error("[Cron] Job failed:", err);
    }
  });
}
