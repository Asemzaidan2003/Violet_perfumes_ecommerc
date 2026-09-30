// Registers the file-per-area scenarios (in order) and holds the E2E_ONLY name filter.
import os from "node:os";
import { registerAdminOnlineScenarios } from "./admin-online.mjs";
import { registerAdminPosScenarios } from "./admin-pos.mjs";
import { registerAdminOrdersScenarios } from "./admin-orders.mjs";
import { registerAdminInterestsScenarios } from "./admin-interests.mjs";
import { registerAdminDashboardScenarios } from "./admin-dashboard.mjs";
import { registerAdminInsightsScenarios } from "./admin-insights.mjs";
import { registerAdminInventoryScenarios } from "./admin-inventory.mjs";
import { registerAdminProductsScenarios } from "./admin-products.mjs";
import { registerAdminProductFormScenarios } from "./admin-product-form.mjs";
import { registerAdminProductFormEditScenarios } from "./admin-product-form-edit.mjs";
import { registerAdminProductFormMediaScenarios } from "./admin-product-form-media.mjs";
import { registerCheckoutScenarios } from "./checkout.mjs";
import { registerPromotionScenarios } from "./promotions.mjs";
import { registerFxScenarios } from "./fx.mjs";
import { registerProductVisibilityScenarios } from "./product-visibility.mjs";
import { registerColorScenarios } from "./colors.mjs";
import { registerBrandScenarios } from "./brands.mjs";
import { registerNavScenarios } from "./nav.mjs";
import { registerIdentityScenarios } from "./identity.mjs";
import { registerPageScenarios } from "./pages.mjs";
import { registerCategoryScenarios } from "./categories.mjs";
import { registerStorefrontCmsScenarios } from "./storefront-cms.mjs";

// E2E_ONLY=<regex> runs only matching scenario names; the rest print SKIP and count as neither pass nor fail.
const only = process.env.E2E_ONLY ? new RegExp(process.env.E2E_ONLY) : null;
export const isSelected = (name) => !only || only.test(name);

// ctx: { scenario, openPage, use3d, check, baseUrl, admin, png, pngPath, productId, fxProductId }
export async function registerAllScenarios(ctx) {
  const { use3d, png, pngPath, productId, fxProductId, ...base } = ctx;
  const shot = { ...base, shotDir: process.env.E2E_SHOT_DIR || os.tmpdir() };
  // Task 6 (cart drawer, checkout, confirmation) — see checkout.mjs.
  await registerCheckoutScenarios({ ...base, png });
  // Admin pages (interests/settings/online orders, POS, orders, dashboard, reports, inventory).
  await registerAdminOnlineScenarios({ ...base, admin: undefined });
  await registerAdminPosScenarios(base);
  await registerAdminOrdersScenarios(base);
  await registerAdminInterestsScenarios(base);
  await registerAdminDashboardScenarios(base);
  await registerAdminInsightsScenarios(base);
  await registerAdminInventoryScenarios(base);
  await registerAdminProductsScenarios(base);
  await registerAdminProductFormScenarios(base);
  await registerAdminProductFormEditScenarios(base);
  await registerAdminProductFormMediaScenarios({ ...base, pngPath });
  await registerPromotionScenarios(shot);
  await registerProductVisibilityScenarios({ ...base, admin: undefined });
  await registerColorScenarios(base);
  await registerBrandScenarios({ ...shot, productId });
  await registerNavScenarios(base);
  await registerIdentityScenarios({ ...shot, pngPath });
  await registerPageScenarios(shot);
  await registerCategoryScenarios({ ...shot, productId });
  await registerStorefrontCmsScenarios(shot);
  // Task 1 (immersive layer) — see fx.mjs. Runs last: use3d() swaps the shared browser context to a fresh one with no admin login.
  await registerFxScenarios({ ...base, admin: undefined, use3d, productId: fxProductId });
}
