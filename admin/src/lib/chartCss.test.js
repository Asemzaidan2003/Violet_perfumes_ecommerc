import { test, expect } from "vitest";
import { buildChartCss } from "./chartCss.js";

test("buildChartCss emits safe keys and colours only", () => {
  const css = buildChartCss("chart-1", {
    revenue: { color: "#0c6e63" },
    ok_2: { theme: { light: "var(--primary)", dark: "hsl(10 20% 30%)" } },
    "</style><img src=x onerror=1>": { color: "#fff" },
    bad: { color: "red;} body{display:none" },
  });
  expect(css).toContain("--color-revenue: #0c6e63;");
  expect(css).toContain("--color-ok_2: var(--primary);");
  expect(css).toContain(".dark [data-chart=chart-1]");
  expect(css).not.toMatch(/<|img|display:none|bad/);
});

test("buildChartCss returns empty string with nothing usable", () => {
  expect(buildChartCss("c", { a: {} })).toBe("");
});
