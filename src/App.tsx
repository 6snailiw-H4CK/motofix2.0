/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect, useMemo } from 'react';
import { 
  Plus, Search, History, Bell, Settings as SettingsIcon, LogOut, 
  ChevronRight, Trash2, CheckCircle, MessageSquare, ArrowLeft, 
  RefreshCw, Wrench, Filter, UserCheck, UserX, AlertCircle, 
  ExternalLink, MoreVertical, Edit2, CheckCircle2, TrendingUp,
  MessageCircle,
  BarChart3, Calendar, ShieldCheck, Download, FileText, X,
  PieChart, LayoutDashboard, ArrowUpRight, ArrowDownRight,
  TrendingDown, Bike, Users, AlertTriangle, ChevronLeft,
  Droplets, Shield, Lock, DollarSign
} from 'lucide-react';
import { 
  format, parseISO, addDays, isAfter, isBefore, startOfMonth, 
  endOfMonth, isWithinInterval, subMonths, startOfDay,
  differenceInDays
} from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { 
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, 
  ResponsiveContainer, Cell, PieChart as RePieChart, Pie 
} from 'recharts';
import { 
  collection, addDoc, query, where, onSnapshot, 
  updateDoc, doc, deleteDoc, getDocs, getDoc,
  getDocFromServer, serverTimestamp, setDoc
} from 'firebase/firestore';
import { 
  signInWithPopup, GoogleAuthProvider, onAuthStateChanged, 
  signOut, User 
} from 'firebase/auth';
import { db, auth, googleProvider } from './firebase';
import { 
  Client, MaintenanceRecord, MessageLog, Settings, 
  UserProfile, Warranty, MaintenanceStatus 
} from './types';
import { cn, safeFormat } from './lib/utils';
import { Toaster, toast as sonnerToast } from 'sonner';
import jsPDF from 'jspdf';
import html2canvas from 'html2canvas';
import { AlertService } from './services/alertService';

// Toast Component
const Toast = ({ message, type, onClose }: { message: string, type: 'success' | 'error', onClose: () => void }) => (
  <div className={cn(
    "fixed bottom-24 left-1/2 -translate-x-1/2 z-[100] px-6 py-3 rounded-2xl shadow-2xl flex items-center gap-3 animate-in fade-in slide-in-from-bottom-4 duration-300",
    type === 'success' ? "bg-emerald-600 text-white" : "bg-red-600 text-white"
  )}>
    {type === 'success' ? <CheckCircle className="w-5 h-5" /> : <AlertCircle className="w-5 h-5" />}
    <p className="font-bold text-sm">{message}</p>
    <button onClick={onClose} className="ml-2 hover:opacity-70">
      <X className="w-4 h-4" />
    </button>
  </div>
);

// --- Components ---

enum OperationType {
  CREATE = 'create',
  UPDATE = 'update',
  DELETE = 'delete',
  LIST = 'list',
  GET = 'get',
  WRITE = 'write',
}

interface FirestoreErrorInfo {
  error: string;
  operationType: OperationType;
  path: string | null;
  authInfo: {
    userId: string | undefined;
    email: string | null | undefined;
    emailVerified: boolean | undefined;
    isAnonymous: boolean | undefined;
    tenantId: string | null | undefined;
    providerInfo: {
      providerId: string;
      displayName: string | null;
      email: string | null;
      photoUrl: string | null;
    }[];
  }
}

function handleFirestoreError(error: unknown, operationType: OperationType, path: string | null) {
  const errInfo: FirestoreErrorInfo = {
    error: error instanceof Error ? error.message : String(error),
    authInfo: {
      userId: auth.currentUser?.uid,
      email: auth.currentUser?.email,
      emailVerified: auth.currentUser?.emailVerified,
      isAnonymous: auth.currentUser?.isAnonymous,
      tenantId: auth.currentUser?.tenantId,
      providerInfo: auth.currentUser?.providerData.map(provider => ({
        providerId: provider.providerId,
        displayName: provider.displayName,
        email: provider.email,
        photoUrl: provider.photoURL
      })) || []
    },
    operationType,
    path
  }
  console.error('Firestore Error: ', JSON.stringify(errInfo));
  throw new Error(JSON.stringify(errInfo));
}

const ErrorBoundary = ({ children }: { children: React.ReactNode }) => {
  const [hasError, setHasError] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const handleError = (e: ErrorEvent) => {
      setHasError(true);
      setError(e.message);
    };
    window.addEventListener('error', handleError);
    return () => window.removeEventListener('error', handleError);
  }, []);

  if (hasError) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background-dark p-4">
        <div className="bg-slate-800 p-8 rounded-2xl border border-red-500/30 max-w-md w-full text-center">
          <AlertTriangle className="w-16 h-16 text-red-500 mx-auto mb-4" />
          <h1 className="text-2xl font-bold text-white mb-2">Algo deu errado</h1>
          <p className="text-slate-400 mb-6">{error || "Ocorreu um erro inesperado."}</p>
          <button 
            onClick={() => window.location.reload()}
            className="w-full py-3 bg-primary text-white font-bold rounded-xl hover:bg-primary/90 transition-all"
          >
            Recarregar Aplicativo
          </button>
        </div>
      </div>
    );
  }

  return <>{children}</>;
};

const LoadingScreen = () => {
  const userId = auth.currentUser?.uid || 'seu-id';
  const whatsappUrl = `https://wa.me/556999944024?text=Olá, quero ativar meu acesso no MotoFix! Meu ID é: ${userId}`;
  
  return (
    <div className="min-h-screen flex flex-col items-center justify-center bg-background-dark">
      <div className="relative">
        <div className="w-16 h-16 border-4 border-primary/20 border-t-primary rounded-full animate-spin"></div>
        <Bike className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-6 h-6 text-primary" />
      </div>
      <p className="mt-4 text-slate-400 font-medium animate-pulse">Carregando MotoFix...</p>
      
      {/* Links de suporte */}
      <div className="mt-8 flex gap-4 text-center">
        <a 
          href={whatsappUrl}
          target="_blank"
          rel="noopener noreferrer"
          className="flex items-center gap-2 text-xs text-slate-400 hover:text-primary transition-colors"
        >
          <MessageCircle className="w-4 h-4" />
          <span>WhatsApp</span>
        </a>
        <span className="text-slate-600">|</span>
        <a 
          href="https://instagram.com/motofix_recorrentes"
          target="_blank"
          rel="noopener noreferrer"
          className="flex items-center gap-2 text-xs text-slate-400 hover:text-primary transition-colors"
        >
          <span>📸 Instagram</span>
        </a>
      </div>
    </div>
  );
};

const AuthScreen = () => (
  <div className="min-h-screen flex flex-col bg-gradient-to-b from-black via-slate-900 to-black overflow-hidden">
    {/* Animated background elements */}
    <div className="fixed top-0 left-0 w-96 h-96 bg-primary/5 rounded-full blur-3xl -translate-x-1/2 -translate-y-1/2 pointer-events-none" />
    <div className="fixed bottom-0 right-0 w-96 h-96 bg-primary/5 rounded-full blur-3xl translate-x-1/2 translate-y-1/2 pointer-events-none" />

    {/* Navigation placeholder */}
    <nav className="relative z-10 flex justify-between items-center px-6 py-4 border-b border-slate-800/50">
      <div className="flex items-center gap-2">
        <div className="bg-gradient-to-br from-primary to-primary/60 p-2 rounded-xl">
          <Bike className="w-5 h-5 text-white" />
        </div>
        <span className="text-lg font-bold text-white">MotoFix</span>
      </div>
      <div className="text-xs text-slate-500">Versão 1.0</div>
    </nav>

    {/* Main content */}
    <div className="relative z-10 flex-1 flex flex-col items-center justify-center px-4 py-12">
      <div className="max-w-2xl w-full space-y-12">
        {/* Hero section */}
        <div className="space-y-6 text-center">
          <div className="inline-block">
            <div className="bg-gradient-to-br from-primary/30 to-primary/10 backdrop-blur-xl p-4 rounded-2xl border border-primary/20">
              <Bike className="w-12 h-12 text-primary" />
            </div>
          </div>
          
          <div className="space-y-3">
            <h1 className="text-5xl md:text-6xl font-black text-white leading-tight">
              MotoFix <span className="bg-gradient-to-r from-primary to-primary/60 bg-clip-text text-transparent">Manager</span>
            </h1>
            <p className="text-lg md:text-xl text-slate-300">
              Gerencie sua oficina com inteligência. Alertas automáticos, garantias organizadas e receita crescente.
            </p>
          </div>

          {/* Stats */}
          <div className="flex justify-center gap-8 pt-4">
            <div className="text-center">
              <p className="text-2xl font-bold text-primary">100%</p>
              <p className="text-xs text-slate-400 uppercase tracking-wide">Automático</p>
            </div>
            <div className="text-center">
              <p className="text-2xl font-bold text-primary">24/7</p>
              <p className="text-xs text-slate-400 uppercase tracking-wide">Disponível</p>
            </div>
            <div className="text-center">
              <p className="text-2xl font-bold text-primary">+50%</p>
              <p className="text-xs text-slate-400 uppercase tracking-wide">Receita</p>
            </div>
          </div>
        </div>

        {/* CTA Button */}
        <button 
          onClick={() => signInWithPopup(auth, googleProvider)}
          className="w-full group relative px-8 py-4 bg-gradient-to-r from-primary to-primary/80 hover:from-primary/90 hover:to-primary/70 text-white font-bold rounded-2xl transition-all duration-300 shadow-2xl shadow-primary/20 hover:shadow-primary/40 active:scale-95 flex items-center justify-center gap-3"
        >
          <img src="https://www.google.com/favicon.ico" alt="Google" className="w-5 h-5" />
          <span className="text-lg">Entrar com Google</span>
          <ArrowUpRight className="w-5 h-5 opacity-0 group-hover:opacity-100 transition-all -translate-y-1 group-hover:translate-y-0" />
        </button>

        {/* Features grid */}
        <div className="grid md:grid-cols-2 gap-4 pt-8">
          <div className="group bg-gradient-to-br from-slate-800/50 to-slate-800/20 backdrop-blur-sm border border-slate-700/50 hover:border-primary/30 rounded-2xl p-6 transition-all duration-300 hover:shadow-xl hover:shadow-primary/10">
            <div className="bg-gradient-to-br from-primary/20 to-primary/5 w-12 h-12 rounded-lg flex items-center justify-center mb-4 group-hover:scale-110 transition-transform">
              <Bell className="w-6 h-6 text-primary" />
            </div>
            <h3 className="font-bold text-white mb-2 text-lg">Alertas Inteligentes</h3>
            <p className="text-sm text-slate-400">Rastreamento automático de manutenções com envio simplificado via WhatsApp</p>
          </div>

          <div className="group bg-gradient-to-br from-slate-800/50 to-slate-800/20 backdrop-blur-sm border border-slate-700/50 hover:border-primary/30 rounded-2xl p-6 transition-all duration-300 hover:shadow-xl hover:shadow-primary/10">
            <div className="bg-gradient-to-br from-primary/20 to-primary/5 w-12 h-12 rounded-lg flex items-center justify-center mb-4 group-hover:scale-110 transition-transform">
              <ShieldCheck className="w-6 h-6 text-primary" />
            </div>
            <h3 className="font-bold text-white mb-2 text-lg">Garantias Organizadas</h3>
            <p className="text-sm text-slate-400">Certificados automáticos e gestão de prazos de garantia</p>
          </div>

          <div className="group bg-gradient-to-br from-slate-800/50 to-slate-800/20 backdrop-blur-sm border border-slate-700/50 hover:border-primary/30 rounded-2xl p-6 transition-all duration-300 hover:shadow-xl hover:shadow-primary/10">
            <div className="bg-gradient-to-br from-primary/20 to-primary/5 w-12 h-12 rounded-lg flex items-center justify-center mb-4 group-hover:scale-110 transition-transform">
              <BarChart3 className="w-6 h-6 text-primary" />
            </div>
            <h3 className="font-bold text-white mb-2 text-lg">Dashboard em Tempo Real</h3>
            <p className="text-sm text-slate-400">Visualize sua receita, clientes e performance instantaneamente</p>
          </div>

          <div className="group bg-gradient-to-br from-slate-800/50 to-slate-800/20 backdrop-blur-sm border border-slate-700/50 hover:border-primary/30 rounded-2xl p-6 transition-all duration-300 hover:shadow-xl hover:shadow-primary/10">
            <div className="bg-gradient-to-br from-primary/20 to-primary/5 w-12 h-12 rounded-lg flex items-center justify-center mb-4 group-hover:scale-110 transition-transform">
              <Users className="w-6 h-6 text-primary" />
            </div>
            <h3 className="font-bold text-white mb-2 text-lg">Gestão de Clientes</h3>
            <p className="text-sm text-slate-400">Base de dados organizada com histórico completo de serviços</p>
          </div>
        </div>

        {/* Trust indicators */}
        <div className="flex flex-col items-center gap-4 pt-8 border-t border-slate-800/50">
          <p className="text-sm text-slate-400">Confie em uma solução testada e validada</p>
          <div className="flex items-center justify-center gap-6 text-slate-500">
            <div className="flex items-center gap-2">
              <CheckCircle className="w-4 h-4 text-primary" />
              <span className="text-xs">Seguro</span>
            </div>
            <div className="flex items-center gap-2">
              <CheckCircle className="w-4 h-4 text-primary" />
              <span className="text-xs">Rápido</span>
            </div>
            <div className="flex items-center gap-2">
              <CheckCircle className="w-4 h-4 text-primary" />
              <span className="text-xs">Confiável</span>
            </div>
          </div>
        </div>
      </div>
    </div>

    {/* Footer */}
    <footer className="relative z-10 border-t border-slate-800/50 bg-slate-900/50 px-4 py-6 text-center text-xs text-slate-500">
      <p>© 2026 MotoFix Manager. Desenvolvido para oficinas que crescem.</p>
    </footer>
  </div>
);

const CheckoutScreen = ({ user, onPaymentSuccess }: { user: User; onPaymentSuccess: () => void }) => {
  const [isProcessing, setIsProcessing] = useState(false);
  const [showPaymentForm, setShowPaymentForm] = useState(false);
  const [stripeLoaded, setStripeLoaded] = useState(false);

  const handleCheckout = async () => {
    try {
      setIsProcessing(true);
      // TODO: Integrar com Stripe para criar sessão de checkout
      // Por enquanto, mostramos um placeholder
      setShowPaymentForm(true);
    } catch (error) {
      console.error('Erro ao iniciar checkout:', error);
      sonnerToast.error('Erro ao processar pagamento');
    } finally {
      setIsProcessing(false);
    }
  };

  return (
    <div className="min-h-screen flex flex-col bg-gradient-to-b from-black via-slate-900 to-black overflow-hidden">
      {/* Background elements */}
      <div className="fixed top-0 left-0 w-96 h-96 bg-primary/5 rounded-full blur-3xl -translate-x-1/2 -translate-y-1/2 pointer-events-none" />
      <div className="fixed bottom-0 right-0 w-96 h-96 bg-primary/5 rounded-full blur-3xl translate-x-1/2 translate-y-1/2 pointer-events-none" />

      {/* Header */}
      <div className="relative z-10 border-b border-slate-800/50 px-6 py-4">
        <button onClick={() => signOut(auth)} className="flex items-center gap-2 text-slate-400 hover:text-white transition-colors">
          <ArrowLeft className="w-4 h-4" />
          <span className="text-sm">Sair</span>
        </button>
      </div>

      {/* Main content */}
      <div className="relative z-10 flex-1 flex flex-col items-center justify-center px-4 py-12">
        <div className="max-w-md w-full space-y-8">
          {!showPaymentForm ? (
            <>
              {/* Pricing card */}
              <div className="space-y-6 text-center">
                <div className="inline-block">
                  <div className="bg-gradient-to-br from-primary/30 to-primary/10 backdrop-blur-xl p-4 rounded-2xl border border-primary/20">
                    <Bike className="w-12 h-12 text-primary" />
                  </div>
                </div>

                <div className="space-y-2">
                  <h2 className="text-3xl font-bold text-white">Ative sua assinatura</h2>
                  <p className="text-slate-400 text-sm">Acesse todas as features do MotoFix Manager</p>
                </div>
              </div>

              {/* Pricing box */}
              <div className="bg-gradient-to-br from-slate-800/50 to-slate-800/20 backdrop-blur-sm border border-slate-700/50 rounded-2xl p-8 space-y-6">
                {/* Price */}
                <div className="text-center space-y-2">
                  <div className="flex items-baseline justify-center gap-1">
                    <span className="text-5xl font-bold text-white">R$ 49</span>
                    <span className="text-slate-400">,90</span>
                  </div>
                  <p className="text-slate-400 text-sm">por mês</p>
                </div>

                {/* Features */}
                <div className="space-y-3 border-y border-slate-700/50 py-6">
                  <div className="flex items-start gap-3">
                    <CheckCircle className="w-5 h-5 text-primary flex-shrink-0 mt-0.5" />
                    <span className="text-sm text-slate-300">Dashboard com análise de receita</span>
                  </div>
                  <div className="flex items-start gap-3">
                    <CheckCircle className="w-5 h-5 text-primary flex-shrink-0 mt-0.5" />
                    <span className="text-sm text-slate-300">Gestão de clientes e veículos</span>
                  </div>
                  <div className="flex items-start gap-3">
                    <CheckCircle className="w-5 h-5 text-primary flex-shrink-0 mt-0.5" />
                    <span className="text-sm text-slate-300">Alertas inteligentes via WhatsApp</span>
                  </div>
                  <div className="flex items-start gap-3">
                    <CheckCircle className="w-5 h-5 text-primary flex-shrink-0 mt-0.5" />
                    <span className="text-sm text-slate-300">Certificados e garantias automáticas</span>
                  </div>
                  <div className="flex items-start gap-3">
                    <CheckCircle className="w-5 h-5 text-primary flex-shrink-0 mt-0.5" />
                    <span className="text-sm text-slate-300">Suporte prioritário</span>
                  </div>
                </div>

                {/* CTA */}
                <button
                  onClick={handleCheckout}
                  disabled={isProcessing}
                  className="w-full px-4 py-3 bg-gradient-to-r from-primary to-primary/80 hover:from-primary/90 hover:to-primary/70 disabled:from-slate-600 disabled:to-slate-600 text-white font-bold rounded-xl transition-all active:scale-95"
                >
                  {isProcessing ? 'Processando...' : 'Pagar agora com PIX ou Cartão'}
                </button>

                <p className="text-xs text-slate-500 text-center">
                  Cancelar assinatura a qualquer momento. Sem compromisso.
                </p>
              </div>
            </>
          ) : (
            <div className="bg-gradient-to-br from-slate-800/50 to-slate-800/20 backdrop-blur-sm border border-slate-700/50 rounded-2xl p-8 text-center space-y-4">
              <div className="bg-slate-800/50 rounded-xl p-6 space-y-3">
                <Bell className="w-8 h-8 text-primary mx-auto" />
                <h3 className="text-white font-bold">Formulário de pagamento</h3>
                <p className="text-sm text-slate-400">O Stripe Payment Element será carregado aqui</p>
                <p className="text-xs text-slate-500 bg-slate-900/50 p-3 rounded">
                  ⚠️ Aguardando integração do backend com Stripe para processar pagamentos
                </p>
              </div>
              <button
                onClick={() => setShowPaymentForm(false)}
                className="w-full px-4 py-2 bg-slate-700 hover:bg-slate-600 text-white rounded-lg transition"
              >
                Voltar
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

// --- Main App ---

const DEFAULT_SETTINGS: Settings = {
  userId: '',
  whatsappTemplate: "Olá {client}, sua {bike} está agendada para manutenção em {date}. Nos vemos lá!",
  oilTypes: ['10W30', '10W40', '20W50', 'Motul 3000', 'Motul 5000', 'Yamalube'],
  warrantyCategories: ['Motor', 'Câmbio', 'Elétrica', 'Suspensão', 'Freios', 'Pintura', 'Geral'],
  businessName: 'Minha Oficina',
  businessPhone: '',
  businessInstagram: '',
  businessAddress: '',
  isProfileComplete: false
};

export default function App() {
  const [user, setUser] = useState<User | null>(null);
  const [userProfile, setUserProfile] = useState<UserProfile | null>(null);
  const [allUsers, setAllUsers] = useState<UserProfile[]>([]);
  const [loading, setLoading] = useState(true);
  const [view, setView] = useState<'dashboard' | 'clients' | 'clients-schedule' | 'clients-schedule-add' | 'history' | 'settings' | 'new-client' | 'new-service' | 'warranties' | 'new-warranty' | 'admin' | 'report' | 'checkout' | 'subscription-expired'>('dashboard');
  const [clients, setClients] = useState<Client[]>([]);
  const [maintenances, setMaintenances] = useState<MaintenanceRecord[]>([]);
  const [warranties, setWarranties] = useState<Warranty[]>([]);
  const [settings, setSettings] = useState<Settings>(DEFAULT_SETTINGS);
  const [isNewUser, setIsNewUser] = useState<boolean | null>(null);
  const [settingsLoaded, setSettingsLoaded] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [editingClient, setEditingClient] = useState<Client | null>(null);
  const [clientNameInput, setClientNameInput] = useState('');
  const [clientSuggestions, setClientSuggestions] = useState<Client[]>([]);
  const [editingWarranty, setEditingWarranty] = useState<Warranty | null>(null);
  const [deleteConfirm, setDeleteConfirm] = useState<{ id: string, type: 'client' | 'maintenance' | 'warranty' | 'message_log' } | null>(null);
  const [saveMessage, setSaveMessage] = useState<string | null>(null);
  const [toast, setToast] = useState<{ message: string; type: 'success' | 'error' } | null>(null);
  const [messageLogs, setMessageLogs] = useState<MessageLog[]>([]);
  const [isNewService, setIsNewService] = useState(false);
  const [historyFilters, setHistoryFilters] = useState({
    startDate: format(startOfMonth(new Date()), 'yyyy-MM-dd'),
    endDate: format(endOfMonth(new Date()), 'yyyy-MM-dd'),
    clientName: '',
    serviceType: 'all',
    isRecurring: 'all'
  });
  const [isSaving, setIsSaving] = useState(false);
  const [processingId, setProcessingId] = useState<string | null>(null);
  const [expandedHistoryClients, setExpandedHistoryClients] = useState<Set<string>>(new Set());
  const [showMoreDetails, setShowMoreDetails] = useState(false);
  const [valorPagoInput, setValorPagoInput] = useState<string>('');

  const ADMIN_EMAILS = ['6snailiw@gmail.com', 'emailgithubb@gmail.com'];

  useEffect(() => {
    if (toast) {
      const timer = setTimeout(() => setToast(null), 3000);
      return () => clearTimeout(timer);
    }
  }, [toast]);

  // Chart Data Calculation
  const chartData = useMemo(() => {
    const months = ['Jan', 'Fev', 'Mar', 'Abr', 'Mai', 'Jun', 'Jul', 'Ago', 'Set', 'Out', 'Nov', 'Dez'];
    const last6Months: Array<{ month: string; monthIndex: number; year: number; count: number }> = [];
    const now = new Date();
    
    for (let i = 5; i >= 0; i--) {
      const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
      last6Months.push({
        month: months[d.getMonth()],
        monthIndex: d.getMonth(),
        year: d.getFullYear(),
        count: 0
      });
    }

    clients.forEach(c => {
      if (!c.lastMaintenanceDate) return;
      const mDate = parseISO(c.lastMaintenanceDate);
      const dataPoint = last6Months.find(p => p.monthIndex === mDate.getMonth() && p.year === mDate.getFullYear());
      if (dataPoint) dataPoint.count++;
    });

    return last6Months;
  }, [clients]);

  // Auth listener - simplified without aggressive retries
  useEffect(() => {
    let isMounted = true;
    
    const loadUserProfile = async (user: User) => {
      try {
        const userDoc = doc(db, 'users', user.uid);
        
        // Increase timeout to 20 seconds for slow connections
        const userSnap = await Promise.race([
          getDoc(userDoc),
          new Promise((_, reject) => 
            setTimeout(() => reject(new Error('Timeout loading user profile (>20s)')), 20000)
          )
        ]) as any;
        
        if (!isMounted) return;
        
        const userExists = userSnap.exists();
        setIsNewUser(!userExists);
        
        if (userExists) {
          setUserProfile(userSnap.data() as UserProfile);
        } else {
          const isAdminUser = ADMIN_EMAILS.includes(user.email || '');
          const newProfile: UserProfile = {
            uid: user.uid,
            email: user.email || '',
            displayName: user.displayName || 'Usuário',
            role: isAdminUser ? 'admin' : 'user',
            isActive: isAdminUser,
            subscription: {
              status: isAdminUser ? 'active' : 'inactive',
              plan: 'free',
              startsAt: format(new Date(), "yyyy-MM-dd'T'HH:mm:ss'Z'"),
              expiresAt: format(addDays(new Date(), 30), "yyyy-MM-dd'T'HH:mm:ss'Z'"),
              currentPeriodEnd: format(addDays(new Date(), 30), "yyyy-MM-dd'T'HH:mm:ss'Z'"),
              autoRenew: false
            },
            subscriptionExpiresAt: format(addDays(new Date(), 30), "yyyy-MM-dd'T'HH:mm:ss'Z'"),
            createdAt: format(new Date(), "yyyy-MM-dd'T'HH:mm:ss'Z'")
          };
          await setDoc(userDoc, newProfile);
          setUserProfile(newProfile);
        }
        setLoading(false);
      } catch (error) {
        console.error('Failed to load user profile:', error);
        if (isMounted) {
          // Allow app to continue but mark as not fully loaded
          setUserProfile(null);
          setIsNewUser(false);
          setLoading(false);
        }
      }
    };
    
    return onAuthStateChanged(auth, (user) => {
      if (user) {
        setUser(user);
        setLoading(true);
        loadUserProfile(user);
      } else {
        if (isMounted) {
          setUser(null);
          setUserProfile(null);
          setIsNewUser(null);
          setLoading(false);
        }
      }
      return () => { isMounted = false; };
    });
  }, []);

  // Subscription expiry check
  useEffect(() => {
    if (!userProfile || userProfile.role === 'admin' || !userProfile.subscriptionExpiresAt || !userProfile.isActive) return;

    const expiryDate = parseISO(userProfile.subscriptionExpiresAt);
    const today = new Date();

    // If today is after expiry date, block the user
    if (isBefore(expiryDate, today)) {
      updateDoc(doc(db, 'users', userProfile.uid), {
        isActive: false
      }).catch(e => console.error("Error auto-blocking expired user", e));
    }
  }, [userProfile]);

  // Data listeners
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

    const settingsDoc = doc(db, 'users', user.uid, 'settings', 'config');
    const unsubscribeSettings = onSnapshot(settingsDoc, (snapshot) => {
      if (snapshot.exists()) {
        const data = snapshot.data();
        const updatedSettings: Settings = {
          userId: user.uid,
          whatsappTemplate: data.whatsappTemplate || "Olá {client}, sua {bike} está agendada para manutenção em {date}. Nos vemos lá!",
          oilTypes: data.oilTypes || ['10W30', '10W40', '20W50', 'Motul 3000', 'Motul 5000', 'Yamalube'],
          warrantyCategories: data.warrantyCategories || ['Motor', 'Câmbio', 'Elétrica', 'Suspensão', 'Freios', 'Pintura', 'Geral'],
          businessName: data.businessName || '',
          businessPhone: data.businessPhone || '',
          businessInstagram: data.businessInstagram || '',
          businessAddress: data.businessAddress || '',
          isProfileComplete: data.isProfileComplete || false
        };
        setSettings(updatedSettings);
        setSettingsLoaded(true);
        
        // If fields were missing, update the doc only if they are actually missing to avoid loops
        const needsUpdate = !data.oilTypes || !data.warrantyCategories || data.isProfileComplete === undefined;
        if (needsUpdate) {
          updateDoc(settingsDoc, {
            oilTypes: updatedSettings.oilTypes,
            warrantyCategories: updatedSettings.warrantyCategories,
            isProfileComplete: updatedSettings.isProfileComplete
          }).catch(e => console.error("Error updating settings with defaults", e));
        }
      } else {
        // Initial settings - if not a new user, mark as profile complete
        // New users need to fill in business details before proceeding
        const initialSettings: Settings = {
          userId: user.uid,
          whatsappTemplate: "Olá {client}, sua {bike} está agendada para manutenção em {date}. Nos vemos lá!",
          oilTypes: ['10W30', '10W40', '20W50', 'Motul 3000', 'Motul 5000', 'Yamalube'],
          warrantyCategories: ['Motor', 'Câmbio', 'Elétrica', 'Suspensão', 'Freios', 'Pintura', 'Geral'],
          businessName: '',
          businessPhone: '',
          businessInstagram: '',
          businessAddress: '',
          isProfileComplete: !isNewUser // true for returning users, false for new users
        };
        setDoc(settingsDoc, initialSettings).catch(error => console.error("Error creating settings", error));
        setSettings(initialSettings);
        setSettingsLoaded(true);
      }
    }, (error) => {
      console.error('Settings listener error:', error);
      // Set default settings if listener fails
      setSettings({
        userId: user.uid,
        whatsappTemplate: "Olá {client}, sua {bike} está agendada para manutenção em {date}. Nos vemos lá!",
        oilTypes: ['10W30', '10W40', '20W50', 'Motul 3000', 'Motul 5000', 'Yamalube'],
        warrantyCategories: ['Motor', 'Câmbio', 'Elétrica', 'Suspensão', 'Freios', 'Pintura', 'Geral'],
        businessName: '',
        businessPhone: '',
        businessInstagram: '',
        businessAddress: '',
        isProfileComplete: false
      });
      setSettingsLoaded(true);
    });

    // Admin listener
    let unsubscribeUsers = () => {};
    if (userProfile.role === 'admin') {
      const usersQuery = collection(db, 'users');
      unsubscribeUsers = onSnapshot(usersQuery, (snapshot) => {
        const usersData = snapshot.docs.map(doc => doc.data() as UserProfile);
        setAllUsers(usersData.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()));
      }, (error) => {
        console.error('Admin users listener error:', error);
        // Don't throw - allow app to continue without admin data
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
      unsubscribeSettings();
      unsubscribeUsers();
      unsubscribeMessageLogs();
    };
  }, [user, userProfile]);

  // Status calculation logic
  const getStatus = (nextDateStr?: string): MaintenanceStatus => {
    if (!nextDateStr) return 'OK'; // Default to OK if no date
    try {
      const nextDate = parseISO(nextDateStr);
      const today = startOfDay(new Date());
      const daysUntil = differenceInDays(nextDate, today);

      if (daysUntil < 0) return 'OVERDUE';
      if (daysUntil <= 3) return 'WARNING';
      return 'OK';
    } catch {
      return 'OK'; // If date parsing fails, return OK
    }
  };

  // Update statuses periodically without infinite loops
  useEffect(() => {
    if (!user?.uid) return; // Early return se user não existir
    
    const checkStatuses = async () => {
      // Usamos o estado atual de clients de forma segura
      for (const client of clients) {
        if (!client.nextMaintenanceDate) continue; // Skip if no date
        const currentStatus = getStatus(client.nextMaintenanceDate);
        if (currentStatus !== client.status) {
          try {
            await updateDoc(doc(db, 'users', user.uid, 'clients', client.id), { status: currentStatus });
          } catch (e) {
            console.error("Erro ao atualizar status do cliente", client.id, e);
          }
        }
      }
    };

    // Executa uma vez ao carregar e depois a cada 5 minutos (menos agressivo para performance)
    checkStatuses();
    const interval = setInterval(checkStatuses, 300000); 
    return () => clearInterval(interval);
  }, [clients.length]); // Somente re-executa se a quantidade de clientes mudar

  // --- Handlers ---

  const handleAddMaintenance = async (client: Client, date: string = format(new Date(), "yyyy-MM-dd'T'HH:mm:ss'Z'")) => {
    if (!user || processingId === client?.id) return;

    // CORREÇÃO 1: Impedir marcação dupla de serviço realizado
    if (client?.status === 'OK') {
      sonnerToast.error(`O serviço para ${client?.name} já foi registrado recentemente.`);
      return;
    }

    setProcessingId(client?.id);
    const nextDate = format(addDays(parseISO(date), client?.recurrenceDays || 30), "yyyy-MM-dd'T'HH:mm:ss'Z'");
    
    const serviceValue = client?.lastServiceValue || client?.oilPrice || 0;
    const serviceType = client?.lastServiceType || 'Troca de Óleo';

    try {
      // 1. Add to history
      await addDoc(collection(db, 'users', user.uid, 'maintenances'), {
        clientId: client.id,
        clientName: client.name,
        bikeModel: client.bikeModel,
        date: date,
        oilType: client.oilType,
        oilPrice: client.oilPrice || 0,
        serviceType: serviceType,
        serviceValue: serviceValue,
        isRecurringRevenue: client.isRecurringRevenue || false,
        userId: user.uid,
        notes: "Manutenção periódica realizada via botão rápido."
      });

      // 2. Update client
      await updateDoc(doc(db, 'users', user.uid, 'clients', client.id), {
        lastMaintenanceDate: date,
        nextMaintenanceDate: nextDate,
        status: getStatus(nextDate),
        notificacao_enviada: false,
        notificacaoStatus: 'pendente',
        lastServiceType: serviceType,
        lastServiceValue: serviceValue,
        lastServiceNotes: "Manutenção periódica realizada via botão rápido."
      });
      
      sonnerToast.success(`Serviço de ${client.name} confirmado com sucesso!`);
    } catch (error) {
      handleFirestoreError(error, OperationType.WRITE, 'maintenances/clients');
      sonnerToast.error("Erro ao confirmar serviço.");
    } finally {
      setProcessingId(null);
    }
  };

  // Helper: Normalize client name (lowercase + trim) to avoid duplicates
  const normalizeClientName = (name: string): string => name.toLowerCase().trim();

  const handleClientNameChange = (value: string) => {
    setClientNameInput(value);
    if (value.length > 0) {
      const normalizedInput = normalizeClientName(value);
      const filtered = clients.filter(c => 
        normalizeClientName(c.name).includes(normalizedInput)
      );
      setClientSuggestions(filtered);
    } else {
      setClientSuggestions([]);
    }
  };

  // 📝 Load client data and last maintenance CORRECTLY to avoid zero values
  const handleSelectClientSuggestion = (client: Client) => {
    setClientNameInput(client?.name || '');
    setClientSuggestions([]);
    
    // 🔍 CRITICO: Find the last maintenance for this client to populate form correctly
    const clientMaintenance = maintenances
      .filter(m => m.clientId === client?.id)
      .sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime())[0];
    
    // ℹ️ Merge client data with last maintenance data to avoid zero values
    // 💡 Try multiple fallbacks to ensure serviceValue is never 0
    const finalServiceValue = 
      clientMaintenance?.serviceValue || 
      client?.lastServiceValue || 
      client?.serviceValue ||
      client?.oilPrice || 
      0;
    
    setEditingClient({
      ...client,
      // 💡 Keep original values from last maintenance (don't use new date)
      serviceValue: finalServiceValue,
      valorPago: clientMaintenance?.valorPago || client?.valorPago || 0,
      statusPagamento: clientMaintenance?.statusPagamento || client?.statusPagamento || 'Pago',
      saldoDevedor: clientMaintenance?.saldoDevedor || client?.saldoDevedor || 0,
      // Use date from last maintenance if exists, don't reset to today
      lastMaintenanceDate: clientMaintenance?.date || client?.lastMaintenanceDate || format(new Date(), "yyyy-MM-dd'T'HH:mm:ss'Z'")
    });
  };

  const handleSaveClient = async (clientData: Partial<Client> & { serviceType?: string, serviceValue?: number, statusPagamento?: string, valorPago?: number, notes?: string }) => {
    if (!user) return;
    setIsSaving(true);

    // Check for potential duplicates (normalized name comparison)
    if (!editingClient && clientData.name) {
      const normalizedNewName = normalizeClientName(clientData.name);
      const potentialDuplicate = clients.find(c => normalizeClientName(c.name) === normalizedNewName);
      if (potentialDuplicate) {
        console.warn(`Possível cliente duplicado encontrado: "${potentialDuplicate.name}". Prosseguindo com novaentrada...`);
      }
    }

    const lastDate = clientData.lastMaintenanceDate || format(new Date(), "yyyy-MM-dd'T'HH:mm:ss'Z'");
    const recurrence = clientData.recurrenceDays || 29;
    const nextDate = format(addDays(parseISO(lastDate), recurrence), "yyyy-MM-dd'T'HH:mm:ss'Z'");
    
    // Calcular saldo devedor
    const serviceValue = clientData.serviceValue || clientData.oilPrice || 0;
    const valorPago = clientData.valorPago || 0;
    const saldoDevedor = Math.max(0, serviceValue - valorPago);
    
    const finalClientData = {
      name: clientData.name,
      bikeModel: clientData.bikeModel,
      contact: clientData.contact,
      oilType: clientData.oilType || '',
      oilPrice: clientData.oilPrice || 0,
      userId: user.uid,
      lastMaintenanceDate: lastDate,
      nextMaintenanceDate: nextDate,
      recurrenceDays: recurrence,
      isRecurringRevenue: clientData.isRecurringRevenue || false,
      status: getStatus(nextDate),
      notificacao_enviada: clientData.notificacao_enviada || false,
      notificacaoStatus: clientData.notificacaoStatus || 'pendente',
      lastServiceType: clientData.serviceType || 'Troca de Óleo',
      lastServiceValue: serviceValue,
      lastServiceNotes: clientData.notes || "Serviço registrado via formulário.",
      lastAlertDate: clientData.lastAlertDate || '',
      statusPagamento: clientData.statusPagamento || 'Pago',
      valorPago: valorPago,
      saldoDevedor: saldoDevedor,
      createdAt: clientData.createdAt || format(new Date(), "yyyy-MM-dd'T'HH:mm:ss'Z'")
    };

    try {
      let clientId = editingClient?.id;
      if (editingClient) {
        await updateDoc(doc(db, 'users', user.uid, 'clients', editingClient.id), finalClientData);
      } else {
        const docRef = await addDoc(collection(db, 'users', user.uid, 'clients'), finalClientData);
        clientId = docRef.id;
      }

      // If it's a new service (has serviceType), create maintenance record
      // But if editingClient exists, don't auto-create (user must explicitly edit service)
      if (clientData.serviceType && !editingClient) {
        await addDoc(collection(db, 'users', user.uid, 'maintenances'), {
          clientId: clientId,
          clientName: clientData.name,
          bikeModel: clientData.bikeModel,
          date: lastDate,
          oilType: clientData.oilType || 'N/A',
          oilPrice: clientData.oilPrice || 0,
          serviceType: clientData.serviceType || 'Troca de Óleo',
          serviceValue: serviceValue,
          isRecurringRevenue: clientData.isRecurringRevenue || false,
          notes: clientData.notes || "Serviço registrado via formulário.",
          statusPagamento: clientData.statusPagamento || 'Pago',
          valorPago: valorPago,
          saldoDevedor: saldoDevedor,
          userId: user.uid
        });
        sonnerToast.success("Serviço registrado com sucesso!");
      } else if (editingClient && clientData.serviceType) {
        // When editing existing client with service info, UPDATE only the saldo/status
        // Find the most recent maintenance for this client
        const clientMaintenances = maintenances.filter(m => m.clientId === clientId).sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
        
        if (clientMaintenances.length > 0) {
          const latestMaintenance = clientMaintenances[0];
          // Only update payment-related fields, don't change serviceValue to avoid duplicating amounts
          await updateDoc(
            doc(db, 'users', user.uid, 'maintenances', latestMaintenance.id),
            {
              statusPagamento: clientData.statusPagamento || latestMaintenance.statusPagamento || 'Pago',
              valorPago: valorPago !== undefined ? valorPago : (latestMaintenance.valorPago || 0),
              saldoDevedor: saldoDevedor
            }
          );
        }
        sonnerToast.success("Cliente e pagamento atualizados com sucesso!");
      } else {
        sonnerToast.success("Cliente atualizado com sucesso!");
      }

      setEditingClient(null);
      setIsNewService(false);
      setClientNameInput('');
      setView('clients');
    } catch (error) {
      handleFirestoreError(error, editingClient ? OperationType.UPDATE : OperationType.CREATE, 'clients');
      sonnerToast.error("Erro ao salvar dados.");
    } finally {
      setIsSaving(false);
    }
  };

  const handleSaveWarranty = async (warrantyData: Partial<Warranty>) => {
    if (!user) return;
    setIsSaving(true);

    const serviceDate = warrantyData.serviceDate || format(new Date(), "yyyy-MM-dd'T'HH:mm:ss'Z'");
    const duration = warrantyData.durationMonths || 3;
    const expiryDate = format(addDays(parseISO(serviceDate), duration * 30), "yyyy-MM-dd'T'HH:mm:ss'Z'");
    
    // Get next warranty number
    const nextNumber = warranties.length > 0 ? Math.max(...warranties.map(w => w.warrantyNumber)) + 1 : 1;

    const finalData = {
      ...warrantyData,
      serviceValue: isNaN(warrantyData.serviceValue || 0) ? 0 : (warrantyData.serviceValue || 0),
      userId: user.uid,
      serviceDate,
      durationMonths: duration,
      expiryDate,
      warrantyNumber: warrantyData.warrantyNumber || nextNumber,
      createdAt: warrantyData.createdAt || format(new Date(), "yyyy-MM-dd'T'HH:mm:ss'Z'")
    };

    try {
      if (editingWarranty) {
        await updateDoc(doc(db, 'users', user.uid, 'warranties', editingWarranty.id), finalData);
        sonnerToast.success("Garantia atualizada com sucesso!");
      } else {
        const docRef = await addDoc(collection(db, 'users', user.uid, 'warranties'), finalData);
        sonnerToast.success("Garantia registrada com sucesso!");
        
        // Auto-generate PDF for new warranty
        setTimeout(() => {
          generateWarrantyPDF({ ...finalData, id: docRef.id } as Warranty);
        }, 500);
      }
      setEditingWarranty(null);
      setView('warranties');
    } catch (error) {
      handleFirestoreError(error, editingWarranty ? OperationType.UPDATE : OperationType.CREATE, 'warranties');
      sonnerToast.error("Erro ao salvar garantia.");
    } finally {
      setIsSaving(false);
    }
  };

  const handleDeleteWarranty = async (id: string) => {
    if (!user?.uid) return; // Early return se user não existir
    try {
      await deleteDoc(doc(db, 'users', user.uid, 'warranties', id));
      setDeleteConfirm(null);
    } catch (error) {
      handleFirestoreError(error, OperationType.DELETE, 'warranties');
    }
  };

  const handleDeleteMaintenance = async (id: string) => {
    if (!user?.uid) return; // Early return se user não existir
    try {
      await deleteDoc(doc(db, 'users', user.uid, 'maintenances', id));
      setDeleteConfirm(null);
    } catch (error) {
      handleFirestoreError(error, OperationType.DELETE, 'maintenances');
    }
  };

  // 💚 Confirm Payment: Mark as fully paid
  const handleConfirmPayment = async (maintenanceId: string | undefined, maintenance: MaintenanceRecord | undefined) => {
    // ✅ SAFETY CHECK: Ensure we have required data before proceeding
    if (!user?.uid || !maintenanceId || !maintenance) {
      sonnerToast.error('❌ Erro: Dados incompletos para confirmação');
      return;
    }
    
    try {
      setProcessingId(maintenanceId);
      await updateDoc(
        doc(db, 'users', user.uid, 'maintenances', maintenanceId),
        {
          statusPagamento: 'Pago',
          valorPago: maintenance.serviceValue || 0,
          saldoDevedor: 0
        }
      );
      sonnerToast.success('✅ Pagamento confirmado!');
    } catch (error) {
      console.error('handleConfirmPayment error:', error);
      handleFirestoreError(error, OperationType.UPDATE, 'maintenances');
    } finally {
      setProcessingId(null);
    }
  };

  // 💸 Settle Partial Debt: Move saldoDevedor to valorPago (pay the outstanding balance)
  const handleSettleDebt = async (maintenanceId: string | undefined, maintenance: MaintenanceRecord | undefined) => {
    // ✅ SAFETY CHECK: Ensure we have required data before proceeding
    if (!user?.uid || !maintenanceId || !maintenance) {
      sonnerToast.error('❌ Erro: Dados incompletos para quitação');
      return;
    }
    
    try {
      setProcessingId(maintenanceId);
      // Calculate new payment: existing payment + outstanding balance
      const newValorPago = Math.min(maintenance.serviceValue || 0, (maintenance.valorPago || 0) + (maintenance.saldoDevedor || 0));
      
      await updateDoc(
        doc(db, 'users', user.uid, 'maintenances', maintenanceId),
        {
          statusPagamento: 'Pago',
          valorPago: newValorPago,
          saldoDevedor: Math.max(0, (maintenance.serviceValue || 0) - newValorPago)
        }
      );
      sonnerToast.success('💸 Débito quitado com sucesso!');
    } catch (error) {
      console.error('handleSettleDebt error:', error);
      handleFirestoreError(error, OperationType.UPDATE, 'maintenances');
    } finally {
      setProcessingId(null);
    }
  };

  const generateWarrantyPDF = async (warranty: Warranty) => {
    if (!settings) return;

    const doc = new jsPDF({
      orientation: 'portrait',
      unit: 'mm',
      format: 'a4'
    });

    const pageWidth = doc.internal.pageSize.getWidth();
    const margin = 15;

    // Header
    doc.setFontSize(24);
    doc.setFont('helvetica', 'bold');
    doc.text(settings?.businessName || 'MOTOFIX', margin, 20);
    
    doc.setFontSize(10);
    doc.setFont('helvetica', 'normal');
    doc.text('Serviços Especializados em Manutenção', margin, 26);
    doc.text(`WhatsApp: ${settings?.businessPhone || 'N/A'} | Instagram: ${settings?.businessInstagram || 'N/A'}`, margin, 30);
    if (settings?.businessAddress) {
      doc.text(settings.businessAddress, margin, 34);
    }
    
    doc.setLineWidth(0.5);
    doc.line(margin, 37, pageWidth - margin, 37);

    // Title
    doc.setFontSize(18);
    doc.setFont('helvetica', 'bold');
    doc.text('CERTIFICADO DE GARANTIA', pageWidth / 2, 47, { align: 'center' });

    // Main Box
    const boxY = 57;
    const boxHeight = 85; // Increased height for long descriptions
    doc.setDrawColor(0);
    doc.setLineWidth(0.3);
    doc.roundedRect(margin, boxY, pageWidth - (margin * 2), boxHeight, 5, 5);

    // Content inside box
    doc.setFontSize(11);
    doc.setFont('helvetica', 'normal');
    let currentY = boxY + 10;
    const lineSpacing = 6;

    doc.text(`Nº da Garantia: ${warranty.warrantyNumber}`, margin + 5, currentY); currentY += lineSpacing;
    doc.text(`Cliente: ${warranty.clientName}`, margin + 5, currentY); currentY += lineSpacing;
    doc.text(`Telefone: ${warranty.clientPhone || 'N/A'}`, margin + 5, currentY); currentY += lineSpacing;
    doc.text(`Serviço: ${warranty.serviceType}`, margin + 5, currentY); currentY += lineSpacing;
    
    // Split description to avoid cutting off
    const splitDescription = doc.splitTextToSize(`Descrição: ${warranty.serviceDescription || 'N/A'}`, pageWidth - (margin * 2) - 10);
    doc.text(splitDescription, margin + 5, currentY); 
    currentY += (splitDescription.length * lineSpacing);

    // Ensure we don't overlap if description is very long
    if (currentY > boxY + boxHeight - 20) {
      // If description is too long, we might need to adjust or add a page, 
      // but for now let's just ensure basic fields are printed
    }

    doc.text(`Valor: R$ ${warranty.serviceValue?.toFixed(2) || '0.00'}`, margin + 5, currentY); currentY += lineSpacing;
    doc.text(`Data do Serviço: ${format(parseISO(warranty.serviceDate), 'yyyy-MM-dd')}`, margin + 5, currentY); currentY += lineSpacing;
    doc.text(`Duração: ${warranty.durationMonths} mês(es)`, margin + 5, currentY); currentY += lineSpacing;
    doc.text(`Vencimento: ${format(parseISO(warranty.expiryDate), 'yyyy-MM-dd')}`, margin + 5, currentY);

    // Terms
    const termsY = boxY + boxHeight + 10;
    doc.setFont('helvetica', 'bold');
    doc.text('Termos da garantia', pageWidth - margin - 70, termsY);
    
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(9);
    const terms = [
      '1) A garantia cobre exclusivamente o serviço descrito neste certificado.',
      `2) Não cobre mau uso, quedas, adaptações, violação de lacres, ou peças não fornecidas/instaladas pela ${settings?.businessName || 'empresa'}.`,
      '3) É obrigatório apresentar este certificado (impresso ou digital) para acionamento.',
      '4) O prazo conta a partir da data do serviço, até a data de vencimento informada.'
    ];
    
    let termY = termsY + 6;
    terms.forEach(term => {
      const splitTerm = doc.splitTextToSize(term, 70);
      doc.text(splitTerm, pageWidth - margin - 70, termY);
      termY += (splitTerm.length * 4) + 1;
    });

    // Signatures
    const sigY = 240;
    doc.line(margin, sigY, margin + 80, sigY);
    doc.text('Assinatura do Cliente', margin + 40, sigY + 5, { align: 'center' });

    doc.line(pageWidth - margin - 80, sigY, pageWidth - margin, sigY);
    doc.text(`Assinatura ${settings?.businessName || 'MotoFix'}`, pageWidth - margin - 40, sigY + 5, { align: 'center' });

    // Footer
    doc.setFontSize(7);
    const now = format(new Date(), "dd/MM/yyyy', 'HH:mm:ss");
    doc.text(`Emitido automaticamente em ${now}`, pageWidth - margin, 265, { align: 'right' });

    doc.save(`Garantia_${warranty.warrantyNumber}_${warranty.clientName}.pdf`);
  };

  const handleDeleteClient = async (id: string) => {
    if (!user?.uid) return; // Early return se user não existir
    try {
      await deleteDoc(doc(db, 'users', user.uid, 'clients', id));
      setDeleteConfirm(null);
    } catch (error) {
      handleFirestoreError(error, OperationType.DELETE, 'clients');
    }
  };

  const handleDeleteMessageLog = async (id: string) => {
    if (!user?.uid) return; // Early return se user não existir
    try {
      await deleteDoc(doc(db, 'users', user.uid, 'message_logs', id));
      setDeleteConfirm(null);
      setToast({ message: "Log excluído com sucesso.", type: 'success' });
    } catch (error) {
      console.error("Erro ao excluir log:", error);
      setToast({ message: "Erro ao excluir log.", type: 'error' });
    }
  };

  const toggleUserStatus = async (targetUser: UserProfile) => {
    if (userProfile?.role !== 'admin') return;
    try {
      // If we are activating a user, we might want to set a default subscription if none exists
      const updates: any = { isActive: !targetUser.isActive };
      
      // If activating and no expiry set, set to 30 days from now by default
      if (!targetUser.isActive && !targetUser.subscriptionExpiresAt) {
        updates.subscriptionExpiresAt = format(addDays(new Date(), 30), "yyyy-MM-dd'T'HH:mm:ss'Z'");
      }

      await updateDoc(doc(db, 'users', targetUser.uid), updates);
    } catch (error) {
      handleFirestoreError(error, OperationType.UPDATE, 'users');
    }
  };

  const updateSubscription = async (uid: string, days: number) => {
    if (userProfile?.role !== 'admin') return;
    try {
      const targetUser = allUsers.find(u => u.uid === uid);
      if (!targetUser) return;
      
      const currentExpiry = targetUser.subscriptionExpiresAt ? parseISO(targetUser.subscriptionExpiresAt) : new Date();
      
      // If adding days and current is expired, start from today
      // If removing days, always subtract from current expiry
      let baseDate = currentExpiry;
      if (days > 0 && isBefore(currentExpiry, new Date())) {
        baseDate = new Date();
      }
      
      const newExpiry = format(addDays(baseDate, days), "yyyy-MM-dd'T'HH:mm:ss'Z'");
      
      await updateDoc(doc(db, 'users', uid), {
        subscriptionExpiresAt: newExpiry,
        isActive: isAfter(parseISO(newExpiry), new Date())
      });
    } catch (error) {
      handleFirestoreError(error, OperationType.UPDATE, 'users');
    }
  };

  const setSubscriptionDate = async (uid: string, dateStr: string) => {
    if (userProfile?.role !== 'admin') return;
    try {
      const newExpiry = `${dateStr}T23:59:59Z`;
      await updateDoc(doc(db, 'users', uid), {
        subscriptionExpiresAt: newExpiry,
        isActive: isAfter(parseISO(newExpiry), new Date())
      });
    } catch (error) {
      handleFirestoreError(error, OperationType.UPDATE, 'users');
    }
  };

  const sendWhatsApp = (client: Client) => {
    if (!user) return;
    
    try {
      // 1. Montar a mensagem e URL de forma SÍNCRONA
      // Isso é CRÍTICO para o iOS não bloquear o pop-up
      const message = AlertService.buildReminderMessage(settings?.whatsappTemplate || DEFAULT_SETTINGS.whatsappTemplate, client);
      const url = AlertService.createWhatsAppUrl(client, message);
      
      // 2. Abrir WhatsApp IMEDIATAMENTE
      // O Safari exige que window.open seja disparado diretamente pelo evento de clique
      // Sem NENHUM await ou chamada assíncrona antes.
      window.open(url, '_blank');
      
      // 3. Registrar a tentativa e atualizar status em segundo plano (async)
      // Não try-catch a verificação de win para evitar erros de COOP
      AlertService.registerManualReminderAttempt(db, user.uid, client, message)
        .then(result => {
          if (result.success) {
            setToast({ message: "WhatsApp aberto e status atualizado.", type: 'success' });
          }
        })
        .catch(err => console.error("Erro ao registrar log:", err));
    } catch (error) {
      console.error("Erro ao preparar WhatsApp:", error);
      setToast({ 
        message: error instanceof Error ? error.message : "Erro ao abrir WhatsApp. Verifique o cadastro do cliente.", 
        type: 'error' 
      });
    }
  };

  // --- Views ---

  const filteredClients = clients.filter(c => 
    c.name.toLowerCase().includes(searchQuery.toLowerCase()) || 
    c.bikeModel.toLowerCase().includes(searchQuery.toLowerCase())
  );

  const dashboardStats = useMemo(() => {
    const today = new Date();
    const currentMonth = today.getMonth();
    const currentYear = today.getFullYear();
    
    let revenue = 0;
    let recurringRevenue = 0;
    let servicesCount = 0;
    
    clients.forEach(c => {
      if (!c.lastMaintenanceDate) return;
      const mDate = parseISO(c.lastMaintenanceDate);
      if (mDate.getMonth() === currentMonth && mDate.getFullYear() === currentYear) {
        const val = c.lastServiceValue || c.oilPrice || 0;
        revenue += val;
        if (c.isRecurringRevenue) {
          recurringRevenue += val;
        }
        servicesCount++;
      }
    });
    
    return { revenue, recurringRevenue, servicesCount };
  }, [clients]);

  const activeWarrantiesCount = useMemo(() => {
    return warranties.filter(w => isAfter(parseISO(w.expiryDate), new Date())).length;
  }, [warranties]);

  // 💰 Cash Flow Stats: Recebido vs A Receber (per month + overall)
  const cashFlowStats = useMemo(() => {
    const today = new Date();
    const currentMonth = today.getMonth();
    const currentYear = today.getFullYear();
    
    let totalRecebidoMes = 0;      // Valor pago este mês
    let aReceber = 0;               // Saldo devedor aberto (geral)
    let faturamentoBrutoMes = 0;   // Valor total de serviços this month
    
    maintenances.forEach(m => {
      // Check if maintenance is in current month
      const mDate = parseISO(m.date);
      const isCurrentMonth = mDate.getMonth() === currentMonth && mDate.getFullYear() === currentYear;
      
      // Calculate A Receber (all open balances)
      aReceber += m.saldoDevedor || 0;
      
      // Month totals
      if (isCurrentMonth) {
        totalRecebidoMes += m.valorPago || 0;
        faturamentoBrutoMes += m.serviceValue || 0;
      }
    });
    
    return { 
      totalRecebidoMes, 
      aReceber, 
      faturamentoBrutoMes,
      // Useful derived values
      aReceberMes: maintenances
        .filter(m => {
          const mDate = parseISO(m.date);
          return mDate.getMonth() === currentMonth && mDate.getFullYear() === currentYear;
        })
        .reduce((sum, m) => sum + (m.saldoDevedor || 0), 0)
    };
  }, [maintenances]);

  // ✅ Hook calls MUST always be called in the same order
  // Even if we return early, we call the hooks first
  const overdueClients = useMemo(() => clients.filter(c => c.status === 'OVERDUE'), [clients]);
  const warningClients = useMemo(() => clients.filter(c => c.status === 'WARNING'), [clients]);
  const pendingAlerts = useMemo(() => AlertService.getDailyPendingAlerts(clients), [clients]);

  // Top Serviços ranking - MUST be at top level, not inside JSX
  const topServicesData = useMemo(() => {
    const servicesByRevenue = maintenances.reduce((acc: Record<string, number>, m) => {
      acc[m.serviceType] = (acc[m.serviceType] || 0) + (m.valorPago || 0);
      return acc;
    }, {});
    return Object.entries(servicesByRevenue)
      .sort(([,a], [,b]) => b - a)
      .slice(0, 5)
      .map(([service, revenue], index) => ({
        service,
        revenue,
        position: index + 1
      }));
  }, [maintenances]);

  // 💰 FINANCIAL STATISTICS (for Dashboard) - Lógica Corrigida
  const financialStats = useMemo(() => {
    // ✅ Receita Total (Dinheiro em Caixa):
    // - Se Pago: soma serviceValue (valor total do serviço)
    // - Se Pendente/Parcial: soma valorPago (somente o que foi pago)
    const totalReceita = maintenances.reduce((sum, m) => {
      if (m.statusPagamento === 'Pago') {
        return sum + (m.serviceValue || 0);
      } else if (m.statusPagamento === 'Parcial' || m.statusPagamento === 'Pendente') {
        return sum + (m.valorPago || 0);
      }
      return sum;
    }, 0);
    
    // ✅ Contas a Receber (O que falta cair)
    // Soma saldoDevedor APENAS de Pendentes e Parciais
    const contasAReceber = maintenances
      .filter(m => m.statusPagamento === 'Parcial' || m.statusPagamento === 'Pendente')
      .reduce((sum, m) => sum + (m.saldoDevedor || 0), 0);
    
    // ✅ Recorrentes: Soma de valorPago onde isRecurringRevenue === true
    const recurrentRevenue = maintenances
      .filter(m => m.isRecurringRevenue === true)
      .reduce((sum, m) => sum + (m.valorPago || 0), 0);
    
    // ✅ Contadores
    const totalClientes = clients.length;
    const totalGarantias = warranties.length;
    
    // ✅ Despesas: Soma de todos os expenses
    const totalDespesas = (settings?.expenses || []).reduce((sum, e) => sum + (Number(e.value) || Number(e.valor) || 0), 0);
    
    // ✅ Lucro Líquido: Receita - Despesas
    const lucroLiquido = totalReceita - totalDespesas;
    
    return {
      totalReceita,
      contasAReceber,
      recurrentRevenue,
      totalClientes,
      totalGarantias,
      totalDespesas,
      lucroLiquido
    };
  }, [maintenances, clients, warranties, settings?.expenses]);

  // Calculate saldo devedor (outstanding balance) per client
  const clientBalanceMap = useMemo(() => {
    const map = new Map<string, number>();
    maintenances.forEach(m => {
      if (m.clientId) {
        const currentBalance = map.get(m.clientId) || 0;
        map.set(m.clientId, currentBalance + (m.saldoDevedor || 0));
      }
    });
    return map;
  }, [maintenances]);

  // Group maintenances by client for history accordion view
  const groupedHistory = useMemo(() => {
    const filtered = maintenances
      .filter(record => {
        const recordDate = parseISO(record.date);
        const start = parseISO(historyFilters.startDate);
        const end = parseISO(historyFilters.endDate);
        const matchesDate = isWithinInterval(recordDate, { start, end });
        const matchesClient = record.clientName.toLowerCase().includes(historyFilters.clientName.toLowerCase());
        const matchesType = historyFilters.serviceType === 'all' || record.serviceType === historyFilters.serviceType;
        const matchesRecurring = historyFilters.isRecurring === 'all' || 
          (historyFilters.isRecurring === 'yes' && record.isRecurringRevenue) ||
          (historyFilters.isRecurring === 'no' && !record.isRecurringRevenue);
        
        return matchesDate && matchesClient && matchesType && matchesRecurring;
      })
      .sort((a, b) => b.date.localeCompare(a.date));

    // Group by clientName
    const grouped = new Map<string, MaintenanceRecord[]>();
    filtered.forEach(record => {
      if (!grouped.has(record.clientName)) {
        grouped.set(record.clientName, []);
      }
      grouped.get(record.clientName)!.push(record);
    });

    // Convert to sorted array
    return Array.from(grouped.entries())
      .map(([clientName, services]) => ({ clientName, services }))
      .sort((a, b) => a.clientName.localeCompare(b.clientName));
  }, [maintenances, historyFilters]);

  // Early returns AFTER all hooks
  if (loading) return <LoadingScreen />;
  if (!user) return <AuthScreen />;

  // Blocked Screen
  if (userProfile && !userProfile.isActive) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background-dark p-4">
        <div className="bg-slate-800 p-8 rounded-3xl border border-primary/20 max-w-md w-full text-center space-y-6">
          <div className="bg-primary/20 w-20 h-20 rounded-full flex items-center justify-center mx-auto">
            <Lock className="w-10 h-10 text-primary" />
          </div>
          <h1 className="text-2xl font-bold text-white">Acesso Restrito</h1>
          <p className="text-slate-400">Sua conta está aguardando ativação pelo administrador. Entre em contato para liberar seu acesso:</p>
          <div className="bg-slate-900/50 p-4 rounded-2xl border border-slate-700 text-left space-y-3">
            <a 
              href="https://wa.me/556999944024" 
              target="_blank" 
              rel="noopener noreferrer"
              className="text-sm flex items-center gap-2 text-slate-300 hover:text-primary transition-colors"
            >
              <MessageSquare className="w-4 h-4 text-primary" />
              <span className="font-bold">WhatsApp:</span> +55 69 99944024
            </a>
            <a 
              href="https://instagram.com/motofix_recorrentes" 
              target="_blank" 
              rel="noopener noreferrer"
              className="text-sm flex items-center gap-2 text-slate-300 hover:text-primary transition-colors"
            >
              <SettingsIcon className="w-4 h-4 text-primary" />
              <span className="font-bold">Instagram:</span> @motofix_recorrentes
            </a>
          </div>
          <div className="pt-4">
            <p className="text-xs text-slate-500 uppercase font-bold tracking-widest mb-2">Seu ID de Usuário:</p>
            <code className="bg-slate-900 px-3 py-1 rounded-lg text-primary text-xs">{user.uid}</code>
          </div>
          <button 
            onClick={() => signOut(auth)}
            className="w-full py-3 bg-slate-700 text-white font-bold rounded-xl hover:bg-slate-600 transition-all"
          >
            Sair da Conta
          </button>
        </div>
      </div>
    );
  }

  return (
    <ErrorBoundary>
      <div className="min-h-screen bg-background-dark text-slate-100 pb-24 font-display">
        {/* Header */}
        <header className="sticky top-0 z-50 bg-background-dark/80 backdrop-blur-md border-b border-primary/10 px-4 py-3 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <div className="bg-primary/20 p-1.5 rounded-lg">
              <Bike className="text-primary w-5 h-5" />
            </div>
            <h1 className="text-lg font-bold tracking-tight">MotoFix</h1>
          </div>
          <div className="flex items-center gap-2">
            <button 
              onClick={() => setView('settings')}
              className="p-1.5 rounded-full hover:bg-slate-800 transition-colors text-slate-400"
            >
              <SettingsIcon className="w-4.5 h-4.5" />
            </button>
            <button 
              onClick={() => signOut(auth)}
              className="p-1.5 rounded-full hover:bg-red-500/10 transition-colors text-red-500"
            >
              <LogOut className="w-4.5 h-4.5" />
            </button>
          </div>
        </header>

        <main className="max-w-5xl mx-auto p-4 space-y-6">
          {view === 'dashboard' && (
            <div className="space-y-8">
              {/* 💰 Fluxo de Caixa: Recebido vs A Receber */}
              <div className="grid grid-cols-2 md:grid-cols-2 gap-3">
                <div className="bg-emerald-500/10 p-4 rounded-2xl border border-emerald-500/20 flex flex-col justify-between">
                  <p className="text-[9px] font-bold text-emerald-500 uppercase tracking-widest mb-3">💰 Total Recebido</p>
                  <div>
                    <p className="text-2xl font-bold text-emerald-400">R$ {cashFlowStats.totalRecebidoMes.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}</p>
                    <p className="text-[10px] text-emerald-600/70 mt-1">Este mês</p>
                  </div>
                </div>
                <div className="bg-amber-500/10 p-4 rounded-2xl border border-amber-500/20 flex flex-col justify-between">
                  <p className="text-[9px] font-bold text-amber-500 uppercase tracking-widest mb-3">⏳ A Receber</p>
                  <div>
                    <p className="text-2xl font-bold text-amber-400">R$ {cashFlowStats.aReceber.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}</p>
                    <p className="text-[10px] text-amber-600/70 mt-1">Pendências abertas</p>
                  </div>
                </div>
              </div>

              {/* Resumo Financeiro */}
              <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                <div className="bg-emerald-500/10 p-3 rounded-2xl border border-emerald-500/20 flex flex-col justify-between">
                  <p className="text-[9px] font-bold text-emerald-500 uppercase tracking-widest">Receita (Mês)</p>
                  <p className="text-lg font-bold text-white">R$ {dashboardStats.revenue.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}</p>
                  <TrendingUp className="w-4 h-4 text-emerald-500 mt-1" />
                </div>
                <div className="bg-primary/10 p-3 rounded-2xl border border-primary/20 flex flex-col justify-between">
                  <p className="text-[9px] font-bold text-primary uppercase tracking-widest">Recorrente</p>
                  <p className="text-lg font-bold text-white">R$ {dashboardStats.recurringRevenue.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}</p>
                  <RefreshCw className="w-4 h-4 text-primary mt-1" />
                </div>
                <div className="bg-blue-500/10 p-3 rounded-2xl border border-blue-500/20 flex flex-col justify-between">
                  <p className="text-[9px] font-bold text-blue-500 uppercase tracking-widest">Serviços</p>
                  <p className="text-lg font-bold text-white">{dashboardStats.servicesCount}</p>
                  <Wrench className="w-4 h-4 text-blue-500 mt-1" />
                </div>
                <div className="bg-purple-500/10 p-3 rounded-2xl border border-purple-500/20 flex flex-col justify-between">
                  <p className="text-[9px] font-bold text-purple-500 uppercase tracking-widest">Garantias</p>
                  <p className="text-lg font-bold text-white">{activeWarrantiesCount}</p>
                  <ShieldCheck className="w-4 h-4 text-purple-500 mt-1" />
                </div>
              </div>

              {/* Painel de Envios do Dia */}
              {pendingAlerts.length > 0 && (
                <div className="bg-primary/5 border border-primary/20 rounded-xl p-3 space-y-2">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <div className="bg-primary/20 p-1 rounded-lg">
                        <Bell className="w-3.5 h-3.5 text-primary animate-bounce" />
                      </div>
                      <div>
                        <h3 className="font-bold text-sm">Envios do Dia</h3>
                        <p className="text-[10px] text-slate-400">{pendingAlerts.length} pendentes hoje</p>
                      </div>
                    </div>
                  </div>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
                    {pendingAlerts.slice(0, 4).map(client => (
                      <div key={client.id} className="bg-slate-800/40 p-2.5 rounded-lg border border-slate-700/50 flex items-center justify-between group hover:border-primary/30 transition-all">
                        <div className="flex items-center gap-2">
                          <div className="w-7 h-7 rounded-full bg-slate-700/50 flex items-center justify-center">
                            <Bike className="w-3.5 h-3.5 text-slate-400" />
                          </div>
                          <div>
                            <p className="font-bold text-[11px] leading-tight">{client.name}</p>
                            <p className="text-[8px] text-slate-500 uppercase font-bold tracking-tighter">{client.bikeModel}</p>
                          </div>
                        </div>
                        <button 
                          onClick={() => sendWhatsApp(client)}
                          className="bg-primary p-1.5 rounded-lg text-white hover:scale-105 transition-transform shadow-md shadow-primary/10"
                        >
                          <MessageSquare className="w-3 h-3" />
                        </button>
                      </div>
                    ))}
                  </div>
                  {pendingAlerts.length > 4 && (
                    <button 
                      onClick={() => setView('clients')}
                      className="text-[9px] text-primary font-bold uppercase tracking-widest hover:underline px-1"
                    >
                      + {pendingAlerts.length - 4} outros alertas
                    </button>
                  )}
                </div>
              )}

              {/* Stats */}
              {/* Stats - Linha 1 */}
              <div className="grid grid-cols-1 md:grid-cols-4 gap-2.5">
                <div className="bg-slate-800/40 p-3 rounded-xl border border-emerald-500/20 relative overflow-hidden">
                  <div className="absolute top-0 right-0 w-0.5 h-full bg-emerald-500/50" />
                  <div className="flex justify-between items-center mb-0.5">
                    <p className="text-[9px] font-bold text-emerald-500/80 uppercase tracking-widest">Receita Total</p>
                    <TrendingUp className="w-3 h-3 text-emerald-500/60" />
                  </div>
                  <p className="text-xl font-bold text-emerald-500">R$ {financialStats.totalReceita.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</p>
                </div>

                <div className="bg-slate-800/40 p-3 rounded-xl border border-amber-500/20 relative overflow-hidden">
                  <div className="absolute top-0 right-0 w-0.5 h-full bg-amber-500/50" />
                  <div className="flex justify-between items-center mb-0.5">
                    <p className="text-[9px] font-bold text-amber-500/80 uppercase tracking-widest">Contas a Receber</p>
                    <TrendingDown className="w-3 h-3 text-amber-500/60" />
                  </div>
                  <p className="text-xl font-bold text-amber-500">R$ {financialStats.contasAReceber.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</p>
                </div>

                <div className="bg-slate-800/40 p-3 rounded-xl border border-slate-700/50">
                  <div className="flex justify-between items-center mb-0.5">
                    <p className="text-[9px] font-bold text-slate-500 uppercase tracking-widest">Total Clientes</p>
                    <Users className="w-3 h-3 text-primary/60" />
                  </div>
                  <p className="text-xl font-bold text-white">{financialStats.totalClientes}</p>
                </div>

                <div className="bg-slate-800/40 p-3 rounded-xl border border-slate-700/50">
                  <div className="flex justify-between items-center mb-0.5">
                    <p className="text-[9px] font-bold text-slate-500 uppercase tracking-widest">Serviços Hoje</p>
                    <Calendar className="w-3 h-3 text-primary/60" />
                  </div>
                  <p className="text-xl font-bold text-white">
                    {maintenances.filter(m => safeFormat(m.date, 'yyyy-MM-dd') === safeFormat(new Date(), 'yyyy-MM-dd')).length}
                  </p>
                </div>
              </div>

              {/* Stats - Linha 2 */}
              <div className="grid grid-cols-1 md:grid-cols-4 gap-2.5">
                <div className="bg-slate-800/40 p-3 rounded-xl border border-emerald-500/20 relative overflow-hidden">
                  <div className="absolute top-0 right-0 w-0.5 h-full bg-emerald-500/50" />
                  <div className="flex justify-between items-center mb-0.5">
                    <p className="text-[9px] font-bold text-emerald-500/80 uppercase tracking-widest">Receita (Mês)</p>
                    <TrendingUp className="w-3 h-3 text-emerald-500/60" />
                  </div>
                  <p className="text-xl font-bold text-emerald-500">R$ {financialStats.totalReceita.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</p>
                </div>

                <div className="bg-slate-800/40 p-3 rounded-xl border border-red-500/20 relative overflow-hidden">
                  <div className="absolute top-0 right-0 w-0.5 h-full bg-red-500/50" />
                  <div className="flex justify-between items-center mb-0.5">
                    <p className="text-[9px] font-bold text-red-500/80 uppercase tracking-widest">Recorrente</p>
                    <AlertTriangle className="w-3 h-3 text-red-500/60" />
                  </div>
                  <p className="text-xl font-bold text-red-500">R$ {financialStats.recurrentRevenue.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</p>
                </div>

                <div className="bg-slate-800/40 p-3 rounded-xl border border-red-500/20 relative overflow-hidden">
                  <div className="absolute top-0 right-0 w-0.5 h-full bg-red-500/50" />
                  <div className="flex justify-between items-center mb-0.5">
                    <p className="text-[9px] font-bold text-red-500/80 uppercase tracking-widest">Vencidos</p>
                    <AlertTriangle className="w-3 h-3 text-red-500/60" />
                  </div>
                  <p className="text-xl font-bold text-red-500">{overdueClients.length}</p>
                </div>

                <div className="bg-slate-800/40 p-3 rounded-xl border border-slate-700/50">
                  <div className="flex justify-between items-center mb-0.5">
                    <p className="text-[9px] font-bold text-slate-500 uppercase tracking-widest">Garantias</p>
                    <ShieldCheck className="w-3 h-3 text-primary/60" />
                  </div>
                  <p className="text-xl font-bold text-white">{financialStats.totalGarantias}</p>
                </div>
              </div>

              {/* Chart */}
              <div className="bg-slate-800/40 p-3.5 rounded-xl border border-slate-700/50">
                <div className="flex justify-between items-center mb-3">
                  <h3 className="font-bold text-sm">Histórico Mensal</h3>
                  <p className="text-[9px] text-slate-500 uppercase font-bold tracking-widest">Últimos 6 Meses</p>
                </div>
                <div className="h-[240px] w-full">
                  <ResponsiveContainer width="100%" height={240}>
                    <BarChart data={chartData}>
                      <CartesianGrid strokeDasharray="3 3" stroke="#334155" vertical={false} strokeOpacity={0.3} />
                      <XAxis 
                        dataKey="month" 
                        axisLine={false} 
                        tickLine={false} 
                        tick={{ fill: '#64748b', fontSize: 9 }} 
                      />
                      <YAxis 
                        axisLine={false} 
                        tickLine={false} 
                        tick={{ fill: '#64748b', fontSize: 9 }} 
                      />
                      <Tooltip 
                        cursor={{ fill: 'rgba(242, 120, 13, 0.05)' }}
                        contentStyle={{ 
                          backgroundColor: '#0f172a', 
                          border: '1px solid #334155',
                          borderRadius: '10px',
                          color: '#fff',
                          fontSize: '9px',
                          padding: '8px'
                        }}
                      />
                      <Bar dataKey="count" radius={[3, 3, 0, 0]} barSize={24}>
                        {chartData.map((entry, index) => (
                          <Cell key={`cell-${index}`} fill={index === chartData.length - 1 ? '#f2780d' : '#f2780d33'} />
                        ))}
                      </Bar>
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              </div>

              {/* Top Serviços */}
              <div className="bg-slate-800/40 p-3.5 rounded-xl border border-slate-700/50">
                <div className="flex justify-between items-center mb-3">
                  <h3 className="font-bold text-sm">🏆 Top Serviços (Receita Total)</h3>
                  <p className="text-[9px] text-slate-500 uppercase font-bold tracking-widest">Ranking</p>
                </div>
                <div className="space-y-2">
                  {topServicesData.map(({ service, revenue, position }) => (
                    <div key={service} className="flex items-center justify-between p-2 bg-slate-900/30 rounded-lg border border-slate-700/30">
                      <div className="flex items-center gap-2">
                        <span className="text-xs font-bold text-primary bg-primary/10 px-1.5 py-0.5 rounded">#{position}</span>
                        <span className="text-sm font-semibold text-white">{service}</span>
                      </div>
                      <span className="text-sm font-bold text-primary">R$ {revenue.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span>
                    </div>
                  ))}
                </div>
              </div>

              {/* Urgent Alerts */}
              {overdueClients.length > 0 && (
                <div className="bg-slate-800/50 rounded-xl border border-slate-700 overflow-hidden">
                  <div className="p-3 border-b border-slate-700 flex justify-between items-center">
                    <div className="flex items-center gap-2">
                      <AlertTriangle className="w-4 h-4 text-red-500" />
                      <h3 className="font-bold text-sm">Alertas Urgentes</h3>
                    </div>
                    <span className="bg-red-500/10 text-red-500 text-[10px] font-bold px-2 py-0.5 rounded-md">
                      {overdueClients.length} VENCIDOS
                    </span>
                  </div>
                  <div className="divide-y divide-slate-700">
                    {overdueClients.slice(0, 5).map(client => (
                      <div key={client.id} className="p-3 flex items-center justify-between hover:bg-slate-800 transition-colors">
                        <div className="flex items-center gap-3">
                          <div className="w-9 h-9 rounded-lg bg-slate-700 flex items-center justify-center">
                            <Bike className="w-4.5 h-4.5 text-slate-400" />
                          </div>
                          <div>
                            <p className="font-bold text-xs">{client?.name || 'N/A'}</p>
                            <p className="text-[10px] text-slate-500">{client?.bikeModel || 'N/A'}</p>
                          </div>
                        </div>
                        <div className="text-right">
                          <p className="text-red-500 font-bold text-[10px]">Vencido</p>
                          <p className="text-[9px] text-slate-500">{safeFormat(client?.nextMaintenanceDate, 'dd/MM/yyyy')}</p>
                        </div>
                      </div>
                    ))}
                  </div>
                  <button 
                    onClick={() => setView('clients')}
                    className="w-full p-3 text-primary text-xs font-bold hover:bg-slate-800 transition-colors"
                  >
                    Ver Todos os Alertas
                  </button>
                </div>
              )}
            </div>
          )}

          {view === 'clients' && (
            <div className="space-y-3">
              {/* Tab Toggle: Serviços Rápidos vs Agenda */}
              <div className="flex gap-2 bg-slate-800/40 p-1 rounded-xl border border-slate-700/50">
                <button 
                  onClick={() => setIsNewService(false)}
                  className={cn(
                    "flex-1 px-4 py-2 rounded-lg font-bold text-sm transition-all",
                    !isNewService 
                      ? "bg-primary text-white shadow-lg" 
                      : "text-slate-400 hover:text-slate-300"
                  )}
                >
                  ⚡ Serviços Rápidos
                </button>
                <button 
                  onClick={() => { setIsNewService(true); setView('clients-schedule'); }}
                  className={cn(
                    "flex-1 px-4 py-2 rounded-lg font-bold text-sm transition-all",
                    isNewService
                      ? "bg-primary text-white shadow-lg"
                      : "text-slate-400 hover:text-slate-300"
                  )}
                >
                  📋 Agenda de Clientes
                </button>
              </div>

              {/* Quick Action at Top for Mobile Access */}
              <button 
                onClick={() => { setEditingClient(null); setView('new-client'); }}
                className="w-full bg-primary p-3 rounded-xl flex items-center justify-center gap-2 text-white hover:bg-primary/90 transition-all shadow-lg shadow-primary/10"
              >
                <Plus className="w-3.5 h-3.5" />
                <span className="font-bold text-xs">Novo Registro</span>
              </button>

              <div className="flex flex-col md:flex-row gap-2 items-center justify-between">
                <h2 className="text-lg font-bold">Serviços</h2>
                <div className="relative w-full md:w-64">
                  <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3 h-3 text-slate-500" />
                  <input 
                    type="text" 
                    placeholder="Buscar..."
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    className="w-full bg-slate-800/40 border border-slate-700/50 rounded-lg pl-8 pr-3 py-1.5 text-xs focus:ring-1 focus:ring-primary outline-none"
                  />
                </div>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-2.5">
                {(filteredClients || []).map(client => (
                  <div key={client.id} className="bg-slate-800/30 p-3 rounded-xl border border-slate-700/40 space-y-2.5 relative overflow-hidden">
                    <div className={cn(
                      "absolute top-0 right-0 w-0.5 h-full opacity-50",
                      client?.status === 'OK' ? 'bg-emerald-500' : 
                      client?.status === 'WARNING' ? 'bg-yellow-500' : 'bg-red-500'
                    )} />
                    
                    <div className="flex justify-between items-start">
                      <div className="flex items-center gap-2">
                        <div className={cn(
                          "w-1 h-1 rounded-full",
                          client?.status === 'OK' ? 'bg-emerald-500' : 
                          client?.status === 'WARNING' ? 'bg-yellow-500' : 'bg-red-500'
                        )} />
                        <div>
                          <h3 className="font-bold text-sm leading-tight">{client?.name || 'N/A'}</h3>
                          <p className="text-[10px] text-slate-500 uppercase font-bold tracking-tighter">{client?.bikeModel || 'N/A'}</p>
                        </div>
                      </div>
                        <div className="flex gap-2">
                          <button 
                            onClick={() => handleAddMaintenance(client)}
                            disabled={client?.status === 'OK' || processingId === client?.id}
                            className={cn(
                              "p-2 rounded-lg transition-all flex items-center gap-1.5",
                              (client?.status === 'OK' || processingId === client?.id)
                                ? "bg-slate-700/30 text-slate-500 cursor-not-allowed opacity-50" 
                                : "bg-emerald-500/10 text-emerald-500 hover:bg-emerald-500/20 active:scale-95"
                            )}
                            title={client?.status === 'OK' ? "Serviço já realizado" : "Confirmar Serviço Realizado"}
                          >
                            {processingId === client.id ? (
                              <RefreshCw className="w-5 h-5 animate-spin" />
                            ) : (
                              <CheckCircle2 className="w-5 h-5" />
                            )}
                            <span className="text-[10px] font-bold uppercase hidden sm:inline">
                              {processingId === client.id ? "Salvando..." : "Concluir"}
                            </span>
                          </button>
                          
                          {/* 💚 NOVO: Botão Quitar Débito - Aparece quando há saldoDevedor */}
                          {(clientBalanceMap.get(client.id) || 0) > 0 && (
                            <button 
                              onClick={() => {
                                // Find the most recent maintenance for this client and settle debt
                                const maintenanceToSettle = maintenances
                                  .filter(m => m.clientId === client?.id && (m.saldoDevedor || 0) > 0)
                                  .sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime())[0];
                                
                                if (maintenanceToSettle) {
                                  handleSettleDebt(maintenanceToSettle.id, maintenanceToSettle);
                                }
                              }}
                              disabled={processingId === client?.id}
                              className="p-2 rounded-lg bg-amber-500 text-white hover:bg-amber-600 transition-all active:scale-95 flex items-center gap-1.5 disabled:opacity-50"
                              title={`Quitar R$ ${(clientBalanceMap.get(client?.id) || 0).toFixed(2)} de débito`}
                            >
                              {processingId === client.id ? (
                                <RefreshCw className="w-5 h-5 animate-spin" />
                              ) : (
                                <DollarSign className="w-5 h-5" />
                              )}
                              <span className="text-[10px] font-bold uppercase hidden sm:inline">
                                {processingId === client.id ? "Salvando..." : "Quitar"}
                              </span>
                            </button>
                          )}
                          
                          <button 
                            onClick={() => sendWhatsApp(client)}
                            className="p-2 rounded-lg bg-emerald-500 text-white hover:bg-emerald-600 transition-all active:scale-95 flex items-center gap-1.5"
                            title="Enviar WhatsApp"
                          >
                            <MessageCircle className="w-5 h-5" />
                            <span className="text-[10px] font-bold uppercase hidden sm:inline">Avisar</span>
                          </button>
                          <button 
                            onClick={() => { setEditingClient(client); setView('new-client'); }}
                            className="p-2 rounded-lg bg-slate-700/50 text-slate-300 hover:bg-slate-700 transition-colors"
                          >
                            <ChevronRight className="w-5 h-5" />
                          </button>
                          <button 
                            onClick={() => {
                              if (deleteConfirm?.id === client.id) {
                                handleDeleteClient(client.id);
                              } else {
                                setDeleteConfirm({ id: client.id, type: 'client' });
                              }
                            }}
                            className={cn(
                              "p-2 rounded-lg transition-colors",
                              deleteConfirm?.id === client.id 
                                ? "bg-red-500 text-white animate-pulse" 
                                : "bg-red-500/10 text-red-500 hover:bg-red-500/20"
                            )}
                          >
                            {deleteConfirm?.id === client.id ? <CheckCircle className="w-5 h-5" /> : <Trash2 className="w-5 h-5" />}
                          </button>
                        </div>
                    </div>

                    <div className="grid grid-cols-3 gap-2 pt-2 border-t border-slate-700/20">
                      <div>
                        <p className="text-[8px] uppercase font-bold text-slate-500 tracking-widest">Último Serviço</p>
                        <p className="text-[10px] font-medium">{safeFormat(client?.lastMaintenanceDate, 'dd/MM/yyyy')}</p>
                        {client?.lastServiceType && (
                          <p className="text-[9px] text-slate-400 mt-0.5">{client?.lastServiceType} • R$ {(client?.lastServiceValue || 0).toFixed(2)}</p>
                        )}
                      </div>
                      <div>
                        <p className={cn(
                          "text-[8px] uppercase font-bold tracking-widest",
                          client?.status === 'OK' ? 'text-slate-500' : 
                          client?.status === 'WARNING' ? 'text-yellow-500' : 'text-red-500'
                        )}>Próximo Alerta</p>
                        <p className={cn(
                          "text-[10px] font-bold",
                          client?.status === 'OK' ? 'text-white' : 
                          client?.status === 'WARNING' ? 'text-yellow-500' : 'text-red-500'
                        )}>
                          {safeFormat(client?.nextMaintenanceDate, 'dd/MM/yyyy')}
                        </p>
                      </div>
                      <div>
                        <p className={cn(
                          "text-[8px] uppercase font-bold tracking-widest",
                          (clientBalanceMap.get(client?.id) || 0) > 0 ? 'text-red-500' : 'text-slate-500'
                        )}>Saldo Devedor</p>
                        <p className={cn(
                          "text-[10px] font-bold",
                          (clientBalanceMap.get(client?.id) || 0) > 0 ? 'text-red-400' : 'text-emerald-400'
                        )}>
                          R$ {(clientBalanceMap.get(client?.id) || 0).toFixed(2)}
                        </p>
                      </div>
                    </div>
                    {client?.lastServiceNotes && (
                      <div className="pt-1.5">
                        <p className="text-[8px] uppercase font-bold text-slate-500 tracking-widest">Observações</p>
                        <p className="text-[9px] text-slate-400 line-clamp-1 italic">"{client?.lastServiceNotes}"</p>
                      </div>
                    )}
                  </div>
                ))}
              </div>
            </div>
          )}

          {view === 'clients-schedule' && (
            <div className="space-y-4">
              <div className="flex items-center gap-3">
                <button onClick={() => setView('dashboard')} className="p-1.5 rounded-full hover:bg-slate-800 transition-colors">
                  <ArrowLeft className="w-5 h-5" />
                </button>
                <h2 className="text-xl font-bold">Agenda de Clientes</h2>
                <div className="ml-auto bg-primary/20 px-2 py-1 rounded-full">
                  <span className="text-xs font-bold text-primary">{clients.length}</span>
                </div>
              </div>

              {clients.length === 0 ? (
                <div className="text-center py-12 bg-slate-800/40 rounded-xl border border-dashed border-slate-700/50">
                  <Users className="w-8 h-8 text-slate-600 mx-auto mb-3" />
                  <p className="text-slate-400 text-sm font-bold">Nenhum cliente cadastrado</p>
                  <p className="text-slate-600 text-xs mt-1">Registre serviços em "Serviços Rápidos" para adicionar clientes</p>
                </div>
              ) : (
                <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                  {(clients || []).map(client => (
                    <div key={client.id} className="bg-slate-800/40 p-4 rounded-xl border border-slate-700/50 space-y-3 hover:border-primary/50 transition-all cursor-pointer group" onClick={() => { setEditingClient(client); setView('clients-schedule-add'); }}>
                      <div className="flex items-start justify-between">
                        <div className="flex-1">
                          <h3 className="font-bold text-sm group-hover:text-primary transition-colors">{client?.name}</h3>
                          <p className="text-[10px] text-slate-500">{client?.bikeModel}</p>
                          <p className="text-[9px] text-slate-600 mt-1">📱 {client?.contact}</p>
                        </div>
                        <div className={cn(
                          "w-8 h-8 rounded-full flex items-center justify-center text-xs font-bold",
                          client?.status === 'OK' ? 'bg-emerald-500/20 text-emerald-500' : 
                          client?.status === 'WARNING' ? 'bg-yellow-500/20 text-yellow-500' : 
                          'bg-red-500/20 text-red-500'
                        )}>
                          {client?.status === 'OK' ? '✅' : client?.status === 'WARNING' ? '⚠️' : '🔴'}
                        </div>
                      </div>
                      <div className="text-[9px] text-slate-600 pt-2 border-t border-slate-700/30">
                        <p>🔄 Recorrência: {client?.recurrenceDays}d</p>
                        {client?.lastMaintenanceDate && (
                          <p className="mt-1">📅 Último: {safeFormat(client?.lastMaintenanceDate, 'dd/MM/yyyy')}</p>
                        )}
                        {(clientBalanceMap.get(client?.id) || 0) > 0 && (
                          <p className="mt-1 text-red-500 font-bold">💰 Débito: R$ {(clientBalanceMap.get(client?.id) || 0).toFixed(2)}</p>
                        )}
                      </div>
                      <div className="flex gap-2 pt-2 border-t border-slate-700/30 opacity-0 group-hover:opacity-100 transition-opacity">
                        <button 
                          onClick={(e) => { 
                            e.stopPropagation();
                            setEditingClient(client); 
                            setView('clients-schedule-add'); 
                          }}
                          className="flex-1 px-2 py-1.5 rounded-lg bg-slate-700/50 text-slate-300 hover:bg-primary/20 hover:text-primary transition-colors text-[9px] font-bold"
                        >
                          ✏️ Editar
                        </button>
                        <button 
                          onClick={(e) => { 
                            e.stopPropagation();
                            if (deleteConfirm?.id === client.id) {
                              handleDeleteClient(client.id);
                            } else {
                              setDeleteConfirm({ id: client.id, type: 'client' });
                            }
                          }}
                          className={cn(
                            "flex-1 px-2 py-1.5 rounded-lg transition-colors text-[9px] font-bold",
                            deleteConfirm?.id === client.id 
                              ? "bg-red-500 text-white" 
                              : "bg-red-500/10 text-red-500 hover:bg-red-500/20"
                          )}
                        >
                          {deleteConfirm?.id === client.id ? '✓ Confirmar' : '🗑️ Deletar'}
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          {view === 'clients-schedule-add' && (
            <div className="max-w-xl mx-auto space-y-4">
              <div className="flex items-center gap-3">
                <button onClick={() => setView('clients-schedule')} className="p-1.5 rounded-full hover:bg-slate-800 transition-colors">
                  <ArrowLeft className="w-5 h-5" />
                </button>
                <h2 className="text-xl font-bold">{editingClient ? 'Editar Cliente' : 'Adicionar Cliente'}</h2>
              </div>

              <form 
                onSubmit={(e) => {
                  e.preventDefault();
                  const formData = new FormData(e.currentTarget);
                  handleSaveClient({
                    name: formData.get('name') as string,
                    bikeModel: formData.get('bikeModel') as string,
                    contact: formData.get('contact') as string,
                    oilType: formData.get('oilType') as string,
                    oilPrice: parseFloat(formData.get('oilPrice') as string) || 0,
                    recurrenceDays: parseInt(formData.get('recurrenceDays') as string) || 29,
                    notes: formData.get('notes') as string
                  });
                  setView('clients-schedule');
                }}
                className="bg-slate-800/40 p-5 rounded-2xl border border-slate-700/50 space-y-4"
              >
                <div className="space-y-4">
                  <div className="space-y-1.5">
                    <label className="text-[10px] font-bold text-slate-500 uppercase tracking-widest px-1">Nome do Cliente</label>
                    <input 
                      name="name" 
                      defaultValue={editingClient?.name || ''} 
                      required 
                      placeholder="Ex: João Silva" 
                      className="w-full bg-slate-900/50 border-slate-700 rounded-xl p-2.5 text-sm focus:ring-1 focus:ring-primary outline-none" 
                    />
                  </div>

                  <div className="space-y-1.5">
                    <label className="text-[10px] font-bold text-slate-500 uppercase tracking-widest px-1">Modelo da Moto</label>
                    <input 
                      name="bikeModel" 
                      defaultValue={editingClient?.bikeModel || ''} 
                      required 
                      placeholder="Ex: Honda CG 160" 
                      className="w-full bg-slate-900/50 border-slate-700 rounded-xl p-2.5 text-sm focus:ring-1 focus:ring-primary outline-none" 
                    />
                  </div>

                  <div className="space-y-1.5">
                    <label className="text-[10px] font-bold text-slate-500 uppercase tracking-widest px-1">WhatsApp</label>
                    <input 
                      name="contact" 
                      defaultValue={editingClient?.contact || ''} 
                      required 
                      placeholder="Ex: (69) 99999-9999" 
                      className="w-full bg-slate-900/50 border-slate-700 rounded-xl p-2.5 text-sm focus:ring-1 focus:ring-primary outline-none" 
                    />
                  </div>

                  <div className="space-y-1.5">
                    <label className="text-[10px] font-bold text-slate-500 uppercase tracking-widest px-1">Tipo de Óleo</label>
                    <select name="oilType" defaultValue={editingClient?.oilType || '10W30'} className="w-full bg-slate-900/50 border-slate-700 rounded-xl p-2.5 text-sm focus:ring-1 focus:ring-primary outline-none">
                      {(settings?.oilTypes || []).map(type => (
                        <option key={type} value={type}>{type}</option>
                      ))}
                      {!settings?.oilTypes || settings.oilTypes.length === 0 && (
                        <option value="10W30">10W30</option>
                      )}
                    </select>
                  </div>

                  <div className="space-y-1.5">
                    <label className="text-[10px] font-bold text-slate-500 uppercase tracking-widest px-1">Preço Padrão (R$)</label>
                    <input 
                      name="oilPrice" 
                      type="number" 
                      step="0.01" 
                      defaultValue={editingClient?.oilPrice || 0} 
                      className="w-full bg-slate-900/50 border-slate-700 rounded-xl p-2.5 text-sm focus:ring-1 focus:ring-primary outline-none" 
                    />
                  </div>

                  <div className="space-y-1.5">
                    <label className="text-[10px] font-bold text-slate-500 uppercase tracking-widest px-1">Recorrência (Dias)</label>
                    <input 
                      name="recurrenceDays" 
                      type="number" 
                      defaultValue={editingClient?.recurrenceDays || 29} 
                      required 
                      className="w-full bg-slate-900/50 border-slate-700 rounded-xl p-2.5 text-sm focus:ring-1 focus:ring-primary outline-none" 
                    />
                  </div>

                  <div className="space-y-1.5">
                    <label className="text-[10px] font-bold text-slate-500 uppercase tracking-widest px-1">Observações</label>
                    <textarea 
                      name="notes" 
                      defaultValue={editingClient?.lastServiceNotes || ''} 
                      placeholder="Informações adicionais..." 
                      className="w-full bg-slate-900/50 border-slate-700 rounded-xl p-2.5 text-sm focus:ring-1 focus:ring-primary outline-none h-16" 
                    />
                  </div>
                </div>

                <div className="flex gap-3 pt-2">
                  <button 
                    type="submit" 
                    disabled={isSaving}
                    className="flex-1 bg-primary py-3 rounded-xl font-bold hover:bg-primary/90 transition-all text-sm shadow-lg disabled:opacity-50 flex items-center justify-center gap-2"
                  >
                    {isSaving ? (
                      <>
                        <RefreshCw className="w-4 h-4 animate-spin" />
                        Salvando...
                      </>
                    ) : (
                      editingClient ? 'Salvar Alterações' : 'Adicionar Cliente'
                    )}
                  </button>
                  <button 
                    type="button" 
                    onClick={() => setView('clients-schedule')} 
                    className="px-6 bg-slate-700/50 py-3 rounded-xl font-bold hover:bg-slate-700 transition-all text-sm"
                  >
                    Cancelar
                  </button>
                </div>
              </form>
            </div>
          )}

          {view === 'history' && (
            <div className="space-y-5">
              <div className="flex flex-col md:flex-row gap-3 items-center justify-between">
                <h2 className="text-lg font-bold">Histórico de Serviços</h2>
                <div className="flex items-center gap-2">
                  <button 
                    onClick={() => setView('report')}
                    className="bg-primary/10 text-primary px-3 py-1.5 rounded-lg text-xs font-bold flex items-center gap-2 hover:bg-primary/20 transition-all"
                  >
                    <BarChart3 className="w-3.5 h-3.5" />
                    Relatório Mensal
                  </button>
                </div>
              </div>

              {/* Filtros */}
              <div className="bg-slate-800/40 p-4 rounded-2xl border border-slate-700/50 space-y-3">
                <div className="flex items-center gap-2 text-primary mb-1">
                  <Filter className="w-3.5 h-3.5" />
                  <span className="text-[10px] font-bold uppercase tracking-widest">Filtros Avançados</span>
                </div>
                <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
                  <div className="space-y-1">
                    <label className="text-[8px] font-bold text-slate-500 uppercase px-1">Início</label>
                    <input 
                      type="date" 
                      value={historyFilters.startDate}
                      onChange={(e) => setHistoryFilters({ ...historyFilters, startDate: e.target.value })}
                      className="w-full bg-slate-900/50 border-slate-700 rounded-lg p-1.5 text-[10px] focus:ring-1 focus:ring-primary outline-none" 
                    />
                  </div>
                  <div className="space-y-1">
                    <label className="text-[8px] font-bold text-slate-500 uppercase px-1">Fim</label>
                    <input 
                      type="date" 
                      value={historyFilters.endDate}
                      onChange={(e) => setHistoryFilters({ ...historyFilters, endDate: e.target.value })}
                      className="w-full bg-slate-900/50 border-slate-700 rounded-lg p-1.5 text-[10px] focus:ring-1 focus:ring-primary outline-none" 
                    />
                  </div>
                  <div className="space-y-1">
                    <label className="text-[8px] font-bold text-slate-500 uppercase px-1">Cliente</label>
                    <input 
                      type="text" 
                      placeholder="Nome..."
                      value={historyFilters.clientName}
                      onChange={(e) => setHistoryFilters({ ...historyFilters, clientName: e.target.value })}
                      className="w-full bg-slate-900/50 border-slate-700 rounded-lg p-1.5 text-[10px] focus:ring-1 focus:ring-primary outline-none" 
                    />
                  </div>
                  <div className="space-y-1">
                    <label className="text-[8px] font-bold text-slate-500 uppercase px-1">Serviço</label>
                    <select 
                      value={historyFilters.serviceType}
                      onChange={(e) => setHistoryFilters({ ...historyFilters, serviceType: e.target.value })}
                      className="w-full bg-slate-900/50 border-slate-700 rounded-lg p-1.5 text-[10px] focus:ring-1 focus:ring-primary outline-none"
                    >
                      <option value="all">Todos</option>
                      <option value="Troca de Óleo">Troca de Óleo</option>
                      <option value="Revisão">Revisão</option>
                      <option value="Pneus">Pneus</option>
                      <option value="Freios">Freios</option>
                      <option value="Outros">Outros</option>
                    </select>
                  </div>
                  <div className="space-y-1">
                    <label className="text-[8px] font-bold text-slate-500 uppercase px-1">Recorrência</label>
                    <select 
                      value={historyFilters.isRecurring}
                      onChange={(e) => setHistoryFilters({ ...historyFilters, isRecurring: e.target.value })}
                      className="w-full bg-slate-900/50 border-slate-700 rounded-lg p-1.5 text-[10px] focus:ring-1 focus:ring-primary outline-none"
                    >
                      <option value="all">Todos</option>
                      <option value="yes">Recorrente</option>
                      <option value="no">Eventual</option>
                    </select>
                  </div>
                </div>
              </div>

              {/* Grouped History with Accordion */}
              <div className="space-y-2">
                {groupedHistory.length === 0 ? (
                  <div className="text-center py-8 bg-slate-800/10 rounded-xl border border-dashed border-slate-700/30">
                    <p className="text-[10px] text-slate-600">Nenhum serviço registrado no período.</p>
                  </div>
                ) : (
                  groupedHistory.map(({ clientName, services }) => (
                    <div key={clientName} className="bg-slate-800/30 rounded-xl border border-slate-700/40 overflow-hidden">
                      {/* Accordion Header */}
                      <button
                        onClick={() => {
                          const newSet = new Set(expandedHistoryClients);
                          if (newSet.has(clientName)) {
                            newSet.delete(clientName);
                          } else {
                            newSet.add(clientName);
                          }
                          setExpandedHistoryClients(newSet);
                        }}
                        className="w-full px-4 py-3 flex items-center justify-between hover:bg-slate-800/50 transition-all"
                      >
                        <div className="flex items-center gap-3 flex-1 text-left">
                          <ChevronRight className={cn(
                            "w-5 h-5 transition-transform",
                            expandedHistoryClients.has(clientName) ? 'rotate-90' : ''
                          )} />
                          <div>
                            <p className="font-bold text-sm">{clientName}</p>
                            <p className="text-[9px] text-slate-500">{services.length} serviço(s)</p>
                          </div>
                        </div>
                        <div className="text-right">
                          <p className="text-[10px] font-bold text-primary">R$ {services.reduce((sum, s) => sum + s.serviceValue, 0).toFixed(2)}</p>
                          <p className="text-[8px] text-slate-500">Total</p>
                        </div>
                      </button>

                      {/* Accordion Body */}
                      {expandedHistoryClients.has(clientName) && (
                        <div className="border-t border-slate-700/40 divide-y divide-slate-700/40 bg-slate-900/20">
                          {(services || []).map(record => (
                            <div key={record.id} className="px-4 py-3 flex items-center justify-between group hover:bg-slate-800/30 transition-all">
                              <div className="flex items-center gap-3 flex-1">
                                <div className={cn(
                                  "p-2 rounded-lg",
                                  record?.isRecurringRevenue ? "bg-primary/10 text-primary" : "bg-slate-700/50 text-slate-400"
                                )}>
                                  {record?.isRecurringRevenue ? <RefreshCw className="w-4 h-4" /> : <Wrench className="w-4 h-4" />}
                                </div>
                                <div>
                                  <div className="flex items-center gap-2">
                                    <p className="font-bold text-xs">{record?.serviceType || 'Serviço'}</p>
                                    {record?.isRecurringRevenue && (
                                      <span className="text-[7px] bg-primary/20 text-primary px-1 rounded uppercase font-bold">Recorrente</span>
                                    )}
                                    {record?.saldoDevedor && record.saldoDevedor > 0 && (
                                      <span className="text-[7px] bg-red-500/20 text-red-400 px-1 rounded uppercase font-bold">Débito</span>
                                    )}
                                  </div>
                                  <p className="text-[9px] text-slate-500">
                                    {record?.bikeModel || 'N/A'} • R$ {(record?.serviceValue || 0).toFixed(2)}
                                  </p>
                                </div>
                              </div>
                              <div className="flex items-center gap-3">
                                <div className="text-right">
                                  <p className="font-bold text-[9px] text-white">{safeFormat(record?.date, 'dd/MM/yyyy')}</p>
                                  {record?.statusPagamento && (
                                    <p className={cn(
                                      "text-[8px] font-bold tracking-widest",
                                      record.statusPagamento === 'Pago' ? 'text-emerald-400' :
                                      record.statusPagamento === 'Pendente' ? 'text-yellow-400' :
                                      'text-slate-400'
                                    )}>
                                      {record.statusPagamento}
                                    </p>
                                  )}
                                </div>
                                {(record?.statusPagamento === 'Pendente' || record?.statusPagamento === 'Parcial') && record?.saldoDevedor && record.saldoDevedor > 0 && (
                                  <div className="flex gap-1">
                                    {/* 💸 Quitar Débito: Pay only the outstanding balance (for Parcial status) */}
                                    {record?.statusPagamento === 'Parcial' && (
                                      <button 
                                        onClick={() => handleSettleDebt(record?.id, record)}
                                        disabled={processingId === record?.id}
                                        className="p-2 rounded-lg bg-amber-500 text-white hover:bg-amber-600 transition-all opacity-0 group-hover:opacity-100 disabled:opacity-50 flex items-center gap-1"
                                        title={`Quitar R$ ${record?.saldoDevedor?.toFixed(2) || '0'} de débito`}
                                      >
                                        {processingId === record?.id ? (
                                          <RefreshCw className="w-4 h-4 animate-spin" />
                                        ) : (
                                          <DollarSign className="w-4 h-4" />
                                        )}
                                      </button>
                                    )}
                                    
                                    {/* ✅ Confirmar Recebimento: Mark full service as paid (for Pendente or when no previous payment) */}
                                    {record?.statusPagamento === 'Pendente' || (record?.statusPagamento === 'Parcial' && (record?.valorPago || 0) === 0) ? (
                                      <button 
                                        onClick={() => handleConfirmPayment(record?.id, record)}
                                        disabled={processingId === record?.id}
                                        className="p-2 rounded-lg bg-emerald-500 text-white hover:bg-emerald-600 transition-all opacity-0 group-hover:opacity-100 disabled:opacity-50 flex items-center gap-1"
                                        title="Confirmar pagamento completo"
                                      >
                                        {processingId === record?.id ? (
                                          <RefreshCw className="w-4 h-4 animate-spin" />
                                        ) : (
                                          <CheckCircle2 className="w-4 h-4" />
                                        )}
                                      </button>
                                    ) : null}
                                  </div>
                                )}
                                <button 
                                  onClick={() => {
                                    if (deleteConfirm?.id === record.id) {
                                      handleDeleteMaintenance(record.id);
                                    } else {
                                      setDeleteConfirm({ id: record.id, type: 'maintenance' });
                                    }
                                  }}
                                  className={cn(
                                    "p-2 rounded-lg transition-colors opacity-0 group-hover:opacity-100",
                                    deleteConfirm?.id === record.id 
                                      ? "bg-red-500 text-white animate-pulse opacity-100" 
                                      : "bg-red-500/10 text-red-500 hover:bg-red-500/20"
                                  )}
                                >
                                  {deleteConfirm?.id === record.id ? <CheckCircle className="w-4 h-4" /> : <Trash2 className="w-4 h-4" />}
                                </button>
                              </div>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  ))
                )}
              </div>

              <div className="space-y-3 pt-8 border-t border-slate-800/50">
                <h2 className="text-lg font-bold flex items-center gap-2">
                  <Bell className="w-4 h-4 text-primary" />
                  Logs de Alertas
                </h2>
                <div className="space-y-1.5">
                  {messageLogs.length === 0 ? (
                    <div className="text-center py-6 bg-slate-800/10 rounded-xl border border-dashed border-slate-700/30">
                      <p className="text-[10px] text-slate-600">Nenhum alerta enviado.</p>
                    </div>
                  ) : (
                    messageLogs.map(log => (
                      <div key={log.id} className="bg-slate-800/30 p-2.5 rounded-xl border border-slate-700/40 flex items-center justify-between">
                        <div className="flex items-center gap-2.5">
                          <div className="bg-emerald-500/10 p-1.5 rounded-lg">
                            <MessageSquare className="w-3.5 h-3.5 text-emerald-500" />
                          </div>
                          <div>
                            <p className="font-bold text-xs leading-tight">{log.clientName}</p>
                            <p className="text-[9px] text-slate-500 uppercase font-bold tracking-tighter">{log.bikeModel}</p>
                          </div>
                        </div>
                          <div className="text-right flex items-center gap-2">
                            <div className="text-right">
                              <p className="font-bold text-[9px] text-white">{format(parseISO(log.createdAt), 'dd/MM HH:mm')}</p>
                              <span className="text-[7px] text-emerald-500 font-bold uppercase tracking-widest">
                                Aberto
                              </span>
                            </div>
                            <button 
                              onClick={() => {
                                if (deleteConfirm?.id === log.id) {
                                  handleDeleteMessageLog(log.id!);
                                } else {
                                  setDeleteConfirm({ id: log.id!, type: 'message_log' });
                                }
                              }}
                              className={cn(
                                "p-1.5 rounded-lg transition-colors",
                                deleteConfirm?.id === log.id 
                                  ? "bg-red-500 text-white animate-pulse" 
                                  : "bg-red-500/10 text-red-500 hover:bg-red-500/20"
                              )}
                            >
                              {deleteConfirm?.id === log.id ? <CheckCircle className="w-3 h-3" /> : <Trash2 className="w-3 h-3" />}
                            </button>
                          </div>
                      </div>
                    ))
                  )}
                </div>
              </div>
            </div>
          )}

          {view === 'report' && (
            <div className="space-y-6">
              <div className="flex items-center gap-3">
                <button onClick={() => setView('history')} className="p-1.5 rounded-full hover:bg-slate-800 transition-colors">
                  <ArrowLeft className="w-5 h-5" />
                </button>
                <h2 className="text-xl font-bold">Relatório Mensal</h2>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <div className="bg-slate-800/40 p-5 rounded-2xl border border-slate-700/50">
                  <p className="text-[10px] font-bold text-slate-500 uppercase tracking-widest mb-1">Receita Total (Mês)</p>
                  <p className="text-2xl font-bold text-white">R$ {dashboardStats.revenue.toFixed(2)}</p>
                  <div className="mt-2 flex items-center gap-1 text-[10px] text-emerald-500 font-bold">
                    <TrendingUp className="w-3 h-3" />
                    <span>+12% vs mês anterior</span>
                  </div>
                </div>
                <div className="bg-slate-800/40 p-5 rounded-2xl border border-slate-700/50">
                  <p className="text-[10px] font-bold text-slate-500 uppercase tracking-widest mb-1">Recorrência</p>
                  <p className="text-2xl font-bold text-primary">R$ {dashboardStats.recurringRevenue.toFixed(2)}</p>
                  <p className="text-[10px] text-slate-500 mt-1">{(dashboardStats.recurringRevenue / (dashboardStats.revenue || 1) * 100).toFixed(1)}% da receita total</p>
                </div>
                <div className="bg-slate-800/40 p-5 rounded-2xl border border-slate-700/50">
                  <p className="text-[10px] font-bold text-slate-500 uppercase tracking-widest mb-1">Serviços Realizados</p>
                  <p className="text-2xl font-bold text-white">{dashboardStats.servicesCount}</p>
                  <p className="text-[10px] text-slate-500 mt-1">Média de {(dashboardStats.servicesCount / 30).toFixed(1)} por dia</p>
                </div>
              </div>

              <div className="bg-slate-800/40 p-6 rounded-2xl border border-slate-700/50">
                <h3 className="text-sm font-bold mb-6 flex items-center gap-2">
                  <BarChart3 className="w-4 h-4 text-primary" />
                  Evolução de Receita (6 Meses)
                </h3>
                <div className="h-64 w-full">
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={Array.from({ length: 6 }).map((_, i) => {
                      const date = subMonths(new Date(), 5 - i);
                      const monthStr = format(date, 'MMM', { locale: ptBR });
                      const monthYear = format(date, 'yyyy-MM');
                      
                      const monthServices = maintenances.filter(m => m.date.startsWith(monthYear));
                      const total = monthServices.reduce((acc, m) => acc + (m.serviceValue || 0), 0);
                      const recurring = monthServices.filter(m => m.isRecurringRevenue).reduce((acc, m) => acc + (m.serviceValue || 0), 0);
                      
                      return {
                        name: monthStr,
                        total: total,
                        recorrente: recurring
                      };
                    })}>
                      <CartesianGrid strokeDasharray="3 3" stroke="#334155" vertical={false} />
                      <XAxis dataKey="name" stroke="#64748b" fontSize={10} tickLine={false} axisLine={false} />
                      <YAxis stroke="#64748b" fontSize={10} tickLine={false} axisLine={false} tickFormatter={(value) => `R$${value}`} />
                      <Tooltip 
                        contentStyle={{ backgroundColor: '#1e293b', border: '1px solid #334155', borderRadius: '12px', fontSize: '10px' }}
                        itemStyle={{ fontWeight: 'bold' }}
                      />
                      <Bar dataKey="total" fill="#3b82f6" radius={[4, 4, 0, 0]} name="Total" />
                      <Bar dataKey="recorrente" fill="#10b981" radius={[4, 4, 0, 0]} name="Recorrente" />
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <div className="bg-slate-800/40 p-6 rounded-2xl border border-slate-700/50">
                  <h3 className="text-sm font-bold mb-4">Serviços por Categoria</h3>
                  <div className="space-y-3">
                    {['Troca de Óleo', 'Revisão', 'Pneus', 'Freios', 'Outros'].map(type => {
                      const count = maintenances.filter(m => m.serviceType === type && m.date.startsWith(format(new Date(), 'yyyy-MM'))).length;
                      const percentage = (count / (dashboardStats.servicesCount || 1)) * 100;
                      return (
                        <div key={type} className="space-y-1">
                          <div className="flex justify-between text-[10px] font-bold">
                            <span className="text-slate-400">{type}</span>
                            <span>{count} ({percentage.toFixed(0)}%)</span>
                          </div>
                          <div className="w-full bg-slate-900 h-1.5 rounded-full overflow-hidden">
                            <div className="bg-primary h-full rounded-full" style={{ width: `${percentage}%` }} />
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>

                <div className="bg-slate-800/40 p-6 rounded-2xl border border-slate-700/50">
                  <h3 className="text-sm font-bold mb-4">Top Clientes (Mês)</h3>
                  <div className="space-y-3">
                    {Object.entries(
                      maintenances
                        .filter(m => m.date.startsWith(format(new Date(), 'yyyy-MM')))
                        .reduce((acc, m) => {
                          acc[m.clientName] = (acc[m.clientName] || 0) + (m.serviceValue || 0);
                          return acc;
                        }, {} as Record<string, number>)
                    )
                    .sort((a, b) => (b[1] as number) - (a[1] as number))
                    .slice(0, 5)
                    .map(([name, value]) => (
                      <div key={name} className="flex justify-between items-center p-2 rounded-lg bg-slate-900/50 border border-slate-700/30">
                        <span className="text-xs font-bold text-slate-300">{name}</span>
                        <span className="text-xs font-bold text-emerald-500">R$ {(value as number).toFixed(2)}</span>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            </div>
          )}

          {view === 'warranties' && (
            <div className="space-y-3">
              <div className="flex flex-col md:flex-row gap-2 items-center justify-between">
                <h2 className="text-lg font-bold">Garantias</h2>
                <button 
                  onClick={() => { setEditingWarranty(null); setView('new-warranty'); }}
                  className="w-full md:w-auto bg-primary px-4 py-2 rounded-xl font-bold flex items-center justify-center gap-2 hover:bg-primary/90 transition-all text-xs"
                >
                  <Plus className="w-3.5 h-3.5" /> Registrar Garantia
                </button>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-2.5">
                {warranties.map(warranty => (
                  <div key={warranty.id} className="bg-slate-800/30 p-3.5 rounded-xl border border-slate-700/40 space-y-2.5">
                    <div className="flex justify-between items-start">
                      <div>
                        <div className="flex items-center gap-2 mb-0.5">
                          <ShieldCheck className="w-3.5 h-3.5 text-primary" />
                          <h3 className="font-bold text-sm leading-tight">{warranty.clientName}</h3>
                        </div>
                        <p className="text-[10px] text-slate-500 uppercase font-bold tracking-tighter">{warranty.serviceType}</p>
                      </div>
                      <div className="flex gap-1">
                        <button 
                          onClick={() => generateWarrantyPDF(warranty)}
                          className="p-1.5 rounded-lg bg-emerald-500/10 text-emerald-500 hover:bg-emerald-500/20 transition-colors"
                        >
                          <Download className="w-3.5 h-3.5" />
                        </button>
                        <button 
                          onClick={() => { setEditingWarranty(warranty); setView('new-warranty'); }}
                          className="p-1.5 rounded-lg bg-slate-700/50 text-slate-300 hover:bg-slate-700 transition-colors"
                        >
                          <ChevronRight className="w-3.5 h-3.5" />
                        </button>
                        <button 
                          onClick={() => {
                            if (deleteConfirm?.id === warranty.id) {
                              handleDeleteWarranty(warranty.id);
                            } else {
                              setDeleteConfirm({ id: warranty.id, type: 'warranty' });
                            }
                          }}
                          className={cn(
                            "p-1.5 rounded-lg transition-colors",
                            deleteConfirm?.id === warranty.id 
                              ? "bg-red-500 text-white animate-pulse" 
                              : "bg-red-500/10 text-red-500 hover:bg-red-500/20"
                          )}
                        >
                          {deleteConfirm?.id === warranty.id ? <CheckCircle className="w-3.5 h-3.5" /> : <Trash2 className="w-3.5 h-3.5" />}
                        </button>
                      </div>
                    </div>

                    <div className="grid grid-cols-2 gap-2 pt-2 border-t border-slate-700/20">
                      <div>
                        <p className="text-[8px] uppercase font-bold text-slate-500 tracking-widest">Nº</p>
                        <p className="text-[10px] font-medium">{warranty.warrantyNumber}</p>
                      </div>
                      <div>
                        <p className="text-[8px] uppercase font-bold text-slate-500 tracking-widest">Vencimento</p>
                        <p className={cn(
                          "text-[10px] font-bold",
                          isBefore(parseISO(warranty.expiryDate), new Date()) ? "text-red-500" : "text-emerald-500"
                        )}>
                          {format(parseISO(warranty.expiryDate), 'dd/MM/yyyy')}
                        </p>
                      </div>
                    </div>

                    {warranty.serviceDescription && (
                      <div className="pt-2 border-t border-slate-700/10">
                        <p className="text-[10px] text-slate-400 leading-tight line-clamp-1 italic">"{warranty.serviceDescription}"</p>
                      </div>
                    )}
                  </div>
                ))}
              </div>
            </div>
          )}

          {view === 'new-warranty' && (
            <div className="max-w-xl mx-auto space-y-4">
              <div className="flex items-center gap-3">
                <button onClick={() => setView('warranties')} className="p-1.5 rounded-full hover:bg-slate-800 transition-colors">
                  <ArrowLeft className="w-5 h-5" />
                </button>
                <h2 className="text-xl font-bold">{editingWarranty ? 'Editar Garantia' : 'Registrar Garantia'}</h2>
              </div>

              <form 
                onSubmit={(e) => {
                  e.preventDefault();
                  const formData = new FormData(e.currentTarget);
                  handleSaveWarranty({
                    clientName: formData.get('clientName') as string,
                    serviceType: formData.get('serviceType') as string,
                    serviceDescription: formData.get('serviceDescription') as string,
                    serviceValue: parseFloat(formData.get('serviceValue') as string),
                    serviceDate: formData.get('serviceDate') ? `${formData.get('serviceDate')}T12:00:00Z` : undefined,
                    durationMonths: parseInt(formData.get('durationMonths') as string),
                    clientPhone: formData.get('clientPhone') as string
                  });
                }}
                className="bg-slate-800/40 p-5 rounded-2xl border border-slate-700/50 space-y-5"
              >
                <div className="space-y-4">
                  <div className="space-y-1.5">
                    <label className="text-[10px] font-bold text-slate-500 uppercase tracking-widest px-1">Nome do Cliente</label>
                    <input name="clientName" defaultValue={editingWarranty?.clientName} required placeholder="Ex: João Silva" className="w-full bg-slate-900/50 border-slate-700 rounded-xl p-2.5 text-sm focus:ring-1 focus:ring-primary outline-none" />
                  </div>

                  <div className="space-y-1.5">
                    <div className="flex justify-between items-center px-1">
                      <label className="text-[10px] font-bold text-slate-500 uppercase tracking-widest">Tipo de Serviço</label>
                      <button type="button" onClick={() => setView('settings')} className="text-[9px] text-primary hover:underline font-bold uppercase tracking-tighter">Gerenciar Lista</button>
                    </div>
                    <select name="serviceType" defaultValue={editingWarranty?.serviceType || ""} required className="w-full bg-slate-900/50 border-slate-700 rounded-xl p-2.5 text-sm focus:ring-1 focus:ring-primary outline-none">
                      <option value="" disabled>Selecione um serviço</option>
                      {editingWarranty?.serviceType && !settings?.warrantyCategories?.includes(editingWarranty.serviceType) && (
                        <option value={editingWarranty.serviceType}>{editingWarranty.serviceType}</option>
                      )}
                      {(settings?.warrantyCategories || []).map(cat => (
                        <option key={cat} value={cat}>{cat}</option>
                      ))}
                    </select>
                  </div>

                  <div className="space-y-1.5">
                    <label className="text-[10px] font-bold text-slate-500 uppercase tracking-widest px-1">Descrição do Serviço</label>
                    <textarea name="serviceDescription" defaultValue={editingWarranty?.serviceDescription} placeholder="Detalhes adicionais do serviço" className="w-full bg-slate-900/50 border-slate-700 rounded-xl p-2.5 text-sm min-h-[80px] focus:ring-1 focus:ring-primary outline-none" />
                  </div>

                  <div className="grid grid-cols-2 gap-4">
                    <div className="space-y-1.5">
                      <label className="text-[10px] font-bold text-slate-500 uppercase tracking-widest px-1">Valor (R$)</label>
                      <input name="serviceValue" type="number" step="0.01" defaultValue={editingWarranty?.serviceValue || 0} className="w-full bg-slate-900/50 border-slate-700 rounded-xl p-2.5 text-sm focus:ring-1 focus:ring-primary outline-none" />
                    </div>
                    <div className="space-y-1.5">
                      <label className="text-[10px] font-bold text-slate-500 uppercase tracking-widest px-1">Data</label>
                      <input 
                        name="serviceDate" 
                        type="date" 
                        defaultValue={editingWarranty ? format(parseISO(editingWarranty.serviceDate), 'yyyy-MM-dd') : format(new Date(), 'yyyy-MM-dd')} 
                        required 
                        className="w-full bg-slate-900/50 border-slate-700 rounded-xl p-2.5 text-sm focus:ring-1 focus:ring-primary outline-none" 
                      />
                    </div>
                  </div>

                  <div className="grid grid-cols-2 gap-4">
                    <div className="space-y-1.5">
                      <label className="text-[10px] font-bold text-slate-500 uppercase tracking-widest px-1">Duração (meses)</label>
                      <select name="durationMonths" defaultValue={editingWarranty?.durationMonths || 3} className="w-full bg-slate-900/50 border-slate-700 rounded-xl p-2.5 text-sm focus:ring-1 focus:ring-primary outline-none">
                        <option value={1}>1 mês</option>
                        <option value={3}>3 meses</option>
                        <option value={6}>6 meses</option>
                        <option value={12}>12 meses</option>
                      </select>
                    </div>
                    <div className="space-y-1.5">
                      <label className="text-[10px] font-bold text-slate-500 uppercase tracking-widest px-1">Telefone</label>
                      <input name="clientPhone" defaultValue={editingWarranty?.clientPhone} placeholder="(11) 98765-4321" className="w-full bg-slate-900/50 border-slate-700 rounded-xl p-2.5 text-sm focus:ring-1 focus:ring-primary outline-none" />
                    </div>
                  </div>
                </div>

                <div className="flex gap-3 pt-2">
                  <button 
                    type="submit" 
                    disabled={isSaving}
                    className="flex-1 bg-primary py-3 rounded-xl font-bold hover:bg-primary/90 transition-all text-sm shadow-lg shadow-primary/20 disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
                  >
                    {isSaving ? (
                      <>
                        <RefreshCw className="w-4 h-4 animate-spin" />
                        Salvando...
                      </>
                    ) : (
                      editingWarranty ? 'Salvar Alterações' : 'Registrar Garantia'
                    )}
                  </button>
                  <button type="button" onClick={() => setView('warranties')} className="px-6 bg-slate-700/50 py-3 rounded-xl font-bold hover:bg-slate-700 transition-all text-sm">
                    Cancelar
                  </button>
                </div>
              </form>
            </div>
          )}

          {view === 'settings' && (
            <div className="space-y-4 max-w-2xl mx-auto">
              <h2 className="text-xl font-bold">Configurações</h2>
              
              {/* Subscription Status (for non-admins) */}
              {userProfile?.role !== 'admin' && userProfile?.subscriptionExpiresAt && (
                <div className={cn(
                  "p-4 rounded-xl border flex items-center justify-between",
                  isBefore(parseISO(userProfile.subscriptionExpiresAt), new Date()) 
                    ? "bg-red-500/10 border-red-500/30 text-red-500" 
                    : "bg-emerald-500/10 border-emerald-500/30 text-emerald-500"
                )}>
                  <div className="flex items-center gap-3">
                    <div className={cn(
                      "p-2 rounded-lg",
                      isBefore(parseISO(userProfile.subscriptionExpiresAt), new Date()) ? "bg-red-500/20" : "bg-emerald-500/20"
                    )}>
                      <ShieldCheck className="w-5 h-5" />
                    </div>
                    <div>
                      <p className="text-[9px] font-bold uppercase tracking-widest opacity-70">Sua Assinatura</p>
                      <p className="text-sm font-bold">
                        {isBefore(parseISO(userProfile.subscriptionExpiresAt), new Date()) 
                          ? "Expirada" 
                          : `Ativa até ${format(parseISO(userProfile.subscriptionExpiresAt), 'dd/MM/yyyy')}`}
                      </p>
                    </div>
                  </div>
                  {isBefore(parseISO(userProfile.subscriptionExpiresAt), new Date()) && (
                    <button 
                      onClick={() => window.open('https://wa.me/5511999999999?text=Olá, gostaria de renovar minha assinatura do MotoFix', '_blank')}
                      className="bg-red-500 text-white px-4 py-2 rounded-lg font-bold hover:bg-red-600 transition-all text-xs"
                    >
                      Renovar
                    </button>
                  )}
                </div>
              )}
              
              <div className="bg-slate-800/40 p-4 rounded-xl border border-slate-700/50 space-y-4">
                <div className="flex items-center gap-2 mb-1">
                  <Bike className="w-4 h-4 text-primary" />
                  <h3 className="text-sm font-bold">Perfil da Empresa</h3>
                </div>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                  <div className="space-y-1">
                    <label className="text-[10px] font-bold text-slate-500 uppercase tracking-widest px-1">Nome da Empresa</label>
                    <input 
                      value={settings?.businessName || ''}
                      onChange={(e) => setSettings(s => s ? { ...s, businessName: e.target.value } : s)}
                      placeholder="Ex: MotoFix Centro Automotivo"
                      className="w-full bg-slate-900/50 border-slate-700 rounded-lg p-2 text-sm focus:ring-1 focus:ring-primary outline-none"
                    />
                  </div>
                  <div className="space-y-1">
                    <label className="text-[10px] font-bold text-slate-500 uppercase tracking-widest px-1">WhatsApp da Empresa</label>
                    <input 
                      value={settings?.businessPhone || ''}
                      onChange={(e) => setSettings(s => s ? { ...s, businessPhone: e.target.value } : s)}
                      placeholder="Ex: (69) 99999-9999"
                      className="w-full bg-slate-900/50 border-slate-700 rounded-lg p-2 text-sm focus:ring-1 focus:ring-primary outline-none"
                    />
                  </div>
                  <div className="space-y-1">
                    <label className="text-[10px] font-bold text-slate-500 uppercase tracking-widest px-1">Instagram (@)</label>
                    <input 
                      value={settings?.businessInstagram || ''}
                      onChange={(e) => setSettings(s => s ? { ...s, businessInstagram: e.target.value } : s)}
                      placeholder="Ex: @motofix_oficial"
                      className="w-full bg-slate-900/50 border-slate-700 rounded-lg p-2 text-sm focus:ring-1 focus:ring-primary outline-none"
                    />
                  </div>
                  <div className="space-y-1">
                    <label className="text-[10px] font-bold text-slate-500 uppercase tracking-widest px-1">Endereço</label>
                    <input 
                      value={settings?.businessAddress || ''}
                      onChange={(e) => setSettings(s => s ? { ...s, businessAddress: e.target.value } : s)}
                      placeholder="Rua Exemplo, 123 - Centro"
                      className="w-full bg-slate-900/50 border-slate-700 rounded-lg p-2 text-sm focus:ring-1 focus:ring-primary outline-none"
                    />
                  </div>
                </div>
                <button 
                  onClick={async () => {
                    if (user && settings) {
                      const updatedSettings = { ...settings, isProfileComplete: !!settings?.businessName };
                      await setDoc(doc(db, 'users', user.uid, 'settings', 'config'), updatedSettings);
                      setSettings(updatedSettings);
                      setSaveMessage("Perfil atualizado com sucesso!");
                      setTimeout(() => setSaveMessage(null), 3000);
                    }
                  }}
                  className="w-full bg-emerald-500/10 text-emerald-500 py-2.5 rounded-lg font-bold hover:bg-emerald-500/20 transition-all border border-emerald-500/20 text-xs"
                >
                  Salvar Perfil da Empresa
                </button>
              </div>

              <div className="bg-slate-800/40 p-4 rounded-xl border border-slate-700/50 space-y-4">
                <div className="flex items-center gap-2 mb-1">
                  <MessageSquare className="w-4 h-4 text-primary" />
                  <h3 className="text-sm font-bold">Template do WhatsApp</h3>
                </div>
                <p className="text-[10px] text-slate-400">Use as tags: <code>{'{client}'}</code>, <code>{'{bike}'}</code>, <code>{'{date}'}</code></p>
                <textarea 
                  value={settings?.whatsappTemplate || ''}
                  onChange={(e) => setSettings(s => s ? { ...s, whatsappTemplate: e.target.value } : s)}
                  className="w-full bg-slate-900/50 border-slate-700 rounded-lg p-3 min-h-[100px] text-sm focus:ring-1 focus:ring-primary outline-none"
                />
                <button 
                  onClick={async () => {
                    if (user && settings) {
                      try {
                        await setDoc(doc(db, 'settings', user.uid), {
                          ...settings,
                          whatsappTemplate: settings?.whatsappTemplate || DEFAULT_SETTINGS.whatsappTemplate
                        }, { merge: true });
                        setSaveMessage("Configurações salvas com sucesso!");
                        setTimeout(() => setSaveMessage(null), 3000);
                      } catch (error) {
                        handleFirestoreError(error, OperationType.UPDATE, 'settings');
                      }
                    }
                  }}
                  className="w-full bg-primary py-2.5 rounded-lg font-bold hover:bg-primary/90 transition-all text-sm"
                >
                  Salvar Configurações
                </button>
                {saveMessage && (
                  <p className="text-emerald-500 text-center text-[10px] font-bold animate-bounce">{saveMessage}</p>
                )}
              </div>

              {/* Oil Types Management */}
              <div className="bg-slate-800/50 p-6 rounded-2xl border border-slate-700 space-y-4">
                <div className="flex items-center gap-3 mb-2">
                  <Droplets className="w-5 h-5 text-primary" />
                  <h3 className="font-bold">Categorias de Itens/Serviços Disponíveis</h3>
                </div>
                <div className="flex flex-wrap gap-2">
                  {(settings?.oilTypes || []).map((type, index) => (
                    <div key={index} className="bg-slate-900 px-3 py-1 rounded-lg border border-slate-700 flex items-center gap-2 group">
                      <span className="text-sm">{type}</span>
                      <button 
                        onClick={() => {
                          const newTypes = (settings?.oilTypes || []).filter((_, i) => i !== index);
                          setSettings({ ...settings, oilTypes: newTypes });
                        }}
                        className="text-slate-500 hover:text-red-500 transition-colors"
                      >
                        <X className="w-4 h-4" />
                      </button>
                    </div>
                  ))}
                </div>
                <div className="flex gap-2">
                  <input 
                    id="newOilType"
                    placeholder="Novo tipo de óleo"
                    className="flex-1 bg-slate-900 border-slate-700 rounded-xl p-2 text-sm focus:ring-primary"
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') {
                        const val = e.currentTarget.value.trim();
                        if (val && !settings?.oilTypes?.includes(val)) {
                          setSettings({ ...settings, oilTypes: [...(settings?.oilTypes || []), val] });
                          e.currentTarget.value = '';
                        }
                      }
                    }}
                  />
                  <button 
                    onClick={() => {
                      const input = document.getElementById('newOilType') as HTMLInputElement;
                      const val = input.value.trim();
                      if (val && !settings?.oilTypes?.includes(val)) {
                        setSettings({ ...settings, oilTypes: [...(settings?.oilTypes || []), val] });
                        input.value = '';
                      }
                    }}
                    className="bg-slate-700 p-2 rounded-xl hover:bg-slate-600"
                  >
                    <Plus className="w-5 h-5" />
                  </button>
                </div>
              </div>

              {/* Warranty Categories Management */}
              <div className="bg-slate-800/50 p-6 rounded-2xl border border-slate-700 space-y-4">
                <div className="flex items-center gap-3 mb-2">
                  <ShieldCheck className="w-5 h-5 text-primary" />
                  <h3 className="font-bold">Categorias de Garantia</h3>
                </div>
                <div className="flex flex-wrap gap-2">
                  {(settings?.warrantyCategories || []).map((cat, index) => (
                    <div key={index} className="bg-slate-900 px-3 py-1 rounded-lg border border-slate-700 flex items-center gap-2 group">
                      <span className="text-sm">{cat}</span>
                      <button 
                        onClick={() => {
                          const newCats = (settings?.warrantyCategories || []).filter((_, i) => i !== index);
                          setSettings({ ...settings, warrantyCategories: newCats });
                        }}
                        className="text-slate-500 hover:text-red-500 transition-colors"
                      >
                        <X className="w-4 h-4" />
                      </button>
                    </div>
                  ))}
                </div>
                <div className="flex gap-2">
                  <input 
                    id="newCategory"
                    placeholder="Nova categoria"
                    className="flex-1 bg-slate-900 border-slate-700 rounded-xl p-2 text-sm focus:ring-primary"
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') {
                        const val = e.currentTarget.value.trim();
                        if (val && !settings?.warrantyCategories?.includes(val)) {
                          setSettings({ ...settings, warrantyCategories: [...(settings?.warrantyCategories || []), val] });
                          e.currentTarget.value = '';
                        }
                      }
                    }}
                  />
                  <button 
                    onClick={() => {
                      const input = document.getElementById('newCategory') as HTMLInputElement;
                      const val = input.value.trim();
                      if (val && !settings?.warrantyCategories?.includes(val)) {
                        setSettings({ ...settings, warrantyCategories: [...(settings?.warrantyCategories || []), val] });
                        input.value = '';
                      }
                    }}
                    className="bg-slate-700 p-2 rounded-xl hover:bg-slate-600"
                  >
                    <Plus className="w-5 h-5" />
                  </button>
                </div>
              </div>

              <div className="bg-slate-800/50 p-6 rounded-2xl border border-slate-700">
                <h3 className="font-bold mb-4">Sobre o App</h3>
                <p className="text-sm text-slate-400">MotoFix Recorrentes v2.0</p>
                <p className="text-sm text-slate-400">Desenvolvido para gerenciamento de troca de óleo e garantias de serviço.</p>
                <p className="text-xs text-slate-500 mt-4">Todos os direitos reservados.</p>
              </div>
            </div>
          )}

          {view === 'new-client' && (
            <div className="max-w-xl mx-auto space-y-4">
              <div className="flex items-center gap-3">
                <button onClick={() => setView('clients')} className="p-1.5 rounded-full hover:bg-slate-800 transition-colors">
                  <ArrowLeft className="w-5 h-5" />
                </button>
                <h2 className="text-xl font-bold">{isNewService ? 'Registrar Serviço' : editingClient ? 'Editar Cliente' : 'Registrar Serviço'}</h2>
              </div>

              <form 
                onSubmit={(e) => {
                  e.preventDefault();
                  const formData = new FormData(e.currentTarget);
                  handleSaveClient({
                    name: formData.get('name') as string,
                    bikeModel: formData.get('bikeModel') as string,
                    contact: formData.get('contact') as string,
                    oilType: formData.get('oilType') as string,
                    oilPrice: parseFloat(formData.get('oilPrice') as string) || 0,
                    serviceType: formData.get('serviceType') as string,
                    serviceValue: parseFloat(formData.get('serviceValue') as string) || 0,
                    statusPagamento: (formData.get('statusPagamento') as 'Pago' | 'Pendente' | 'Parcial') || 'Pago',
                    valorPago: parseFloat(formData.get('valorPago') as string) || 0,
                    isRecurringRevenue: formData.get('isRecurringRevenue') === 'on',
                    recurrenceDays: parseInt(formData.get('recurrenceDays') as string) || 29,
                    lastMaintenanceDate: formData.get('lastMaintenanceDate') ? `${formData.get('lastMaintenanceDate')}T12:00:00Z` : undefined,
                    notes: formData.get('notes') as string
                  });
                }}
                className="bg-slate-800/40 p-5 rounded-2xl border border-slate-700/50 space-y-5"
              >
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div className="space-y-1.5 relative">
                    <label className="text-[10px] font-bold text-slate-500 uppercase tracking-widest px-1">Nome do Cliente</label>
                    <input 
                      name="name" 
                      value={clientNameInput || editingClient?.name || ''} 
                      onChange={(e) => handleClientNameChange(e.target.value)}
                      required 
                      placeholder="Ex: João Silva (digitar para sugestões)" 
                      className="w-full bg-slate-900/50 border-slate-700 rounded-xl p-2.5 text-sm focus:ring-1 focus:ring-primary outline-none" 
                    />
                    {clientSuggestions.length > 0 && (
                      <div className="absolute top-full left-0 right-0 mt-1 bg-slate-800 border border-slate-700 rounded-xl shadow-xl z-10 max-h-48 overflow-y-auto">
                        {clientSuggestions.map(suggestion => (
                          <button
                            key={suggestion.id}
                            type="button"
                            onClick={() => {
                              handleSelectClientSuggestion(suggestion);
                              setClientNameInput(suggestion.name);
                            }}
                            className="w-full px-3 py-2 text-left hover:bg-slate-700/50 border-b border-slate-700/30 last:border-b-0 text-xs transition-colors"
                          >
                            <div className="font-semibold text-white">{suggestion.name}</div>
                            <div className="text-slate-500 text-[10px]">{suggestion.bikeModel} • {suggestion.contact}</div>
                          </button>
                        ))}
                      </div>
                    )}
                  </div>
                  <div className="space-y-1.5">
                    <label className="text-[10px] font-bold text-slate-500 uppercase tracking-widest px-1">WhatsApp</label>
                    <input 
                      name="contact" 
                      defaultValue={editingClient?.contact} 
                      required 
                      placeholder="Ex: (69) 99999-9999" 
                      onChange={(e) => {
                        const val = e.target.value;
                        const numeric = val.replace(/\D/g, '');
                        let formatted = numeric;
                        if (numeric.length > 2) {
                          formatted = `(${numeric.slice(0, 2)}) ${numeric.slice(2)}`;
                        }
                        if (numeric.length > 7) {
                          formatted = `(${numeric.slice(0, 2)}) ${numeric.slice(2, 7)}-${numeric.slice(7, 11)}`;
                        }
                        e.target.value = formatted;
                      }}
                      className="w-full bg-slate-900/50 border-slate-700 rounded-xl p-2.5 text-sm focus:ring-1 focus:ring-primary outline-none" 
                    />
                  </div>
                  <div className="space-y-1.5">
                    <label className="text-[10px] font-bold text-slate-500 uppercase tracking-widest px-1">Modelo da Moto</label>
                    <input name="bikeModel" defaultValue={editingClient?.bikeModel} required placeholder="Ex: Honda CG 160" className="w-full bg-slate-900/50 border-slate-700 rounded-xl p-2.5 text-sm focus:ring-1 focus:ring-primary outline-none" />
                  </div>
                  <div className="space-y-1.5">
                    <label className="text-[10px] font-bold text-slate-500 uppercase tracking-widest px-1">Tipo de Serviço</label>
                    <select name="serviceType" defaultValue={editingClient?.lastServiceType || 'Troca de Óleo'} className="w-full bg-slate-900/50 border-slate-700 rounded-xl p-2.5 text-sm focus:ring-1 focus:ring-primary outline-none">
                      <option value="Troca de Óleo">Troca de Óleo</option>
                      <option value="Revisão">Revisão</option>
                      <option value="Pneus">Pneus</option>
                      <option value="Freios">Freios</option>
                      <option value="Outros">Outros</option>
                    </select>
                  </div>
                  <div className="space-y-1.5">
                    <label className="text-[10px] font-bold text-slate-500 uppercase tracking-widest px-1">Valor do Serviço (R$)</label>
                    <input name="serviceValue" type="number" step="0.01" defaultValue={editingClient?.serviceValue || 0} required className="w-full bg-slate-900/50 border-slate-700 rounded-xl p-2.5 text-sm focus:ring-1 focus:ring-primary outline-none" />
                  </div>
                  <div className="space-y-1.5">
                    <label className="text-[10px] font-bold text-slate-500 uppercase tracking-widest px-1">Status do Pagamento</label>
                    <select name="statusPagamento" defaultValue={editingClient?.statusPagamento || 'Pago'} className="w-full bg-slate-900/50 border-slate-700 rounded-xl p-2.5 text-sm focus:ring-1 focus:ring-primary outline-none">
                      <option value="Pago">✅ Pago</option>
                      <option value="Pendente">⏳ Pendente</option>
                      <option value="Parcial">📊 Parcial</option>
                    </select>
                  </div>
                  <div className="space-y-1.5">
                    <label className="text-[10px] font-bold text-slate-500 uppercase tracking-widest px-1">Valor Pago (R$)</label>
                    <input 
                      name="valorPago" 
                      type="number" 
                      step="0.01" 
                      value={valorPagoInput === '' ? '' : valorPagoInput}
                      onChange={(e) => setValorPagoInput(e.target.value)}
                      className="w-full bg-slate-900/50 border-slate-700 rounded-xl p-2.5 text-sm focus:ring-1 focus:ring-primary outline-none" 
                    />
                    <p className="text-[8px] text-slate-600 px-1">Deixe vazio para limpar</p>
                  </div>
                  <div className="space-y-1.5">
                    <label className="text-[10px] font-bold text-slate-500 uppercase tracking-widest px-1">Data do Serviço</label>
                    <input 
                      name="lastMaintenanceDate" 
                      type="date" 
                      defaultValue={editingClient?.lastMaintenanceDate ? format(parseISO(editingClient.lastMaintenanceDate), 'yyyy-MM-dd') : format(new Date(), 'yyyy-MM-dd')} 
                      required 
                      className="w-full bg-slate-900/50 border-slate-700 rounded-xl p-2.5 text-sm focus:ring-1 focus:ring-primary outline-none" 
                    />
                  </div>
                  <div className="space-y-1.5">
                    <label className="text-[10px] font-bold text-slate-500 uppercase tracking-widest px-1">Recorrência (Dias)</label>
                    <input name="recurrenceDays" type="number" defaultValue={editingClient?.recurrenceDays || 29} required className="w-full bg-slate-900/50 border-slate-700 rounded-xl p-2.5 text-sm focus:ring-1 focus:ring-primary outline-none" />
                  </div>
                  <div className="flex items-center gap-2 pt-6">
                    <input name="isRecurringRevenue" type="checkbox" defaultChecked={editingClient?.isRecurringRevenue ?? true} className="w-4 h-4 rounded border-slate-700 bg-slate-900 text-primary focus:ring-primary" />
                    <label className="text-xs font-bold text-slate-400">Receita Recorrente</label>
                  </div>
                </div>

                <div className="space-y-1.5">
                  <label className="text-[10px] font-bold text-slate-500 uppercase tracking-widest px-1">Observações</label>
                  <textarea name="notes" placeholder="Detalhes adicionais do serviço..." className="w-full bg-slate-900/50 border-slate-700 rounded-xl p-2.5 text-sm focus:ring-1 focus:ring-primary outline-none h-20" />
                </div>

                <div className="flex gap-3 pt-2">
                  <button 
                    type="submit" 
                    disabled={isSaving}
                    className="flex-1 bg-primary py-3 rounded-xl font-bold hover:bg-primary/90 transition-all text-sm shadow-lg shadow-primary/20 disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
                  >
                    {isSaving ? (
                      <>
                        <RefreshCw className="w-4 h-4 animate-spin" />
                        Salvando...
                      </>
                    ) : (
                      editingClient ? 'Salvar Alterações' : 'Registrar Serviço'
                    )}
                  </button>
                  <button type="button" onClick={() => setView('clients')} className="px-6 bg-slate-700/50 py-3 rounded-xl font-bold hover:bg-slate-700 transition-all text-sm">
                    Cancelar
                  </button>
                </div>
              </form>
            </div>
          )}
          {view === 'admin' && userProfile?.role === 'admin' && (
            <div className="space-y-6">
              <div className="flex items-center justify-between">
                <h2 className="text-2xl font-bold">Painel Administrativo</h2>
                <div className="bg-primary/10 px-3 py-1 rounded-full flex items-center gap-2">
                  <Shield className="w-4 h-4 text-primary" />
                  <span className="text-xs font-bold text-primary">ADMIN</span>
                </div>
              </div>

              <div className="grid grid-cols-1 gap-4">
                {allUsers.map(u => (
                  <div key={u.uid} className="bg-slate-800/50 p-5 rounded-2xl border border-slate-700 flex items-center justify-between">
                    <div className="flex items-center gap-4">
                      <div className={cn(
                        "w-12 h-12 rounded-xl flex items-center justify-center",
                        u.isActive ? "bg-emerald-500/10" : "bg-red-500/10"
                      )}>
                        {u.isActive ? <UserCheck className="w-6 h-6 text-emerald-500" /> : <UserX className="w-6 h-6 text-red-500" />}
                      </div>
                      <div>
                        <p className="font-bold">{u.displayName}</p>
                        <p className="text-xs text-slate-500">{u.email}</p>
                        <div className="flex flex-col gap-1 mt-1">
                          <p className="text-[10px] text-slate-600">Desde: {format(parseISO(u.createdAt), 'dd/MM/yyyy')}</p>
                          {u.subscriptionExpiresAt && (
                            <p className={cn(
                              "text-[10px] font-bold",
                              isBefore(parseISO(u.subscriptionExpiresAt), new Date()) ? "text-red-500" : "text-emerald-500"
                            )}>
                              Expira: {format(parseISO(u.subscriptionExpiresAt), 'dd/MM/yyyy')}
                            </p>
                          )}
                        </div>
                      </div>
                    </div>
                    <div className="flex flex-col items-end gap-2">
                      <div className="flex items-center gap-3">
                        <div className={cn(
                          "px-2 py-1 rounded-md text-[10px] font-bold uppercase tracking-widest",
                          u.isActive ? "bg-emerald-500/20 text-emerald-500" : "bg-red-500/20 text-red-500"
                        )}>
                          {u.isActive ? 'Ativo' : 'Bloqueado'}
                        </div>
                        {u.uid !== user.uid && (
                          <button 
                            onClick={() => toggleUserStatus(u)}
                            className={cn(
                              "p-2 rounded-lg transition-all",
                              u.isActive ? "bg-red-500/10 text-red-500 hover:bg-red-500/20" : "bg-emerald-500/10 text-emerald-500 hover:bg-emerald-500/20"
                            )}
                          >
                            {u.isActive ? <Lock className="w-5 h-5" /> : <ShieldCheck className="w-5 h-5" />}
                          </button>
                        )}
                      </div>
                      
                      {/* Subscription Quick Actions */}
                      {u.uid !== user.uid && (
                        <div className="flex flex-col items-end gap-2">
                          <div className="flex flex-wrap justify-end gap-1 max-w-[150px]">
                            <button 
                              onClick={() => updateSubscription(u.uid, -30)}
                              className="px-2 py-1 bg-red-500/10 hover:bg-red-500/20 text-[10px] font-bold rounded text-red-500 transition-colors border border-red-500/20"
                              title="Remover 30 dias"
                            >
                              -30d
                            </button>
                            <button 
                              onClick={() => updateSubscription(u.uid, -7)}
                              className="px-2 py-1 bg-red-500/10 hover:bg-red-500/20 text-[10px] font-bold rounded text-red-500 transition-colors border border-red-500/20"
                              title="Remover 7 dias"
                            >
                              -7d
                            </button>
                            <button 
                              onClick={() => updateSubscription(u.uid, 30)}
                              className="px-2 py-1 bg-emerald-500/10 hover:bg-emerald-500/20 text-[10px] font-bold rounded text-emerald-500 transition-colors border border-emerald-500/20"
                              title="Adicionar 30 dias"
                            >
                              +30d
                            </button>
                            <button 
                              onClick={() => updateSubscription(u.uid, 90)}
                              className="px-2 py-1 bg-emerald-500/10 hover:bg-emerald-500/20 text-[10px] font-bold rounded text-emerald-500 transition-colors border border-emerald-500/20"
                              title="Adicionar 90 dias"
                            >
                              +90d
                            </button>
                          </div>
                          <div className="flex items-center gap-2">
                            <span className="text-[10px] font-bold text-slate-500 uppercase">Vencimento:</span>
                            <input 
                              type="date" 
                              className="bg-slate-900 border border-slate-700 rounded px-2 py-1 text-[10px] text-white focus:ring-1 focus:ring-primary outline-none"
                              defaultValue={u.subscriptionExpiresAt ? format(parseISO(u.subscriptionExpiresAt), 'yyyy-MM-dd') : ''}
                              onChange={(e) => {
                                if (e.target.value) {
                                  setSubscriptionDate(u.uid, e.target.value);
                                }
                              }}
                            />
                          </div>
                        </div>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </main>

        {/* Bottom Nav */}
        <nav className="fixed bottom-0 left-0 right-0 bg-background-dark/95 backdrop-blur-xl border-t border-slate-800/50 px-6 py-2 z-50">
          <div className="max-w-md mx-auto flex justify-between items-center">
            <button 
              onClick={() => setView('dashboard')}
              className={cn("flex flex-col items-center gap-0.5 transition-all", view === 'dashboard' ? 'text-primary scale-110' : 'text-slate-500')}
            >
              <LayoutDashboard className="w-5 h-5" />
              <span className="text-[9px] font-bold uppercase tracking-tighter">Início</span>
            </button>
            <button 
              onClick={() => setView('clients')}
              className={cn("flex flex-col items-center gap-0.5 transition-all", view === 'clients' ? 'text-primary scale-110' : 'text-slate-500')}
            >
              <Users className="w-5 h-5" />
              <span className="text-[9px] font-bold uppercase tracking-tighter">Serviços</span>
            </button>
            {userProfile?.role === 'admin' ? (
              <button 
                onClick={() => setView('admin')}
                className={cn("flex flex-col items-center gap-0.5 transition-all", view === 'admin' ? 'text-primary scale-110' : 'text-slate-500')}
              >
                <Shield className="w-5 h-5" />
                <span className="text-[9px] font-bold uppercase tracking-tighter">Admin</span>
              </button>
            ) : (
              <button 
                onClick={() => setView('warranties')}
                className={cn("flex flex-col items-center gap-0.5 transition-all", view === 'warranties' ? 'text-primary scale-110' : 'text-slate-500')}
              >
                <ShieldCheck className="w-5 h-5" />
                <span className="text-[9px] font-bold uppercase tracking-tighter">Garantias</span>
              </button>
            )}
            <button 
              onClick={() => setView('history')}
              className={cn("flex flex-col items-center gap-0.5 transition-all", view === 'history' ? 'text-primary scale-110' : 'text-slate-500')}
            >
              <History className="w-5 h-5" />
              <span className="text-[9px] font-bold uppercase tracking-tighter">Histórico</span>
            </button>
            <button 
              onClick={() => setView('settings')}
              className={cn("flex flex-col items-center gap-0.5 transition-all", view === 'settings' ? 'text-primary scale-110' : 'text-slate-500')}
            >
              <SettingsIcon className="w-5 h-5" />
              <span className="text-[9px] font-bold uppercase tracking-tighter">Ajustes</span>
            </button>
          </div>
        </nav>

        {/* First Login Profile Setup Modal */}
        {!settings?.isProfileComplete && settingsLoaded && (
          <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm">
            <div className="bg-slate-800 w-full max-w-md rounded-3xl border border-primary/30 p-8 shadow-2xl animate-in fade-in zoom-in duration-300">
              <div className="bg-primary/20 w-16 h-16 rounded-2xl flex items-center justify-center mb-6">
                <Bike className="w-8 h-8 text-primary" />
              </div>
              <h2 className="text-2xl font-bold text-white mb-2">Bem-vindo ao MotoFix!</h2>
              <p className="text-slate-400 mb-8">Para começar, precisamos de alguns dados da sua empresa para os certificados de garantia.</p>
              
              <form 
                onSubmit={async (e) => {
                  e.preventDefault();
                  const formData = new FormData(e.currentTarget);
                  const businessName = formData.get('businessName') as string;
                  if (!businessName) return;

                  const updatedSettings = {
                    ...settings,
                    businessName,
                    businessPhone: formData.get('businessPhone') as string,
                    businessInstagram: formData.get('businessInstagram') as string,
                    businessAddress: formData.get('businessAddress') as string,
                    isProfileComplete: true
                  };
                  
                  if (user) {
                    await setDoc(doc(db, 'users', user.uid, 'settings', 'config'), updatedSettings);
                    setSettings(updatedSettings);
                  }
                }}
                className="space-y-4"
              >
                <div className="space-y-1">
                  <label className="text-[10px] font-bold text-slate-500 uppercase tracking-widest px-1">Nome da Empresa</label>
                  <input name="businessName" required placeholder="Ex: MotoFix Centro Automotivo" className="w-full bg-slate-900 border-slate-700 rounded-xl p-3 focus:ring-primary" />
                </div>
                <div className="space-y-1">
                  <label className="text-[10px] font-bold text-slate-500 uppercase tracking-widest px-1">WhatsApp</label>
                  <input name="businessPhone" placeholder="Ex: (69) 99999-9999" className="w-full bg-slate-900 border-slate-700 rounded-xl p-3 focus:ring-primary" />
                </div>
                <div className="space-y-1">
                  <label className="text-[10px] font-bold text-slate-500 uppercase tracking-widest px-1">Instagram (@)</label>
                  <input name="businessInstagram" placeholder="Ex: @motofix_oficial" className="w-full bg-slate-900 border-slate-700 rounded-xl p-3 focus:ring-primary" />
                </div>
                <div className="space-y-1">
                  <label className="text-[10px] font-bold text-slate-500 uppercase tracking-widest px-1">Endereço</label>
                  <input name="businessAddress" placeholder="Rua Exemplo, 123 - Centro" className="w-full bg-slate-900 border-slate-700 rounded-xl p-3 focus:ring-primary" />
                </div>
                <button type="submit" className="w-full bg-primary py-4 rounded-2xl font-bold text-white mt-4 hover:bg-primary/90 transition-all shadow-lg shadow-primary/20">
                  Concluir Cadastro
                </button>
              </form>
            </div>
          </div>
        )}
        {toast && (
          <Toast 
            message={toast.message} 
            type={toast.type} 
            onClose={() => setToast(null)} 
          />
        )}
      </div>
    </ErrorBoundary>
  );
}
