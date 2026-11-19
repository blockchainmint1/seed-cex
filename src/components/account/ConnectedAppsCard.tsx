import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Unplug } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/account/ui";

const KEY = ["connected-apps"] as const;

/** AI assistants and other apps the member approved on the connection screen; disconnecting ends their access at once. */
export function ConnectedAppsCard() {
  const qc = useQueryClient();
  const grants = useQuery({
    queryKey: KEY,
    queryFn: async () => {
      const { data, error } = await supabase.auth.oauth.listGrants();
      if (error) throw new Error("Couldn't load connected apps. Try again in a minute.");
      return data ?? [];
    },
  });
  const revoke = useMutation({
    mutationFn: async (clientId: string) => {
      const { error } = await supabase.auth.oauth.revokeGrant({ clientId });
      if (error) throw new Error("Disconnecting didn't go through. Try again.");
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: KEY }),
  });
  const list = grants.data ?? [];

  return (
    <Card title="Connected apps" desc="AI assistants and other apps you've let look at your Seeds account. They can read, never trade or move coins.">
      {grants.isLoading ? (
        <p className="text-sm text-muted-foreground">Loading…</p>
      ) : grants.error ? (
        <p className="text-sm text-destructive">{(grants.error as Error).message}</p>
      ) : !list.length ? (
        <p className="text-sm text-muted-foreground">No apps connected.</p>
      ) : (
        <ul className="divide-y divide-border">
          {list.map((g) => (
            <li key={g.client.id} className="flex flex-wrap items-center justify-between gap-3 py-3 first:pt-0 last:pb-0">
              <span className="min-w-0">
                <span className="block break-words text-sm">{g.client.name || "Unnamed app"}</span>
                <span className="block text-xs text-muted-foreground">
                  Connected {new Date(g.granted_at).toLocaleDateString()}
                </span>
              </span>
              <Button
                variant="outline"
                size="sm"
                disabled={revoke.isPending}
                onClick={() => revoke.mutate(g.client.id)}
              >
                <Unplug /> Disconnect
              </Button>
            </li>
          ))}
        </ul>
      )}
      {revoke.error ? <p role="alert" className="mt-3 text-xs text-destructive">{(revoke.error as Error).message}</p> : null}
    </Card>
  );
}
