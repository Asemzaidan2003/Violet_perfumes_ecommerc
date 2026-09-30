// Pure text edits for the page-body toolbar. `#` = h2 and `##` = h3 (the page title is the only h1).
const lineStart = (v, i) => v.lastIndexOf("\n", i - 1) + 1;
const lineEnd = (v, i) => { const j = v.indexOf("\n", i); return j === -1 ? v.length : j; };

// Toggles a heading prefix on the line holding the cursor: same prefix removes it, the other heading level swaps it.
function heading(value, s, e, prefix) {
  const ls = lineStart(value, s);
  const line = value.slice(ls, lineEnd(value, s));
  const cur = line.startsWith("## ") ? "## " : line.startsWith("# ") ? "# " : "";
  const next = cur === prefix ? "" : prefix;
  const out = value.slice(0, ls) + next + value.slice(ls + cur.length);
  const d = next.length - cur.length;
  return { value: out, selStart: Math.max(ls, s + d), selEnd: Math.max(ls, e + d) };
}

function bold(value, s, e) {
  if (value.slice(s - 2, s) === "**" && value.slice(e, e + 2) === "**") {
    return { value: value.slice(0, s - 2) + value.slice(s, e) + value.slice(e + 2), selStart: s - 2, selEnd: e - 2 };
  }
  return { value: `${value.slice(0, s)}**${value.slice(s, e)}**${value.slice(e)}`, selStart: s + 2, selEnd: e + 2 };
}

// "- " at the start of every selected line; when all of them already have it, it is removed instead.
function list(value, s, e) {
  const from = lineStart(value, s);
  const to = lineEnd(value, e);
  const lines = value.slice(from, to).split("\n");
  const allOn = lines.every((l) => l.startsWith("- "));
  const next = lines.map((l) => (allOn ? l.slice(2) : l.startsWith("- ") ? l : `- ${l}`));
  const out = value.slice(0, from) + next.join("\n") + value.slice(to);
  const firstD = next[0].length - lines[0].length;
  const totalD = next.join("\n").length - lines.join("\n").length;
  return { value: out, selStart: Math.max(from, s + firstD), selEnd: Math.max(from, e + totalD) };
}

function link(value, s, e, slug) {
  const url = `/page/${slug || "slug"}`;
  const sel = value.slice(s, e);
  return { value: `${value.slice(0, s)}[${sel}](${url})${value.slice(e)}`, selStart: s + 1, selEnd: s + 1 + sel.length };
}

export function applyToolbar(value, selStart, selEnd, action, slug) {
  const s = Math.min(selStart, selEnd);
  const e = Math.max(selStart, selEnd);
  if (action === "h2") return heading(value, s, e, "# ");
  if (action === "h") return heading(value, s, e, "## ");
  if (action === "b") return bold(value, s, e);
  if (action === "list") return list(value, s, e);
  if (action === "link") return link(value, s, e, slug);
  return { value, selStart: s, selEnd: e };
}
