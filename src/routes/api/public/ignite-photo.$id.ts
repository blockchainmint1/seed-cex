import { createFileRoute } from "@tanstack/react-router";

// Instructor photos for Ignite class pages. Public (they're shown on public pages);
// only files an admin uploaded under instructors/<uuid> can be read, nothing else in the bucket.
export const Route = createFileRoute("/api/public/ignite-photo/$id")({
  staticData: { sitemap: false },
  server: {
    handlers: {
      GET: async ({ params }) => {
        if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(params.id)) return new Response("Not found", { status: 404 });
        const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
        const { data, error } = await supabaseAdmin.storage.from("ignite-media").download(`instructors/${params.id.toLowerCase()}`);
        if (error || !data) return new Response("Not found", { status: 404 });
        const type = ["image/jpeg", "image/png", "image/webp"].includes(data.type) ? data.type : "application/octet-stream";
        return new Response(await data.arrayBuffer(), {
          headers: { "content-type": type, "cache-control": "public, max-age=86400, immutable", "x-content-type-options": "nosniff" },
        });
      },
    },
  },
});
