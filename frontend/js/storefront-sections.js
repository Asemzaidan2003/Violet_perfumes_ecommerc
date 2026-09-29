// Home-page section list editor: reorder (swap in the array), visible toggle, title override.
// Sections that have no on-page <h2> of their own (the promo slots) get no title input.
export const SECTION_LABELS = {
  aisles: "الأقسام", best_sellers: "الأكثر مبيعًا", promo_mid: "شريط ترويجي (وسط)",
  designers: "المصممون", testers: "ركن التجربة", new_arrivals: "وصل حديثًا",
  offers: "العروض", promo_bottom: "شريط ترويجي (أسفل)", service: "شريط الخدمات",
};
const TITLED = new Set(["aisles", "best_sellers", "designers", "testers", "new_arrivals", "offers", "service"]);

export function renderSections(tbody, sections, onChange) {
  tbody.replaceChildren();
  sections.forEach((s, i) => {
    const tr = document.createElement("tr");

    const nameCell = document.createElement("td");
    nameCell.textContent = SECTION_LABELS[s.key] || s.key;
    tr.append(nameCell);

    const orderCell = document.createElement("td");
    const up = document.createElement("button");
    up.type = "button"; up.className = "btn btn-ghost btn-sm"; up.textContent = "▲"; up.disabled = i === 0;
    up.addEventListener("click", () => { [sections[i - 1], sections[i]] = [sections[i], sections[i - 1]]; onChange(); });
    const down = document.createElement("button");
    down.type = "button"; down.className = "btn btn-ghost btn-sm"; down.textContent = "▼"; down.disabled = i === sections.length - 1;
    down.addEventListener("click", () => { [sections[i + 1], sections[i]] = [sections[i], sections[i + 1]]; onChange(); });
    orderCell.append(up, down);
    tr.append(orderCell);

    const visCell = document.createElement("td");
    const vis = document.createElement("input");
    vis.type = "checkbox"; vis.checked = s.visible !== false;
    vis.addEventListener("change", () => { sections[i] = { ...s, visible: vis.checked }; });
    visCell.append(vis);
    tr.append(visCell);

    const titleCell = document.createElement("td");
    if (TITLED.has(s.key)) {
      const title = document.createElement("input");
      title.type = "text"; title.maxLength = 40; title.value = s.title || "";
      title.placeholder = SECTION_LABELS[s.key];
      title.addEventListener("input", () => { sections[i] = { ...sections[i], title: title.value }; });
      titleCell.append(title);
    } else {
      titleCell.textContent = "—";
      titleCell.className = "muted";
    }
    tr.append(titleCell);

    tbody.append(tr);
  });
}

export const readSections = (sections) => sections.map((s) => ({ key: s.key, visible: s.visible !== false, title: s.title || "" }));
