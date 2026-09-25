// شريط التنقل المشترك — يُبنى ديناميكيًا ويعتمد بالكامل على الأصناف
// (classes) الموجودة في css/style.css بدل الأنماط المضمّنة inline.

// يعترض كل نداءات fetch: أي 401 من /api/* (باستثناء تسجيل الدخول) يعيد التوجيه
// فورًا لصفحة الدخول، بدل ترك صفحات البيانات تعرض أخطاء قبل أن يلحقها navbar.js.
const originalFetch = window.fetch.bind(window);
window.fetch = async function (input, init) {
  const response = await originalFetch(input, init);
  const rawUrl = input instanceof Request ? input.url : String(input);
  const url = new URL(rawUrl, location.href);
  if (
    response.status === 401 &&
    url.origin === location.origin &&
    url.pathname.startsWith("/api/") &&
    url.pathname !== "/api/auth/login"
  ) {
    location.replace("login.html");
    return new Promise(() => {});
  }
  return response;
};

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
          <li><a class="nav-link" href="#" id="logoutLink">تسجيل الخروج</a></li>
        </ul>
      </div>
    </nav>
  `;
}

document.addEventListener("DOMContentLoaded", async function () {
  const res = await fetch("/api/auth/me");
  if (res.status === 401) return location.replace("login.html");

  const navbarContainer = document.getElementById("navbar");
  if (navbarContainer) {
    navbarContainer.innerHTML = buildNavbarHTML();
    document.getElementById("logoutLink").addEventListener("click", async (e) => {
      e.preventDefault();
      await fetch("/api/auth/logout", { method: "POST" });
      location.replace("login.html");
    });
  }
});
