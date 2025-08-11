// كود JavaScript لإضافة شريط التنقل ديناميكيًا
const navbarHTML = `
  <nav style="
    background-color: #343a40;
    color: white;
    padding: 15px;
    font-family: Arial, sans-serif;
  ">
    <ul style="list-style: none; display: flex; gap: 20px; margin: 0; padding: 0;">
      <li><a href="index.html" style="color: white; text-decoration: none;">شاشة المبيعات</a></li>
      <li style="position: relative;">
        <a href="#" style="color: white; text-decoration: none;">إضافة جديد ▼</a>
        <ul class="dropdown" style="
          display: none;
          position: absolute;
          background-color: #343a40;
          list-style: none;
          margin: 0;
          padding: 10px;
          top: 100%;
          right: 0;
          min-width: 160px;
          box-shadow: 0 2px 8px rgba(0,0,0,0.2);
        ">
          <li><a href="add_product.html" style="color:white; text-decoration:none; display:block; padding:5px;">إضافة عطر جديد</a></li>
          <li><a href="add_oil.html" style="color:white; text-decoration:none; display:block; padding:5px;">إضافة زيت جديد</a></li>
          <li><a href="add_bottle.html" style="color:white; text-decoration:none; display:block; padding:5px;">إضافة زجاجة جديدة</a></li>
        </ul>
      </li>
      <li><a href="orders.html" style="color: white; text-decoration: none;">الطلبات</a></li>
      <li><a href="all_oils.html" style="color: white; text-decoration: none;">عرض الزيوت</a></li>
      <li><a href="all_bottles.html" style="color: white; text-decoration: none;">عرض الزجاجات</a></li>
      <li><a href="all_products.html" style="color: white; text-decoration: none;">عرض المنتجات</a></li>
    </ul>
  </nav>
  <style>
    nav ul li {
      position: relative;
    }

    nav ul li:hover .dropdown {
      display: block !important;
    }
  </style>
`;

document.addEventListener("DOMContentLoaded", function () {
  const navbarContainer = document.getElementById("navbar");
  console.log("Navbar container:", navbarContainer);
  if (navbarContainer) {
    navbarContainer.innerHTML = navbarHTML;
  }
});
