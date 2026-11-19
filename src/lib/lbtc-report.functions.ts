import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { requireAdmin } from "./admin-guard";

/** Admin-only: the LocalBitcoins post-mortem, rendered to HTML on the server so its text stays out of the public bundle. */
export const getLbtcReport = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }): Promise<{ html: string }> => {
    await requireAdmin(context as never);
    const [{ createElement }, { renderToStaticMarkup }, { LbtcReport }] = await Promise.all([
      import("react"),
      import("react-dom/server"),
      import("./lbtc-report.server"),
    ]);
    return { html: renderToStaticMarkup(createElement(LbtcReport)) };
  });
