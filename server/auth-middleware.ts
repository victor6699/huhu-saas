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
      };
    }
  }
}

/**
 * Middleware: Extract and verify Supabase JWT from Authorization header.
 * Populates req.supabaseUser if valid token is found.
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

    req.supabaseUser = {
      id: user.id,
      email: user.email,
      role: user.user_metadata?.role,
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
 */
export function requireStaff(req: Request, res: Response, next: NextFunction) {
  if (!req.supabaseUser) {
    return res.status(401).json({ message: "請先登入" });
  }
  // Check if user has an admin-level role (set in metadata or org membership)
  const staffRoles = ["admin", "superadmin", "sales", "finance", "support"];
  if (req.supabaseUser.role && staffRoles.includes(req.supabaseUser.role)) {
    return next();
  }
  // For now, allow all authenticated users — refine with org_member check later
  next();
}

export { supabaseAdmin };
