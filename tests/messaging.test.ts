import { describe, it, expect } from "vitest";
import { firstName, templateVars, renderTemplate } from "@/lib/messaging/template";
import { toE164 } from "@/lib/messaging/phone";

describe("firstName / templateVars", () => {
  it("takes the first token, trims, and falls back to 'there'", () => {
    expect(firstName("Ada Lovelace")).toBe("Ada");
    expect(firstName("  Jordan   Rivera ")).toBe("Jordan");
    expect(firstName(null)).toBe("");
    expect(templateVars({ full_name: null }).first_name).toBe("there");
    expect(templateVars({ full_name: "Ada Lovelace" })).toEqual({
      first_name: "Ada",
      full_name: "Ada Lovelace",
    });
  });
});

describe("renderTemplate", () => {
  it("fills known placeholders and blanks unknown ones", () => {
    const vars = templateVars({ full_name: "Ada Lovelace" });
    expect(renderTemplate("Hi {{first_name}}, welcome {{full_name}}.", vars)).toBe(
      "Hi Ada, welcome Ada Lovelace.",
    );
    expect(renderTemplate("Hello {{unknown}}!", vars)).toBe("Hello !");
    expect(renderTemplate("no placeholders", vars)).toBe("no placeholders");
  });
  it("tolerates whitespace inside the braces", () => {
    expect(renderTemplate("Hi {{ first_name }}", templateVars({ full_name: "Ada L" }))).toBe("Hi Ada");
  });
});

describe("toE164 (Blooio requires E.164)", () => {
  it("normalizes common US formats", () => {
    expect(toE164("+1 (555) 010-2030")).toBe("+15550102030");
    expect(toE164("555-010-2030")).toBe("+15550102030");
    expect(toE164("15550102030")).toBe("+15550102030");
    expect(toE164("+15550102030")).toBe("+15550102030");
  });
  it("returns null for empty / junk / too-short", () => {
    expect(toE164(null)).toBeNull();
    expect(toE164("")).toBeNull();
    expect(toE164("   ")).toBeNull();
    expect(toE164("abc")).toBeNull();
    expect(toE164("12345")).toBeNull();
  });
});
