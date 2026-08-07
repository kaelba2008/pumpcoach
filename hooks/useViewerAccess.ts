import { useCallback, useEffect, useState } from "react";
import { supabase } from "../lib/supabase";
import { useAuthStore } from "../store/authStore";
import { getInitials } from "../lib/formatters";

interface ViewerAccessPerson {
  id: string;
  display_name: string | null;
  email: string | null;
  initials: string;
  viewer_role: "partner" | "ibclc";
  last_logged_at: string | null;
}

export function useViewerAccess() {
  const { user } = useAuthStore();
  const [people, setPeople] = useState<ViewerAccessPerson[]>([]);
  const [loading, setLoading] = useState(true);

  const fetchPeople = useCallback(async () => {
    if (!user) return;
    setLoading(true);

    try {
      // Get all viewer_accounts records where this user is the viewer
      const { data: accessData, error: accessError } = await supabase
        .from("viewer_accounts")
        .select("owner_id, viewer_role")
        .eq("viewer_id", user.id);

      if (accessError) throw accessError;

      if (!accessData || accessData.length === 0) {
        setPeople([]);
        setLoading(false);
        return;
      }

      const ownerIds = accessData.map((a) => a.owner_id);
      const roleByOwnerId = new Map(accessData.map((a) => [a.owner_id, a.viewer_role as "partner" | "ibclc"]));

      // Get profiles for all owners
      const { data: profiles, error: profileError } = await supabase
        .from("profiles")
        .select("id, display_name, email")
        .in("id", ownerIds);

      if (profileError) throw profileError;

      // Most recent pump session per owner, for a "Last logged X ago" line —
      // first-write-wins on a descending sort gives "most recent per owner"
      // without a GROUP BY/RPC, fine at realistic client-list scale.
      const { data: recentSessions } = await supabase
        .from("pump_sessions")
        .select("user_id, started_at")
        .in("user_id", ownerIds)
        .order("started_at", { ascending: false });

      const lastLoggedByUserId = new Map<string, string>();
      (recentSessions ?? []).forEach((s) => {
        if (!lastLoggedByUserId.has(s.user_id)) lastLoggedByUserId.set(s.user_id, s.started_at);
      });

      const peopleList: ViewerAccessPerson[] = (profiles || []).map((p) => ({
        id: p.id,
        display_name: p.display_name,
        email: p.email,
        initials: getInitials(p.display_name, p.email),
        viewer_role: roleByOwnerId.get(p.id) ?? "ibclc",
        last_logged_at: lastLoggedByUserId.get(p.id) ?? null,
      }));

      setPeople(peopleList.sort((a, b) => (a.initials || "").localeCompare(b.initials || "")));
    } catch (err) {
      console.error("Error fetching viewer access:", err);
    } finally {
      setLoading(false);
    }
  }, [user]);

  useEffect(() => {
    fetchPeople();
  }, [fetchPeople]);

  return { people, loading, refetch: fetchPeople };
}
