import { useCallback, useEffect, useState } from "react";
import { supabase } from "../lib/supabase";
import { useAuthStore } from "../store/authStore";
import { Profile, ViewerNote } from "../types";

interface ViewerAccessPerson {
  id: string;
  display_name: string | null;
  email: string | null;
  initials: string;
  note: ViewerNote | null;
}

export function useViewerAccess() {
  const { user } = useAuthStore();
  const [people, setPeople] = useState<ViewerAccessPerson[]>([]);
  const [loading, setLoading] = useState(false);

  const fetchPeople = useCallback(async () => {
    if (!user) return;
    setLoading(true);

    try {
      // Get all viewer_access records where this user is the viewer
      const { data: accessData, error: accessError } = await supabase
        .from("viewer_access")
        .select("owner_id")
        .eq("viewer_id", user.id);

      if (accessError) throw accessError;

      if (!accessData || accessData.length === 0) {
        setPeople([]);
        setLoading(false);
        return;
      }

      const ownerIds = accessData.map((a) => a.owner_id);

      // Get profiles for all owners
      const { data: profiles, error: profileError } = await supabase
        .from("profiles")
        .select("id, display_name, email")
        .in("id", ownerIds);

      if (profileError) throw profileError;

      // Get notes for each person
      const { data: notes, error: notesError } = await supabase
        .from("viewer_notes")
        .select("*")
        .eq("viewer_id", user.id)
        .in("viewing_user_id", ownerIds);

      if (notesError) throw notesError;

      const notesByUserId = new Map(
        (notes || []).map((n) => [n.viewing_user_id, n])
      );

      const peopleList: ViewerAccessPerson[] = (profiles || []).map((p) => ({
        id: p.id,
        display_name: p.display_name,
        email: p.email,
        initials: getInitials(p.display_name),
        note: notesByUserId.get(p.id) || null,
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

  const saveNote = useCallback(
    async (viewingUserId: string, noteContent: string) => {
      if (!user) return;

      try {
        const { error } = await supabase.from("viewer_notes").upsert({
          viewer_id: user.id,
          viewing_user_id: viewingUserId,
          note_content: noteContent,
          updated_at: new Date().toISOString(),
        });

        if (error) throw error;

        // Refresh the list to update the note
        await fetchPeople();
      } catch (err) {
        console.error("Error saving note:", err);
        throw err;
      }
    },
    [user, fetchPeople]
  );

  return { people, loading, saveNote, refetch: fetchPeople };
}

function getInitials(name: string | null | undefined): string {
  if (!name) return "?";
  const parts = name.trim().split(/\s+/);
  if (parts.length === 1) {
    return parts[0].substring(0, 1).toUpperCase();
  }
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}
