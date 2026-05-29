import { Dispatch, SetStateAction, useEffect, useState } from 'react';
import { User } from 'firebase/auth';
import { collection, doc, onSnapshot, query, setDoc, updateDoc } from 'firebase/firestore';
import { db } from '../firebase';
import {
  Appointment,
  CashRegisterLaunch,
  Client,
  ExpenseRecord,
  MaintenanceRecord,
  MessageLog,
  ProductCatalogItem,
  Settings,
  UserProfile,
  Warranty
} from '../types';
import { DEFAULT_SETTINGS } from '../constants/appDefaults';

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

  useEffect(() => {
    if (!user || !userProfile?.isActive) return;

    const clientsQuery = query(collection(db, 'users', user.uid, 'clients'));
    const unsubscribeClients = onSnapshot(clientsQuery, (snapshot) => {
      const clientsData = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as Client));
      setClients(clientsData);
    }, (error) => {
      console.error('Clients listener error:', error);
      setClients([]);
    });

    const maintenanceQuery = query(collection(db, 'users', user.uid, 'maintenances'));
    const unsubscribeMaintenances = onSnapshot(maintenanceQuery, (snapshot) => {
      const maintenanceData = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as MaintenanceRecord));
      setMaintenances(maintenanceData.sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime()));
    }, (error) => {
      console.error('Maintenances listener error:', error);
      setMaintenances([]);
    });

    const warrantyQuery = query(collection(db, 'users', user.uid, 'warranties'));
    const unsubscribeWarranties = onSnapshot(warrantyQuery, (snapshot) => {
      const warrantyData = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as Warranty));
      setWarranties(warrantyData.sort((a, b) => b.warrantyNumber - a.warrantyNumber));
    }, (error) => {
      console.error('Warranties listener error:', error);
      setWarranties([]);
    });

    const appointmentsQuery = query(collection(db, 'users', user.uid, 'appointments'));
    const unsubscribeAppointments = onSnapshot(appointmentsQuery, (snapshot) => {
      const appointmentData = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as Appointment));
      setAppointments(appointmentData.sort((a, b) => a.scheduledDate.localeCompare(b.scheduledDate)));
    }, (error) => {
      console.error('Appointments listener error:', error);
      setAppointments([]);
    });

    const expensesQuery = query(collection(db, 'users', user.uid, 'expenses'));
    const unsubscribeExpenses = onSnapshot(expensesQuery, (snapshot) => {
      const expensesData = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as ExpenseRecord));
      setExpenseEntries(expensesData.sort((a, b) => b.date.localeCompare(a.date)));
    }, (error) => {
      console.error('Expenses listener error:', error);
      setExpenseEntries([]);
    });

    const productsQuery = query(collection(db, 'users', user.uid, 'products'));
    const unsubscribeProducts = onSnapshot(productsQuery, (snapshot) => {
      const productsData = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as ProductCatalogItem));
      setProductCatalog(productsData.sort((a, b) => a.description.localeCompare(b.description)));
    }, (error) => {
      console.error('Products listener error:', error);
      setProductCatalog([]);
    });

    const cashLaunchesQuery = query(collection(db, 'users', user.uid, 'cash_launches'));
    const unsubscribeCashLaunches = onSnapshot(cashLaunchesQuery, (snapshot) => {
      const launchesData = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as CashRegisterLaunch));
      setCashLaunches(launchesData.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()));
    }, (error) => {
      console.error('Cash launches listener error:', error);
      setCashLaunches([]);
    });

    const settingsDoc = doc(db, 'users', user.uid, 'settings', 'config');
    const unsubscribeSettings = onSnapshot(settingsDoc, (snapshot) => {
      if (snapshot.exists()) {
        const data = snapshot.data();
        const updatedSettings = buildSettings(user.uid, data);
        setSettings(updatedSettings);
        setSettingsLoaded(true);

        const needsUpdate = !data.oilTypes || !data.warrantyCategories || data.isProfileComplete === undefined;
        if (needsUpdate) {
          updateDoc(settingsDoc, {
            oilTypes: updatedSettings.oilTypes,
            warrantyCategories: updatedSettings.warrantyCategories,
            isProfileComplete: updatedSettings.isProfileComplete
          }).catch(e => console.error('Error updating settings with defaults', e));
        }
      } else {
        const initialSettings = buildInitialSettings(user.uid, isNewUser);
        setDoc(settingsDoc, initialSettings).catch(error => console.error('Error creating settings', error));
        setSettings(initialSettings);
        setSettingsLoaded(true);
      }
    }, (error) => {
      console.error('Settings listener error:', error);
      setSettings({
        ...DEFAULT_SETTINGS,
        userId: user.uid,
        businessName: '',
        isProfileComplete: false
      });
      setSettingsLoaded(true);
    });

    let unsubscribeUsers = () => {};
    if (userProfile.role === 'admin') {
      const usersQuery = collection(db, 'users');
      unsubscribeUsers = onSnapshot(usersQuery, (snapshot) => {
        const usersData = snapshot.docs.map(doc => doc.data() as UserProfile);
        setAllUsers(usersData.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()));
      }, (error) => {
        console.error('Admin users listener error:', error);
        setAllUsers([]);
      });
    }

    const messageLogsQuery = query(collection(db, 'users', user.uid, 'message_logs'));
    const unsubscribeMessageLogs = onSnapshot(messageLogsQuery, (snapshot) => {
      const logsData = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as MessageLog));
      setMessageLogs(logsData.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()));
    }, (error) => {
      console.error('Message logs listener error:', error);
      setMessageLogs([]);
    });

    return () => {
      unsubscribeClients();
      unsubscribeMaintenances();
      unsubscribeWarranties();
      unsubscribeAppointments();
      unsubscribeExpenses();
      unsubscribeProducts();
      unsubscribeCashLaunches();
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
    cashLaunches
  };
}
