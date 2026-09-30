import { createElement } from "react";
import { validLink } from "@/lib/links";

// Renders the server's already-escaped preview HTML without dangerouslySetInnerHTML. Only h2,h3,p,ul,li,br,strong,a are
// elements; any other tag (script, img, style, comments…) is shown as its literal source text. `a[href]` must pass validLink,
// otherwise its text is kept and the anchor dropped.
const ALLOWED = new Set(["h2", "h3", "p", "ul", "li", "br", "strong", "a"]);
const ENT = { amp: "&", lt: "<", gt: ">", quot: '"', "#39": "'", "#x27": "'" };
const decode = (s) => s.replace(/&(amp|lt|gt|quot|#39|#x27);/g, (_, e) => ENT[e]);
const TOKEN = /(<!--[\s\S]*?-->|<\/?[a-zA-Z][^<>]*>)|([^<]+|<)/g;

export function parseHtml(html) {
  const root = { tag: null, children: [] };
  const stack = [root];
  for (const m of String(html ?? "").matchAll(TOKEN)) {
    const cur = stack[stack.length - 1];
    if (m[2] !== undefined) { cur.children.push(decode(m[2])); continue; }
    const raw = m[1];
    const t = /^<(\/?)([a-zA-Z][a-zA-Z0-9]*)([^<>]*)>$/.exec(raw);
    const name = t?.[2].toLowerCase();
    if (!t || !ALLOWED.has(name)) { cur.children.push(raw); continue; }
    if (t[1]) {
      const at = stack.map((n) => n.tag).lastIndexOf(name);
      if (at > 0) stack.length = at;
      continue;
    }
    if (name === "br") { cur.children.push({ tag: "br", children: [] }); continue; }
    const node = { tag: name, children: [] };
    if (name === "a") node.href = decode(/\shref\s*=\s*"([^"]*)"/i.exec(t[3])?.[1] ?? "");
    cur.children.push(node);
    stack.push(node);
  }
  return root.children;
}

const CLASS = { h2: "mt-4 text-xl font-bold", h3: "mt-3 text-lg font-semibold", p: "my-2", ul: "my-2 list-disc ps-6" };

function render(node, key) {
  if (typeof node === "string") return node;
  const kids = node.children.map((c, i) => render(c, i));
  if (node.tag === "br") return createElement("br", { key });
  if (node.tag === "a") {
    return validLink(node.href) ? createElement("a", { key, href: node.href, rel: "noopener", className: "text-primary underline" }, ...kids) : createElement("span", { key }, ...kids);
  }
  return createElement(node.tag, { key, className: CLASS[node.tag] }, ...kids);
}

export const htmlToReact = (html) => parseHtml(html).map((n, i) => render(n, i));
