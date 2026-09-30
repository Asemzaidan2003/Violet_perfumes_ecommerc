import { describe, expect, test } from "vitest";
import { quantityUpdate } from "./stock.js";

describe("quantityUpdate", () => {
  test("unchanged quantity sends nothing", () => expect(quantityUpdate("oil_quantity", 5, 5, null)).toEqual({}));
  test("changed quantity sends the absolute value (0 and negatives included)", () => {
    expect(quantityUpdate("oil_quantity", 5, 0, null)).toEqual({ oil_quantity: 0 });
    expect(quantityUpdate("oil_quantity", 5, -7, null)).toEqual({ oil_quantity: -7 });
  });
  test("an increment is sent alone, even when the quantity also changed", () => {
    expect(quantityUpdate("quantity", -7, 100, 10)).toEqual({ add_quantity: 10 });
  });
  test("a non-positive or missing increment is ignored", () => {
    expect(quantityUpdate("quantity", 3, 3, 0)).toEqual({});
    expect(quantityUpdate("quantity", 3, null, null)).toEqual({});
  });
});
