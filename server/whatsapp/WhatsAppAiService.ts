import type { WhatsAppAiReplyContext } from "./types";

type OpenAiChatResponse = {
  choices?: Array<{
    message?: {
      content?: string;
    };
  }>;
};

const MAX_INPUT_LENGTH = Number(process.env.WHATSAPP_AI_MAX_INPUT_LENGTH || 2500);
const MAX_REPLY_LENGTH = Number(process.env.WHATSAPP_AI_MAX_REPLY_LENGTH || 900);

const getAiConfig = () => {
  const apiKey = process.env.WHATSAPP_AI_API_KEY || process.env.OPENAI_API_KEY;
  const model = process.env.WHATSAPP_AI_MODEL || process.env.OPENAI_MODEL || "gpt-4o-mini";
  const endpoint = process.env.WHATSAPP_AI_API_URL || "https://api.openai.com/v1/chat/completions";
  return { apiKey, endpoint, model };
};

const trimReply = (value: string) => {
  const normalized = value.replace(/\s+/g, " ").trim();
  return normalized.length > MAX_REPLY_LENGTH ? `${normalized.slice(0, MAX_REPLY_LENGTH - 3)}...` : normalized;
};

export const whatsAppAiService = {
  isConfigured() {
    return Boolean(getAiConfig().apiKey);
  },

  async generateReply(context: WhatsAppAiReplyContext) {
    const { apiKey, endpoint, model } = getAiConfig();
    const inboundText = String(context.inboundText || "").trim().slice(0, MAX_INPUT_LENGTH);

    if (!apiKey || !inboundText) return null;

    const response = await fetch(endpoint, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model,
        temperature: 0.4,
        max_tokens: 220,
        messages: [
          {
            role: "system",
            content: [
              "Voce e o atendente virtual do MotoFix para uma oficina mecanica de motos.",
              "Responda em portugues do Brasil, com tom profissional e direto.",
              "Nao invente valores, prazos, horarios ou servicos que nao foram informados.",
              "Quando faltar contexto, peca uma informacao simples ou diga que a equipe vai confirmar.",
              "Nunca prometa diagnostico tecnico definitivo por mensagem.",
            ].join(" "),
          },
          {
            role: "user",
            content: `Cliente: ${context.contactName || context.from}\nMensagem: ${inboundText}`,
          },
        ],
      }),
    });

    if (!response.ok) {
      const text = await response.text().catch(() => "");
      throw new Error(`Falha na IA WhatsApp (${response.status}): ${text.slice(0, 300)}`);
    }

    const payload = (await response.json()) as OpenAiChatResponse;
    const reply = payload.choices?.[0]?.message?.content;
    return reply ? trimReply(reply) : null;
  },
};
