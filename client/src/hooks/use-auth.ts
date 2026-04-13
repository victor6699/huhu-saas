import { useState, useEffect, useCallback } from "react";
import { supabase } from "@/lib/supabase";
import type { Session, User as SupabaseUser } from "@supabase/supabase-js";

export type AuthUser = {
  id: string;                    // auth.users UUID
  email: string;
  fullName: string;
  role?: string;                 // from organization_members or metadata
  personProfileId?: string;
  organizationId?: string;
  orgType?: string;              // individual_family, care_institution, gov_welfare_bureau
  roleCode?: string;             // admin, sales, finance, support, case_manager, etc.
};

export function useAuth() {
  const [session, setSession] = useState<Session | null>(null);
  const [user, setUser] = useState<AuthUser | null>(null);
  const [loading, setLoading] = useState(true);

  // Fetch extended user profile — prefer server /api/me (bypasses RLS),
  // fall back to direct Supabase client queries.
  // ⚠️ accessToken must be passed in — do NOT call supabase.auth.getSession()
  // inside onAuthStateChange as it causes a PKCE deadlock on Safari/iOS.
  const fetchUserProfile = useCallback(async (supabaseUser: SupabaseUser, accessToken?: string): Promise<AuthUser> => {
    // ── Strategy 1: server-side /api/me (uses service_role, no RLS issues) ──
    try {
      if (accessToken) {
        // Add 5-second timeout to prevent hanging on slow connections (iPad)
        const controller = new AbortController();
        const timeoutHandle = setTimeout(() => controller.abort(), 5000);
        const res = await fetch("/api/me", {
          headers: {
            "Content-Type": "application/json",
            "Authorization": `Bearer ${accessToken}`,
          },
          credentials: "include",
          signal: controller.signal,
        });
        clearTimeout(timeoutHandle);
        if (res.ok) {
          const me = await res.json();
          const firstMembership = me.memberships?.[0];
          return {
            id: me.id,
            email: me.email || supabaseUser.email || "",
            fullName: me.profile?.full_name || supabaseUser.user_metadata?.full_name || supabaseUser.email?.split("@")[0] || "",
            personProfileId: me.profile?.id,
            organizationId: firstMembership?.organization_id,
            orgType: firstMembership?.organizations?.org_type,
            roleCode: firstMembership?.role_code,
            role: firstMembership?.role_code || supabaseUser.user_metadata?.role || "user",
          };
        }
      }
    } catch {
      // /api/me failed or timed out — fall through to direct queries
    }
    // ── Strategy 2: direct Supabase client (subject to RLS) ──
    try {
      const { data: profile } = await supabase
        .from("person_profiles")
        .select("id, full_name, nickname")
        .eq("user_id", supabaseUser.id)
        .single();

      const { data: membership } = await supabase
        .from("organization_members")
        .select("organization_id, role_code, title")
        .eq("user_id", supabaseUser.id)
        .eq("status", "active")
        .limit(1)
        .single();

      return {
        id: supabaseUser.id,
        email: supabaseUser.email || "",
        fullName: profile?.full_name || supabaseUser.user_metadata?.full_name || supabaseUser.email?.split("@")[0] || "",
        personProfileId: profile?.id,
        organizationId: membership?.organization_id,
        roleCode: membership?.role_code || supabaseUser.user_metadata?.role,
        role: membership?.role_code || supabaseUser.user_metadata?.role || "user",
      };
    } catch {
      // Strategy 2 also failed — return basic info from user_metadata
    }

    // ── Strategy 3: pure user_metadata fallback ──
    return {
      id: supabaseUser.id,
      email: supabaseUser.email || "",
      fullName: supabaseUser.user_metadata?.full_name || supabaseUser.email?.split("@")[0] || "",
      roleCode: supabaseUser.user_metadata?.role,
      role: supabaseUser.user_metadata?.role || "user",
    };
  }, []);

  useEffect(() => {
    // Timeout guard: if auth takes too long (Safari/iOS), stop loading
    const timeoutId = setTimeout(() => {
      setLoading(false);
    }, 8000);

    const initAuth = async () => {
      try {
        // SSO: if huhu-care passed tokens via URL params, set session FIRST
        const urlParams = new URLSearchParams(window.location.search);
        const ssoAccess = urlParams.get("t");
        const ssoRefresh = urlParams.get("r");
        if (ssoAccess) {
          try {
            await supabase.auth.setSession({
              access_token: ssoAccess,
              refresh_token: ssoRefresh || "",
            });
          } catch {
            // SSO failed — fall through to normal auth
          }
          // Clean tokens from URL so they don't stay in browser history
          window.history.replaceState({}, document.title, window.location.pathname + window.location.hash);
        }

        // Get session (will now include SSO session if setSession succeeded)
        const { data: { session: s } } = await supabase.auth.getSession();
        clearTimeout(timeoutId);
        setSession(s);
        if (s?.user) {
          try {
            // Pass access_token directly — avoids re-calling getSession() in PKCE flow
            const profile = await fetchUserProfile(s.user, s.access_token);
            setUser(profile);
          } catch {
            // Fallback: basic user info from session
            setUser({
              id: s.user.id,
              email: s.user.email || "",
              fullName: s.user.user_metadata?.full_name || s.user.email?.split("@")[0] || "",
              roleCode: s.user.user_metadata?.role,
              role: s.user.user_metadata?.role || "user",
            });
          }
        }
        setLoading(false);
      } catch {
        clearTimeout(timeoutId);
        setLoading(false);
      }
    };

    initAuth();

    // Listen for auth state changes
    // ⚠️ Do NOT call supabase.auth.getSession() inside this callback —
    // doing so deadlocks on PKCE flow in Safari/iOS (ITP blocks sessionStorage access).
    const { data: { subscription } } = supabase.auth.onAuthStateChange(
      async (event, newSession) => {
        setSession(newSession);
        if (newSession?.user) {
          try {
            // Pass access_token directly — critical for PKCE on Safari
            const profile = await fetchUserProfile(newSession.user, newSession.access_token ?? undefined);
            setUser(profile);
          } catch {
            setUser({
              id: newSession.user.id,
              email: newSession.user.email || "",
              fullName: newSession.user.user_metadata?.full_name || "",
              roleCode: newSession.user.user_metadata?.role,
              role: newSession.user.user_metadata?.role || "user",
            });
          }
        } else {
          setUser(null);
        }
        setLoading(false);
      }
    );

    return () => subscription.unsubscribe();
  }, [fetchUserProfile]);

  const signIn = async (email: string, password: string) => {
    const { data, error } = await supabase.auth.signInWithPassword({ email, password });
    if (error) throw error;
    return data;
  };

  const signUp = async (email: string, password: string, metadata?: Record<string, any>) => {
    const { data, error } = await supabase.auth.signUp({
      email,
      password,
      options: { data: metadata },
    });
    if (error) throw error;
    return data;
  };

  const signOut = async () => {
    const { error } = await supabase.auth.signOut();
    if (error) throw error;
    setUser(null);
    setSession(null);
  };

  const resetPassword = async (email: string) => {
    const { error } = await supabase.auth.resetPasswordForEmail(email, {
      redirectTo: `${window.location.origin}/reset-password`,
    });
    if (error) throw error;
  };

  return {
    session,
    user,
    loading,
    signIn,
    signUp,
    signOut,
    resetPassword,
    isAuthenticated: !!session,
  };
}
