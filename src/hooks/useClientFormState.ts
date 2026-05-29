import { format } from 'date-fns';
import { useCallback, useEffect, useState } from 'react';
import { canonicalServiceType } from '../lib/serviceTypes';
import type { Client, MaintenanceRecord } from '../types';

type UseClientFormStateParams = {
  clients: Client[];
  defaultServiceType: string;
  isClientFormOpen: boolean;
  maintenances: MaintenanceRecord[];
};

const normalizeClientName = (name: string): string => name.toLowerCase().trim();

export const useClientFormState = ({
  clients,
  defaultServiceType,
  isClientFormOpen,
  maintenances,
}: UseClientFormStateParams) => {
  const [editingClient, setEditingClient] = useState<Client | null>(null);
  const [clientNameInput, setClientNameInput] = useState('');
  const [clientSuggestions, setClientSuggestions] = useState<Client[]>([]);
  const [isCreatingService, setIsCreatingService] = useState(false);
  const [serviceType, setServiceTypeState] = useState(defaultServiceType);

  const setServiceType = useCallback((value: string) => {
    setServiceTypeState(canonicalServiceType(value));
  }, []);

  const enrichClientForEdit = useCallback((client: Client): Client => {
    const clientMaintenance = maintenances
      .filter((maintenance) => maintenance.clientId === client.id)
      .sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime())[0];
    const finalServiceValue =
      clientMaintenance?.serviceValue ||
      client.lastServiceValue ||
      client.serviceValue ||
      client.oilPrice ||
      0;
    const valorPago = clientMaintenance?.valorPago ?? client.valorPago ?? 0;

    return {
      ...client,
      serviceValue: finalServiceValue,
      valorPago,
      statusPagamento: clientMaintenance?.statusPagamento || client.statusPagamento || 'Pago',
      saldoDevedor: clientMaintenance?.saldoDevedor ?? Math.max(0, finalServiceValue - valorPago),
      lastMaintenanceDate: clientMaintenance?.date || client.lastMaintenanceDate || format(new Date(), "yyyy-MM-dd'T'HH:mm:ss'Z'"),
      lastServiceType: clientMaintenance?.serviceType || client.lastServiceType,
      lastServiceNotes: clientMaintenance?.notes || client.lastServiceNotes || '',
      oilType: clientMaintenance?.oilType || client.oilType || '10W30',
    };
  }, [maintenances]);

  const handleClientNameChange = useCallback((value: string) => {
    setClientNameInput(value);

    if (value.length > 0) {
      const normalizedInput = normalizeClientName(value);
      setClientSuggestions(clients.filter((client) => normalizeClientName(client.name).includes(normalizedInput)));
      return;
    }

    setClientSuggestions([]);
  }, [clients]);

  const selectClientSuggestion = useCallback((client: Client) => {
    setClientNameInput(client?.name || '');
    setClientSuggestions([]);
    setEditingClient(enrichClientForEdit(client));
  }, [enrichClientForEdit]);

  const startNewClient = useCallback(() => {
    setEditingClient(null);
    setClientNameInput('');
    setClientSuggestions([]);
    setIsCreatingService(true);
    setServiceTypeState(defaultServiceType);
  }, [defaultServiceType]);

  const startScheduleClient = useCallback(() => {
    setEditingClient(null);
    setClientNameInput('');
    setClientSuggestions([]);
    setIsCreatingService(false);
    setServiceTypeState(defaultServiceType);
  }, [defaultServiceType]);

  const startEditClient = useCallback((client: Client) => {
    setClientNameInput('');
    setClientSuggestions([]);
    setIsCreatingService(false);
    setEditingClient(enrichClientForEdit(client));
  }, [enrichClientForEdit]);

  const resetAfterSave = useCallback(() => {
    setEditingClient(null);
    setClientNameInput('');
    setClientSuggestions([]);
    setIsCreatingService(false);
    setServiceTypeState(defaultServiceType);
  }, [defaultServiceType]);

  useEffect(() => {
    if (!isClientFormOpen) return;

    if (!editingClient) {
      setServiceTypeState(defaultServiceType);
      return;
    }

    if (isCreatingService) {
      setServiceTypeState((current) => canonicalServiceType(current || defaultServiceType));
      return;
    }

    const latest = maintenances
      .filter((maintenance) => maintenance.clientId === editingClient.id)
      .sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime())[0];
    setServiceTypeState(canonicalServiceType(latest?.serviceType || editingClient.lastServiceType || defaultServiceType));
  }, [defaultServiceType, editingClient, isClientFormOpen, isCreatingService, maintenances]);

  return {
    clientNameInput,
    clientSuggestions,
    editingClient,
    handleClientNameChange,
    isCreatingService,
    resetAfterSave,
    selectClientSuggestion,
    serviceType,
    setServiceType,
    startEditClient,
    startNewClient,
    startScheduleClient,
  };
};
