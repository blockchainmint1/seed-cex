import { createServerFn } from "@tanstack/react-start";

export const getNodeStatus = createServerFn({ method: "GET" }).handler(async () => {
  const { fetchAllNodeStatus } = await import("./rpc.server");
  const { shared } = await import("./cache/shared-cache.server");
  const { CACHE_TIMES } = await import("./cache/shared-cache-rules");
  return shared("nodes:status", CACHE_TIMES.nodeStatus, () => fetchAllNodeStatus());
});
