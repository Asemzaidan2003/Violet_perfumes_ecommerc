// شريط التنقل المشترك — يُبنى ديناميكيًا ويعتمد بالكامل على الأصناف
// (classes) الموجودة في css/style.css بدل الأنماط المضمّنة inline.

// يهرب أي نص من العميل قبل حقنه في innerHTML — يُستخدم في كل صفحة تعرض
// اسم/هاتف/ملاحظة زبون أو طلب اهتمام (orders.html، order-details.html، reports.js).
const ESC_MAP = { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" };
window.esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ESC_MAP[c]);

// Normalized phones are stored as "07XXXXXXXX" (see backend/../phone.js); wa.me needs the
// international form with no leading zero. Shared by orders.html, order-details.html and
// interests.html.
window.waLink = (phone) => {
  const digits = String(phone).replace(/\D/g, "");
  return `https://wa.me/962${digits.replace(/^0/, "")}`;
};

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
  { href: "interests.html", label: "طلبات الاهتمام" },
  { href: "promotions.html", label: "العروض والإعلانات" },
  { href: "all_oils.html", label: "عرض الزيوت" },
  { href: "all_bottles.html", label: "عرض الزجاجات" },
  { href: "all_products.html", label: "عرض المنتجات" },
  { href: "catalog.html", label: "تصنيف المنتجات" },
  { href: "categories.html", label: "الأقسام" },
  { href: "brands.html", label: "المصممون" },
  { href: "pages.html", label: "الصفحات" },
  { href: "settings.html", label: "إعدادات المتجر" },
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

  const mainLinks = NAV_LINKS.map((link) => {
    const badge = link.href === "orders.html" ? ' <span class="nav-badge" id="navOrdersBadge" hidden>0</span>' : "";
    return `<li><a class="nav-link${isActive(link.href)}" href="${link.href}">${link.label}${badge}</a></li>`;
  }).join("");

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

// إشارة الطلب الجديد: يستطلع عدد الطلبات غير المؤكدة (غير الملغاة) كل 60 ثانية
// ويعرضها كشارة على رابط "الطلبات" وكبادئة "(n) " في عنوان الصفحة.
const ORIGINAL_TITLE = document.title;
let pollIntervalId = null;

async function pollUnconfirmedOrders() {
  const badge = document.getElementById("navOrdersBadge");
  if (!badge) return;
  try {
    // The un-intercepted fetch: a 401 here must never yank the page out from under someone
    // mid-edit (see the fetch wrapper above). Instead, stop polling and just hide the badge.
    const res = await originalFetch("/api/orders/pending-count");
    if (res.status === 401) {
      if (pollIntervalId) clearInterval(pollIntervalId);
      badge.hidden = true;
      document.title = ORIGINAL_TITLE;
      return;
    }
    if (!res.ok) return;
    const { data } = await res.json();
    const n = data?.count || 0;
    badge.textContent = String(n);
    badge.hidden = n === 0;
    document.title = n > 0 ? `(${n}) ${ORIGINAL_TITLE}` : ORIGINAL_TITLE;
  } catch (err) {
    console.error("Error polling unconfirmed orders:", err);
  }
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
    pollUnconfirmedOrders();
    pollIntervalId = setInterval(pollUnconfirmedOrders, 60_000);
  }
});
