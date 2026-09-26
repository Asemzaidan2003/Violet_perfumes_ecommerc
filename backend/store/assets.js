import pkg from "../../package.json" with { type: "json" };

// Appended as ?v= to every /assets URL (package version + boot time), so /assets can be immutable.
export const ASSET_V = `${pkg.version}-${Date.now().toString(36)}`;
export const asset = (path) => `/assets/${path}?v=${ASSET_V}`;
