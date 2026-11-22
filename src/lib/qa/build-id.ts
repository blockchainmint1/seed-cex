declare const __SEEDS_BUILD__: string | undefined;

/** This build's stamp (set in vite.config.ts), or "" when unavailable. */
export const BUILD_ID: string = typeof __SEEDS_BUILD__ === "string" ? __SEEDS_BUILD__ : "";
