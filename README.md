# HuHu AI — SaaS 商務管理平台

智能陪伴服務的客戶訂閱、帳務管理系統。

## 快速開始

```bash
npm install
npm run dev
```

開啟瀏覽器：http://localhost:5000

---

## 登入帳號

> ⚠️ 以下帳號為 Supabase Auth 帳號（Email 登入），非舊版帳號密碼

### 員工後台（Staff / 超級管理員）
| Email | 密碼 | 角色 | 登入後畫面 |
|-------|------|------|-----------|
| admin@twinc.ai | admin2026! | Superadmin | StaffDashboard |

### 機構管理員
| Email | 密碼 | 角色 | 所屬機構 |
|-------|------|------|---------|
| admin@love.com | admin2026! | OrgAdmin | 仁愛長照機構 |

### Care 端帳號（家人 / 長輩 / 照護員）
| Email | 密碼 | 角色 |
|-------|------|------|
| family@huhu.ai | Family2026! | 家人 |
| elder@huhu.ai | Elder2026! | 長輩 |
| elder02@huhu.com | Elder2026! | 長輩 |
| caregiver@huhu.ai | Caregiver2026! | 照護員 |

---

## 功能說明

### 員工後台 (`/#/staff/dashboard`)
- **總覽**：MRR、待收帳款、活躍客戶數等 KPI
- **客戶管理**：列表、開通、停用
- **訂閱管理**：查看所有訂閱
- **帳單管理**：新增帳單、查看狀態
- **金流紀錄**：標記付款、查看付款歷史
- **服務紀錄**：各客戶月度使用量
- **員工管理**：員工列表（含角色/職稱編輯）

### 機構管理員後台 (`/#/org/dashboard`)
- **成員管理**：照護員列表（含角色/職稱編輯）
- **被照護者管理**：長輩資料（含姓名/電話/Email 編輯）

### 客戶入口 (`/#/portal/overview`)
- **總覽**：訂閱狀態、待繳通知
- **帳單查詢**：查看所有帳單、線上付款
- **我的訂閱**：方案詳情、到期日

---

## 技術架構
- Frontend: React + Vite + Tailwind CSS + TanStack Query + Wouter
- Backend: Express.js + Supabase Auth
- 資料庫: Supabase (PostgreSQL)
- 付款整合: 綠界 / 藍新 / Stripe / 銀行匯款

## Render 部署
- Service: `huhu-saas`
- Repo: `victor6699/huhu-saas` (master)
- Push: `git push origin master`
