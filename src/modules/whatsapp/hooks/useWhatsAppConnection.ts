import { useCallback, useEffect, useState } from 'react';
import { whatsappApi } from '../services/whatsappApi';
import type {
  WhatsAppAutomation,
  WhatsAppContact,
  WhatsAppMessage,
  WhatsAppQrPayload,
  WhatsAppSendInput,
  WhatsAppSession,
} from '../types';

type UseWhatsAppConnectionOptions = {
  autoLoad?: boolean;
};

type RunOptions = {
  clearError?: boolean;
};

export const useWhatsAppConnection = (options: UseWhatsAppConnectionOptions = {}) => {
  const { autoLoad = false } = options;
  const [session, setSession] = useState<WhatsAppSession | null>(null);
  const [automation, setAutomation] = useState<WhatsAppAutomation | null>(null);
  const [qrCode, setQrCode] = useState<WhatsAppQrPayload | null>(null);
  const [messages, setMessages] = useState<WhatsAppMessage[]>([]);
  const [contacts, setContacts] = useState<WhatsAppContact[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const run = useCallback(async <T,>(action: () => Promise<T>, runOptions: RunOptions = {}) => {
    setLoading(true);
    if (runOptions.clearError !== false) {
      setError(null);
    }
    try {
      return await action();
    } catch (caught) {
      const message = caught instanceof Error ? caught.message : 'Erro inesperado no modulo WhatsApp.';
      setError(message);
      throw caught;
    } finally {
      setLoading(false);
    }
  }, []);

  const refreshStatus = useCallback(async () => run(async () => {
    const response = await whatsappApi.status();
    setSession(response.session);
    setAutomation(response.automation);
    return response;
  }), [run]);

  const refreshQrCode = useCallback(async () => run(async () => {
    const response = await whatsappApi.qrcode();
    setQrCode(response.qrCode);
    return response.qrCode;
  }), [run]);

  const connect = useCallback(async () => run(async () => {
    const response = await whatsappApi.connect();
    setSession(response.session);
    await refreshQrCode().catch(() => null);
    return response.session;
  }), [refreshQrCode, run]);

  const disconnect = useCallback(async (preserveSessionData = false) => run(async () => {
    const response = await whatsappApi.disconnect(preserveSessionData);
    setSession(response.session);
    setQrCode(null);
    return response.session;
  }), [run]);

  const reconnect = useCallback(async () => run(async () => {
    const response = await whatsappApi.reconnect();
    setSession(response.session);
    await refreshQrCode().catch(() => null);
    return response.session;
  }), [refreshQrCode, run]);

  const sendMessage = useCallback(async (input: WhatsAppSendInput) => run(async () => {
    const response = await whatsappApi.send(input);
    setMessages((current) => [...current, response.message]);
    return response.message;
  }), [run]);

  const refreshMessages = useCallback(async (limit?: number, runOptions?: RunOptions) => run(async () => {
    const response = await whatsappApi.messages(limit);
    setMessages(response.messages);
    return response.messages;
  }, runOptions), [run]);

  const refreshContacts = useCallback(async (limit?: number) => run(async () => {
    const response = await whatsappApi.contacts(limit);
    setContacts(response.contacts);
    return response.contacts;
  }), [run]);

  const updateAutomation = useCallback(async (input: Partial<Pick<WhatsAppAutomation, 'enabled' | 'aiEnabled' | 'autoReplyEnabled' | 'appointmentEnabled'>>) => run(async () => {
    const response = await whatsappApi.updateAutomation(input);
    setAutomation(response.automation);
    return response.automation;
  }), [run]);

  useEffect(() => {
    if (!autoLoad) return;
    void refreshStatus().catch(() => undefined);
  }, [autoLoad, refreshStatus]);

  return {
    automation,
    connect,
    contacts,
    disconnect,
    error,
    loading,
    messages,
    qrCode,
    reconnect,
    refreshContacts,
    refreshMessages,
    refreshQrCode,
    refreshStatus,
    sendMessage,
    session,
    updateAutomation,
  };
};
