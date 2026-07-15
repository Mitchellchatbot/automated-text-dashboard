import { describe, it, expect } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { AlumniDetailModal } from "@/components/alumni/AlumniDetailModal";
import type { AlumniDetail } from "@/lib/types";

const base: AlumniDetail = {
  id: "u1",
  salesforce_id: "00QVs00000SOZULMA5",
  full_name: "Ada Lovelace",
  email: "ada@example.com",
  phone_number: "+1 (555) 010-2030",
  discharge_date: "2026-07-14",
  status: "Closed",
  created_at: "2026-07-14T22:52:29.100Z",
  updated_at: "2026-07-14T23:10:00.000Z",
  daysSinceDischarge: 1,
  group: "Day 3",
};

describe("AlumniDetailModal", () => {
  it("renders nothing when no record is selected", () => {
    const html = renderToStaticMarkup(<AlumniDetailModal alumni={null} onClose={() => {}} />);
    expect(html).toBe("");
  });

  it("renders the person's fields with click-to-call / click-to-email (URL-encoded)", () => {
    const html = renderToStaticMarkup(<AlumniDetailModal alumni={base} onClose={() => {}} />);
    expect(html).toContain("Ada Lovelace");
    expect(html).toContain("00QVs00000SOZULMA5");
    expect(html).toContain("Closed");
    expect(html).toContain("Day 3");
    // Contact affordances, values URL-encoded (injection-safe).
    expect(html).toContain(`href="tel:${encodeURIComponent(base.phone_number as string)}"`);
    expect(html).toContain(`href="mailto:${encodeURIComponent(base.email as string)}"`);
    // Dialog semantics + close affordances.
    expect(html).toContain('role="dialog"');
    expect(html).toContain('aria-label="Close dialog"'); // backdrop
    expect(html).toContain('aria-label="Close"'); // close button
  });

  it("shows placeholders (no tel:/mailto:) when phone and email are null", () => {
    const html = renderToStaticMarkup(
      <AlumniDetailModal alumni={{ ...base, phone_number: null, email: null }} onClose={() => {}} />,
    );
    expect(html).not.toContain("href=\"tel:");
    expect(html).not.toContain("href=\"mailto:");
    expect(html).toContain("—"); // the dash placeholder
  });
});
