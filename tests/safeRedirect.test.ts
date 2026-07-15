import { describe, it, expect } from "vitest";
import { safeRedirect } from "@/lib/safeRedirect";

describe("safeRedirect (open-redirect guard)", () => {
  it("allows same-origin relative paths", () => {
    expect(safeRedirect("/")).toBe("/");
    expect(safeRedirect("/alumni")).toBe("/alumni");
    expect(safeRedirect("/alumni?due=due&page=2")).toBe("/alumni?due=due&page=2");
  });
  it("rejects protocol-relative and backslash targets", () => {
    expect(safeRedirect("//evil.com")).toBe("/");
    expect(safeRedirect("/\\evil.com")).toBe("/"); // browsers normalize \ to /
    expect(safeRedirect("https://evil.com")).toBe("/");
    expect(safeRedirect("\\evil.com")).toBe("/");
  });
  it("falls back to / for empty / nullish", () => {
    expect(safeRedirect(null)).toBe("/");
    expect(safeRedirect(undefined)).toBe("/");
    expect(safeRedirect("")).toBe("/");
  });
});
