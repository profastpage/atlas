'use client';

import { useState, useEffect, useRef, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Mic, MicOff, Send, Plus, MessageSquare, Trash2, X, Loader2 } from 'lucide-react';
import { WELCOME_MESSAGE } from '@/lib/atlas';

// Types
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

// ============================================================
// MAIN APP COMPONENT
// ============================================================
export default function AtlasApp() {
  // Session state
  const [tenantId, setTenantId] = useState<string>('');
  const [sessionId, setSessionId] = useState<string>('');
  const [sessions, setSessions] = useState<SessionInfo[]>([]);
  const [showSessions, setShowSessions] = useState(false);

  // Chat state
  const [messages, setMessages] = useState<Message[]>([]);
  const [inputValue, setInputValue] = useState('');
  const [isLoading, setIsLoading] = useState(false);

  // Voice state
  const [isRecording, setIsRecording] = useState(false);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const audioChunksRef = useRef<Blob[]>([]);

  // UI refs
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const chatContainerRef = useRef<HTMLDivElement>(null);

  // ---- INITIALIZATION ----
  useEffect(() => {
    const savedTenant = localStorage.getItem('atlas_tenant_id');
    if (savedTenant) {
      setTenantId(savedTenant);
      fetchSessions(savedTenant);
    }
  }, []);

  useEffect(() => {
    scrollToBottom();
  }, [messages]);

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  };

  // ---- SESSION MANAGEMENT ----
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

      // Reset messages with welcome
      setMessages([]);
      setShowSessions(false);

      if (data.isNew) {
        // New user: show welcome after a short delay
        setTimeout(() => {
          setMessages([
            {
              id: `welcome-${Date.now()}`,
              role: 'assistant',
              content: WELCOME_MESSAGE,
              timestamp: new Date().toISOString(),
            },
          ]);
        }, 500);
      } else {
        // Existing user starting new session: show welcome
        setTimeout(() => {
          setMessages([
            {
              id: `welcome-${Date.now()}`,
              role: 'assistant',
              content: WELCOME_MESSAGE,
              timestamp: new Date().toISOString(),
            },
          ]);
        }, 500);
      }

      // Refresh sessions list
      fetchSessions(data.tenantId);
    } catch (error) {
      console.error('Failed to create session:', error);
    }
  }, [tenantId]);

  const fetchSessions = async (tId: string) => {
    try {
      const res = await fetch(`/api/session?tenantId=${tId}`);
      const data = await res.json();
      setSessions(data.sessions || []);
    } catch (error) {
      console.error('Failed to fetch sessions:', error);
    }
  };

  const loadSession = async (sId: string) => {
    try {
      const res = await fetch(`/api/chat?sessionId=${sId}`);
      const data = await res.json();
      setSessionId(sId);
      setMessages(
        data.messages.map((m: Message) => ({
          ...m,
          id: m.id || `msg-${Math.random()}`,
          timestamp: m.timestamp || new Date().toISOString(),
        }))
      );
      setShowSessions(false);
    } catch (error) {
      console.error('Failed to load session:', error);
    }
  };

  const deleteSession = async (sId: string) => {
    try {
      await fetch(`/api/chat?sessionId=${sId}`, { method: 'DELETE' });
      setSessions((prev) => prev.filter((s) => s.id !== sId));
      if (sessionId === sId) {
        setSessionId('');
        setMessages([]);
      }
    } catch (error) {
      console.error('Failed to delete session:', error);
    }
  };

  // ---- SEND MESSAGE ----
  const sendMessage = useCallback(
    async (text: string) => {
      if (!text.trim() || isLoading) return;

      if (!sessionId) {
        await createNewSession();
        // Small delay to ensure session is created
        await new Promise((r) => setTimeout(r, 300));
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
            sessionId,
            message: text.trim(),
            tenantId,
          }),
        });

        const data = await res.json();

        const assistantMsg: Message = {
          id: `assistant-${Date.now()}`,
          role: 'assistant',
          content: data.response,
          timestamp: new Date().toISOString(),
        };

        setMessages((prev) => [...prev, assistantMsg]);

        // Refresh sessions list for updated message count
        if (tenantId) fetchSessions(tenantId);
      } catch (error) {
        console.error('Send message error:', error);
        setMessages((prev) => [
          ...prev,
          {
            id: `error-${Date.now()}`,
            role: 'assistant',
            content: 'Error de conexión. Intenta de nuevo.',
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

  // ---- VOICE RECORDING (Speech-to-Text) ----
  const startRecording = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const mediaRecorder = new MediaRecorder(stream, {
        mimeType: 'audio/webm;codecs=opus',
      });
      mediaRecorderRef.current = mediaRecorder;
      audioChunksRef.current = [];

      mediaRecorder.ondataavailable = (event) => {
        if (event.data.size > 0) {
          audioChunksRef.current.push(event.data);
        }
      };

      mediaRecorder.onstop = async () => {
        stream.getTracks().forEach((t) => t.stop());
        const audioBlob = new Blob(audioChunksRef.current, { type: 'audio/webm' });
        await transcribeAudio(audioBlob);
      };

      mediaRecorder.start();
      setIsRecording(true);
    } catch (error) {
      console.error('Microphone access denied:', error);
    }
  };

  const stopRecording = () => {
    if (mediaRecorderRef.current && isRecording) {
      mediaRecorderRef.current.stop();
      setIsRecording(false);
    }
  };

  const transcribeAudio = async (audioBlob: Blob) => {
    try {
      const formData = new FormData();
      formData.append('audio', audioBlob, 'recording.webm');

      const res = await fetch('/api/transcribe', {
        method: 'POST',
        body: formData,
      });

      const data = await res.json();

      if (data.transcription && data.transcription.trim()) {
        setInputValue(data.transcription.trim());
        // Auto-send the transcribed message
        sendMessage(data.transcription.trim());
      }
    } catch (error) {
      console.error('Transcription error:', error);
    }
  };

  const toggleRecording = () => {
    if (isRecording) {
      stopRecording();
    } else {
      startRecording();
    }
  };

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

  // ---- FORMATTING HELPERS ----
  const formatMessageContent = (content: string) => {
    // Convert bullet points
    let formatted = content.replace(/•/g, '<span class="text-emerald-400 mr-1">•</span>');
    // Convert **bold**
    formatted = formatted.replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>');
    // Convert newlines
    formatted = formatted.replace(/\n/g, '<br/>');
    return formatted;
  };

  const formatTime = (timestamp: string) => {
    try {
      const date = new Date(timestamp);
      return date.toLocaleTimeString('es-ES', {
        hour: '2-digit',
        minute: '2-digit',
      });
    } catch {
      return '';
    }
  };

  // ---- RENDER ----
  return (
    <div className="flex flex-col h-dvh bg-gray-950 text-white overflow-hidden">
      {/* Header */}
      <header className="flex items-center justify-between px-4 py-3 bg-gray-900/80 backdrop-blur-md border-b border-gray-800/50 z-20">
        <div className="flex items-center gap-3">
          <button
            onClick={() => setShowSessions(!showSessions)}
            className="p-2 rounded-full hover:bg-gray-800 transition-colors"
            aria-label="Menú de sesiones"
          >
            <MessageSquare className="w-5 h-5 text-emerald-400" />
          </button>
          <div>
            <h1 className="text-base font-semibold text-white tracking-tight">
              ATLAS
            </h1>
            <p className="text-[11px] text-emerald-400/80 font-medium">
              Coach Estratégico
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          {sessionId && (
            <span className="text-[10px] text-gray-500 font-mono hidden sm:block">
              {sessionId.slice(0, 8)}...
            </span>
          )}
          <button
            onClick={createNewSession}
            className="p-2 rounded-full hover:bg-gray-800 transition-colors"
            aria-label="Nueva conversación"
          >
            <Plus className="w-5 h-5 text-gray-400" />
          </button>
        </div>
      </header>

      {/* Sessions Drawer */}
      <AnimatePresence>
        {showSessions && (
          <motion.div
            initial={{ x: -320, opacity: 0 }}
            animate={{ x: 0, opacity: 1 }}
            exit={{ x: -320, opacity: 0 }}
            transition={{ type: 'spring', damping: 25, stiffness: 200 }}
            className="fixed inset-y-0 left-0 w-72 bg-gray-900 z-30 shadow-2xl border-r border-gray-800/50 flex flex-col"
          >
            <div className="flex items-center justify-between p-4 border-b border-gray-800/50">
              <h2 className="text-sm font-semibold text-gray-300">
                Conversaciones
              </h2>
              <button
                onClick={() => setShowSessions(false)}
                className="p-1 rounded-full hover:bg-gray-800 transition-colors"
              >
                <X className="w-4 h-4 text-gray-400" />
              </button>
            </div>
            <div className="flex-1 overflow-y-auto p-2 space-y-1">
              {sessions.length === 0 ? (
                <p className="text-xs text-gray-600 text-center mt-8">
                  No hay conversaciones
                </p>
              ) : (
                sessions.map((session) => (
                  <div
                    key={session.id}
                    className={`flex items-center justify-between p-3 rounded-xl cursor-pointer transition-all ${
                      session.id === sessionId
                        ? 'bg-emerald-500/10 border border-emerald-500/20'
                        : 'hover:bg-gray-800/50'
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
        )}
      </AnimatePresence>

      {/* Overlay for sessions drawer */}
      <AnimatePresence>
        {showSessions && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 bg-black/50 z-20"
            onClick={() => setShowSessions(false)}
          />
        )}
      </AnimatePresence>

      {/* Chat Area */}
      <div
        ref={chatContainerRef}
        className="flex-1 overflow-y-auto px-4 py-4 space-y-4 scroll-smooth"
      >
        {messages.length === 0 && !isLoading && (
          <div className="flex flex-col items-center justify-center h-full text-center px-6">
            <div className="w-16 h-16 rounded-full bg-emerald-500/10 flex items-center justify-center mb-4">
              <span className="text-3xl">🧭</span>
            </div>
            <h2 className="text-lg font-semibold text-gray-200 mb-1">
              Atlas
            </h2>
            <p className="text-sm text-gray-500 max-w-xs leading-relaxed">
              Tu coach estratégico de alto rendimiento.
              <br />
              Comienza una conversación o escribe tu primer mensaje.
            </p>
          </div>
        )}

        <AnimatePresence initial={false}>
          {messages.map((msg) => (
            <motion.div
              key={msg.id}
              initial={{ opacity: 0, y: 12, scale: 0.97 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              transition={{ duration: 0.25, ease: 'easeOut' }}
              className={`flex ${
                msg.role === 'user' ? 'justify-end' : 'justify-start'
              }`}
            >
              <div
                className={`relative max-w-[85%] sm:max-w-[70%] px-4 py-2.5 rounded-2xl ${
                  msg.role === 'user'
                    ? 'bg-emerald-600 text-white rounded-br-md'
                    : 'bg-gray-800/80 text-gray-100 rounded-bl-md border border-gray-700/50'
                }`}
              >
                {msg.role === 'assistant' && (
                  <div className="flex items-center gap-1.5 mb-1.5">
                    <span className="text-xs">🧭</span>
                    <span className="text-[10px] font-semibold text-emerald-400 uppercase tracking-wider">
                      Atlas
                    </span>
                  </div>
                )}
                <div
                  className={`text-[14px] leading-relaxed ${
                    msg.role === 'user' ? '' : 'text-gray-200'
                  }`}
                  dangerouslySetInnerHTML={{
                    __html: formatMessageContent(msg.content),
                  }}
                />
                <p
                  className={`text-[10px] mt-1.5 ${
                    msg.role === 'user'
                      ? 'text-emerald-200/60'
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
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            className="flex justify-start"
          >
            <div className="bg-gray-800/80 border border-gray-700/50 rounded-2xl rounded-bl-md px-4 py-3">
              <div className="flex items-center gap-1.5 mb-1">
                <span className="text-xs">🧭</span>
                <span className="text-[10px] font-semibold text-emerald-400 uppercase tracking-wider">
                  Atlas
                </span>
              </div>
              <div className="flex gap-1">
                <span className="w-2 h-2 bg-gray-500 rounded-full animate-bounce [animation-delay:0ms]" />
                <span className="w-2 h-2 bg-gray-500 rounded-full animate-bounce [animation-delay:150ms]" />
                <span className="w-2 h-2 bg-gray-500 rounded-full animate-bounce [animation-delay:300ms]" />
              </div>
            </div>
          </motion.div>
        )}

        <div ref={messagesEndRef} />
      </div>

      {/* Input Area */}
      <div className="border-t border-gray-800/50 bg-gray-900/80 backdrop-blur-md px-3 py-3 pb-[env(safe-area-inset-bottom)] z-10">
        <form onSubmit={handleSubmit} className="flex items-center gap-2 max-w-3xl mx-auto">
          <input
            ref={inputRef}
            type="text"
            value={inputValue}
            onChange={(e) => setInputValue(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="Escribe o habla tu mensaje..."
            className="flex-1 bg-gray-800/60 border border-gray-700/50 rounded-full px-4 py-3 text-sm text-white placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-emerald-500/40 focus:border-emerald-500/40 transition-all"
            disabled={isLoading}
          />

          {/* Send Button */}
          <button
            type="submit"
            disabled={!inputValue.trim() || isLoading}
            className="w-11 h-11 rounded-full bg-emerald-600 hover:bg-emerald-500 disabled:bg-gray-700 disabled:opacity-40 flex items-center justify-center transition-all active:scale-95 shrink-0"
            aria-label="Enviar mensaje"
          >
            <Send className="w-4.5 h-4.5 text-white" />
          </button>

          {/* Microphone Button */}
          <button
            type="button"
            onClick={toggleRecording}
            disabled={isLoading}
            className={`w-11 h-11 rounded-full flex items-center justify-center transition-all active:scale-95 shrink-0 ${
              isRecording
                ? 'bg-red-500 hover:bg-red-400 shadow-lg shadow-red-500/30 animate-pulse'
                : 'bg-gray-800 hover:bg-gray-700 border border-gray-700/50'
            }`}
            aria-label={isRecording ? 'Detener grabación' : 'Iniciar grabación'}
          >
            {isRecording ? (
              <MicOff className="w-5 h-5 text-white" />
            ) : (
              <Mic className="w-5 h-5 text-emerald-400" />
            )}
          </button>
        </form>

        {/* Recording indicator */}
        <AnimatePresence>
          {isRecording && (
            <motion.div
              initial={{ opacity: 0, y: -4 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -4 }}
              className="flex items-center justify-center gap-2 mt-2"
            >
              <span className="w-2 h-2 bg-red-500 rounded-full animate-pulse" />
              <span className="text-xs text-red-400 font-medium">
                Grabando... toca de nuevo para enviar
              </span>
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </div>
  );
}
