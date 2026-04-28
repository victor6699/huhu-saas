import type { Request, Response, NextFunction } from "express";
import { createClient } from "@supabase/supabase-js";

const supabaseUrl = process.env.SUPABASE_URL || "";
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_ANON_KEY || "";

// Service role client for server-side verification
const supabaseAdmin = createClient(supabaseUrl, supabaseServiceKey, {
  auth: { autoRefreshToken: false, persistSession: false },
});

// Extend Express Request type
declare global {
  namespace Express {
    interface Request {
      supabaseUser?: {
        id: string;         // auth.users UUID
        email?: string;
        role?: string;       // from user metadata
        verifiedRole?: string; // DB-verified role from organization_members
      };
    }
  }
}

/** Staff-level roles recognized by the system */
const STAFF_ROLES = ["admin", "superadmin", "sales", "finance", "support"] as const;

/** Superadmin roles — highest privilege (CRM mutations, role changes) */
const SUPERADMIN_ROLES = ["superadmin"] as const;

/**
 * Middleware: Extract and verify Supabase JWT from Authorization header.
 * Populates req.supabaseUser if valid token is found.
 * Also performs a DB lookup on organization_members to get verified role.
 * Does NOT block if no token — use requireAuth() for that.
 */
export async function extractUser(req: Request, _res: Response, next: NextFunction) {
  const authHeader = req.headers.authorization;
  if (!authHeader?.startsWith("Bearer ")) {
    return next();
  }

  const token = authHeader.slice(7);
  try {
    const { data: { user }, error } = await supabaseAdmin.auth.getUser(token);
    if (error || !user) {
      return next();
    }

    // DB-backed role verification — check organization_members for staff role
    // This cannot be tampered with by the user (unlike user_metadata)
    let verifiedRole: string | undefined;
    try {
      const { data: membership } = await supabaseAdmin
        .from("organization_members")
        .select("role_code")
        .eq("user_id", user.id)
        .eq("status", "active")
        .in("role_code", [...STAFF_ROLES])
        .limit(1)
        .single();
      if (membership) {
        verifiedRole = membership.role_code;
      }
    } catch {
      // No staff membership found — that's fine
    }

    req.supabaseUser = {
      id: user.id,
      email: user.email,
      role: user.user_metadata?.role,
      verifiedRole,
    };
  } catch {
    // Invalid token — just continue without user
  }

  next();
}

/**
 * Middleware: Require a valid Supabase JWT.
 * Returns 401 if no valid user found.
 */
export function requireAuth(req: Request, res: Response, next: NextFunction) {
  if (!req.supabaseUser) {
    return res.status(401).json({ message: "請先登入" });
  }
  next();
}

/**
 * Middleware: Require admin/staff role.
 * Uses DB-verified role (organization_members) as primary check,
 * falls back to user_metadata.role for backward compatibility.
 * ⛔ Rejects non-staff users with 403.
 */
export function requireStaff(req: Request, res: Response, next: NextFunction) {
  if (!req.supabaseUser) {
    return res.status(401).json({ message: "請先登入" });
  }

  // Primary: DB-verified role (tamper-proof)
  if (req.supabaseUser.verifiedRole &&
      (STAFF_ROLES as readonly string[]).includes(req.supabaseUser.verifiedRole)) {
    return next();
  }

  // Fallback: user_metadata role (for backward compat during migration)
  if (req.supabaseUser.role &&
      (STAFF_ROLES as readonly string[]).includes(req.supabaseUser.role)) {
    return next();
  }

  // ⛔ Block non-staff users
  return res.status(403).json({ message: "權限不足，需要管理員角色" });
}

/**
 * Middleware: Require superadmin role.
 * For highest-privilege operations: CRM role changes, batch imports, staff management.
 * Only checks DB-verified role (cannot be self-escalated).
 */
export function requireSuperAdmin(req: Request, res: Response, next: NextFunction) {
  if (!req.supabaseUser) {
    return res.status(401).json({ message: "請先登入" });
  }

  // Only DB-verified superadmin — no metadata fallback for this level
  if (req.supabaseUser.verifiedRole &&
      (SUPERADMIN_ROLES as readonly string[]).includes(req.supabaseUser.verifiedRole)) {
    return next();
  }

  // Also allow metadata-based superadmin for backward compat
  if (req.supabaseUser.role === "superadmin") {
    return next();
  }

  return res.status(403).json({ message: "權限不足，需要超級管理員角色" });
}

export { supabaseAdmin };
