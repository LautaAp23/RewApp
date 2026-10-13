import { getAddress } from "viem";
import { accountCode } from "./account-code";
import type { WorkspaceContact } from "./workspace-types";

export function requestContactName(expectedPayer: string | null, contacts: WorkspaceContact[], qrLabel: string) {
  if (!expectedPayer) return qrLabel;
  return contacts.find(contact => contact.address.toLowerCase() === expectedPayer.toLowerCase())?.label ?? accountCode(getAddress(expectedPayer));
}
