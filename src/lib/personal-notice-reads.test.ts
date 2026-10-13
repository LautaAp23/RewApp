import { describe, expect, it } from "vitest";
import { createPersonalNoticeReads } from "./personal-notice-reads";
import { isServerNoticeId, noticeReadToken, parseInboxReadIds } from "./notification-inbox";

describe("personal notice read synchronization", () => {
  it("uses server-backed reading for each participant's split notice", () => {
    const state = createPersonalNoticeReads();
    expect(isServerNoticeId("split-part")).toBe(true);
    expect(isServerNoticeId("platform-welcome")).toBe(false);
    state.begin("participant", "split-part"); state.finish("participant", "split-part", true);
    state.merge("participant", []);
    expect(state.ids("participant")).toEqual(["split-part"]);
    expect(state.ids("another-participant")).toEqual([]);
    expect(noticeReadToken("split-part")).toBe("split:part");
    expect(parseInboxReadIds(["split:part"])).toEqual({ personal: [], splits: ["part"] });
    expect(parseInboxReadIds(["split:../other"])).toBeNull();
    expect(parseInboxReadIds(Array(51).fill("split:part"))).toBeNull();
  });
  it("keeps an acknowledgement visible across header/inbox and stale refreshes", () => {
    const state = createPersonalNoticeReads();
    expect(state.ids("Account")).toEqual([]);
    expect(state.begin("Account", "personal-1")).toBe(true);
    state.merge("account", []); // A refresh started before the tap still says unread.
    expect(state.ids("account")).toEqual(["personal-1"]);
    state.finish("account", "personal-1", true);
    state.merge("account", []);
    expect(state.ids("ACCOUNT")).toEqual(["personal-1"]);
    expect(state.begin("account", "personal-1")).toBe(false);
  });
  it("preserves server reads when another kind of notification is opened", () => {
    const state = createPersonalNoticeReads();
    state.merge("account", ["personal-1"]);
    state.merge("account", []);
    expect(state.ids("account")).toEqual(["personal-1"]);
    expect(state.ids("other-account")).toEqual([]);
  });
  it("rolls back failed acknowledgements and allows retry without duplicates", () => {
    const state = createPersonalNoticeReads();
    state.begin("account", "personal-1");
    expect(state.begin("account", "personal-1")).toBe(false);
    state.finish("account", "personal-1", false);
    expect(state.ids("account")).toEqual([]);
    expect(state.begin("account", "personal-1")).toBe(true);
    state.merge("account", ["personal-1"]); // Another device already acknowledged it.
    state.finish("account", "personal-1", false);
    expect(state.ids("account")).toEqual(["personal-1"]);
  });
});
