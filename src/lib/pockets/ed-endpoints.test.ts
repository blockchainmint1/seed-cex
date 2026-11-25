import { afterEach, expect, test } from "bun:test";
import { tonEndpoint, edEndpoint } from "@/lib/nodes.server";

const names = ["TONCENTER_API_KEY", "TONAPI_API_KEY", "SUI_GRPC_URL", "SUI_GRPC_API_KEY", "STELLAR_HORIZON_URL", "STELLAR_HORIZON_API_KEY"];
const saved = Object.fromEntries(names.map((name) => [name, process.env[name]]));
afterEach(() => { for (const name of names) { const value = saved[name]; if (value === undefined) delete process.env[name]; else process.env[name] = value; } });

test("all TON operations share the keyed endpoint, with the key only in a header", () => {
  process.env['TONCENTER_API_KEY'] = 'test-toncenter-key';
  const endpoint = tonEndpoint();
  expect(endpoint.headers['X-API-Key']).toBe('test-toncenter-key');
  expect(endpoint.url).not.toContain('test-toncenter-key');
  expect(endpoint.url).toBe('https://toncenter.com/api/v2');
});
test("independent TONAPI account and trace reads accept their own header key", () => {
  process.env['TONAPI_API_KEY'] = 'test-tonapi-key';
  expect(tonEndpoint(true).headers['Authorization']).toBe('Bearer test-tonapi-key');
  expect(tonEndpoint(true).url).toBe('https://tonapi.io/v2');
});
test("configured Stellar and Sui endpoints carry header credentials without changing public defaults", () => {
  for (const [chain, prefix] of [["stellar", "STELLAR_HORIZON"], ["sui", "SUI_GRPC"]] as const) {
    process.env[`${prefix}_URL`] = 'https://node.example.test';
    process.env[`${prefix}_API_KEY`] = 'test-node-key';
    expect(edEndpoint(chain).url).toBe('https://node.example.test');
    expect(edEndpoint(chain).headers['x-api-key']).toBe('test-node-key');
  }
});
test("node configuration refuses insecure URLs and embedded credentials", () => {
  process.env['SUI_GRPC_URL'] = 'http://node.example.test';
  expect(() => edEndpoint('sui')).toThrow();
  process.env['SUI_GRPC_URL'] = 'https://user:pass@node.example.test';
  expect(() => edEndpoint('sui')).toThrow();
});