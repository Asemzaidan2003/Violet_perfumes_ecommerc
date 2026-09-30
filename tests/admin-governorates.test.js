import test from "node:test";
import assert from "node:assert/strict";
import { GOVERNORATES as serverGovernorates } from "../backend/store/validate.js";
import { OVERRIDE_TOKENS as serverTokens, DEFAULT_THEME as serverDefault } from "../backend/store/theme.js";
import { GOVERNORATES as adminGovernorates } from "../admin/src/lib/governorates.js";
import { OVERRIDE_TOKENS as adminTokens, DEFAULT_THEME as adminDefault } from "../admin/src/lib/themeColors.js";

test("admin governorates list equals the server list", () => {
  assert.deepEqual(adminGovernorates, serverGovernorates);
});

test("admin theme override tokens and default theme equal the server's", () => {
  assert.deepEqual(adminTokens.map((t) => t.key), serverTokens);
  assert.deepEqual(adminDefault, serverDefault);
});
