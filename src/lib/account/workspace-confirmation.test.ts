import { describe, expect, it } from "vitest";
import { workspaceActions } from "../workspace-types";
import { workspaceNeedsPasskey } from "./workspace-confirmation";

describe("off-chain preparation confirmation scope", () => {
  it("allows only direct transfer preparation to use an existing session", () => {
    expect(workspaceNeedsPasskey("personal.create", { kind: "DIRECT" })).toBe(false);
    expect(workspaceNeedsPasskey("personal.create", { kind: "REQUEST" })).toBe(true);
    expect(workspaceNeedsPasskey("personal.create", {})).toBe(true);
    for (const action of workspaceActions.filter(a => a !== "personal.create")) {
      expect(workspaceNeedsPasskey(action, { kind: "DIRECT" })).toBe(true);
    }
  });
});
