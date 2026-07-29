import { createServerFn } from "@tanstack/react-start";

export const getNodeStatus = createServerFn({ method: "GET" }).handler(async () => {
  const { fetchAllNodeStatus } = await import("./rpc.server");
  return fetchAllNodeStatus();
});
