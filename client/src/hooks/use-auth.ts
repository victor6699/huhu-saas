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
  roleCode?: string;             // admin, sales, finance, support, case_manager, etc.
};

export function useAuth() {
  const [session, setSession] = useState<Session | null>(null);
  const [user, setUser] = useState<AuthUser | null>(null);
  const [loading, setLoading] = useState(true);

  // Fetch extended user profile from DB
  const fetchUserProfile = useCallback(async (supabaseUser: SupabaseUser): Promise<AuthUser> => {
    // Get person_profile
    const { data: profile } = await supabase
      .from("person_profiles")
      .select("id, full_name, nickname")
      .eq("user_id", supabaseUser.id)
      .single();

    // Get organization membership (first active membership)
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
      roleCode: membership?.role_code,
      role: membership?.role_code || "user",
    };
  }, []);

  useEffect(() => {
    // Get initial session
    supabase.auth.getSession().then(async ({ data: { session: s } }) => {
      setSession(s);
      if (s?.user) {
        const profile = await fetchUserProfile(s.user);
        setUser(profile);
      }
      setLoading(false);
    });

    // Listen for auth state changes
    const { data: { subscription } } = supabase.auth.onAuthStateChange(
      async (event, newSession) => {
        setSession(newSession);
        if (newSession?.user) {
          const profile = await fetchUserProfile(newSession.user);
          setUser(profile);
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
