import { useCallback, useEffect, useState } from "react";
import { api, errorMessage, type OrganizerSession } from "./api";

export function useOrganizerSession() {
  const [session, setSession] = useState<OrganizerSession | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      setSession(await api.getSession());
    } catch (caught) {
      setSession(null);
      setError(errorMessage(caught));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  return { session, loading, error, refresh, setSession };
}
