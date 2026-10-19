import { auth } from "../firebase";

const configuredApiUrl = import.meta.env.VITE_STRIPE_API_URL?.trim();
const isProductionLocalhostUrl = import.meta.env.PROD && configuredApiUrl?.includes("localhost");
export const API_BASE_URL = configuredApiUrl && !isProductionLocalhostUrl
  ? configuredApiUrl
  : window.location.origin;

export const authHeaders = async (forceRefresh = false) => {
  const token = await auth.currentUser?.getIdToken(forceRefresh);
  if (!token) throw new Error("Usuario precisa estar autenticado para acessar a API.");
  return { Authorization: `Bearer ${token}` };
};
