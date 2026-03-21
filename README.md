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

### 員工後台（點「員工登入」）
| 帳號 | 密碼 | 角色 |
|------|------|------|
| admin | admin123 | 超級管理員 |
| sales_chen | demo123 | 業務 |
| finance_lin | demo123 | 財務 |

### 客戶入口（點「客戶登入」）
| 帳號 | 密碼 | 類型 |
|------|------|------|
| cirai_org | demo123 | 機構（慈愛養護中心）|
| taipei_welfare | demo123 | 社會局（台北市）|
| chen_hua | demo123 | 個人 |

---

## 功能說明

### 員工後台 (`/#/staff/dashboard`)
- **總覽**：MRR、待收帳款、活躍客戶數等 KPI
- **客戶管理**：列表、開通、停用
- **訂閱管理**：查看所有訂閱
- **帳單管理**：新增帳單、查看狀態
- **金流紀錄**：標記付款、查看付款歷史
- **服務紀錄**：各客戶月度使用量
- **員工管理**：員工列表

### 客戶入口 (`/#/portal/overview`)
- **總覽**：訂閱狀態、待繳通知
- **帳單查詢**：查看所有帳單、線上付款
- **我的訂閱**：方案詳情、到期日
- **方案介紹**：比較各方案
- **使用紀錄**：月度對話量、警報數

---

## 技術架構
- Frontend: React + Vite + Tailwind CSS + TanStack Query + Wouter
- Backend: Express.js + express-session
- 資料庫: In-Memory (Demo用，可接PostgreSQL)
- 付款整合: 模擬綠界/藍新/Stripe/銀行匯款
