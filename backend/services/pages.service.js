import Page from "../models/page.model.js";

const CACHE_TTL_MS = 60_000; // catalog-style TTL, per spec
let cache = null; // { at, rows } — published pages only, lean

export function invalidatePages() {
  cache = null;
}

export async function getPublishedPages() {
  if (!cache || Date.now() - cache.at >= CACHE_TTL_MS) {
    const rows = await Page.find({ published: true }).sort({ sort: 1, createdAt: 1 }).lean();
    cache = { at: Date.now(), rows };
  }
  return cache.rows;
}

const SEED_PAGES = [
  {
    slug: "terms", title: "الشروط والأحكام", footer_group: "info", sort: 0,
    body: "# الشروط والأحكام\n\nمرحبًا بك في متجرنا. باستخدامك هذا الموقع وإتمام أي طلب، فإنك توافق على الشروط التالية.\n\n## الطلب والدفع\n\n- الدفع نقدًا عند الاستلام فقط.\n- يتم تأكيد الطلب عبر اتصال أو رسالة واتساب قبل الشحن.\n\n## التوصيل\n\nنوصل الطلبات إلى جميع محافظات الأردن. للاستفسار، تواصل معنا عبر واتساب.",
  },
  {
    slug: "privacy", title: "سياسة الخصوصية", footer_group: "info", sort: 1,
    body: "# سياسة الخصوصية\n\nنحترم خصوصيتك ولا نستخدم بياناتك إلا لإتمام طلبك وتوصيله.\n\n- لا نشارك بياناتك مع أي جهة خارجية.\n- بيانات التواصل تُستخدم فقط لتأكيد الطلب والتوصيل عبر واتساب أو الهاتف.",
  },
  {
    slug: "returns", title: "الاستبدال والاسترجاع", footer_group: "info", sort: 2,
    body: "# الاستبدال والاسترجاع\n\nنسعى لرضاك التام عن كل طلب.\n\n- يمكن استبدال المنتج خلال فترة محددة من الاستلام إذا كان بحالته الأصلية.\n- للاسترجاع أو الاستبدال، تواصل معنا عبر واتساب وسنقوم بترتيب الأمر.",
  },
  {
    slug: "shipping", title: "الشحن والتوصيل", footer_group: "info", sort: 3,
    body: "# الشحن والتوصيل\n\nنوصل طلباتك إلى جميع محافظات الأردن.\n\n- الدفع نقدًا عند الاستلام.\n- مدة التوصيل تختلف حسب المحافظة، وسيتم التواصل معك لتأكيد الموعد.",
  },
  {
    slug: "about", title: "من نحن", footer_group: "help", sort: 0,
    body: "# من نحن\n\nمتجرنا متخصص في العطور المختارة بعناية، نقدم لعملائنا تجربة تسوق سهلة وموثوقة في الأردن، مع الدفع نقدًا عند الاستلام.",
  },
  {
    slug: "contact", title: "تواصل معنا", footer_group: "help", sort: 1,
    body: "# تواصل معنا\n\nيسعدنا تواصلك معنا في أي وقت عبر واتساب لأي استفسار عن المنتجات أو الطلبات أو التوصيل.",
  },
  {
    slug: "faq", title: "الأسئلة الشائعة", footer_group: "help", sort: 2,
    body: "# الأسئلة الشائعة\n\n## كيف أدفع؟\n\nالدفع نقدًا عند الاستلام فقط.\n\n## إلى أين توصلون؟\n\nنوصل لجميع محافظات الأردن.\n\n## كيف أتواصل معكم؟\n\nتواصل معنا عبر واتساب في أي وقت.",
  },
];

// Idempotent: only runs when the collection is empty, and never overwrites existing pages. Called
// from the real app's startup path only (never from tests) — see backend/server.js.
export async function seedDefaultPages() {
  if (await Page.exists({})) return;
  await Page.insertMany(SEED_PAGES.map((p) => ({ ...p, published: false, meta_description: "" })), { ordered: false }).catch((err) => {
    // Duplicate-key races between concurrent startups are fine to ignore; anything else rethrows.
    if (err?.code !== 11000 && !err?.writeErrors?.every((w) => w.code === 11000)) throw err;
  });
}
