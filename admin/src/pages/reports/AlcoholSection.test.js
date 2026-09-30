import { describe, expect, it } from "vitest";
import { alcoholPayload } from "./AlcoholSection";

const orig = { quantity: 40 };
const d = (o = {}) => ({ name: " A ", type: "t", quantity: "40", add: "", cost: "1.5", ...o });

describe("alcoholPayload", () => {
  it("omits quantity when unchanged and add when blank", () => expect(alcoholPayload(d(), orig)).toEqual({ name: "A", type: "t", cost: 1.5 }));
  it("sends quantity only when changed and add_quantity when > 0", () => {
    expect(alcoholPayload(d({ quantity: "45", add: "10" }), orig)).toEqual({ name: "A", type: "t", cost: 1.5, quantity: 45, add_quantity: 10 });
  });
  it("rejects blank fields, zero/negative add and negative cost", () => {
    for (const o of [{ name: " " }, { type: "" }, { quantity: "" }, { cost: "" }, { cost: "-1" }, { add: "0" }, { add: "-2" }]) expect(alcoholPayload(d(o), orig)).toBeNull();
  });
});
