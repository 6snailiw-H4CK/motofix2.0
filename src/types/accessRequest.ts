export type AccessRequestStatus = "pending" | "approved" | "blocked";

export type AccessRequest<TimestampValue = unknown> = {
  uid: string;
  email: string;
  displayName: string;
  status: AccessRequestStatus;
  createdAt: TimestampValue;
  lastAuditId?: string;
};

export const createPendingAccessRequest = <TimestampValue>(
  identity: Pick<AccessRequest, "uid" | "email" | "displayName">,
  createdAt: TimestampValue,
): AccessRequest<TimestampValue> => ({
  ...identity,
  status: "pending",
  createdAt,
});
