import axios from "axios";
import { API_BASE_URL, authHeaders } from "./apiClient";

export type AccountAccessResponse = {
  allowed: boolean;
  status: string | null;
  reason: string;
  accountState: "active" | "blocked" | "missing";
  entitlementSource: "admin" | "owner" | "stripe" | "manual" | "none";
  expiresAt: string | null;
  evaluatedAt: string;
};

export const getAccountAccess = async (): Promise<AccountAccessResponse> => {
  try {
    const { data } = await axios.get<AccountAccessResponse>(`${API_BASE_URL}/api/account/access`, {
      headers: await authHeaders(true),
    });
    return data;
  } catch (error) {
    if (!axios.isAxiosError(error)) throw error;

    const status = error.response?.status;
    if (status === 401) throw new Error("Autenticação recusada pelo backend (HTTP 401). Entre novamente.");
    if (status === 403) throw new Error("Backend autenticou a conta, mas recusou a autorização (HTTP 403).");
    if (status === 404) throw new Error("Rota de validação de acesso não encontrada (HTTP 404). Verifique o servidor.");
    if (status === 500) throw new Error("Erro interno ao validar acesso (HTTP 500).");
    if (status !== undefined && [502, 503, 504].includes(status)) {
      throw new Error(`Backend indisponível (HTTP ${status}).`);
    }
    if (status !== undefined && status >= 500) throw new Error(`Falha do backend (HTTP ${status}).`);
    if (status === undefined) throw new Error("Falha de rede ou infraestrutura ao validar o acesso.");
    throw new Error(`Falha na validação de acesso (HTTP ${status}).`);
  }
};
