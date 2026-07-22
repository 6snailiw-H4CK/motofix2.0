import { Dispatch, SetStateAction, useEffect, useState } from 'react';
import { isBefore, parseISO } from 'date-fns';
import { User } from 'firebase/auth';
import { collection, doc, onSnapshot, query, setDoc, updateDoc } from 'firebase/firestore';
import { db } from '../firebase';
import { queueFirestoreVoidWrite } from '../services/firestoreOfflineQueue';
import { getLocalCashLaunches, LOCAL_CASH_LAUNCHES_UPDATED_EVENT } from '../services/localCashLaunchRepository';
import { isSoftDeleted } from '../services/softDelete';
import {
  Appointment,
  CashRegisterLaunch,
  Client,
  ExpenseRecord,
  FiscalCompany,
  FiscalInvoice,
  FiscalLog,
  MaintenanceRecord,
  MessageLog,
  OperationalLog,
  ProductCatalogItem,
  Settings,
  UserProfile,
  Warranty
} from '../types';
import { DEFAULT_SETTINGS } from '../constants/appDefaults';

export type CollectionListenerIssue = {
  key: string;
  label: string;
  message: string;
  at: string;
};

type UseUserCollectionsParams = {
  user: User | null;
  userProfile: UserProfile | null;
  isNewUser: boolean | null;
};

type UseUserCollectionsResult = {
  allUsers: UserProfile[];
  clients: Client[];
  maintenances: MaintenanceRecord[];
  warranties: Warranty[];
  settings: Settings;
  setSettings: Dispatch<SetStateAction<Settings>>;
  settingsLoaded: boolean;
  messageLogs: MessageLog[];
  appointments: Appointment[];
  expenseEntries: ExpenseRecord[];
  productCatalog: ProductCatalogItem[];
  cashLaunches: CashRegisterLaunch[];
  fiscalCompanies: FiscalCompany[];
  fiscalInvoices: FiscalInvoice[];
  fiscalLogs: FiscalLog[];
  operationalLogs: OperationalLog[];
  collectionListenerIssues: CollectionListenerIssue[];
};

const buildSettings = (userId: string, data: Record<string, any>): Settings => ({
  userId,
  whatsappTemplate: data.whatsappTemplate || DEFAULT_SETTINGS.whatsappTemplate,
  oilTypes: data.oilTypes || DEFAULT_SETTINGS.oilTypes,
  serviceTypes: Array.isArray(data.serviceTypes) ? data.serviceTypes : [],
  disabledDefaultServiceTypes: Array.isArray(data.disabledDefaultServiceTypes) ? data.disabledDefaultServiceTypes : [],
  warrantyCategories: data.warrantyCategories || DEFAULT_SETTINGS.warrantyCategories,
  businessName: data.businessName || '',
  businessPhone: data.businessPhone || '',
  businessEmail: data.businessEmail || '',
  businessInstagram: data.businessInstagram || '',
  businessAddress: data.businessAddress || '',
  isProfileComplete: data.isProfileComplete || false
});

const buildInitialSettings = (userId: string, isNewUser: boolean | null): Settings => ({
  ...DEFAULT_SETTINGS,
  userId,
  businessName: '',
  isProfileComplete: !isNewUser
});

const mapActiveDocuments = <T,>(documents: Array<{ id: string; data: () => Record<string, unknown> }>): T[] => (
  documents.flatMap((documentSnapshot) => {
    const data = documentSnapshot.data();
    return isSoftDeleted(data) ? [] : [{ id: documentSnapshot.id, ...data } as T];
  })
);

const getListenerErrorMessage = (error: unknown) => (
  error instanceof Error ? error.message : String(error)
);

const isQuotaLikeListenerError = (error: unknown) => {
  const message = getListenerErrorMessage(error).toLowerCase();
  return message.includes('429')
    || message.includes('resource-exhausted')
    || message.includes('quota exceeded')
    || message.includes('too many requests');
};

const mergeCashLaunches = (remoteLaunches: CashRegisterLaunch[]) => {
  const localLaunches = getLocalCashLaunches();
  const combined = [...remoteLaunches, ...localLaunches];
  const byId = new Map<string, CashRegisterLaunch>();

  combined.forEach((launch) => {
    if (!launch?.id) return;
    if (isSoftDeleted(launch)) return;
    const existing = byId.get(launch.id);
    if (!existing || new Date(launch.updatedAt || launch.createdAt).getTime() >= new Date(existing.updatedAt || existing.createdAt).getTime()) {
      byId.set(launch.id, launch);
    }
  });

  return Array.from(byId.values()).sort((left, right) => {
    const leftTime = new Date(left.updatedAt || left.createdAt).getTime();
    const rightTime = new Date(right.updatedAt || right.createdAt).getTime();
    return rightTime - leftTime;
  });
};

export function useUserCollections({
  user,
  userProfile,
  isNewUser
}: UseUserCollectionsParams): UseUserCollectionsResult {
  const [allUsers, setAllUsers] = useState<UserProfile[]>([]);
  const [clients, setClients] = useState<Client[]>([]);
  const [maintenances, setMaintenances] = useState<MaintenanceRecord[]>([]);
  const [warranties, setWarranties] = useState<Warranty[]>([]);
  const [settings, setSettings] = useState<Settings>(DEFAULT_SETTINGS);
  const [settingsLoaded, setSettingsLoaded] = useState(false);
  const [messageLogs, setMessageLogs] = useState<MessageLog[]>([]);
  const [appointments, setAppointments] = useState<Appointment[]>([]);
  const [expenseEntries, setExpenseEntries] = useState<ExpenseRecord[]>([]);
  const [productCatalog, setProductCatalog] = useState<ProductCatalogItem[]>([]);
  const [cashLaunches, setCashLaunches] = useState<CashRegisterLaunch[]>([]);
  const [fiscalCompanies, setFiscalCompanies] = useState<FiscalCompany[]>([]);
  const [fiscalInvoices, setFiscalInvoices] = useState<FiscalInvoice[]>([]);
  const [fiscalLogs, setFiscalLogs] = useState<FiscalLog[]>([]);
  const [operationalLogs, setOperationalLogs] = useState<OperationalLog[]>([]);
  const [collectionListenerIssuesByKey, setCollectionListenerIssuesByKey] = useState<Record<string, CollectionListenerIssue>>({});

  useEffect(() => {
    const syncLocalCashLaunches = () => {
      setCashLaunches((currentLaunches) => {
        const remoteLaunches = currentLaunches.filter((launch) => !getLocalCashLaunches().some((localLaunch) => localLaunch.id === launch.id));
        return mergeCashLaunches(remoteLaunches);
      });
    };

    if (typeof window !== 'undefined') {
      window.addEventListener(LOCAL_CASH_LAUNCHES_UPDATED_EVENT, syncLocalCashLaunches);
    }

    syncLocalCashLaunches();

    return () => {
      if (typeof window !== 'undefined') {
        window.removeEventListener(LOCAL_CASH_LAUNCHES_UPDATED_EVENT, syncLocalCashLaunches);
      }
    };
  }, []);

  useEffect(() => {
    const hasExpiredSubscription = userProfile?.subscriptionExpiresAt
      ? isBefore(parseISO(userProfile.subscriptionExpiresAt), new Date())
      : false;

    if (!user || !userProfile) {
      setCollectionListenerIssuesByKey({});
      return;
    }

    setCollectionListenerIssuesByKey({});

    const clearListenerIssue = (key: string) => {
      setCollectionListenerIssuesByKey((current) => {
        if (!current[key]) return current;
        const next = { ...current };
        delete next[key];
        return next;
      });
    };

    const recordListenerIssue = (key: string, label: string, error: unknown) => {
      if (isQuotaLikeListenerError(error)) {
        console.warn(`${label} listener quota issue:`, error);
        return;
      }
      console.error(`${label} listener error:`, error);
      setCollectionListenerIssuesByKey((current) => ({
        ...current,
        [key]: {
          key,
          label,
          message: getListenerErrorMessage(error),
          at: new Date().toISOString(),
        },
      }));
    };

    const clientsQuery = query(collection(db, 'users', user.uid, 'clients'));
    const unsubscribeClients = onSnapshot(clientsQuery, (snapshot) => {
      clearListenerIssue('clients');
      const clientsData = mapActiveDocuments<Client>(snapshot.docs);
      setClients(clientsData);
    }, (error) => {
      recordListenerIssue('clients', 'Clientes', error);
    });

    const maintenanceQuery = query(collection(db, 'users', user.uid, 'maintenances'));
    const unsubscribeMaintenances = onSnapshot(maintenanceQuery, (snapshot) => {
      clearListenerIssue('maintenances');
      const maintenanceData = mapActiveDocuments<MaintenanceRecord>(snapshot.docs);
      setMaintenances(maintenanceData.sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime()));
    }, (error) => {
      recordListenerIssue('maintenances', 'Historico de servicos', error);
    });

    const warrantyQuery = query(collection(db, 'users', user.uid, 'warranties'));
    const unsubscribeWarranties = onSnapshot(warrantyQuery, (snapshot) => {
      clearListenerIssue('warranties');
      const warrantyData = mapActiveDocuments<Warranty>(snapshot.docs);
      setWarranties(warrantyData.sort((a, b) => b.warrantyNumber - a.warrantyNumber));
    }, (error) => {
      recordListenerIssue('warranties', 'Garantias', error);
    });

    const appointmentsQuery = query(collection(db, 'users', user.uid, 'appointments'));
    const unsubscribeAppointments = onSnapshot(appointmentsQuery, (snapshot) => {
      clearListenerIssue('appointments');
      const appointmentData = mapActiveDocuments<Appointment>(snapshot.docs);
      setAppointments(appointmentData.sort((a, b) => a.scheduledDate.localeCompare(b.scheduledDate)));
    }, (error) => {
      recordListenerIssue('appointments', 'Agenda', error);
    });

    const expensesQuery = query(collection(db, 'users', user.uid, 'expenses'));
    const unsubscribeExpenses = onSnapshot(expensesQuery, (snapshot) => {
      clearListenerIssue('expenses');
      const expensesData = mapActiveDocuments<ExpenseRecord>(snapshot.docs);
      setExpenseEntries(expensesData.sort((a, b) => b.date.localeCompare(a.date)));
    }, (error) => {
      recordListenerIssue('expenses', 'Gastos', error);
    });

    const productsQuery = query(collection(db, 'users', user.uid, 'products'));
    const unsubscribeProducts = onSnapshot(productsQuery, (snapshot) => {
      clearListenerIssue('products');
      const productsData = mapActiveDocuments<ProductCatalogItem>(snapshot.docs);
      setProductCatalog(productsData.sort((a, b) => a.description.localeCompare(b.description)));
    }, (error) => {
      recordListenerIssue('products', 'Mercadorias', error);
    });

    const cashLaunchesQuery = query(collection(db, 'users', user.uid, 'cash_launches'));
    const unsubscribeCashLaunches = onSnapshot(cashLaunchesQuery, (snapshot) => {
      clearListenerIssue('cash_launches');
      const launchesData = mapActiveDocuments<CashRegisterLaunch>(snapshot.docs);
      setCashLaunches(mergeCashLaunches(launchesData));
    }, (error) => {
      recordListenerIssue('cash_launches', 'Lancamentos caixa', error);
      setCashLaunches(mergeCashLaunches([]));
    });

    const fiscalCompaniesQuery = query(collection(db, 'users', user.uid, 'fiscal_companies'));
    const unsubscribeFiscalCompanies = onSnapshot(fiscalCompaniesQuery, (snapshot) => {
      clearListenerIssue('fiscal_companies');
      const companiesData = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as FiscalCompany));
      setFiscalCompanies(companiesData.sort((a, b) => a.legalName.localeCompare(b.legalName)));
    }, (error) => {
      recordListenerIssue('fiscal_companies', 'Empresas fiscais', error);
    });

    const fiscalInvoicesQuery = query(collection(db, 'users', user.uid, 'fiscal_invoices'));
    const unsubscribeFiscalInvoices = onSnapshot(fiscalInvoicesQuery, (snapshot) => {
      clearListenerIssue('fiscal_invoices');
      const invoicesData = mapActiveDocuments<FiscalInvoice>(snapshot.docs);
      setFiscalInvoices(invoicesData.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()));
    }, (error) => {
      recordListenerIssue('fiscal_invoices', 'Notas fiscais', error);
    });

    const fiscalLogsQuery = query(collection(db, 'users', user.uid, 'fiscal_logs'));
    const unsubscribeFiscalLogs = onSnapshot(fiscalLogsQuery, (snapshot) => {
      clearListenerIssue('fiscal_logs');
      const logsData = mapActiveDocuments<FiscalLog>(snapshot.docs);
      setFiscalLogs(logsData.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()));
    }, (error) => {
      recordListenerIssue('fiscal_logs', 'Logs fiscais', error);
    });

    const operationalLogsQuery = query(collection(db, 'users', user.uid, 'operational_logs'));
    const unsubscribeOperationalLogs = onSnapshot(operationalLogsQuery, (snapshot) => {
      clearListenerIssue('operational_logs');
      const logsData = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as OperationalLog));
      setOperationalLogs(logsData.sort((a, b) => b.timestamp.localeCompare(a.timestamp)).slice(0, 50));
    }, (error) => {
      recordListenerIssue('operational_logs', 'Logs operacionais', error);
    });

    const settingsDoc = doc(db, 'users', user.uid, 'settings', 'config');
    const unsubscribeSettings = onSnapshot(settingsDoc, (snapshot) => {
      clearListenerIssue('settings');
      if (snapshot.exists()) {
        const data = snapshot.data();
        const updatedSettings = buildSettings(user.uid, data);
        setSettings(updatedSettings);
        setSettingsLoaded(true);

        const needsUpdate = !data.oilTypes || !data.warrantyCategories || data.isProfileComplete === undefined;
        if (needsUpdate) {
          queueFirestoreVoidWrite(
            () => updateDoc(settingsDoc, {
              oilTypes: updatedSettings.oilTypes,
              warrantyCategories: updatedSettings.warrantyCategories,
              isProfileComplete: updatedSettings.isProfileComplete
            }),
            'Atualizar configuracoes padrao'
          ).catch(e => console.error('Error updating settings with defaults', e));
        }
      } else {
        const initialSettings = buildInitialSettings(user.uid, isNewUser);
        queueFirestoreVoidWrite(
          () => setDoc(settingsDoc, initialSettings),
          'Criar configuracoes iniciais'
        ).catch(error => console.error('Error creating settings', error));
        setSettings(initialSettings);
        setSettingsLoaded(true);
      }
    }, (error) => {
      recordListenerIssue('settings', 'Configuracoes', error);
      setSettings((currentSettings) => (
        currentSettings.userId === user.uid
          ? currentSettings
          : {
            ...DEFAULT_SETTINGS,
            userId: user.uid,
            businessName: '',
            isProfileComplete: false
          }
      ));
      setSettingsLoaded(true);
    });

    let unsubscribeUsers = () => {};
    if (userProfile?.role === 'admin' && userProfile?.isActive) {
      const usersQuery = collection(db, 'users');
      unsubscribeUsers = onSnapshot(usersQuery, (snapshot) => {
        clearListenerIssue('admin_users');
        const usersData = snapshot.docs.map(doc => doc.data() as UserProfile);
        setAllUsers(usersData.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()));
      }, (error) => {
        if (error instanceof Error && error.message?.includes('permission')) {
          clearListenerIssue('admin_users');
          setAllUsers([]);
          return;
        }
        recordListenerIssue('admin_users', 'Usuarios administrativos', error);
      });
    }

    const messageLogsQuery = query(collection(db, 'users', user.uid, 'message_logs'));
    const unsubscribeMessageLogs = onSnapshot(messageLogsQuery, (snapshot) => {
      clearListenerIssue('message_logs');
      const logsData = mapActiveDocuments<MessageLog>(snapshot.docs);
      setMessageLogs(logsData.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()));
    }, (error) => {
      recordListenerIssue('message_logs', 'Avisos enviados', error);
    });

    return () => {
      unsubscribeClients();
      unsubscribeMaintenances();
      unsubscribeWarranties();
      unsubscribeAppointments();
      unsubscribeExpenses();
      unsubscribeProducts();
      unsubscribeCashLaunches();
      unsubscribeFiscalCompanies();
      unsubscribeFiscalInvoices();
      unsubscribeFiscalLogs();
      unsubscribeOperationalLogs();
      unsubscribeSettings();
      unsubscribeUsers();
      unsubscribeMessageLogs();
    };
  }, [user, userProfile, isNewUser]);

  return {
    allUsers,
    clients,
    maintenances,
    warranties,
    settings,
    setSettings,
    settingsLoaded,
    messageLogs,
    appointments,
    expenseEntries,
    productCatalog,
    cashLaunches,
    fiscalCompanies,
    fiscalInvoices,
    fiscalLogs,
    operationalLogs,
    collectionListenerIssues: Object.values(collectionListenerIssuesByKey).sort((a, b) => b.at.localeCompare(a.at))
  };
}
