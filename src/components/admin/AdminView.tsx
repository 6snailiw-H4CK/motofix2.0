import { format, isBefore, parseISO } from 'date-fns';
import { Lock, Shield, ShieldCheck, UserCheck, UserX } from 'lucide-react';
import { cn } from '../../lib/utils';
import type { UserProfile } from '../../types';

type AdminViewProps = {
  users: UserProfile[];
  currentUserId: string;
  onToggleUserStatus: (user: UserProfile) => Promise<void> | void;
  onUpdateSubscription: (uid: string, days: number) => Promise<void> | void;
  onSetSubscriptionDate: (uid: string, date: string) => Promise<void> | void;
};

export const AdminView = ({
  users,
  currentUserId,
  onToggleUserStatus,
  onUpdateSubscription,
  onSetSubscriptionDate,
}: AdminViewProps) => (
  <div className="space-y-6">
    <div className="flex items-center justify-between">
      <h2 className="text-2xl font-bold">Painel Administrativo</h2>
      <div className="bg-primary/10 px-3 py-1 rounded-full flex items-center gap-2">
        <Shield className="w-4 h-4 text-primary" />
        <span className="text-xs font-bold text-primary">ADMIN</span>
      </div>
    </div>

    <div className="grid grid-cols-1 gap-4">
      {users.map((appUser) => {
        const isCurrentUser = appUser.uid === currentUserId;
        const isExpired = appUser.subscriptionExpiresAt
          ? isBefore(parseISO(appUser.subscriptionExpiresAt), new Date())
          : false;

        return (
          <div
            key={appUser.uid}
            className="bg-slate-800/50 p-5 rounded-2xl border border-slate-700 flex items-center justify-between"
          >
            <div className="flex items-center gap-4">
              <div
                className={cn(
                  'w-12 h-12 rounded-xl flex items-center justify-center',
                  appUser.isActive ? 'bg-emerald-500/10' : 'bg-red-500/10'
                )}
              >
                {appUser.isActive ? (
                  <UserCheck className="w-6 h-6 text-emerald-500" />
                ) : (
                  <UserX className="w-6 h-6 text-red-500" />
                )}
              </div>
              <div>
                <p className="font-bold">{appUser.displayName}</p>
                <p className="text-xs text-slate-500">{appUser.email}</p>
                <div className="flex flex-col gap-1 mt-1">
                  <p className="text-[10px] text-slate-600">
                    Desde: {format(parseISO(appUser.createdAt), 'dd/MM/yyyy')}
                  </p>
                  {appUser.subscriptionExpiresAt && (
                    <p className={cn('text-[10px] font-bold', isExpired ? 'text-red-500' : 'text-emerald-500')}>
                      Expira: {format(parseISO(appUser.subscriptionExpiresAt), 'dd/MM/yyyy')}
                    </p>
                  )}
                </div>
              </div>
            </div>

            <div className="flex flex-col items-end gap-2">
              <div className="flex items-center gap-3">
                <div
                  className={cn(
                    'px-2 py-1 rounded-md text-[10px] font-bold uppercase tracking-widest',
                    appUser.isActive ? 'bg-emerald-500/20 text-emerald-500' : 'bg-red-500/20 text-red-500'
                  )}
                >
                  {appUser.isActive ? 'Ativo' : 'Bloqueado'}
                </div>
                {!isCurrentUser && (
                  <button
                    type="button"
                    onClick={() => void onToggleUserStatus(appUser)}
                    className={cn(
                      'p-2 rounded-lg transition-all',
                      appUser.isActive
                        ? 'bg-red-500/10 text-red-500 hover:bg-red-500/20'
                        : 'bg-emerald-500/10 text-emerald-500 hover:bg-emerald-500/20'
                    )}
                  >
                    {appUser.isActive ? <Lock className="w-5 h-5" /> : <ShieldCheck className="w-5 h-5" />}
                  </button>
                )}
              </div>

              {!isCurrentUser && (
                <div className="flex flex-col items-end gap-2">
                  <div className="flex flex-wrap justify-end gap-1 max-w-[150px]">
                    <button
                      type="button"
                      onClick={() => void onUpdateSubscription(appUser.uid, -30)}
                      className="px-2 py-1 bg-red-500/10 hover:bg-red-500/20 text-[10px] font-bold rounded text-red-500 transition-colors border border-red-500/20"
                      title="Remover 30 dias"
                    >
                      -30d
                    </button>
                    <button
                      type="button"
                      onClick={() => void onUpdateSubscription(appUser.uid, -7)}
                      className="px-2 py-1 bg-red-500/10 hover:bg-red-500/20 text-[10px] font-bold rounded text-red-500 transition-colors border border-red-500/20"
                      title="Remover 7 dias"
                    >
                      -7d
                    </button>
                    <button
                      type="button"
                      onClick={() => void onUpdateSubscription(appUser.uid, 30)}
                      className="px-2 py-1 bg-emerald-500/10 hover:bg-emerald-500/20 text-[10px] font-bold rounded text-emerald-500 transition-colors border border-emerald-500/20"
                      title="Adicionar 30 dias"
                    >
                      +30d
                    </button>
                    <button
                      type="button"
                      onClick={() => void onUpdateSubscription(appUser.uid, 90)}
                      className="px-2 py-1 bg-emerald-500/10 hover:bg-emerald-500/20 text-[10px] font-bold rounded text-emerald-500 transition-colors border border-emerald-500/20"
                      title="Adicionar 90 dias"
                    >
                      +90d
                    </button>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="text-[10px] font-bold text-slate-950 uppercase">Vencimento:</span>
                    <input
                      type="date"
                      className="bg-white border border-slate-300 rounded px-2 py-1 text-[10px] font-bold text-slate-950 focus:ring-1 focus:ring-primary outline-none"
                      defaultValue={
                        appUser.subscriptionExpiresAt ? format(parseISO(appUser.subscriptionExpiresAt), 'yyyy-MM-dd') : ''
                      }
                      onChange={(event) => {
                        if (event.target.value) {
                          void onSetSubscriptionDate(appUser.uid, event.target.value);
                        }
                      }}
                    />
                  </div>
                </div>
              )}
            </div>
          </div>
        );
      })}
    </div>
  </div>
);
