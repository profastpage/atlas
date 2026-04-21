'use client';

import { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  X, User, LogOut, Edit3, Check, Loader2, ShieldCheck, ChevronRight
} from 'lucide-react';

// ========================================
// SETTINGS SIDEBAR — Simplified (no API deps)
// Mobile First, Dark Theme
// ========================================

interface SettingsSidebarProps {
  isOpen: boolean;
  onClose: () => void;
  user: { id: string; email: string; name: string; tenantId: string } | null;
  token: string;
  onOpenAdmin: () => void;
}

function getInitial(name: string): string {
  return (name || '?').charAt(0).toUpperCase();
}

export default function SettingsSidebar({
  isOpen,
  onClose,
  user,
  onOpenAdmin,
}: SettingsSidebarProps) {
  const [isEditingName, setIsEditingName] = useState(false);
  const [editName, setEditName] = useState('');
  const isAdmin = user?.email?.toLowerCase().includes('admin') ?? false;

  const startEditName = () => {
    if (user) {
      setEditName(user.name);
      setIsEditingName(true);
    }
  };

  const saveEditName = () => {
    setIsEditingName(false);
  };

  return (
    <AnimatePresence>
      {isOpen && (
        <>
          <motion.div
            key="backdrop"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.2 }}
            className="fixed inset-0 bg-black/60 backdrop-blur-sm z-[60]"
            onClick={onClose}
          />

          <motion.aside
            key="panel"
            initial={{ x: '100%' }}
            animate={{ x: 0 }}
            exit={{ x: '100%' }}
            transition={{ type: 'spring', damping: 30, stiffness: 300 }}
            className="fixed top-0 right-0 bottom-0 z-[70] w-full sm:w-80 bg-gray-900 rounded-l-2xl shadow-2xl shadow-black/40 flex flex-col"
            role="dialog"
            aria-modal="true"
          >
            {/* Header */}
            <div className="flex items-center justify-between px-5 pt-5 pb-3 shrink-0">
              <h2 className="text-lg font-bold text-white">Configuracion</h2>
              <button
                onClick={onClose}
                className="p-2 rounded-xl hover:bg-gray-800 text-gray-400 hover:text-white transition-colors"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Scrollable Content */}
            <div className="flex-1 overflow-y-auto px-5 pb-6 min-h-0 overscroll-contain">
              {/* User Profile */}
              <section aria-label="User profile">
                <div className="flex items-center gap-3.5">
                  <div className="w-14 h-14 rounded-full bg-gradient-to-br from-emerald-500 to-emerald-700 flex items-center justify-center shrink-0 shadow-lg shadow-emerald-500/20">
                    <span className="text-xl font-bold text-white">
                      {user ? getInitial(user.name) : '?'}
                    </span>
                  </div>
                  <div className="flex-1 min-w-0">
                    {isEditingName ? (
                      <div className="flex items-center gap-1.5">
                        <input
                          type="text"
                          value={editName}
                          onChange={(e) => setEditName(e.target.value)}
                          onKeyDown={(e) => e.key === 'Enter' && saveEditName()}
                          autoFocus
                          className="flex-1 bg-gray-800/60 border border-gray-700/50 rounded-lg px-2.5 py-1 text-sm text-white focus:outline-none focus:ring-2 focus:ring-emerald-500/40"
                        />
                        <button
                          onClick={saveEditName}
                          className="p-1.5 rounded-lg bg-emerald-600 text-white hover:bg-emerald-500"
                        >
                          <Check className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    ) : (
                      <button
                        onClick={startEditName}
                        className="group flex items-center gap-1.5 w-full text-left"
                      >
                        <span className="text-sm font-semibold text-white truncate">
                          {user?.name || 'Usuario'}
                        </span>
                        <Edit3 className="w-3 h-3 text-gray-600 group-hover:text-emerald-400 shrink-0" />
                      </button>
                    )}
                    <p className="text-xs text-gray-500 truncate mt-0.5">
                      {user?.email || 'email@example.com'}
                    </p>
                  </div>
                </div>
              </section>

              <div className="border-t border-gray-800/40 my-5" />

              {/* Plan Info (static) */}
              <section aria-label="Plan">
                <h3 className="text-xs uppercase tracking-wider text-gray-500 font-semibold mb-3">
                  Tu Plan
                </h3>
                <div className="bg-gray-800/40 rounded-xl p-4 border border-gray-700/30">
                  <div className="flex items-center gap-2 mb-2">
                    <span className="text-sm font-semibold text-emerald-400">Plan Gratuito</span>
                    <span className="px-2 py-0.5 rounded-full text-[10px] font-medium bg-emerald-500/20 text-emerald-400">
                      Activo
                    </span>
                  </div>
                  <p className="text-xs text-gray-400">
                    Acceso completo al chat con Atlas. 5 mensajes como invitado, ilimitados con cuenta.
                  </p>
                </div>
              </section>

              {/* Admin Access */}
              {isAdmin && (
                <>
                  <div className="border-t border-gray-800/40 my-5" />
                  <section aria-label="Admin access">
                    <h3 className="text-xs uppercase tracking-wider text-gray-500 font-semibold mb-3">
                      Administracion
                    </h3>
                    <button
                      onClick={onOpenAdmin}
                      className="w-full flex items-center gap-3 p-3.5 rounded-xl bg-amber-500/10 border border-amber-500/20 hover:bg-amber-500/15 transition-all active:scale-[0.98] group"
                    >
                      <div className="w-9 h-9 rounded-lg bg-amber-500/20 flex items-center justify-center shrink-0">
                        <ShieldCheck className="w-5 h-5 text-amber-400" />
                      </div>
                      <div className="text-left flex-1 min-w-0">
                        <p className="text-sm font-semibold text-amber-300">
                          Panel de Administracion
                        </p>
                        <p className="text-[11px] text-amber-400/60">
                          Acceso elevado requerido
                        </p>
                      </div>
                      <ChevronRight className="w-4 h-4 text-amber-400/40 group-hover:text-amber-400 shrink-0" />
                    </button>
                  </section>
                </>
              )}

              <div className="border-t border-gray-800/40 my-5" />

              {/* Logout */}
              <button
                onClick={() => {
                  localStorage.removeItem('atlas_token');
                  localStorage.removeItem('atlas_tenant_id');
                  localStorage.removeItem('atlas_user');
                  window.location.reload();
                }}
                className="w-full flex items-center gap-3 p-3.5 rounded-xl bg-red-500/10 border border-red-500/20 hover:bg-red-500/15 transition-all active:scale-[0.98]"
              >
                <div className="w-9 h-9 rounded-lg bg-red-500/20 flex items-center justify-center shrink-0">
                  <LogOut className="w-5 h-5 text-red-400" />
                </div>
                <div className="text-left">
                  <p className="text-sm font-semibold text-red-400">Cerrar Sesion</p>
                  <p className="text-[11px] text-red-400/60">Salir de tu cuenta</p>
                </div>
              </button>

              {/* App Info */}
              <div className="border-t border-gray-800/40 my-5" />
              <div className="text-center py-2">
                <p className="text-xs font-semibold text-gray-500">Atlas Coach v1.0</p>
                <p className="text-[11px] text-gray-600 mt-0.5">Hecho con IA</p>
              </div>
              <div className="h-[env(safe-area-inset-bottom,0px)]" />
            </div>
          </motion.aside>
        </>
      )}
    </AnimatePresence>
  );
}
