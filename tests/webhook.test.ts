import { describe, it, expect } from "vitest";
import {
  parseDischargeDate,
  cleanStatus,
  isDischarged,
  extractRecords,
  mapRecord,
  dedupeBySalesforceId,
  normalizeBatch,
  dischargeDateWarning,
  type NormalizedRecord,
} from "../supabase/functions/salesforce-webhook/lib";

describe("parseDischargeDate (no -1-day bug)", () => {
  it("keeps a pure calendar date", () => {
    expect(parseDischargeDate("2026-07-14")).toBe("2026-07-14");
  });
  it("takes the date part of a midnight-UTC datetime WITHOUT shifting", () => {
    expect(parseDischargeDate("2026-07-14T00:00:00.000Z")).toBe("2026-07-14");
    expect(parseDischargeDate("2026-07-14T00:00:00+00:00")).toBe("2026-07-14");
    expect(parseDischargeDate("2026-01-01T05:30:00Z")).toBe("2026-01-01");
  });
  it("returns null for junk / impossible / missing", () => {
    expect(parseDischargeDate("")).toBeNull();
    expect(parseDischargeDate("  ")).toBeNull();
    expect(parseDischargeDate("07/14/2026")).toBeNull();
    expect(parseDischargeDate("2026-02-30")).toBeNull();
    expect(parseDischargeDate("2026-13-01")).toBeNull();
    expect(parseDischargeDate(null)).toBeNull();
    expect(parseDischargeDate(undefined)).toBeNull();
    expect(parseDischargeDate(12345)).toBeNull();
  });
  it("rejects implausible years (pre-2000 / post-2100) but keeps the boundaries", () => {
    expect(parseDischargeDate("1999-12-31")).toBeNull();
    expect(parseDischargeDate("1900-01-01")).toBeNull(); // the DoS poison-row date
    expect(parseDischargeDate("2101-01-01")).toBeNull();
    expect(parseDischargeDate("9999-01-01")).toBeNull();
    expect(parseDischargeDate("2000-01-01")).toBe("2000-01-01");
    expect(parseDischargeDate("2100-12-31")).toBe("2100-12-31");
  });
});

describe("cleanStatus (raw Salesforce Lead status, verbatim)", () => {
  it("stores the value verbatim, trimmed", () => {
    expect(cleanStatus("Working - Contacted")).toBe("Working - Contacted");
    expect(cleanStatus("  Open  ")).toBe("Open");
    expect(cleanStatus("Closed - Converted")).toBe("Closed - Converted");
  });
  it("returns null for empty / non-string", () => {
    expect(cleanStatus("")).toBeNull();
    expect(cleanStatus("   ")).toBeNull();
    expect(cleanStatus(null)).toBeNull();
    expect(cleanStatus(undefined)).toBeNull();
    expect(cleanStatus(42)).toBeNull();
  });
});

describe("isDischarged (Discharged_Treatment__c guard)", () => {
  it("is true unless explicitly false", () => {
    expect(isDischarged(true)).toBe(true);
    expect(isDischarged(undefined)).toBe(true); // absent -> ingest
    expect(isDischarged("true")).toBe(true);
    expect(isDischarged(false)).toBe(false);
    expect(isDischarged("false")).toBe(false);
    expect(isDischarged("no")).toBe(false);
    expect(isDischarged("0")).toBe(false);
  });
});

describe("extractRecords (tolerant shapes)", () => {
  it("accepts a bare array", () => {
    expect(extractRecords([{ Id: "a" }])).toHaveLength(1);
  });
  it("accepts { records: [...] } (our contract + raw SOQL)", () => {
    expect(
      extractRecords({ totalSize: 1, done: true, records: [{ Id: "a" }] }),
    ).toHaveLength(1);
  });
  it("accepts { data: [...] }", () => {
    expect(extractRecords({ data: [{ Id: "a" }, { Id: "b" }] })).toHaveLength(2);
  });
  it("accepts a single record object", () => {
    expect(extractRecords({ Id: "a", Name: "X" })).toHaveLength(1);
  });
  it("accepts the Zapier 'Full Response Data' wrapper (data.records)", () => {
    const wrapper = {
      request: { method: "GET", url: "https://x.my.salesforce.com/query" },
      response: { status: 200, headers: {} },
      data: { totalSize: 2, done: true, records: [{ Id: "a" }, { Id: "b" }] },
    };
    expect(extractRecords(wrapper)).toHaveLength(2);
  });
  it("accepts the wrapper by re-parsing response.body (raw JSON string)", () => {
    const wrapper = {
      request: { method: "GET" },
      response: {
        status: 200,
        body: JSON.stringify({ totalSize: 1, done: true, records: [{ Id: "a" }] }),
      },
    };
    expect(extractRecords(wrapper)).toHaveLength(1);
  });
  it("throws for malformed bodies", () => {
    expect(() => extractRecords(42)).toThrow();
    expect(() => extractRecords("nope")).toThrow();
    expect(() => extractRecords({ foo: "bar" })).toThrow();
    expect(() => extractRecords(null)).toThrow();
  });
});

describe("mapRecord (Salesforce Lead field mapping)", () => {
  it("maps the finalized Lead query fields, status verbatim, date not shifted", () => {
    const mapped = mapRecord({
      Id: "00Q1",
      Name: "Ada Lovelace",
      Email: "ada@example.com",
      Phone: "+1-555-0100",
      Status: "Working - Contacted",
      Discharged_Treatment__c: true,
      Discharged_Date__c: "2026-07-14T00:00:00.000Z",
    });
    expect(mapped).toEqual<NormalizedRecord>({
      salesforce_id: "00Q1",
      full_name: "Ada Lovelace",
      email: "ada@example.com",
      phone_number: "+1-555-0100",
      discharge_date: "2026-07-14",
      status: "Working - Contacted",
    });
  });
  it("skips a record explicitly flagged not discharged", () => {
    expect(
      mapRecord({ Id: "00Q2", Discharged_Treatment__c: false, Discharged_Date__c: "2026-07-14" }),
    ).toEqual({ error: "not discharged" });
  });
  it("errors when salesforce_id is missing", () => {
    expect(mapRecord({ Name: "No Id" })).toEqual({ error: "missing salesforce_id" });
    expect(mapRecord({ Id: "  " })).toEqual({ error: "missing salesforce_id" });
    expect(mapRecord(null)).toEqual({ error: "not an object" });
  });
  it("leaves optional fields null and status null when absent", () => {
    const mapped = mapRecord({ salesforce_id: "x" }) as NormalizedRecord;
    expect(mapped.full_name).toBeNull();
    expect(mapped.email).toBeNull();
    expect(mapped.discharge_date).toBeNull();
    expect(mapped.status).toBeNull();
  });
  it("ignores a __proto__ key without polluting Object.prototype", () => {
    const evil = JSON.parse('{"__proto__":{"polluted":"yes"},"Id":"a"}');
    mapRecord(evil);
    expect(({} as Record<string, unknown>).polluted).toBeUndefined();
  });
});

describe("dedupeBySalesforceId (last wins)", () => {
  it("keeps the last occurrence", () => {
    const out = dedupeBySalesforceId([
      { salesforce_id: "a", full_name: "First", email: null, phone_number: null, discharge_date: null, status: null },
      { salesforce_id: "a", full_name: "Second", email: null, phone_number: null, discharge_date: null, status: null },
      { salesforce_id: "b", full_name: "B", email: null, phone_number: null, discharge_date: null, status: null },
    ]);
    expect(out).toHaveLength(2);
    expect(out.find((r) => r.salesforce_id === "a")?.full_name).toBe("Second");
  });
});

describe("normalizeBatch (end-to-end)", () => {
  it("counts received, dedupes valid, and reports skipped", () => {
    const result = normalizeBatch({
      records: [
        { Id: "1", Name: "A", Discharged_Date__c: "2026-07-01" },
        { Id: "1", Name: "A (dupe, newer)", Discharged_Date__c: "2026-07-02" },
        { Name: "no id" },
        { Id: "2", Name: "B" },
      ],
    });
    expect(result.received).toBe(4);
    expect(result.records).toHaveLength(2); // 1 (deduped) + 2
    expect(result.skipped).toEqual([{ index: 2, reason: "missing salesforce_id" }]);
    expect(result.records.find((r) => r.salesforce_id === "1")?.discharge_date).toBe(
      "2026-07-02",
    );
  });
});

describe("dischargeDateWarning (misconfiguration guard)", () => {
  const rec = (discharge_date: string | null): NormalizedRecord => ({
    salesforce_id: "x",
    full_name: null,
    email: null,
    phone_number: null,
    discharge_date,
    status: null,
  });
  it("warns when a non-empty batch has no usable discharge dates", () => {
    expect(dischargeDateWarning([rec(null), rec(null)])).toContain("discharge-date field");
  });
  it("is silent when at least one date is present or batch is empty", () => {
    expect(dischargeDateWarning([rec(null), rec("2026-07-14")])).toBeNull();
    expect(dischargeDateWarning([])).toBeNull();
  });
});
