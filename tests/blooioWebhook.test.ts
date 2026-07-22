import { describe, it, expect } from "vitest";
import {
  classifyKeyword,
  parseSignatureHeader,
  classifyEvent,
} from "../supabase/functions/blooio-webhook/lib";

describe("classifyKeyword (STOP/START detection)", () => {
  it("detects STOP-family keywords regardless of case/punctuation", () => {
    for (const s of ["STOP", "stop", " Stop ", "STOP.", "unsubscribe", "Cancel", "QUIT", "opt-out"]) {
      expect(classifyKeyword(s)).toBe("stop");
    }
  });
  it("detects START-family keywords", () => {
    for (const s of ["START", "start", "UNSTOP", "resume", "opt-in", "YES"]) {
      expect(classifyKeyword(s)).toBe("start");
    }
  });
  it("treats a leading keyword as the intent (e.g. 'STOP please')", () => {
    expect(classifyKeyword("STOP please")).toBe("stop");
    expect(classifyKeyword("start now")).toBe("start");
  });
  it("returns null for ordinary replies and empties", () => {
    expect(classifyKeyword("thanks so much!")).toBeNull();
    expect(classifyKeyword("can you call me")).toBeNull();
    expect(classifyKeyword("")).toBeNull();
    expect(classifyKeyword(null)).toBeNull();
  });
});

describe("parseSignatureHeader", () => {
  it("parses t and v1", () => {
    expect(parseSignatureHeader("t=1710000000,v1=abcdef")).toEqual({ t: 1710000000, v1: "abcdef" });
    expect(parseSignatureHeader("v1=deadbeef,t=42")).toEqual({ t: 42, v1: "deadbeef" });
  });
  it("returns null when malformed", () => {
    expect(parseSignatureHeader(null)).toBeNull();
    expect(parseSignatureHeader("")).toBeNull();
    expect(parseSignatureHeader("t=notanumber,v1=x")).toBeNull();
    expect(parseSignatureHeader("t=1")).toBeNull(); // no v1
  });
});

describe("classifyEvent", () => {
  it("classifies an inbound message (with { data } envelope too)", () => {
    const inbound = {
      message_id: "msg_1",
      direction: "inbound",
      text: "STOP",
      status: "received",
      sender: "+15551234567",
      recipient: "+15557654321",
    };
    expect(classifyEvent(inbound)).toEqual({
      kind: "inbound",
      phone: "+15551234567",
      text: "STOP",
      providerMessageId: "msg_1",
    });
    // envelope form
    expect(classifyEvent({ type: "message.received", data: inbound }).kind).toBe("inbound");
  });
  it("classifies a delivery-status event", () => {
    const evt = classifyEvent({ message_id: "msg_9", direction: "outbound", status: "delivered", kind: "delivered" });
    expect(evt).toEqual({ kind: "status", providerMessageId: "msg_9", status: "delivered" });
  });
  it("returns 'other' for unrecognized payloads", () => {
    expect(classifyEvent({ foo: "bar" }).kind).toBe("other");
    expect(classifyEvent(null).kind).toBe("other");
  });
});
