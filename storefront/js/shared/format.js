// Display formatting shared by the server views and browser scripts. Pure.
const nf = new Intl.NumberFormat("ar-JO-u-nu-latn", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const int = new Intl.NumberFormat("ar-JO-u-nu-latn");
const pr = new Intl.PluralRules("ar");

export const money = (n) => `${nf.format(Number(n) || 0)} د.أ`;
export const num = (n) => int.format(n);
export const sizeLabel = (size) => `${size} مل`;

// Arabic count of perfumes: "عطر واحد", "عطران", "3 عطور", "11 عطرًا", "100 عطر".
const FORMS = { zero: "لا عطور", one: "عطر واحد", two: "عطران", few: "# عطور", many: "# عطرًا", other: "# عطر" };
export const perfumeCount = (n) => FORMS[pr.select(n)].replace("#", int.format(n));
