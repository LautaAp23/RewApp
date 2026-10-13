import type { WorkspaceAction } from "../workspace-types";

/** Preparing a transfer cannot authorize or move money. The payment still needs a fresh passkey. */
export function workspaceNeedsPasskey(action: WorkspaceAction, payload: Record<string, unknown>) {
  return action !== "personal.create" || payload.kind !== "DIRECT";
}
