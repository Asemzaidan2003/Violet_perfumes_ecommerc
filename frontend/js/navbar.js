// شريط التنقل المشترك — يُبنى ديناميكيًا ويعتمد بالكامل على الأصناف
// (classes) الموجودة في css/style.css بدل الأنماط المضمّنة inline.

const NAV_LINKS = [
  { href: "index.html", label: "شاشة المبيعات" },
  { href: "dashboard.html", label: "لوحة المعلومات" },
  { href: "reports.html", label: "التقارير" },
  { href: "orders.html", label: "الطلبات" },
  { href: "all_oils.html", label: "عرض الزيوت" },
  { href: "all_bottles.html", label: "عرض الزجاجات" },
  { href: "all_products.html", label: "عرض المنتجات" },
];

const ADD_NEW_LINKS = [
  { href: "add_product.html", label: "إضافة عطر جديد" },
  { href: "add_oil.html", label: "إضافة زيت جديد" },
  { href: "add_bottle.html", label: "إضافة زجاجة جديدة" },
];

function currentPage() {
  const path = window.location.pathname.split("/").pop();
  return path || "index.html";
}

function buildNavbarHTML() {
  const current = currentPage();
  const isActive = (href) => (href === current ? " active" : "");

  const mainLinks = NAV_LINKS.map(
    (link) => `<li><a class="nav-link${isActive(link.href)}" href="${link.href}">${link.label}</a></li>`
  ).join("");

  const dropdownItems = ADD_NEW_LINKS.map(
    (link) => `<li><a href="${link.href}">${link.label}</a></li>`
  ).join("");

  const addNewActive = ADD_NEW_LINKS.some((l) => l.href === current) ? " active" : "";

  return `
    <nav class="app-nav">
      <div class="nav-inner">
        <a class="brand" href="index.html">🧴 إدارة العطور</a>
        <ul>
          <li>
            <a class="nav-link${addNewActive}" href="#">إضافة جديد ▾</a>
            <ul class="dropdown">${dropdownItems}</ul>
          </li>
          ${mainLinks}
        </ul>
      </div>
    </nav>
  `;
}

document.addEventListener("DOMContentLoaded", function () {
  const navbarContainer = document.getElementById("navbar");
  if (navbarContainer) {
    navbarContainer.innerHTML = buildNavbarHTML();
  }
});
