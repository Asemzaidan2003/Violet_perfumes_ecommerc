// The storefront's import map for Three.js: served from node_modules/three via app.js, and its
// CSP hash (backend/routes/storefront.Routs.js). layout.js renders IMPORT_MAP_JSON byte-identical
// to what IMPORT_MAP_HASH was computed from — any drift between the two breaks `three` entirely.
import { createHash } from "node:crypto";
import pkg from "../../node_modules/three/package.json" with { type: "json" };

export const THREE_VERSION = pkg.version;

const vendorBase = `/vendor/three@${THREE_VERSION}`;

export const IMPORT_MAP_JSON = JSON.stringify({
  imports: {
    three: `${vendorBase}/build/three.module.js`,
    "three/addons/": `${vendorBase}/examples/jsm/`,
  },
});

export const IMPORT_MAP_HASH = `'sha256-${createHash("sha256").update(IMPORT_MAP_JSON, "utf8").digest("base64")}'`;
