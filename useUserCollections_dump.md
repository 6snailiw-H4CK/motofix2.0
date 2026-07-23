# useUserCollections — código e referências

## 1. Assinatura da função

```ts
export function useUserCollections({
  user,
  userProfile,
  isNewUser
}: UseUserCollectionsParams): UseUserCollectionsResult {
```

## 2. useEffect completo entre as linhas 167 e 392

```ts
useEffect(() => {
  traceEffectRun('useUserCollections', 'cash-launches-sync', 0);
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
  traceEffectRun('useUserCollections', 'load-firestore-listeners', 3);
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
  const unsubscribeClients = traceFirestoreListener('clients', () => onSnapshot(clientsQuery, (snapshot) => {
    clearListenerIssue('clients');
    const clientsData = mapActiveDocuments<Client>(snapshot.docs);
    setClients(clientsData);
  }, (error) => {
    recordListenerIssue('clients', 'Clientes', error);
  }));

  const maintenanceQuery = query(collection(db, 'users', user.uid, 'maintenances'));
  const unsubscribeMaintenances = traceFirestoreListener('maintenances', () => onSnapshot(maintenanceQuery, (snapshot) => {
    clearListenerIssue('maintenances');
    const maintenanceData = mapActiveDocuments<MaintenanceRecord>(snapshot.docs);
    setMaintenances(maintenanceData.sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime()));
  }, (error) => {
    recordListenerIssue('maintenances', 'Historico de servicos', error);
  }));

  const warrantyQuery = query(collection(db, 'users', user.uid, 'warranties'));
  const unsubscribeWarranties = traceFirestoreListener('warranties', () => onSnapshot(warrantyQuery, (snapshot) => {
    clearListenerIssue('warranties');
    const warrantyData = mapActiveDocuments<Warranty>(snapshot.docs);
    setWarranties(warrantyData.sort((a, b) => b.warrantyNumber - a.warrantyNumber));
  }, (error) => {
    recordListenerIssue('warranties', 'Garantias', error);
  }));

  const appointmentsQuery = query(collection(db, 'users', user.uid, 'appointments'));
  const unsubscribeAppointments = traceFirestoreListener('appointments', () => onSnapshot(appointmentsQuery, (snapshot) => {
    clearListenerIssue('appointments');
    const appointmentData = mapActiveDocuments<Appointment>(snapshot.docs);
    setAppointments(appointmentData.sort((a, b) => a.scheduledDate.localeCompare(b.scheduledDate)));
  }, (error) => {
    recordListenerIssue('appointments', 'Agenda', error);
  }));

  const expensesQuery = query(collection(db, 'users', user.uid, 'expenses'));
  const unsubscribeExpenses = traceFirestoreListener('expenses', () => onSnapshot(expensesQuery, (snapshot) => {
    clearListenerIssue('expenses');
    const expensesData = mapActiveDocuments<ExpenseRecord>(snapshot.docs);
    setExpenseEntries(expensesData.sort((a, b) => b.date.localeCompare(a.date)));
  }, (error) => {
    recordListenerIssue('expenses', 'Gastos', error);
  }));

  const productsQuery = query(collection(db, 'users', user.uid, 'products'));
  const unsubscribeProducts = traceFirestoreListener('products', () => onSnapshot(productsQuery, (snapshot) => {
    clearListenerIssue('products');
    const productsData = mapActiveDocuments<ProductCatalogItem>(snapshot.docs);
    setProductCatalog(productsData.sort((a, b) => a.description.localeCompare(b.description)));
  }, (error) => {
    recordListenerIssue('products', 'Mercadorias', error);
  }));

  const cashLaunchesQuery = query(collection(db, 'users', user.uid, 'cash_launches'));
  const unsubscribeCashLaunches = traceFirestoreListener('cash_launches', () => onSnapshot(cashLaunchesQuery, (snapshot) => {
    clearListenerIssue('cash_launches');
    const launchesData = mapActiveDocuments<CashRegisterLaunch>(snapshot.docs);
    setCashLaunches(mergeCashLaunches(launchesData));
  }, (error) => {
    recordListenerIssue('cash_launches', 'Lancamentos caixa', error);
    setCashLaunches(mergeCashLaunches([]));
  }));

  const fiscalCompaniesQuery = query(collection(db, 'users', user.uid, 'fiscal_companies'));
  const unsubscribeFiscalCompanies = traceFirestoreListener('fiscal_companies', () => onSnapshot(fiscalCompaniesQuery, (snapshot) => {
    clearListenerIssue('fiscal_companies');
    const companiesData = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as FiscalCompany));
    setFiscalCompanies(companiesData.sort((a, b) => a.legalName.localeCompare(b.legalName)));
  }, (error) => {
    recordListenerIssue('fiscal_companies', 'Empresas fiscais', error);
  }));

  const fiscalInvoicesQuery = query(collection(db, 'users', user.uid, 'fiscal_invoices'));
  const unsubscribeFiscalInvoices = traceFirestoreListener('fiscal_invoices', () => onSnapshot(fiscalInvoicesQuery, (snapshot) => {
    clearListenerIssue('fiscal_invoices');
    const invoicesData = mapActiveDocuments<FiscalInvoice>(snapshot.docs);
    setFiscalInvoices(invoicesData.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()));
  }, (error) => {
    recordListenerIssue('fiscal_invoices', 'Notas fiscais', error);
  }));

  const fiscalLogsQuery = query(collection(db, 'users', user.uid, 'fiscal_logs'));
  const unsubscribeFiscalLogs = traceFirestoreListener('fiscal_logs', () => onSnapshot(fiscalLogsQuery, (snapshot) => {
    clearListenerIssue('fiscal_logs');
    const logsData = mapActiveDocuments<FiscalLog>(snapshot.docs);
    setFiscalLogs(logsData.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()));
  }, (error) => {
    recordListenerIssue('fiscal_logs', 'Logs fiscais', error);
  }));

  const operationalLogsQuery = query(collection(db, 'users', user.uid, 'operational_logs'));
  const unsubscribeOperationalLogs = traceFirestoreListener('operational_logs', () => onSnapshot(operationalLogsQuery, (snapshot) => {
    clearListenerIssue('operational_logs');
    const logsData = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as OperationalLog));
    setOperationalLogs(logsData.sort((a, b) => b.timestamp.localeCompare(a.timestamp)).slice(0, 50));
  }, (error) => {
    recordListenerIssue('operational_logs', 'Logs operacionais', error);
  }));

  const settingsDoc = doc(db, 'users', user.uid, 'settings', 'config');
  const unsubscribeSettings = traceFirestoreListener('settings', () => onSnapshot(settingsDoc, (snapshot) => {
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
  }));

  let unsubscribeUsers = () => {};
  if (userProfile?.role === 'admin' && userProfile?.isActive) {
    const usersQuery = collection(db, 'users');
    unsubscribeUsers = traceFirestoreListener('admin_users', () => onSnapshot(usersQuery, (snapshot) => {
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
    }));
  }

  const messageLogsQuery = query(collection(db, 'users', user.uid, 'message_logs'));
  const unsubscribeMessageLogs = traceFirestoreListener('message_logs', () => onSnapshot(messageLogsQuery, (snapshot) => {
    clearListenerIssue('message_logs');
    const logsData = mapActiveDocuments<MessageLog>(snapshot.docs);
    setMessageLogs(logsData.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()));
  }, (error) => {
    recordListenerIssue('message_logs', 'Avisos enviados', error);
  }));

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
```

## 3. Lista de dependências

```ts
[user, userProfile, isNewUser]
```

## 4. De onde vêm

```ts
user
```

```ts
userProfile
```

```ts
isNewUser
```

## 5. Quem altera

```ts
setUserProfile
```

```ts
setUser
```

```ts
setIsNewUser
```

## 6. Quem chama useUserCollections

```ts
useUserCollections({
  user,
  userProfile,
  isNewUser,
});
```
