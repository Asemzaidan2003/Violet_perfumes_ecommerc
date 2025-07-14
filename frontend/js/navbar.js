// كود JavaScript لإضافة شريط التنقل ديناميكيًا
const navbarHTML = `
    <nav style="
      background-color: #343a40;
      color: white;
      padding: 15px;
      font-family: Arial, sans-serif;
    ">
      <ul style="list-style: none; display: flex; gap: 20px; margin: 0; padding: 0;">
        <li><a href="index.html" style="color: white; text-decoration: none;">شاشة مبيعات</a></li>
        <li><a href="add_product.html" style="color: white; text-decoration: none;">اضافة عطر جديد</a></li>
        <li><a href="add_oil.html" style="color: white; text-decoration: none;">إضافة زيت جديد</a></li>
        <li><a href="add_bottle.html" style="color: white; text-decoration: none;">إضافة زجاجة جديدة</a></li>
        <li><a href="all_oils.html" style="color: white; text-decoration: none;">عرض الزيوت</a></li>
        <li><a href="all_bottles.html" style="color: white; text-decoration: none;">عرض الزجاجات</a></li>
        <li><a href="all_products.html" style="color: white; text-decoration: none;">عرض المنتجات</a></li>
      </ul>
    </nav>
  `;
document.addEventListener("DOMContentLoaded", function () {
  const navbarContainer = document.getElementById("navbar");
  console.log("Navbar container:", navbarContainer);
  if (navbarContainer) {
    navbarContainer.innerHTML = navbarHTML;
  }
});
