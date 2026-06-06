import { lazy, Suspense, useState, type Dispatch, type SetStateAction } from 'react';
import type {
  AppView,
  Appointment,
  CashRegisterLaunch,
  Client,
  ColorMode,
  ExpenseRecord,
  FiscalCompany,
  FiscalInvoice,
  FiscalLog,
  MaintenanceRecord,
  MessageLog,
  ProductCatalogItem,
  Settings,
  UserProfile,
  Warranty,
} from '../../types';
import type { useAdminActions } from '../../hooks/useAdminActions';
import type { useAppointmentActions } from '../../hooks/useAppointmentActions';
import type { useCashRegisterActions } from '../../hooks/useCashRegisterActions';
import type { useClientActions } from '../../hooks/useClientActions';
import type { useClientFormState } from '../../hooks/useClientFormState';
import type { useDeleteConfirmation } from '../../hooks/useDeleteConfirmation';
import type { useExpenseActions } from '../../hooks/useExpenseActions';
import type { useFiscalActions } from '../../hooks/useFiscalActions';
import type { useMaintenanceActions } from '../../hooks/useMaintenanceActions';
import type { ServiceListFilter, useMaintenanceStats } from '../../hooks/useMaintenanceStats';
import type { useMessageLogActions } from '../../hooks/useMessageLogActions';
import type { useProductActions } from '../../hooks/useProductActions';
import type { useServiceTypeActions } from '../../hooks/useServiceTypeActions';
import type { useSettingsActions } from '../../hooks/useSettingsActions';
import type { useWarrantyActions } from '../../hooks/useWarrantyActions';
import type { useWhatsAppReminderActions } from '../../hooks/useWhatsAppReminderActions';

const AdminView = lazy(() => import('../admin/AdminView').then((module) => ({ default: module.AdminView })));
const AppointmentsView = lazy(() => import('../appointments/AppointmentsView').then((module) => ({ default: module.AppointmentsView })));
const CashRegisterView = lazy(() => import('../cash/CashRegisterView').then((module) => ({ default: module.CashRegisterView })));
const ClientForm = lazy(() => import('../clients/ClientForm').then((module) => ({ default: module.ClientForm })));
const ClientScheduleForm = lazy(() => import('../clients/ClientScheduleForm').then((module) => ({ default: module.ClientScheduleForm })));
const ClientsScheduleView = lazy(() => import('../clients/ClientsScheduleView').then((module) => ({ default: module.ClientsScheduleView })));
const ClientsView = lazy(() => import('../clients/ClientsView').then((module) => ({ default: module.ClientsView })));
const DashboardRecurringView = lazy(() => import('../dashboard/DashboardDetailViews').then((module) => ({ default: module.DashboardRecurringView })));
const DashboardRevenueView = lazy(() => import('../dashboard/DashboardDetailViews').then((module) => ({ default: module.DashboardRevenueView })));
const DashboardServicesView = lazy(() => import('../dashboard/DashboardDetailViews').then((module) => ({ default: module.DashboardServicesView })));
const DashboardView = lazy(() => import('../dashboard/DashboardView').then((module) => ({ default: module.DashboardView })));
const ExpensesView = lazy(() => import('../expenses/ExpensesView').then((module) => ({ default: module.ExpensesView })));
const FiscalView = lazy(() => import('../fiscal/FiscalView').then((module) => ({ default: module.FiscalView })));
const GeneralReportView = lazy(() => import('../reports/GeneralReportView').then((module) => ({ default: module.GeneralReportView })));
const HistoryView = lazy(() => import('../history/HistoryView').then((module) => ({ default: module.HistoryView })));
const PendenciesView = lazy(() => import('../pendencies/PendenciesView').then((module) => ({ default: module.PendenciesView })));
const ProductsView = lazy(() => import('../products/ProductsView').then((module) => ({ default: module.ProductsView })));
const ReportView = lazy(() => import('../dashboard/ReportView').then((module) => ({ default: module.ReportView })));
const ReturnsView = lazy(() => import('../returns/ReturnsView').then((module) => ({ default: module.ReturnsView })));
const SettingsView = lazy(() => import('../settings/SettingsView').then((module) => ({ default: module.SettingsView })));
const WarrantiesView = lazy(() => import('../warranties/WarrantiesView').then((module) => ({ default: module.WarrantiesView })));
const WarrantyForm = lazy(() => import('../Forms/WarrantyForm').then((module) => ({ default: module.WarrantyForm })));

const ViewLoadingFallback = () => (
  <div className="py-10 text-center text-xs font-bold uppercase tracking-widest text-slate-500">
    Carregando tela...
  </div>
);

type ChartDataPoint = {
  month: string;
  monthIndex: number;
  year: number;
  count: number;
};

type AdminActions = ReturnType<typeof useAdminActions>;
type AppointmentActions = ReturnType<typeof useAppointmentActions>;
type CashRegisterActions = ReturnType<typeof useCashRegisterActions>;
type ClientActions = ReturnType<typeof useClientActions>;
type ClientFormState = ReturnType<typeof useClientFormState>;
type DeleteConfirmation = ReturnType<typeof useDeleteConfirmation>;
type ExpenseActions = ReturnType<typeof useExpenseActions>;
type FiscalActions = ReturnType<typeof useFiscalActions>;
type MaintenanceActions = ReturnType<typeof useMaintenanceActions>;
type MaintenanceStats = ReturnType<typeof useMaintenanceStats>;
type MessageLogActions = ReturnType<typeof useMessageLogActions>;
type ProductActions = ReturnType<typeof useProductActions>;
type ServiceTypeActions = ReturnType<typeof useServiceTypeActions>;
type SettingsActions = ReturnType<typeof useSettingsActions>;
type WarrantyActions = ReturnType<typeof useWarrantyActions>;
type SendWhatsApp = ReturnType<typeof useWhatsAppReminderActions>['sendWhatsApp'];

type AppViewRendererActions = {
  admin: AdminActions;
  appointment: AppointmentActions;
  cashRegister: CashRegisterActions;
  client: ClientActions;
  clientForm: ClientFormState;
  expense: ExpenseActions;
  fiscal: FiscalActions;
  maintenance: MaintenanceActions;
  messageLog: MessageLogActions;
  product: ProductActions;
  sendWhatsApp: SendWhatsApp;
  serviceType: ServiceTypeActions;
  settings: SettingsActions;
  warranty: WarrantyActions;
};

type AppViewRendererData = {
  allUsers: UserProfile[];
  appointments: Appointment[];
  cashLaunches: CashRegisterLaunch[];
  chartData: ChartDataPoint[];
  clients: Client[];
  dailyPendingAlerts: Client[];
  expenseEntries: ExpenseRecord[];
  fiscalCompanies: FiscalCompany[];
  fiscalInvoices: FiscalInvoice[];
  fiscalLogs: FiscalLog[];
  historyServiceTypeOptions: string[];
  maintenanceStats: MaintenanceStats;
  maintenances: MaintenanceRecord[];
  messageLogs: MessageLog[];
  nextAppointment?: Appointment;
  productCatalog: ProductCatalogItem[];
  serviceTypeOptions: string[];
  scheduleClientHistoryRows: MaintenanceRecord[];
  settings: Settings;
  warranties: Warranty[];
};

type AppViewRendererSession = {
  currentUserId: string;
  deleteConfirmation: Pick<DeleteConfirmation, 'confirmOrRequestDelete' | 'getDeleteConfirmId'>;
  userEmail?: string | null;
  userProfile: UserProfile | null;
};

type AppViewRendererUi = {
  colorMode: ColorMode;
  expandedTopService: string | null;
  isNewService: boolean;
  searchQuery: string;
  serviceListFilter: ServiceListFilter;
  setExpandedTopService: Dispatch<SetStateAction<string | null>>;
  setIsNewService: Dispatch<SetStateAction<boolean>>;
  setSearchQuery: Dispatch<SetStateAction<string>>;
  setServiceListFilter: Dispatch<SetStateAction<ServiceListFilter>>;
  setSettings: Dispatch<SetStateAction<Settings>>;
  setView: Dispatch<SetStateAction<AppView>>;
  view: AppView;
};

type AppViewRendererProps = {
  actions: AppViewRendererActions;
  data: AppViewRendererData;
  session: AppViewRendererSession;
  ui: AppViewRendererUi;
};

export const AppViewRenderer = ({
  actions,
  data,
  session,
  ui,
}: AppViewRendererProps) => {
  const {
    admin: adminActions,
    appointment: appointmentActions,
    cashRegister: cashRegisterActions,
    client: clientActions,
    clientForm,
    expense: expenseActions,
    fiscal: fiscalActions,
    maintenance: maintenanceActions,
    messageLog: messageLogActions,
    product: productActions,
    sendWhatsApp,
    serviceType: serviceTypeActions,
    settings: settingsActions,
    warranty: warrantyActions,
  } = actions;
  const {
    allUsers,
    appointments,
    cashLaunches,
    chartData,
    clients,
    dailyPendingAlerts,
    expenseEntries,
    fiscalCompanies,
    fiscalInvoices,
    fiscalLogs,
    historyServiceTypeOptions,
    maintenanceStats,
    maintenances,
    messageLogs,
    nextAppointment,
    productCatalog,
    serviceTypeOptions,
    scheduleClientHistoryRows,
    settings,
    warranties,
  } = data;
  const {
    currentUserId,
    deleteConfirmation,
    userEmail,
    userProfile,
  } = session;
  const {
    colorMode,
    expandedTopService,
    isNewService,
    searchQuery,
    serviceListFilter,
    setExpandedTopService,
    setIsNewService,
    setSearchQuery,
    setServiceListFilter,
    setSettings,
    setView,
    view,
  } = ui;
  const {
    activeWarrantiesCount,
    cashFlowStats,
    clientBalanceMap,
    clientStats,
    clientsSortedByBalance,
    dashboardMaintenances,
    dashboardStats,
    filteredServiceClients,
    getTopServiceSubRows,
    overdueClients,
    topServicesData,
  } = maintenanceStats;
  const { confirmOrRequestDelete, getDeleteConfirmId } = deleteConfirmation;
  const pendingPaymentClients = clientsSortedByBalance.filter((client) => (clientBalanceMap.get(client.id) || 0) > 0);
  const pendingCashLaunches = cashLaunches.filter((launch) => (
    (Number(launch.total) || 0) > 0
    && (launch.status === 'Pendente' || (launch.status === 'Finalizado' && !launch.invoiced))
  ));
  const pendingPaymentCount = pendingPaymentClients.length + pendingCashLaunches.length;
  const [cashLaunchToOpenId, setCashLaunchToOpenId] = useState<string | null>(null);

  return (
    <Suspense fallback={<ViewLoadingFallback />}>
      {view === 'dashboard' && (
        <DashboardView
          cashFlowStats={cashFlowStats}
          dailyPendingAlerts={dailyPendingAlerts}
          pendingPaymentCount={pendingPaymentCount}
          warranties={warranties}
          appointments={appointments}
          nextAppointment={nextAppointment}
          overdueClients={overdueClients}
          chartData={chartData}
          topServicesData={topServicesData}
          expandedTopService={expandedTopService}
          onViewChange={setView}
          onQuickServiceRegister={() => {
            clientForm.startNewClient();
            setView('new-client');
          }}
          onNewClient={() => {
            clientForm.startScheduleClient();
            setView('clients-schedule-add');
          }}
          onNewExpense={() => setView('expenses')}
          onNewReturn={() => {
            clientForm.startNewClient();
            setView('new-client');
          }}
          onSendWhatsApp={sendWhatsApp}
          onToggleTopService={(service) => setExpandedTopService(expandedTopService === service ? null : service)}
          getTopServiceSubRows={getTopServiceSubRows}
        />
      )}

      {view === 'returns' && (
        <ReturnsView
          clients={clientsSortedByBalance}
          dailyPendingAlerts={dailyPendingAlerts}
          processingId={maintenanceActions.processingId}
          onBack={() => setView('dashboard')}
          onEditClient={(client) => {
            clientForm.startEditClient(client);
            setView('new-client');
          }}
          onNewClient={() => {
            clientForm.startScheduleClient();
            setView('clients-schedule-add');
          }}
          onNewReturn={() => {
            clientForm.startNewClient();
            setView('new-client');
          }}
          onRegisterReturn={maintenanceActions.addMaintenance}
          onSendWhatsApp={sendWhatsApp}
        />
      )}

      {view === 'pendencies' && (
        <PendenciesView
          cashLaunches={cashLaunches}
          maintenances={dashboardMaintenances}
          processingId={maintenanceActions.processingId}
          onBack={() => setView('dashboard')}
          onOpenCashLaunch={(launch) => {
            setCashLaunchToOpenId(launch.id);
            setView('cash-register');
          }}
          onRegisterPayment={(record) => maintenanceActions.settleDebt(record.id, record)}
        />
      )}

      {view === 'dashboard-revenue' && (
        <DashboardRevenueView
          dashboardStats={dashboardStats}
          clientStats={clientStats}
          onBack={() => setView('dashboard')}
        />
      )}

      {view === 'dashboard-recurring' && (
        <DashboardRecurringView
          dashboardStats={dashboardStats}
          maintenances={dashboardMaintenances}
          onBack={() => setView('dashboard')}
        />
      )}

      {view === 'dashboard-services' && (
        <DashboardServicesView
          dashboardStats={dashboardStats}
          maintenances={dashboardMaintenances}
          onBack={() => setView('dashboard')}
        />
      )}

      {view === 'clients' && (
        <ClientsView
          clients={filteredServiceClients}
          maintenances={dashboardMaintenances}
          clientBalanceMap={clientBalanceMap}
          searchQuery={searchQuery}
          serviceListFilter={serviceListFilter}
          processingId={maintenanceActions.processingId}
          deleteConfirmId={getDeleteConfirmId('maintenance')}
          onNewClient={() => {
            clientForm.startScheduleClient();
            setView('clients-schedule-add');
          }}
          onNewProduct={() => setView('products')}
          onNewRecord={() => {
            clientForm.startNewClient();
            setView('new-client');
          }}
          onOpenCashRegister={() => setView('cash-register')}
          onSearchChange={setSearchQuery}
          onServiceListFilterChange={setServiceListFilter}
          onAddMaintenance={maintenanceActions.addMaintenance}
          onSettleDebt={(maintenance) => maintenanceActions.settleDebt(maintenance.id, maintenance)}
          onSendWhatsApp={sendWhatsApp}
          onEditClient={(client) => {
            clientForm.startEditClient(client);
            setView('new-client');
          }}
          onDeleteMaintenanceClick={(record) => {
            confirmOrRequestDelete('maintenance', record.id, () => maintenanceActions.deleteMaintenance(record));
          }}
        />
      )}

      {view === 'cash-register' && (
        <CashRegisterView
          cashLaunches={cashLaunches}
          clients={clients}
          products={productCatalog}
          fiscalAutoIssueEnabled={fiscalCompanies.some((company) => company.autoIssueFromCashLaunch && company.nfseEnabled)}
          isImportingProducts={cashRegisterActions.isImportingProducts}
          isSavingLaunch={cashRegisterActions.isSavingLaunch}
          deleteConfirmId={getDeleteConfirmId('cashLaunch')}
          deletingLaunchId={cashRegisterActions.deletingLaunchId}
          initialLaunchId={cashLaunchToOpenId}
          onBack={() => setView('clients')}
          onOpenRecurringServices={() => setView('clients')}
          onImportProducts={cashRegisterActions.importProductsWorkbook}
          onInitialLaunchLoaded={() => setCashLaunchToOpenId(null)}
          onQuickSaveClient={clientActions.quickCreateClient}
          onSaveLaunch={cashRegisterActions.saveLaunch}
          onAutoIssueFiscalFromCashLaunch={(cashLaunchId) => {
            const cashLaunch = cashLaunches.find((launch) => launch.id === cashLaunchId);
            if (cashLaunch) {
              void fiscalActions.issueFromCashLaunch(cashLaunch);
            }
          }}
          onDeleteLaunchClick={(launch) => {
            confirmOrRequestDelete('cashLaunch', launch.id, () => {
              void cashRegisterActions.deleteLaunch(launch.id);
            });
          }}
        />
      )}

      {view === 'products' && (
        <ProductsView
          products={productCatalog}
          isImportingProducts={productActions.isImportingProducts}
          isSavingProduct={productActions.isSavingProduct}
          deletingProductId={productActions.deletingProductId}
          deleteConfirmId={getDeleteConfirmId('product')}
          onImportProducts={productActions.importProductsWorkbook}
          onSaveProduct={productActions.saveProduct}
          onDeleteProductClick={(product) => {
            confirmOrRequestDelete('product', product.id, () => {
              void productActions.deleteProduct(product.id);
            });
          }}
        />
      )}

      {view === 'fiscal' && (
        <FiscalView
          cashLaunches={cashLaunches}
          fiscalCompanies={fiscalCompanies}
          fiscalInvoices={fiscalInvoices}
          fiscalLogs={fiscalLogs}
          isIssuingInvoice={fiscalActions.isIssuingInvoice}
          isSavingCompany={fiscalActions.isSavingCompany}
          processingInvoiceId={fiscalActions.processingInvoiceId}
          onCancelInvoice={(invoice) => fiscalActions.cancelInvoice(invoice)}
          onDownloadDocument={fiscalActions.downloadDocument}
          onIssueFromCashLaunch={fiscalActions.issueFromCashLaunch}
          onIssueManualNfse={fiscalActions.issueManualNfse}
          onSaveCompany={fiscalActions.saveCompany}
          onSyncInvoice={fiscalActions.syncInvoice}
        />
      )}

      {view === 'appointments' && (
        <AppointmentsView
          appointments={appointments}
          calendarMonth={appointmentActions.calendarMonth}
          selectedDate={appointmentActions.selectedDate}
          showForm={appointmentActions.showForm}
          message={appointmentActions.message}
          formValues={appointmentActions.formValues}
          deleteConfirmId={getDeleteConfirmId('appointment')}
          onBack={() => setView('clients')}
          onCalendarMonthChange={appointmentActions.setCalendarMonth}
          onSelectedDateChange={appointmentActions.setSelectedDate}
          onShowFormChange={appointmentActions.setShowForm}
          onMessageChange={appointmentActions.setMessage}
          onFormValueChange={appointmentActions.setFormValue}
          onSaveAppointment={appointmentActions.saveAppointment}
          onToggleAppointmentCompleted={appointmentActions.toggleAppointmentCompleted}
          onDeleteAppointmentClick={(appointment) => {
            confirmOrRequestDelete('appointment', appointment.id, () => appointmentActions.deleteAppointment(appointment.id));
          }}
        />
      )}

      {view === 'clients-schedule' && (
        <ClientsScheduleView
          clients={clientsSortedByBalance}
          clientBalanceMap={clientBalanceMap}
          deleteConfirmId={getDeleteConfirmId('client')}
          onBack={() => setView('dashboard')}
          onAddClient={() => {
            clientForm.startScheduleClient();
            setView('clients-schedule-add');
          }}
          onEditClient={(client) => {
            clientForm.startEditClient(client);
            setView('clients-schedule-add');
          }}
          onDeleteClientClick={(client) => {
            confirmOrRequestDelete('client', client.id, () => clientActions.deleteClient(client.id));
          }}
        />
      )}

      {view === 'clients-schedule-add' && (
        <ClientScheduleForm
          editingClient={clientForm.editingClient}
          historyRows={scheduleClientHistoryRows}
          isSaving={clientActions.isSaving}
          onBack={() => setView('clients-schedule')}
          onSave={clientActions.saveClient}
          onAfterSubmit={() => setView('clients-schedule')}
        />
      )}

      {view === 'history' && (
        <HistoryView
          maintenances={maintenances}
          messageLogs={messageLogs}
          messageLogDeleteConfirmId={getDeleteConfirmId('messageLog')}
          serviceTypeOptions={historyServiceTypeOptions}
          processingId={maintenanceActions.processingId}
          deleteConfirmId={getDeleteConfirmId('maintenance')}
          onSettleDebt={(record) => maintenanceActions.settleDebt(record.id, record)}
          onConfirmPayment={(record) => maintenanceActions.confirmPayment(record.id, record)}
          onDeleteMaintenanceClick={(record) => {
            confirmOrRequestDelete('maintenance', record.id, () => maintenanceActions.deleteMaintenance(record));
          }}
          onDeleteMessageLogClick={(log) => {
            confirmOrRequestDelete('messageLog', log.id, () => messageLogActions.deleteMessageLog(log.id));
          }}
          onOpenGeneralReport={() => setView('general-report')}
        />
      )}

      {view === 'expenses' && (
        <ExpensesView
          expenseEntries={expenseEntries}
          description={expenseActions.description}
          supplier={expenseActions.supplier}
          amount={expenseActions.amount}
          paymentMethod={expenseActions.paymentMethod}
          date={expenseActions.date}
          note={expenseActions.note}
          isSaving={expenseActions.isSaving}
          onBack={() => setView('dashboard')}
          onDescriptionChange={expenseActions.setDescription}
          onSupplierChange={expenseActions.setSupplier}
          onAmountChange={expenseActions.setAmount}
          onPaymentMethodChange={expenseActions.setPaymentMethod}
          onDateChange={expenseActions.setDate}
          onNoteChange={expenseActions.setNote}
          onSaveExpense={expenseActions.saveExpense}
          onDeleteExpense={expenseActions.deleteExpense}
          onResetForm={expenseActions.resetForm}
        />
      )}

      {view === 'report' && (
        <ReportView
          dashboardStats={dashboardStats}
          maintenances={dashboardMaintenances}
          onBack={() => setView('history')}
        />
      )}

      {view === 'general-report' && (
        <GeneralReportView
          activeWarrantiesCount={activeWarrantiesCount}
          cashFlowStats={cashFlowStats}
          clients={clients}
          dashboardStats={dashboardStats}
          maintenances={dashboardMaintenances}
          expenses={expenseEntries}
          warranties={warranties}
          appointments={appointments}
          settings={settings}
          onBack={() => setView('history')}
          onViewChange={setView}
        />
      )}

      {view === 'warranties' && (
        <WarrantiesView
          warranties={warranties}
          deleteConfirmId={getDeleteConfirmId('warranty')}
          onNewWarranty={warrantyActions.startNewWarranty}
          onEditWarranty={warrantyActions.startEditWarranty}
          onGeneratePDF={warrantyActions.generateWarrantyPDF}
          onDeleteWarrantyClick={(warranty) => {
            confirmOrRequestDelete('warranty', warranty.id, () => warrantyActions.deleteWarranty(warranty.id));
          }}
        />
      )}

      {view === 'new-warranty' && (
        <WarrantyForm
          editingWarranty={warrantyActions.editingWarranty}
          settings={settings}
          isSaving={warrantyActions.isSaving}
          onBack={() => setView('warranties')}
          onManageCategories={() => setView('settings')}
          onSubmit={warrantyActions.saveWarranty}
        />
      )}

      {view === 'settings' && (
        <SettingsView
          clientsCount={clients.length}
          userEmail={userEmail}
          userProfile={userProfile}
          settings={settings}
          setSettings={setSettings}
          colorMode={colorMode}
          saveMessage={settingsActions.saveMessage}
          onSaveProfile={settingsActions.saveCompanyProfile}
          onSaveSettings={settingsActions.saveSettings}
          onSaveSettingsPatch={settingsActions.saveSettingsPatch}
          onExportClientsBackup={clientActions.exportClientsBackup}
          onImportClientsBackup={clientActions.importClientsBackup}
          isImportingClients={clientActions.isImportingClients}
        />
      )}

      {view === 'new-client' && (
        <ClientForm
          editingClient={clientForm.editingClient}
          isNewService={clientForm.isCreatingService}
          clientNameInput={clientForm.clientNameInput}
          clientSuggestions={clientForm.clientSuggestions}
          serviceType={clientForm.serviceType}
          serviceTypeOptions={serviceTypeOptions}
          oilTypes={settings.oilTypes || []}
          isSaving={clientActions.isSaving}
          onBack={() => {
            clientForm.resetAfterSave();
            setView('clients');
          }}
          onClientNameChange={clientForm.handleClientNameChange}
          onSelectClientSuggestion={clientForm.selectClientSuggestion}
          onServiceTypeChange={clientForm.setServiceType}
          onAddCustomServiceType={serviceTypeActions.addCustomServiceType}
          onSave={clientActions.saveClient}
        />
      )}

      {view === 'admin' && userProfile?.role === 'admin' && (
        <AdminView
          users={allUsers}
          currentUserId={currentUserId}
          onToggleUserStatus={adminActions.toggleUserStatus}
          onUpdateSubscription={adminActions.updateSubscription}
          onSetSubscriptionDate={adminActions.setSubscriptionDate}
        />
      )}
    </Suspense>
  );
};
