import { lazy, Suspense, type Dispatch, type SetStateAction } from 'react';
import type {
  AppView,
  Appointment,
  Client,
  ColorMode,
  ExpenseRecord,
  MaintenanceRecord,
  MessageLog,
  Settings,
  UserProfile,
  Warranty,
} from '../../types';
import type { useAdminActions } from '../../hooks/useAdminActions';
import type { useAppointmentActions } from '../../hooks/useAppointmentActions';
import type { useClientActions } from '../../hooks/useClientActions';
import type { useClientFormState } from '../../hooks/useClientFormState';
import type { useDeleteConfirmation } from '../../hooks/useDeleteConfirmation';
import type { useExpenseActions } from '../../hooks/useExpenseActions';
import type { useMaintenanceActions } from '../../hooks/useMaintenanceActions';
import type { ServiceListFilter, useMaintenanceStats } from '../../hooks/useMaintenanceStats';
import type { useMessageLogActions } from '../../hooks/useMessageLogActions';
import type { useServiceTypeActions } from '../../hooks/useServiceTypeActions';
import type { useSettingsActions } from '../../hooks/useSettingsActions';
import type { useWarrantyActions } from '../../hooks/useWarrantyActions';
import type { useWhatsAppReminderActions } from '../../hooks/useWhatsAppReminderActions';

const AdminView = lazy(() => import('../admin/AdminView').then((module) => ({ default: module.AdminView })));
const AppointmentsView = lazy(() => import('../appointments/AppointmentsView').then((module) => ({ default: module.AppointmentsView })));
const ClientForm = lazy(() => import('../clients/ClientForm').then((module) => ({ default: module.ClientForm })));
const ClientScheduleForm = lazy(() => import('../clients/ClientScheduleForm').then((module) => ({ default: module.ClientScheduleForm })));
const ClientsScheduleView = lazy(() => import('../clients/ClientsScheduleView').then((module) => ({ default: module.ClientsScheduleView })));
const ClientsView = lazy(() => import('../clients/ClientsView').then((module) => ({ default: module.ClientsView })));
const DashboardRecurringView = lazy(() => import('../dashboard/DashboardDetailViews').then((module) => ({ default: module.DashboardRecurringView })));
const DashboardRevenueView = lazy(() => import('../dashboard/DashboardDetailViews').then((module) => ({ default: module.DashboardRevenueView })));
const DashboardServicesView = lazy(() => import('../dashboard/DashboardDetailViews').then((module) => ({ default: module.DashboardServicesView })));
const DashboardView = lazy(() => import('../dashboard/DashboardView').then((module) => ({ default: module.DashboardView })));
const ExpensesView = lazy(() => import('../expenses/ExpensesView').then((module) => ({ default: module.ExpensesView })));
const GeneralReportView = lazy(() => import('../reports/GeneralReportView').then((module) => ({ default: module.GeneralReportView })));
const HistoryView = lazy(() => import('../history/HistoryView').then((module) => ({ default: module.HistoryView })));
const ReportView = lazy(() => import('../dashboard/ReportView').then((module) => ({ default: module.ReportView })));
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
type ClientActions = ReturnType<typeof useClientActions>;
type ClientFormState = ReturnType<typeof useClientFormState>;
type DeleteConfirmation = ReturnType<typeof useDeleteConfirmation>;
type ExpenseActions = ReturnType<typeof useExpenseActions>;
type MaintenanceActions = ReturnType<typeof useMaintenanceActions>;
type MaintenanceStats = ReturnType<typeof useMaintenanceStats>;
type MessageLogActions = ReturnType<typeof useMessageLogActions>;
type ServiceTypeActions = ReturnType<typeof useServiceTypeActions>;
type SettingsActions = ReturnType<typeof useSettingsActions>;
type WarrantyActions = ReturnType<typeof useWarrantyActions>;
type SendWhatsApp = ReturnType<typeof useWhatsAppReminderActions>['sendWhatsApp'];

type AppViewRendererActions = {
  admin: AdminActions;
  appointment: AppointmentActions;
  client: ClientActions;
  clientForm: ClientFormState;
  expense: ExpenseActions;
  maintenance: MaintenanceActions;
  messageLog: MessageLogActions;
  sendWhatsApp: SendWhatsApp;
  serviceType: ServiceTypeActions;
  settings: SettingsActions;
  warranty: WarrantyActions;
};

type AppViewRendererData = {
  allUsers: UserProfile[];
  appointments: Appointment[];
  chartData: ChartDataPoint[];
  clients: Client[];
  dailyPendingAlerts: Client[];
  expenseEntries: ExpenseRecord[];
  historyServiceTypeOptions: string[];
  maintenanceStats: MaintenanceStats;
  maintenances: MaintenanceRecord[];
  messageLogs: MessageLog[];
  nextAppointment?: Appointment;
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
    client: clientActions,
    clientForm,
    expense: expenseActions,
    maintenance: maintenanceActions,
    messageLog: messageLogActions,
    sendWhatsApp,
    serviceType: serviceTypeActions,
    settings: settingsActions,
    warranty: warrantyActions,
  } = actions;
  const {
    allUsers,
    appointments,
    chartData,
    clients,
    dailyPendingAlerts,
    expenseEntries,
    historyServiceTypeOptions,
    maintenanceStats,
    maintenances,
    messageLogs,
    nextAppointment,
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

  return (
    <Suspense fallback={<ViewLoadingFallback />}>
      {view === 'dashboard' && (
        <DashboardView
          cashFlowStats={cashFlowStats}
          dashboardStats={dashboardStats}
          activeWarrantiesCount={activeWarrantiesCount}
          dailyPendingAlerts={dailyPendingAlerts}
          nextAppointment={nextAppointment}
          overdueClients={overdueClients}
          chartData={chartData}
          topServicesData={topServicesData}
          expandedTopService={expandedTopService}
          onViewChange={setView}
          onSendWhatsApp={sendWhatsApp}
          onToggleTopService={(service) => setExpandedTopService(expandedTopService === service ? null : service)}
          getTopServiceSubRows={getTopServiceSubRows}
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
          isNewService={isNewService}
          processingId={maintenanceActions.processingId}
          deleteConfirmId={getDeleteConfirmId('maintenance')}
          onQuickModeClick={() => setIsNewService(false)}
          onScheduleClick={() => {
            setIsNewService(true);
            setView('clients-schedule');
          }}
          onNewRecord={() => {
            clientForm.startNewClient();
            setView('new-client');
          }}
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
        />
      )}

      {view === 'expenses' && (
        <ExpensesView
          expenseEntries={expenseEntries}
          description={expenseActions.description}
          amount={expenseActions.amount}
          paymentMethod={expenseActions.paymentMethod}
          date={expenseActions.date}
          note={expenseActions.note}
          isSaving={expenseActions.isSaving}
          onBack={() => setView('dashboard')}
          onDescriptionChange={expenseActions.setDescription}
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
          clients={clients}
          maintenances={dashboardMaintenances}
          expenses={expenseEntries}
          warranties={warranties}
          appointments={appointments}
          settings={settings}
          onBack={() => setView('settings')}
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
          userEmail={userEmail}
          userProfile={userProfile}
          settings={settings}
          setSettings={setSettings}
          colorMode={colorMode}
          saveMessage={settingsActions.saveMessage}
          onSaveProfile={settingsActions.saveCompanyProfile}
          onSaveSettings={settingsActions.saveSettings}
          onSaveSettingsPatch={settingsActions.saveSettingsPatch}
          onOpenGeneralReport={() => setView('general-report')}
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
