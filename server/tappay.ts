import { Router } from "express";
import { requireAuth, supabaseAdmin } from "./auth-middleware";
import { z } from "zod";
import { eq } from "drizzle-orm";

export const tappayRouter = Router();

// Use TAPPAY_ENV to control sandbox/prod (NODE_ENV="production" on Render but we may still want sandbox)
const isSandbox = (process.env.TAPPAY_ENV ?? "sandbox") !== "production";
const TAPPAY_API_URL = isSandbox
  ? "https://sandbox.tappaysdk.com/tpc/payment/pay-by-prime"
  : "https://prod.tappaysdk.com/tpc/payment/pay-by-prime";

// Diagnostic: check outbound IP of this server (needed for TapPay IP whitelist)
tappayRouter.get("/server-ip", async (_req, res) => {
  try {
    const r = await fetch("https://api.ipify.org?format=json");
    const data = await r.json() as { ip: string };
    res.json({ outbound_ip: data.ip, tappay_env: process.env.TAPPAY_ENV ?? "sandbox(default)", tappay_api: TAPPAY_API_URL });
  } catch (e: any) {
    res.json({ error: e.message });
  }
});

const payByPrimeSchema = z.object({
  prime: z.string().min(1),
  organizationId: z.string().uuid(),
  planId: z.string().uuid(),
  cycle: z.enum(["monthly", "annual"]).default("monthly"),
  elderCount: z.number().int().positive().default(1),
  amount: z.number().positive(),
  cardholder: z.object({
    phoneNumber: z.string().min(1),
    name: z.string().min(1),
    email: z.string().email(),
  }),
});

tappayRouter.post("/pay-by-prime", requireAuth, async (req, res) => {
  try {
    const parsed = payByPrimeSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ message: "付款資料格式錯誤", errors: parsed.error });
    }

    const { prime, organizationId, planId, cycle, elderCount, amount, cardholder } = parsed.data;

    // 1. 確保環境變數已設定
    const partnerKey = process.env.TAPPAY_PARTNER_KEY;
    const merchantId = process.env.TAPPAY_MERCHANT_ID;
    
    if (!partnerKey || !merchantId || partnerKey.includes("這邊填入")) {
      return res.status(500).json({ message: "金流尚未設定完成 (Partner Key 遺失)" });
    }

    // 2. 向 TapPay 請求付款 (Pay by Prime)
    const response = await fetch(TAPPAY_API_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": partnerKey,
      },
      body: JSON.stringify({
        prime: prime,
        partner_key: partnerKey,
        merchant_id: merchantId,
        details: "HuHu SaaS 系統訂閱",
        amount: amount,
        currency: "TWD",
        cardholder: cardholder,
        remember: true // 要求記住卡片，TapPay 會回傳 token
      }),
    });

    const tappayData = await response.json() as any;

    // 3. 判斷付款結果
    console.log("[TapPay] API URL:", TAPPAY_API_URL, "status:", tappayData.status, "msg:", tappayData.msg);
    if (tappayData.status !== 0) {
      console.error("TapPay Payment Failed:", JSON.stringify(tappayData));
      return res.status(400).json({ 
        message: "付款失敗", 
        detail: tappayData.msg,
        tappay_status: tappayData.status,
        tappay_msg: tappayData.msg,
      });
    }

    // 4. 付款成功，儲存卡片資訊與建立訂閱紀錄
    const cardSecret = tappayData.card_secret; // 後續用來做定扣的 key
    const cardToken = tappayData.card_info.card_token; // 實際的 token
    
    // 計算訂閱週期
    const startDate = new Date();
    const nextBillingDate = new Date();
    if (cycle === "annual") {
      nextBillingDate.setFullYear(nextBillingDate.getFullYear() + 1);
    } else {
      nextBillingDate.setMonth(nextBillingDate.getMonth() + 1);
    }

    const { data: subscription, error } = await supabaseAdmin
      .from("subscriptions")
      .insert({
        organization_id: organizationId,
        plan_id: planId,
        billing_cycle: cycle,
        status: "active",
        amount: amount,
        elder_count: elderCount,
        start_date: startDate.toISOString().split('T')[0],
        end_date: nextBillingDate.toISOString().split('T')[0],
        next_billing_date: nextBillingDate.toISOString().split('T')[0],
        tappay_card_token: cardToken,
        tappay_card_key: cardSecret,
        tappay_card_info: tappayData.card_info, // 裡面包含卡號後四碼等資訊
      })
      .select()
      .single();

    if (error) {
      console.error("Save subscription error:", error);
      return res.status(500).json({ message: "付款成功，但儲存訂閱資料失敗" });
    }

    res.json({ ok: true, subscription });
  } catch (err: any) {
    console.error("Tappay Router Error:", err);
    res.status(500).json({ message: "系統錯誤", detail: err.message });
  }
});
