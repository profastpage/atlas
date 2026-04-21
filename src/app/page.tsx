'use client';

import { useState, useEffect, useRef, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Mic, MicOff, Send, Plus, MessageSquare, Trash2, X, LogOut } from 'lucide-react';
import { WELCOME_MESSAGE_NEW } from '@/lib/atlas';
import AuthScreen from '@/components/AuthScreen';

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
// MAIN APP -- ATLAS COGNITIVE COACH
// ========================================

export default function AtlasApp() {
  // ---- Auth State ----
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [authMode, setAuthMode] = useState<'login' | 'register'>('login');
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

  // ---- Voice State ----
  const [isRecording, setIsRecording] = useState(false);
  const [isTranscribing, setIsTranscribing] = useState(false);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const audioChunksRef = useRef<Blob[]>([]);

  // ---- Refs ----
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  // ---- AUTH: Check saved session ----
  useEffect(() => {
    const token = localStorage.getItem('atlas_token');
    const savedTenantId = localStorage.getItem('atlas_tenant_id');
    const savedUser = localStorage.getItem('atlas_user');

    if (token && savedTenantId) {
      // Validate token
      fetch('/api/auth/me', {
        headers: { Authorization: `Bearer ${token}` },
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
        .catch(() => logout());
    }
  }, []);

  useEffect(() => {
    scrollToBottom();
  }, [messages]);

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  };

  // ---- AUTH: Logout ----
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
    setAuthMode('login');
  };

  // ---- AUTH: On success ----
  const handleAuthSuccess = (data: { token: string; tenantId: string; user: UserInfo }) => {
    setIsAuthenticated(true);
    setTenantId(data.tenantId);
    setUserInfo(data.user);
    fetchSessions(data.tenantId);
  };

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

      // ---- MENSAJE DE INICIALIZACION ----
      // Si es usuario nuevo (sin context_summary): bienvenida estandar
      // Si es usuario existente: el LLM usara su nombre y contexto
      setTimeout(() => {
        let welcomeContent = WELCOME_MESSAGE_NEW;

        if (!data.isNewUser && data.userName && data.contextSummary) {
          // Usuario recurrente -- referencia directa
          welcomeContent = `${data.userName}, otra vez aqui. Volvamos a tu problema: **${data.contextSummary.substring(0, 60)}**. ?Hubo algun cambio o seguimos en el mismo punto?`;
        } else if (!data.isNewUser && data.contextSummary) {
          // Sin nombre pero con contexto
          welcomeContent = `Ya hemos hablado. Tu situacion previa: **${data.contextSummary.substring(0, 60)}**. ?Que hay de nuevo?`;
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
  // SEND MESSAGE -- MODULO DE CEREBRO
  // ========================================

  const sendMessage = useCallback(
    async (text: string) => {
      if (!text.trim() || isLoading) return;

      // Auto-crear sesion si no existe
      let currentSessionId = sessionId;
      if (!currentSessionId) {
        const sessionData = await createNewSession();
        if (!sessionData) return;
        currentSessionId = sessionData.sessionId;
        // Esperar a que la sesion este lista
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

        const data = await res.json();
        const assistantMsg: Message = {
          id: `assistant-${Date.now()}`,
          role: 'assistant',
          content: data.response || 'Error de comunicacion.',
          timestamp: new Date().toISOString(),
        };

        setMessages((prev) => [...prev, assistantMsg]);

        if (tenantId) fetchSessions(tenantId);
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
        inputRef.current?.focus();
      }
    },
    [sessionId, tenantId, isLoading, createNewSession]
  );

  // ========================================
  // VOICE RECORDING -- MODULO DE OIDO
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

      // Seleccionar mimeType compatible (priorizar webm/opus)
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
        // Mostrar texto transcrito brevemente, luego enviar
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

  // ========================================
  // RENDER
  // ========================================

  // ---- AUTH SCREEN (not authenticated) ----
  if (!isAuthenticated) {
    return (
      <AuthScreen
        mode={authMode}
        onSwitchMode={setAuthMode}
        onAuthSuccess={handleAuthSuccess}
      />
    );
  }

  // ---- CHAT SCREEN (authenticated) ----
  return (
    <div className="flex flex-col h-dvh bg-gray-950 text-white overflow-hidden">
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
        <div className="flex items-center gap-2">
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
            <LogOut className="w-4.5 h-4.5 text-gray-500 hover:text-red-400" />
          </button>
          <button
            onClick={createNewSession}
            className="p-2 rounded-full hover:bg-gray-800/60 transition-colors"
            aria-label="Nueva conversacion"
          >
            <Plus className="w-5 h-5 text-gray-400" />
          </button>
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
                    __html: formatMessageContent(msg.content),
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
              </div>
            </motion.div>
          ))}
        </AnimatePresence>

        {/* Typing indicator */}
        {isLoading && (
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
                : 'Escribe o habla tu mensaje...'
            }
            className="flex-1 bg-gray-800/50 border border-gray-700/40 rounded-full px-4 py-3 text-[14px] text-white placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-emerald-500/30 focus:border-emerald-500/30 transition-all disabled:opacity-50"
            disabled={isLoading || isTranscribing}
          />

          {/* Send */}
          <button
            type="submit"
            disabled={!inputValue.trim() || isLoading || isTranscribing}
            className="w-11 h-11 rounded-full bg-emerald-600 hover:bg-emerald-500 disabled:bg-gray-700/50 disabled:opacity-30 flex items-center justify-center transition-all active:scale-90 shrink-0"
            aria-label="Enviar"
          >
            <Send className="w-[18px] h-[18px] text-white" />
          </button>

          {/* Microphone -- GRANDE y visible */}
          <button
            type="button"
            onClick={toggleRecording}
            disabled={isLoading || isTranscribing}
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
    </div>
  );
}
