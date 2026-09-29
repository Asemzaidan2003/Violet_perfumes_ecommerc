const THEMES = { light: "", dark: ".dark" };
const SAFE_KEY = /^[\w-]+$/;
const SAFE_COLOR = /^(#[0-9a-fA-F]{3,8}|(rgb|rgba|hsl|hsla|oklch|oklab|var)\([\w\s.,%/#()-]*\)|[a-zA-Z]+)$/;

// CSS variables for chart colours. Keys and colours that are not plainly safe are dropped, so
// data-derived config keys can never break out of the <style> element or the rule.
export function buildChartCss(id, config = {}) {
  if (!SAFE_KEY.test(id)) return "";
  const rules = Object.entries(THEMES).map(([theme, prefix]) => {
    const lines = Object.entries(config).flatMap(([key, item]) => {
      const color = item?.theme?.[theme] ?? item?.color;
      return SAFE_KEY.test(key) && typeof color === "string" && SAFE_COLOR.test(color) ? [`  --color-${key}: ${color};`] : [];
    });
    return lines.length ? `${prefix} [data-chart=${id}] {\n${lines.join("\n")}\n}` : "";
  });
  return rules.filter(Boolean).join("\n");
}
