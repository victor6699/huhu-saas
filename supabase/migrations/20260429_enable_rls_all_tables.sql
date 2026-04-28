-- ═══════════════════════════════════════════════════════════════
-- HuHu SAAS — 全面啟用 RLS + 建立安全存取政策
-- 日期：2026-04-29
-- 目的：修復 C1 安全漏洞（所有表未啟用 Row Level Security）
--
-- 設計原則：
--   1. service_role（server 端）自動 bypass RLS，不需要額外 policy
--   2. authenticated 用戶只能存取自己的資料（用於 client fallback）
--   3. anon key 除了 plans（公開方案列表）以外，全部封鎖
-- ═══════════════════════════════════════════════════════════════

-- ────────────────────────────────────────────────────
-- STEP 1: 對所有表啟用 RLS
-- ────────────────────────────────────────────────────

-- Module 1: 組織與租戶
ALTER TABLE organizations ENABLE ROW LEVEL SECURITY;
ALTER TABLE organization_members ENABLE ROW LEVEL SECURITY;

-- Module 2: 使用者與身份
ALTER TABLE person_profiles ENABLE ROW LEVEL SECURITY;

-- Module 3: 照護主體與關係
ALTER TABLE care_recipients ENABLE ROW LEVEL SECURITY;
ALTER TABLE care_relationships ENABLE ROW LEVEL SECURITY;
ALTER TABLE households ENABLE ROW LEVEL SECURITY;

-- Module 4: 聊天系統
ALTER TABLE conversations ENABLE ROW LEVEL SECURITY;
ALTER TABLE conversation_participants ENABLE ROW LEVEL SECURITY;
ALTER TABLE messages ENABLE ROW LEVEL SECURITY;

-- Module 5: AI 記憶
ALTER TABLE memory_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE conversation_summaries ENABLE ROW LEVEL SECURITY;
ALTER TABLE personality_settings ENABLE ROW LEVEL SECURITY;
ALTER TABLE emotion_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE emotion_assessments ENABLE ROW LEVEL SECURITY;

-- Module 6: 事件與提醒
ALTER TABLE care_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE event_assignees ENABLE ROW LEVEL SECURITY;
ALTER TABLE reminders ENABLE ROW LEVEL SECURITY;
ALTER TABLE notification_logs ENABLE ROW LEVEL SECURITY;

-- Module 7: 照護紀錄與風險
ALTER TABLE care_notes ENABLE ROW LEVEL SECURITY;
ALTER TABLE health_observations ENABLE ROW LEVEL SECURITY;
ALTER TABLE alerts ENABLE ROW LEVEL SECURITY;
ALTER TABLE risk_event_log ENABLE ROW LEVEL SECURITY;
ALTER TABLE episodes ENABLE ROW LEVEL SECURITY;
ALTER TABLE tasks ENABLE ROW LEVEL SECURITY;

-- Module 8: 掃描與附件
ALTER TABLE scan_records ENABLE ROW LEVEL SECURITY;
ALTER TABLE attachments ENABLE ROW LEVEL SECURITY;
ALTER TABLE webauthn_credentials ENABLE ROW LEVEL SECURITY;

-- Module 9: SaaS 帳務
ALTER TABLE plans ENABLE ROW LEVEL SECURITY;
ALTER TABLE subscriptions ENABLE ROW LEVEL SECURITY;
ALTER TABLE invoices ENABLE ROW LEVEL SECURITY;
ALTER TABLE payments ENABLE ROW LEVEL SECURITY;
ALTER TABLE service_records ENABLE ROW LEVEL SECURITY;

-- Module 10: 稽核與進階
ALTER TABLE audit_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE care_plans ENABLE ROW LEVEL SECURITY;
ALTER TABLE benefit_cases ENABLE ROW LEVEL SECURITY;
ALTER TABLE ai_risk_alerts ENABLE ROW LEVEL SECURITY;

-- Module 11: Legacy / huhu-ai 共享表
ALTER TABLE elder_memories ENABLE ROW LEVEL SECURITY;
ALTER TABLE elder_skills ENABLE ROW LEVEL SECURITY;
ALTER TABLE legacy_alerts ENABLE ROW LEVEL SECURITY;
ALTER TABLE legacy_care_relationships ENABLE ROW LEVEL SECURITY;
ALTER TABLE legacy_conversations ENABLE ROW LEVEL SECURITY;
ALTER TABLE legacy_episodes ENABLE ROW LEVEL SECURITY;
ALTER TABLE legacy_observations ENABLE ROW LEVEL SECURITY;
ALTER TABLE legacy_tasks ENABLE ROW LEVEL SECURITY;
ALTER TABLE line_pending_messages ENABLE ROW LEVEL SECURITY;
ALTER TABLE linking_tokens ENABLE ROW LEVEL SECURITY;
ALTER TABLE memories ENABLE ROW LEVEL SECURITY;
ALTER TABLE memory_recall_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE phq2_screenings ENABLE ROW LEVEL SECURITY;
ALTER TABLE reply_fingerprints ENABLE ROW LEVEL SECURITY;
ALTER TABLE users ENABLE ROW LEVEL SECURITY;
ALTER TABLE weekly_metrics ENABLE ROW LEVEL SECURITY;


-- ────────────────────────────────────────────────────
-- STEP 2: 公開資料政策（anon + authenticated 都可讀）
-- ────────────────────────────────────────────────────

-- 方案列表是公開的（定價頁面需要）
CREATE POLICY "plans_public_read"
  ON plans FOR SELECT
  USING (true);


-- ────────────────────────────────────────────────────
-- STEP 3: 使用者自身資料政策（authenticated 可讀自己的資料）
-- 用途：client 端 use-auth.ts 的 Strategy 2 fallback
-- ────────────────────────────────────────────────────

-- 使用者可以讀自己的 person_profile
CREATE POLICY "person_profiles_own_read"
  ON person_profiles FOR SELECT
  TO authenticated
  USING (user_id = auth.uid());

-- 使用者可以讀自己的 organization_members
CREATE POLICY "org_members_own_read"
  ON organization_members FOR SELECT
  TO authenticated
  USING (user_id = auth.uid());

-- 使用者可以讀自己所屬的 organization 資訊
CREATE POLICY "organizations_member_read"
  ON organizations FOR SELECT
  TO authenticated
  USING (
    id IN (
      SELECT organization_id
      FROM organization_members
      WHERE user_id = auth.uid()
        AND status = 'active'
    )
  );


-- ────────────────────────────────────────────────────
-- STEP 4: 照護關係鏈存取政策
-- 使用者可以看到自己相關的照護對象
-- ────────────────────────────────────────────────────

-- 使用者可以讀取自己（作為 related_person）的照護關係
CREATE POLICY "care_rels_own_read"
  ON care_relationships FOR SELECT
  TO authenticated
  USING (
    related_person_id IN (
      SELECT id FROM person_profiles WHERE user_id = auth.uid()
    )
  );

-- 使用者可以讀取自己相關的 care_recipients
CREATE POLICY "care_recipients_related_read"
  ON care_recipients FOR SELECT
  TO authenticated
  USING (
    -- 透過 care_relationships 關聯
    id IN (
      SELECT care_recipient_id
      FROM care_relationships
      WHERE related_person_id IN (
        SELECT id FROM person_profiles WHERE user_id = auth.uid()
      )
      AND status = 'active'
    )
    OR
    -- 透過同機構
    primary_org_id IN (
      SELECT organization_id
      FROM organization_members
      WHERE user_id = auth.uid()
        AND status = 'active'
    )
  );


-- ────────────────────────────────────────────────────
-- STEP 5: WebAuthn 憑證（使用者管理自己的生物辨識）
-- ────────────────────────────────────────────────────

CREATE POLICY "webauthn_own_all"
  ON webauthn_credentials FOR ALL
  TO authenticated
  USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());


-- ────────────────────────────────────────────────────
-- STEP 6: Portal 端使用者可讀取的帳務資料
-- （限定在自己所屬機構的訂閱/帳單）
-- ────────────────────────────────────────────────────

-- 使用者可以讀自己機構的訂閱
CREATE POLICY "subscriptions_org_member_read"
  ON subscriptions FOR SELECT
  TO authenticated
  USING (
    organization_id IN (
      SELECT organization_id
      FROM organization_members
      WHERE user_id = auth.uid()
        AND status = 'active'
    )
  );

-- 使用者可以讀自己機構的帳單
CREATE POLICY "invoices_org_member_read"
  ON invoices FOR SELECT
  TO authenticated
  USING (
    organization_id IN (
      SELECT organization_id
      FROM organization_members
      WHERE user_id = auth.uid()
        AND status = 'active'
    )
  );

-- 使用者可以讀自己機構的付款紀錄
CREATE POLICY "payments_org_member_read"
  ON payments FOR SELECT
  TO authenticated
  USING (
    organization_id IN (
      SELECT organization_id
      FROM organization_members
      WHERE user_id = auth.uid()
        AND status = 'active'
    )
  );

-- 使用者可以讀自己機構的服務紀錄
CREATE POLICY "service_records_org_member_read"
  ON service_records FOR SELECT
  TO authenticated
  USING (
    organization_id IN (
      SELECT organization_id
      FROM organization_members
      WHERE user_id = auth.uid()
        AND status = 'active'
    )
  );


-- ────────────────────────────────────────────────────
-- STEP 7: 聊天紀錄（使用者可讀自己參與的對話）
-- ────────────────────────────────────────────────────

CREATE POLICY "conversations_participant_read"
  ON conversations FOR SELECT
  TO authenticated
  USING (
    initiated_by_user_id = auth.uid()
    OR id IN (
      SELECT conversation_id
      FROM conversation_participants
      WHERE user_id = auth.uid()
    )
  );

CREATE POLICY "messages_participant_read"
  ON messages FOR SELECT
  TO authenticated
  USING (
    conversation_id IN (
      SELECT id FROM conversations
      WHERE initiated_by_user_id = auth.uid()
      UNION
      SELECT conversation_id FROM conversation_participants
      WHERE user_id = auth.uid()
    )
  );

CREATE POLICY "conv_participants_own_read"
  ON conversation_participants FOR SELECT
  TO authenticated
  USING (user_id = auth.uid());


-- ────────────────────────────────────────────────────
-- STEP 8: 通知 / 事件（使用者可讀自己收到的通知）
-- ────────────────────────────────────────────────────

CREATE POLICY "notification_logs_own_read"
  ON notification_logs FOR SELECT
  TO authenticated
  USING (recipient_user_id = auth.uid());


-- ────────────────────────────────────────────────────
-- 完成！
-- 注意：以下表僅供 service_role（server 端）存取，
-- 不建立 authenticated 政策：
--   - memory_items, conversation_summaries, personality_settings
--   - emotion_logs, emotion_assessments
--   - care_events, event_assignees, reminders
--   - care_notes, health_observations
--   - alerts, risk_event_log, episodes, tasks
--   - scan_records, attachments
--   - audit_logs, care_plans, benefit_cases, ai_risk_alerts
--   - households
--
-- 這些表的所有操作都透過 Express API（supabaseAdmin）執行，
-- 啟用 RLS 但不建立 policy = anon/authenticated 完全無法存取。
-- ────────────────────────────────────────────────────
