import axios from 'axios';

const STRIPE_API_URL = import.meta.env.VITE_STRIPE_API_URL || 'http://localhost:3001';

interface CreateCheckoutSessionParams {
  userId: string;
  userEmail: string;
  priceId: string;
}

interface CreateCheckoutSessionResponse {
  clientSecret: string;
  sessionId: string;
}

/**
 * Cria uma sessão de checkout no Stripe retornando o client secret
 * para inicializar o Payment Element
 */
export const createCheckoutSession = async ({
  userId,
  userEmail,
  priceId,
}: CreateCheckoutSessionParams): Promise<CreateCheckoutSessionResponse> => {
  try {
    const response = await axios.post(
      `${STRIPE_API_URL}/api/payments/create-checkout`,
      {
        userId,
        userEmail,
        priceId,
      },
      {
        headers: {
          'Content-Type': 'application/json',
        },
      }
    );

    return response.data;
  } catch (error) {
    console.error('Erro ao criar sessão de checkout:', error);
    throw error;
  }
};

/**
 * Verifica o status do pagamento
 */
export const checkPaymentStatus = async (
  sessionId: string
): Promise<{ status: string; paid: boolean }> => {
  try {
    const response = await axios.get(
      `${STRIPE_API_URL}/api/payments/session/${sessionId}`
    );

    return response.data;
  } catch (error) {
    console.error('Erro ao verificar status do pagamento:', error);
    throw error;
  }
};

/**
 * Obtém o Stripe publishable key
 */
export const getStripePublishableKey = async (): Promise<string> => {
  try {
    const response = await axios.get(
      `${STRIPE_API_URL}/api/payments/publishable-key`
    );

    return response.data.publishableKey;
  } catch (error) {
    console.error('Erro ao obter Stripe key:', error);
    throw error;
  }
};
