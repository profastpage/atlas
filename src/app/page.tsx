'use client';

import { useState, useEffect, useRef, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Mic, MicOff, Send, Plus, MessageSquare, Trash2,
  X, LogOut, LogIn, Settings, Lock, UserPlus, ShieldCheck, XCircle
} from 'lucide-react';
import { WELCOME_MESSAGE_NEW } from '@/lib/atlas';
import SettingsSidebar from '@/components/SettingsSidebar';
import InstallPrompt from '@/components/InstallPrompt';
import ExpandButton, { ExpandSpinner } from '@/components/ExpandButton';

// ========================================
// TYPES
// ========================================

interface Message {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  timestamp: string;
}

interface SessionInfo {
  id: string;
  title: string;
  isActive: boolean;
  createdAt: string;
  _count?: { messages: number };
}

interface UserInfo {
  id: string;
  email: string;
  name: string;
}

// ========================================
// CONSTANTS
// ========================================

const FREE_MESSAGES_LIMIT = 5;
const GUEST_TENANT_KEY = 'atlas_guest_tenant_id';
const GUEST_MESSAGES_KEY = 'atlas_guest_msg_count';

// ========================================
// MAIN APP -- ATLAS COGNITIVE COACH
// Chat directo con 5 mensajes gratis
// ========================================

export default function AtlasApp() {
  // ---- Auth State ----
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [userInfo, setUserInfo] = useState<UserInfo | null>(null);

  // ---- Session & Tenant State ----
  const [tenantId, setTenantId] = useState<string>('');
  const [sessionId, setSessionId] = useState<string>('');
  const [sessions, setSessions] = useState<SessionInfo[]>([]);
  const [showSessions, setShowSessions] = useState(false);
  const [sessionReady, setSessionReady] = useState(false);

  // ---- Chat State ----
  const [messages, setMessages] = useState<Message[]>([]);
  const [inputValue, setInputValue] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [streamingId, setStreamingId] = useState<string | null>(null);

  // ---- Guest State ----
  const [guestMessageCount, setGuestMessageCount] = useState(0);
  const [showPaywall, setShowPaywall] = useState(false);

  // ---- Expand State ----
  const [expandingId, setExpandingId] = useState<string | null>(null);

  // ---- Voice State ----
  const [isRecording, setIsRecording] = useState(false);
  const [isTranscribing, setIsTranscribing] = useState(false);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const audioChunksRef = useRef<Blob[]>([]);

  // ---- Refs ----
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  // ---- Settings State ----
  const [token, setToken] = useState('');
  const [showSettings, setShowSettings] = useState(false);

  // ========================================
  // INIT: Determine auth state
  // ========================================
  useEffect(() => {
    const savedToken = localStorage.getItem('atlas_token');
    const savedTenantId = localStorage.getItem('atlas_tenant_id');
    const savedUser = localStorage.getItem('atlas_user');

    if (savedToken) {
      setToken(savedToken);

      if (savedTenantId) {
        // Validate token with server
        fetch('/api/auth/me', {
          headers: { Authorization: `Bearer ${savedToken}` },
        })
          .then((res) => {
            if (res.ok) return res.json();
            throw new Error('Token invalid');
          })
          .then((data) => {
            if (data.authenticated) {
              setIsAuthenticated(true);
              setTenantId(savedTenantId);
              if (savedUser) {
                try { setUserInfo(JSON.parse(savedUser)); } catch {}
              }
              fetchSessions(savedTenantId);
            } else {
              logout();
            }
          })
          .catch(() => {
            // Token invalid — become guest
            logout();
          });
      }
    } else {
      // No token — Guest mode: restore guest session or start fresh
      const guestTenantId = localStorage.getItem(GUEST_TENANT_KEY);
      const guestCount = parseInt(localStorage.getItem(GUEST_MESSAGES_KEY) || '0', 10);
      setGuestMessageCount(guestCount);

      if (guestTenantId) {
        setTenantId(guestTenantId);
      }

      // Auto-init session for guest
      initGuestSession(guestTenantId);
    }
  }, []);

  const initGuestSession = async (existingTenantId?: string | null) => {
    try {
      const res = await fetch('/api/session', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ tenantId: existingTenantId || undefined }),
      });
      const data = await res.json();

      const tId = data.tenantId;
      setTenantId(tId);
      setSessionId(data.sessionId);
      if (!existingTenantId) {
        localStorage.setItem(GUEST_TENANT_KEY, tId);
      }
      setMessages([
        {
          id: `welcome-${Date.now()}`,
          role: 'assistant',
          content: WELCOME_MESSAGE_NEW,
          timestamp: new Date().toISOString(),
        },
      ]);
      setSessionReady(true);
    } catch (error) {
      console.error('[GUEST] Error al iniciar sesion:', error);
    }
  };

  useEffect(() => {
    scrollToBottom();
  }, [messages]);

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  };

  // ========================================
  // AUTH LOGIC
  // ========================================

  const logout = () => {
    localStorage.removeItem('atlas_token');
    localStorage.removeItem('atlas_tenant_id');
    localStorage.removeItem('atlas_user');
    setIsAuthenticated(false);
    setTenantId('');
    setSessionId('');
    setSessions([]);
    setMessages([]);
    setUserInfo(null);
    setToken('');
    setShowPaywall(false);
  };

  // ========================================
  // LOGIN MODAL (inline, no separate route needed in page)
  // ========================================

  // ========================================
  // SESSION MANAGEMENT
  // ========================================

  const createNewSession = useCallback(async () => {
    try {
      const res = await fetch('/api/session', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ tenantId: tenantId || undefined }),
      });
      const data = await res.json();

      setTenantId(data.tenantId);
      setSessionId(data.sessionId);
      localStorage.setItem('atlas_tenant_id', data.tenantId);
      setMessages([]);
      setShowSessions(false);

      setTimeout(() => {
        let welcomeContent = WELCOME_MESSAGE_NEW;

        if (!data.isNewUser && data.userName && data.contextSummary) {
          welcomeContent = `${data.userName}, otra vez aqui. Volvamos a tu problema: **${data.contextSummary.substring(0, 60)}**. Hubo algun cambio o seguimos en el mismo punto?`;
        } else if (!data.isNewUser && data.contextSummary) {
          welcomeContent = `Ya hemos hablado. Tu situacion previa: **${data.contextSummary.substring(0, 60)}**. Que hay de nuevo?`;
        }

        setMessages([
          {
            id: `welcome-${Date.now()}`,
            role: 'assistant',
            content: welcomeContent,
            timestamp: new Date().toISOString(),
          },
        ]);
        setSessionReady(true);
      }, 400);

      fetchSessions(data.tenantId);
      return data;
    } catch (error) {
      console.error('[SESION] Error al crear:', error);
      return null;
    }
  }, [tenantId]);

  const fetchSessions = async (tId: string) => {
    try {
      const res = await fetch(`/api/session?tenantId=${tId}`);
      const data = await res.json();
      setSessions(data.sessions || []);
    } catch (error) {
      console.error('[SESION] Error al listar:', error);
    }
  };

  const loadSession = async (sId: string) => {
    try {
      const res = await fetch(`/api/chat?sessionId=${sId}`);
      const data = await res.json();
      setSessionId(sId);
      setMessages(
        (data.messages || []).map((m: Message) => ({
          ...m,
          id: m.id || `msg-${Math.random()}`,
          timestamp: m.timestamp || new Date().toISOString(),
        }))
      );
      setSessionReady(true);
      setShowSessions(false);
    } catch (error) {
      console.error('[SESION] Error al cargar:', error);
    }
  };

  const deleteSession = async (sId: string) => {
    try {
      await fetch(`/api/chat?sessionId=${sId}`, { method: 'DELETE' });
      setSessions((prev) => prev.filter((s) => s.id !== sId));
      if (sessionId === sId) {
        setSessionId('');
        setMessages([]);
        setSessionReady(false);
      }
    } catch (error) {
      console.error('[SESION] Error al eliminar:', error);
    }
  };

  // ========================================
  // SEND MESSAGE — Guest + Auth flow
  // ========================================

  const sendMessage = useCallback(
    async (text: string) => {
      if (!text.trim() || isLoading || !!streamingId) return;

      // ---- GUEST LIMIT CHECK ----
      if (!isAuthenticated) {
        const newCount = guestMessageCount + 1;
        if (newCount > FREE_MESSAGES_LIMIT) {
          setShowPaywall(true);
          return;
        }
        setGuestMessageCount(newCount);
        localStorage.setItem(GUEST_MESSAGES_KEY, String(newCount));
      }

      // Auto-crear sesion si no existe
      let currentSessionId = sessionId;
      if (!currentSessionId) {
        const sessionData = await createNewSession();
        if (!sessionData) return;
        currentSessionId = sessionData.sessionId;
        await new Promise((r) => setTimeout(r, 500));
      }

      const userMsg: Message = {
        id: `user-${Date.now()}`,
        role: 'user',
        content: text.trim(),
        timestamp: new Date().toISOString(),
      };

      setMessages((prev) => [...prev, userMsg]);
      setInputValue('');
      setIsLoading(true);

      try {
        const res = await fetch('/api/chat', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            sessionId: currentSessionId,
            message: text.trim(),
            tenantId,
          }),
        });

        const contentType = res.headers.get('content-type') || '';

        if (contentType.includes('text/event-stream')) {
          // ====== STREAMING MODE — Real-time tokens ======
          const aId = `assistant-${Date.now()}`;
          setMessages((prev) => [
            ...prev,
            { id: aId, role: 'assistant', content: '', timestamp: new Date().toISOString() },
          ]);
          setIsLoading(false);
          setStreamingId(aId);

          const reader = res.body!.getReader();
          const decoder = new TextDecoder();
          let buffer = '';
          let fullText = '';
          let lastUIUpdate = 0;

          while (true) {
            const { done, value } = await reader.read();
            if (done) break;

            buffer += decoder.decode(value, { stream: true });
            const lines = buffer.split('\n');
            buffer = lines.pop() || '';

            for (const line of lines) {
              const trimmed = line.trim();
              if (!trimmed.startsWith('data: ')) continue;
              try {
                const parsed = JSON.parse(trimmed.slice(6));
                if (parsed.done) {
                  fullText = parsed.full;
                } else if (parsed.token) {
                  fullText += parsed.token;
                } else if (parsed.error) {
                  fullText = 'Error de comunicacion.';
                }
              } catch {}
            }

            // Throttle UI updates to ~30fps
            const now = Date.now();
            if (now - lastUIUpdate > 30) {
              const currentText = fullText;
              setMessages((prev) =>
                prev.map((m) => (m.id === aId ? { ...m, content: currentText } : m))
              );
              lastUIUpdate = now;
            }
          }

          // Final update
          setMessages((prev) =>
            prev.map((m) =>
              m.id === aId
                ? { ...m, content: fullText || 'Sin respuesta.' }
                : m
            )
          );
          setStreamingId(null);
        } else {
          // ====== NON-STREAMING MODE (fallback) ======
          const data = await res.json();
          const assistantMsg: Message = {
            id: `assistant-${Date.now()}`,
            role: 'assistant',
            content: data.response || 'Error de comunicacion.',
            timestamp: new Date().toISOString(),
          };
          setMessages((prev) => [...prev, assistantMsg]);
        }

        // After response, check if guest hit limit
        if (!isAuthenticated && guestMessageCount >= FREE_MESSAGES_LIMIT) {
          setTimeout(() => setShowPaywall(true), 800);
        }

        if (tenantId && isAuthenticated) fetchSessions(tenantId);
      } catch (error) {
        console.error('[CEREBRO] Error:', error);
        setMessages((prev) => [
          ...prev,
          {
            id: `error-${Date.now()}`,
            role: 'assistant',
            content: 'Error de conexion. Intenta de nuevo.',
            timestamp: new Date().toISOString(),
          },
        ]);
      } finally {
        setIsLoading(false);
        setStreamingId(null);
        inputRef.current?.focus();
      }
    },
    [sessionId, tenantId, isLoading, streamingId, createNewSession, isAuthenticated, guestMessageCount]
  );

  // ========================================
  // VOICE RECORDING — Ear Module
  // ========================================

  const startRecording = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: {
          channelCount: 1,
          sampleRate: 16000,
          echoCancellation: true,
          noiseSuppression: true,
        },
      });

      let mimeType = 'audio/webm;codecs=opus';
      if (!MediaRecorder.isTypeSupported(mimeType)) {
        mimeType = 'audio/webm';
        if (!MediaRecorder.isTypeSupported(mimeType)) {
          mimeType = 'audio/mp4';
        }
      }

      const mediaRecorder = new MediaRecorder(stream, { mimeType });
      mediaRecorderRef.current = mediaRecorder;
      audioChunksRef.current = [];

      mediaRecorder.ondataavailable = (event) => {
        if (event.data.size > 0) {
          audioChunksRef.current.push(event.data);
        }
      };

      mediaRecorder.onstop = async () => {
        stream.getTracks().forEach((t) => t.stop());
        const extension = mimeType.includes('mp4') ? 'mp4' : 'webm';
        const audioBlob = new Blob(audioChunksRef.current, { type: mimeType });
        await transcribeAudio(audioBlob, extension);
      };

      mediaRecorder.start();
      setIsRecording(true);
    } catch (error) {
      console.error('[OIDO] Acceso al microfono denegado:', error);
      setIsRecording(false);
    }
  };

  const stopRecording = () => {
    if (mediaRecorderRef.current && isRecording) {
      mediaRecorderRef.current.stop();
      setIsRecording(false);
    }
  };

  const transcribeAudio = async (audioBlob: Blob, extension: string) => {
    setIsTranscribing(true);
    try {
      const formData = new FormData();
      formData.append('audio', audioBlob, `recording.${extension}`);

      const res = await fetch('/api/transcribe', {
        method: 'POST',
        body: formData,
      });

      const data = await res.json();

      if (data.transcription && data.transcription.trim()) {
        setInputValue(data.transcription.trim());
        sendMessage(data.transcription.trim());
      } else if (data.error) {
        console.error('[OIDO]', data.error);
      }
    } catch (error) {
      console.error('[OIDO] Error de transcripcion:', error);
    } finally {
      setIsTranscribing(false);
    }
  };

  const toggleRecording = () => {
    if (isLoading || isTranscribing) return;
    if (isRecording) {
      stopRecording();
    } else {
      startRecording();
    }
  };

  // ---- Form Handlers ----
  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    sendMessage(inputValue);
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      sendMessage(inputValue);
    }
  };



  // ========================================
  // FORMATTING
  // ========================================

  const formatMessageContent = (content: string) => {
    let formatted = content.replace(
      /\u2022/g,
      '<span class="text-emerald-400 mr-1">\u2022</span>'
    );
    formatted = formatted.replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>');
    formatted = formatted.replace(/\n/g, '<br/>');
    return formatted;
  };

  const formatTime = (timestamp: string) => {
    try {
      return new Date(timestamp).toLocaleTimeString('es-PE', {
        hour: '2-digit',
        minute: '2-digit',
      });
    } catch {
      return '';
    }
  };

  const remainingMessages = Math.max(0, FREE_MESSAGES_LIMIT - guestMessageCount);

  // ========================================
  // EXPAND MODE — Regenerate with no word limit
  // ========================================

  const isShortResponse = (content: string) => {
    if (!content || content.startsWith('Error') || content.startsWith('Sin respuesta')) return false;
    const words = content.split(/\s+/).filter(Boolean).length;
    return words >= 15 && words <= 90;
  };

  const expandMessage = useCallback(
    async (msgId: string) => {
      if (!sessionId || !tenantId || expandingId) return;

      setExpandingId(msgId);

      try {
        const res = await fetch('/api/chat', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            sessionId,
            tenantId,
            expandedMode: true,
            messageId: msgId,
          }),
        });

        const contentType = res.headers.get('content-type') || '';

        if (contentType.includes('text/event-stream')) {
          // Streaming expanded response
          const reader = res.body!.getReader();
          const decoder = new TextDecoder();
          let buffer = '';
          let fullText = '';
          let lastUIUpdate = 0;

          while (true) {
            const { done, value } = await reader.read();
            if (done) break;

            buffer += decoder.decode(value, { stream: true });
            const lines = buffer.split('\n');
            buffer = lines.pop() || '';

            for (const line of lines) {
              const trimmed = line.trim();
              if (!trimmed.startsWith('data: ')) continue;
              try {
                const parsed = JSON.parse(trimmed.slice(6));
                if (parsed.token) {
                  fullText += parsed.token;
                }
              } catch {}
            }

            // Throttle UI updates to ~30fps
            const now = Date.now();
            if (now - lastUIUpdate > 30) {
              const currentText = fullText;
              setMessages((prev) =>
                prev.map((m) =>
                  m.id === msgId ? { ...m, content: currentText } : m
                )
              );
              lastUIUpdate = now;
            }
          }

          // Final update
          setMessages((prev) =>
            prev.map((m) =>
              m.id === msgId
                ? { ...m, content: fullText || 'Sin respuesta.' }
                : m
            )
          );
        } else {
          // Non-streaming fallback
          const data = await res.json();
          if (data.response) {
            setMessages((prev) =>
              prev.map((m) =>
                m.id === msgId
                  ? { ...m, content: data.response }
                  : m
              )
            );
          }
        }
      } catch (error) {
        console.error('[EXPAND] Error:', error);
      } finally {
        setExpandingId(null);
      }
    },
    [sessionId, tenantId, expandingId]
  );

  // ========================================
  // MAIN CHAT SCREEN (accessible for all)
  // ========================================

  return (
    <div className="flex flex-col h-dvh bg-gray-950 text-white overflow-hidden">
      {/* ===== SETTINGS SIDEBAR ===== */}
      <SettingsSidebar
        isOpen={showSettings}
        onClose={() => setShowSettings(false)}
        user={userInfo ? { ...userInfo, tenantId } : null}
        token={token || ''}
        onOpenAdmin={() => { setShowSettings(false); window.location.href = '/admin'; }}
      />

      {/* ===== HEADER ===== */}
      <header className="flex items-center justify-between px-4 py-3 bg-gray-900/90 backdrop-blur-md border-b border-gray-800/40 z-20 shrink-0">
        <div className="flex items-center gap-3">
          <button
            onClick={() => setShowSessions(!showSessions)}
            className="p-2 rounded-full hover:bg-gray-800/60 transition-colors"
            aria-label="Historial de sesiones"
          >
            <MessageSquare className="w-5 h-5 text-emerald-400" />
          </button>
          <div>
            <h1 className="text-[15px] font-bold text-white tracking-tight">
              ATLAS
            </h1>
            <p className="text-[10px] text-emerald-400/70 font-medium tracking-wide uppercase">
              Coach Cognitivo de Elite
            </p>
          </div>
        </div>
        <div className="flex items-center gap-1.5 sm:gap-2">
          {/* Guest indicator or user name */}
          {isAuthenticated ? (
            <>
              {userInfo?.name && (
                <span className="text-[11px] text-gray-500 hidden sm:block max-w-[120px] truncate">
                  {userInfo.name}
                </span>
              )}
              <button
                onClick={logout}
                className="p-2 rounded-full hover:bg-gray-800/60 transition-colors"
                aria-label="Cerrar sesion"
                title="Cerrar sesion"
              >
                <LogOut className="w-4 h-4 text-gray-500 hover:text-red-400" />
              </button>
            </>
          ) : (
            <>
              {/* Guest free messages badge */}
              {remainingMessages > 0 && (
                <span className="hidden xs:flex items-center gap-1 px-2 py-1 rounded-full bg-emerald-600/15 border border-emerald-500/20 text-emerald-400/80 text-[10px] font-medium">
                  <ShieldCheck className="w-3 h-3" />
                  <span className="hidden sm:inline">{remainingMessages} gratis</span>
                </span>
              )}
              {/* Iniciar Sesion button — always visible for guests */}
              <a
                href="/login"
                className="flex items-center justify-center gap-1.5 px-3 sm:px-4 py-2 rounded-full bg-emerald-600 hover:bg-emerald-500 text-white text-[11px] sm:text-xs font-semibold transition-all active:scale-95 shadow-lg shadow-emerald-500/15 whitespace-nowrap"
              >
                <LogIn className="w-3.5 h-3.5 sm:w-4 sm:h-4" />
                <span className="hidden xs:inline">Iniciar</span>
                <span>Sesion</span>
              </a>
            </>
          )}
          <button
            onClick={createNewSession}
            className="p-2 rounded-full hover:bg-gray-800/60 transition-colors"
            aria-label="Nueva conversacion"
          >
            <Plus className="w-5 h-5 text-gray-400" />
          </button>
          {isAuthenticated && (
            <button
              onClick={() => setShowSettings(true)}
              className="p-2 rounded-full hover:bg-gray-800/60 transition-colors"
              aria-label="Configuracion"
              title="Configuracion"
            >
              <Settings className="w-5 h-5 text-gray-400" />
            </button>
          )}
        </div>
      </header>

      {/* ===== SESSIONS DRAWER ===== */}
      <AnimatePresence>
        {showSessions && (
          <>
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="fixed inset-0 bg-black/60 z-20"
              onClick={() => setShowSessions(false)}
            />
            <motion.div
              initial={{ x: -300, opacity: 0 }}
              animate={{ x: 0, opacity: 1 }}
              exit={{ x: -300, opacity: 0 }}
              transition={{ type: 'spring', damping: 28, stiffness: 260 }}
              className="fixed inset-y-0 left-0 w-[280px] bg-gray-900 z-30 shadow-2xl border-r border-gray-800/40 flex flex-col"
            >
              <div className="flex items-center justify-between p-4 border-b border-gray-800/40">
                <h2 className="text-sm font-semibold text-gray-300">
                  Conversaciones
                </h2>
                <button
                  onClick={() => setShowSessions(false)}
                  className="p-1 rounded-full hover:bg-gray-800/60"
                >
                  <X className="w-4 h-4 text-gray-400" />
                </button>
              </div>
              <div className="flex-1 overflow-y-auto p-2 space-y-1">
                {sessions.length === 0 ? (
                  <p className="text-xs text-gray-600 text-center mt-10">
                    Sin conversaciones aun
                  </p>
                ) : (
                  sessions.map((session) => (
                    <div
                      key={session.id}
                      className={`flex items-center justify-between p-3 rounded-xl cursor-pointer transition-all ${
                        session.id === sessionId
                          ? 'bg-emerald-500/10 border border-emerald-500/20'
                          : 'hover:bg-gray-800/40'
                      }`}
                      onClick={() => loadSession(session.id)}
                    >
                      <div className="flex-1 min-w-0">
                        <p className="text-sm text-gray-300 truncate">
                          {session.title}
                        </p>
                        <p className="text-[10px] text-gray-600 mt-0.5">
                          {session._count?.messages || 0} mensajes
                        </p>
                      </div>
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          deleteSession(session.id);
                        }}
                        className="p-1.5 rounded-lg hover:bg-red-500/10 transition-colors ml-2"
                      >
                        <Trash2 className="w-3.5 h-3.5 text-gray-600 hover:text-red-400" />
                      </button>
                    </div>
                  ))
                )}
              </div>
            </motion.div>
          </>
        )}
      </AnimatePresence>

      {/* ===== CHAT AREA ===== */}
      <div className="flex-1 overflow-y-auto px-4 py-4 space-y-3">
        {messages.length === 0 && !isLoading && (
          <div className="flex flex-col items-center justify-center h-full text-center px-6">
            <div className="w-20 h-20 rounded-2xl bg-gradient-to-br from-emerald-500/10 to-emerald-600/5 flex items-center justify-center mb-5 border border-emerald-500/10">
              <span className="text-4xl">{'\uD83E\uDDED'}</span>
            </div>
            <h2 className="text-xl font-bold text-gray-200 mb-2">Atlas</h2>
            <p className="text-sm text-gray-500 max-w-[260px] leading-relaxed">
              Consultor Estrategico y Coach Cognitivo de Elite.
              <br />
              <span className="text-gray-600 text-xs mt-1 block">
                Escribe o usa el microfono para empezar.
              </span>
            </p>
          </div>
        )}

        <AnimatePresence initial={false}>
          {messages.map((msg) => (
            <motion.div
              key={msg.id}
              initial={{ opacity: 0, y: 10, scale: 0.98 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              transition={{ duration: 0.2, ease: 'easeOut' }}
              className={`flex ${
                msg.role === 'user' ? 'justify-end' : 'justify-start'
              }`}
            >
              <div
                className={`relative max-w-[85%] sm:max-w-[70%] px-4 py-2.5 rounded-2xl shadow-sm ${
                  msg.role === 'user'
                    ? 'bg-emerald-600 text-white rounded-br-md'
                    : 'bg-gray-800/70 text-gray-100 rounded-bl-md border border-gray-700/40'
                }`}
              >
                {msg.role === 'assistant' && (
                  <div className="flex items-center gap-1.5 mb-1.5">
                    <span className="text-xs">{'\uD83E\uDDED'}</span>
                    <span className="text-[9px] font-bold text-emerald-400 uppercase tracking-widest">
                      Atlas
                    </span>
                  </div>
                )}
                <div
                  className={`text-[13.5px] leading-relaxed ${
                    msg.role === 'user' ? 'text-white' : 'text-gray-200'
                  }`}
                  dangerouslySetInnerHTML={{
                    __html: formatMessageContent(msg.content) +
                      (msg.id === streamingId
                        ? '<span class="inline-block w-[3px] h-[18px] bg-emerald-400 animate-pulse ml-0.5 align-text-bottom rounded-sm"></span>'
                        : ''),
                  }}
                />
                <p
                  className={`text-[9px] mt-1.5 ${
                    msg.role === 'user'
                      ? 'text-emerald-200/50'
                      : 'text-gray-600'
                  }`}
                >
                  {formatTime(msg.timestamp)}
                </p>

                {/* Expand button for short assistant responses */}
                {msg.role === 'assistant' &&
                  msg.id !== streamingId &&
                  msg.id !== expandingId &&
                  isShortResponse(msg.content) && (
                  <ExpandButton
                    onExpand={() => expandMessage(msg.id)}
                    isExpanding={false}
                  />
                )}
                {msg.role === 'assistant' && msg.id === expandingId && (
                  <ExpandSpinner />
                )}
              </div>
            </motion.div>
          ))}
        </AnimatePresence>

        {/* Typing indicator */}
        {isLoading && !streamingId && (
          <motion.div
            initial={{ opacity: 0, y: 6 }}
            animate={{ opacity: 1, y: 0 }}
            className="flex justify-start"
          >
            <div className="bg-gray-800/70 border border-gray-700/40 rounded-2xl rounded-bl-md px-4 py-3">
              <div className="flex items-center gap-1.5 mb-1">
                <span className="text-xs">{'\uD83E\uDDED'}</span>
                <span className="text-[9px] font-bold text-emerald-400 uppercase tracking-widest">
                  Atlas
                </span>
              </div>
              <div className="flex gap-1.5">
                <span className="w-2 h-2 bg-gray-500 rounded-full animate-bounce [animation-delay:0ms]" />
                <span className="w-2 h-2 bg-gray-500 rounded-full animate-bounce [animation-delay:150ms]" />
                <span className="w-2 h-2 bg-gray-500 rounded-full animate-bounce [animation-delay:300ms]" />
              </div>
            </div>
          </motion.div>
        )}

        <div ref={messagesEndRef} />
      </div>

      {/* ===== INPUT AREA ===== */}
      <div className="shrink-0 border-t border-gray-800/40 bg-gray-900/90 backdrop-blur-md px-3 py-2.5 pb-[max(0.625rem,env(safe-area-inset-bottom))] z-10">
        {/* Guest remaining messages bar */}
        {!isAuthenticated && remainingMessages > 0 && (
          <div className="text-center mb-2">
            <span className="text-[10px] text-gray-600">
              Tienes <span className="text-emerald-400 font-semibold">{remainingMessages}</span> mensaje{remainingMessages !== 1 ? 's' : ''} gratuito{remainingMessages !== 1 ? 's' : ''}.{' '}
              <a href="/login" className="text-emerald-400 hover:text-emerald-300 underline">
                Inicia sesion
              </a>{' '}
              para acceso ilimitado.
            </span>
          </div>
        )}

        <form onSubmit={handleSubmit} className="flex items-center gap-2 max-w-3xl mx-auto">
          <input
            ref={inputRef}
            type="text"
            value={inputValue}
            onChange={(e) => setInputValue(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder={
              isTranscribing
                ? 'Transcribiendo voz...'
                : !isAuthenticated && remainingMessages <= 0
                ? 'Inicia sesion para continuar...'
                : 'Escribe o habla tu mensaje...'
            }
            className="flex-1 bg-gray-800/50 border border-gray-700/40 rounded-full px-4 py-3 text-[14px] text-white placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-emerald-500/30 focus:border-emerald-500/30 transition-all disabled:opacity-50"
            disabled={isLoading || !!streamingId || isTranscribing || (!isAuthenticated && remainingMessages <= 0)}
          />

          {/* Send */}
          <button
            type="submit"
            disabled={!inputValue.trim() || isLoading || !!streamingId || isTranscribing || (!isAuthenticated && remainingMessages <= 0)}
            className="w-11 h-11 rounded-full bg-emerald-600 hover:bg-emerald-500 disabled:bg-gray-700/50 disabled:opacity-30 flex items-center justify-center transition-all active:scale-90 shrink-0"
            aria-label="Enviar"
          >
            <Send className="w-[18px] h-[18px] text-white" />
          </button>

          {/* Microphone */}
          <button
            type="button"
            onClick={toggleRecording}
            disabled={isLoading || !!streamingId || isTranscribing || (!isAuthenticated && remainingMessages <= 0)}
            className={`w-[52px] h-[52px] rounded-full flex items-center justify-center transition-all active:scale-90 shrink-0 ${
              isRecording
                ? 'bg-red-500 hover:bg-red-400 shadow-xl shadow-red-500/40 animate-pulse'
                : 'bg-gray-800 hover:bg-gray-700/80 border-2 border-emerald-500/30 hover:border-emerald-500/60'
            }`}
            aria-label={
              isRecording ? 'Detener grabacion' : 'Hablar (microfono)'
            }
          >
            {isRecording ? (
              <MicOff className="w-6 h-6 text-white" />
            ) : (
              <Mic className="w-6 h-6 text-emerald-400" />
            )}
          </button>
        </form>

        {/* Recording / Transcribing indicator */}
        <AnimatePresence>
          {(isRecording || isTranscribing) && (
            <motion.div
              initial={{ opacity: 0, y: -4 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -4 }}
              className="flex items-center justify-center gap-2 mt-2"
            >
              <span
                className={`w-2 h-2 rounded-full animate-pulse ${
                  isRecording ? 'bg-red-500' : 'bg-emerald-400'
                }`}
              />
              <span
                className={`text-[11px] font-medium ${
                  isRecording
                    ? 'text-red-400'
                    : 'text-emerald-400/70'
                }`}
              >
                {isRecording
                  ? 'Grabando... toca para enviar'
                  : 'Transcribiendo voz...'}
              </span>
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      {/* ===== PAYWALL / LOGIN MODAL ===== */}
      <AnimatePresence>
        {showPaywall && !isAuthenticated && (
          <>
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="fixed inset-0 bg-black/70 backdrop-blur-sm z-50"
              onClick={() => setShowPaywall(false)}
            />
            <motion.div
              initial={{ opacity: 0, scale: 0.9, y: 20 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.9, y: 20 }}
              transition={{ type: 'spring', damping: 25, stiffness: 300 }}
              className="fixed inset-x-4 top-1/2 -translate-y-1/2 z-50 max-w-sm mx-auto"
            >
              <div className="bg-gray-900 border border-gray-700/50 rounded-2xl p-6 shadow-2xl">
                {/* Close button */}
                <button
                  onClick={() => setShowPaywall(false)}
                  className="absolute top-4 right-4 p-1 rounded-full hover:bg-gray-800/60 transition-colors"
                >
                  <XCircle className="w-5 h-5 text-gray-500" />
                </button>

                {/* Icon */}
                <div className="text-center mb-5">
                  <div className="w-16 h-16 rounded-2xl bg-gradient-to-br from-emerald-500/20 to-emerald-600/5 flex items-center justify-center mx-auto mb-4 border border-emerald-500/20">
                    <Lock className="w-8 h-8 text-emerald-400" />
                  </div>
                  <h2 className="text-xl font-bold text-white">
                    Acceso Completo
                  </h2>
                  <p className="text-sm text-gray-400 mt-2 leading-relaxed">
                    Has usado tus {FREE_MESSAGES_LIMIT} mensajes gratuitos.
                    Inicia sesion o crea una cuenta para:
                  </p>
                </div>

                {/* Benefits */}
                <ul className="space-y-2.5 mb-6 px-1">
                  {[
                    'Mensajes ilimitados con Atlas',
                    'Historial guardado automaticamente',
                    'Memoria contextual entre sesiones',
                    'Acceso a multiples dispositivos',
                  ].map((benefit) => (
                    <li key={benefit} className="flex items-start gap-2.5">
                      <span className="text-emerald-400 mt-0.5">{'\u2713'}</span>
                      <span className="text-sm text-gray-300">{benefit}</span>
                    </li>
                  ))}
                </ul>

                {/* Action Buttons */}
                <div className="space-y-3">
                  <a
                    href="/login"
                    className="w-full flex items-center justify-center gap-2 py-3 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white text-sm font-semibold transition-all active:scale-[0.98] shadow-lg shadow-emerald-500/15"
                  >
                    Iniciar Sesion
                    <Lock className="w-4 h-4" />
                  </a>
                  <a
                    href="/register"
                    className="w-full flex items-center justify-center gap-2 py-3 rounded-xl bg-gray-800 hover:bg-gray-700 text-white text-sm font-medium border border-gray-700/50 transition-all active:scale-[0.98]"
                  >
                    Crear Cuenta Gratis
                    <UserPlus className="w-4 h-4" />
                  </a>
                </div>

                {/* Dismiss */}
                <p className="text-center text-[10px] text-gray-600 mt-4">
                  Puedes seguir explorando sin cuenta, pero tu historial no se guardara
                </p>
              </div>
            </motion.div>
          </>
        )}
      </AnimatePresence>

      {/* ===== PWA INSTALL PROMPT ===== */}
      <InstallPrompt />
    </div>
  );
}
