import { format, parseISO } from 'date-fns';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { toast as sonnerToast } from 'sonner';
import { AlertService } from '../services/alertService';
import type { Client } from '../types';

type UseNotificationsParams = {
  clients: Client[];
};

const playNotificationSound = () => {
  if (typeof window === 'undefined') return;

  try {
    const AudioContextClass = window.AudioContext || (window as typeof window & {
      webkitAudioContext?: typeof AudioContext;
    }).webkitAudioContext;
    if (!AudioContextClass) return;

    const audioContext = new AudioContextClass();
    const oscillator = audioContext.createOscillator();
    const gain = audioContext.createGain();
    oscillator.type = 'sine';
    oscillator.frequency.setValueAtTime(880, audioContext.currentTime);
    gain.gain.setValueAtTime(0.08, audioContext.currentTime);
    oscillator.connect(gain);
    gain.connect(audioContext.destination);
    oscillator.start();
    oscillator.stop(audioContext.currentTime + 0.14);
  } catch {
    // Ignore audio errors in unsupported browsers.
  }
};

export const useNotifications = ({ clients }: UseNotificationsParams) => {
  const [notificationsSupported, setNotificationsSupported] = useState(false);
  const [notificationPermission, setNotificationPermission] = useState<NotificationPermission>('default');
  const [swRegistration, setSwRegistration] = useState<ServiceWorkerRegistration | null>(null);
  const [notifiedClients, setNotifiedClients] = useState<Set<string>>(new Set());

  useEffect(() => {
    if (typeof window === 'undefined') return;

    const supported = 'Notification' in window;
    setNotificationsSupported(supported);
    if (supported) {
      setNotificationPermission(window.Notification.permission);
    }

    if ('serviceWorker' in navigator) {
      navigator.serviceWorker.register('/sw.js')
        .then((registration) => {
          setSwRegistration(registration);
          console.log('Service worker registrado em:', registration.scope);
        })
        .catch((error) => {
          console.warn('Falha ao registrar service worker:', error);
        });
    }
  }, []);

  const requestNotificationPermission = useCallback(async () => {
    if (!notificationsSupported) {
      sonnerToast.error('Notifica\u00e7\u00f5es n\u00e3o suportadas neste navegador.');
      return;
    }

    try {
      const permission = await Notification.requestPermission();
      setNotificationPermission(permission);
      if (permission === 'granted') {
        sonnerToast.success('Notifica\u00e7\u00f5es ativadas.');
      } else if (permission === 'denied') {
        sonnerToast.error('Permiss\u00e3o negada. Ative notifica\u00e7\u00f5es nas configura\u00e7\u00f5es do navegador.');
      }
    } catch {
      sonnerToast.error('N\u00e3o foi poss\u00edvel solicitar permiss\u00e3o de notifica\u00e7\u00f5es.');
    }
  }, [notificationsSupported]);

  const sendClientReminderNotification = useCallback(async (client: Client) => {
    if (!notificationsSupported || notificationPermission !== 'granted') return;

    const nextDate = client.nextMaintenanceDate ? format(parseISO(client.nextMaintenanceDate), 'dd/MM/yyyy') : 'em breve';
    const notificationOptions: NotificationOptions & { renotify?: boolean } = {
      body: `Cliente ${client.name} tem manuten\u00e7\u00e3o agendada para ${nextDate}.`,
      icon: '/motofix-logo.svg',
      tag: `motofix-reminder-${client.id}`,
      renotify: true,
      data: { url: '/' },
    };

    if (swRegistration?.showNotification) {
      try {
        await swRegistration.showNotification('Lembrete de manuten\u00e7\u00e3o', notificationOptions);
      } catch (error) {
        console.warn('Erro ao exibir notifica\u00e7\u00e3o via service worker:', error);
        new Notification('Lembrete de manuten\u00e7\u00e3o', notificationOptions);
      }
    } else {
      const notification = new Notification('Lembrete de manuten\u00e7\u00e3o', notificationOptions);
      notification.onclick = () => window.focus();
    }
  }, [notificationPermission, notificationsSupported, swRegistration]);

  const pendingAlerts = useMemo(() => AlertService.getPendingAlerts(clients), [clients]);

  const dailyPendingAlerts = useMemo(() => AlertService.getDailyPendingAlerts(clients), [clients]);

  const uniqueAlertClients = useMemo(() => {
    const combined = [...pendingAlerts, ...dailyPendingAlerts];
    return Array.from(new Map(combined.map(client => [client.id, client])).values());
  }, [dailyPendingAlerts, pendingAlerts]);

  useEffect(() => {
    if (!notificationsSupported || notificationPermission !== 'granted') return;
    if (uniqueAlertClients.length === 0) return;

    const clientsToNotify = uniqueAlertClients.filter(client => !notifiedClients.has(client.id));
    if (clientsToNotify.length === 0) return;

    playNotificationSound();
    clientsToNotify.forEach((client) => {
      void sendClientReminderNotification(client);
      try {
        sonnerToast(`${client.name} - ${client.nextMaintenanceDate ? format(parseISO(client.nextMaintenanceDate), 'dd/MM') : 'em breve'}`);
      } catch {
        // Ignore toast errors.
      }
    });
    setNotifiedClients(prev => new Set([...Array.from(prev), ...clientsToNotify.map(client => client.id)]));
  }, [
    notificationPermission,
    notificationsSupported,
    notifiedClients,
    sendClientReminderNotification,
    uniqueAlertClients,
  ]);

  return {
    alertCount: uniqueAlertClients.length,
    dailyPendingAlerts,
    requestNotificationPermission,
  };
};
