// Tiny safe markup renderer for admin-authored page bodies. No raw HTML is ever allowed through:
// every character that isn't part of a recognized construct is escaped. Supports:
//   # heading / ## heading, paragraphs (blank-line separated), "- " bullet lists,
//   **bold**, and [text](url) links (url must pass the same validLink rule as placements).
import { esc } from "./html.js";
import { validLink } from "../models/placement.model.js";

// Bold and links inside a line of already-untouched text. Escapes everything else.
function renderInline(text) {
  let out = "";
  let i = 0;
  const s = String(text ?? "");
  while (i < s.length) {
    const link = /^\[([^\]]*)\]\(([^)]*)\)/.exec(s.slice(i));
    if (link) {
      const [whole, label, url] = link;
      if (validLink(url)) {
        out += `<a href="${esc(url)}" rel="noopener">${esc(label)}</a>`;
        i += whole.length;
        continue;
      }
      // Invalid url: fall through and treat the leading "[" as a literal character.
    }
    const bold = /^\*\*([^*]+)\*\*/.exec(s.slice(i));
    if (bold) {
      out += `<strong>${esc(bold[1])}</strong>`;
      i += bold[0].length;
      continue;
    }
    out += esc(s[i]);
    i += 1;
  }
  return out;
}

function renderBlock(block) {
  const lines = block.split("\n").filter((l) => l.trim() !== "");
  if (!lines.length) return "";
  if (lines.length === 1 && lines[0].startsWith("## ")) return `<h3>${renderInline(lines[0].slice(3))}</h3>`;
  if (lines.length === 1 && lines[0].startsWith("# ")) return `<h2>${renderInline(lines[0].slice(2))}</h2>`;
  if (lines.every((l) => l.startsWith("- "))) {
    return `<ul>${lines.map((l) => `<li>${renderInline(l.slice(2))}</li>`).join("")}</ul>`;
  }
  return `<p>${lines.map(renderInline).join("<br>")}</p>`;
}

// Returns a raw (trusted) HTML string built entirely from escaped/validated parts.
export function renderMarkup(source) {
  const blocks = String(source ?? "").replace(/\r\n/g, "\n").split(/\n\s*\n/);
  return blocks.map(renderBlock).filter(Boolean).join("\n");
}
