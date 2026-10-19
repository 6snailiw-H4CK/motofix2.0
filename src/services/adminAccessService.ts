import axios from "axios";
import { API_BASE_URL, authHeaders } from "./apiClient";

type AdminAccessUpdate = {
  isActive?: boolean;
  subscriptionExpiresAt?: string | null;
  role?: "user" | "admin" | "master_admin";
  days?: number;
};

export const updateUserAccess = async (uid: string, changes: AdminAccessUpdate) => {
  const { data } = await axios.patch(`${API_BASE_URL}/api/admin/users/${encodeURIComponent(uid)}/access`, changes, {
    headers: await authHeaders(true),
  });
  if (typeof window !== "undefined") window.dispatchEvent(new Event("motofix:admin-users-changed"));
  return data as { success: true; action: string; target: string };
};
