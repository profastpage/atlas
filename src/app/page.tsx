'use client';

import { useState, useEffect, useRef, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Mic, Send, Plus, MessageSquare, Trash2,
  X, LogOut, LogIn, Settings, Lock, ShieldCheck, XCircle,
  Pencil, Archive, ArchiveRestore, Check, AlertTriangle,
  Paperclip, FileText, XCircle as XCircleIcon, Loader2,
  Copy, Share2, Bell, Star
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
  isAdmin?: boolean;
}

// ========================================
// CONSTANTS
// ========================================

const FREE_BOT_RESPONSES = 5;
const GUEST_TENANT_KEY = 'atlas_guest_tenant_id';
const TRIAL_BOT_KEY = 'atlas_trial_bot_count';

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
  const [showArchived, setShowArchived] = useState(false);
  const [sessionReady, setSessionReady] = useState(false);
  const [renamingId, setRenamingId] = useState<string | null>(null);
  const [renameValue, setRenameValue] = useState('');
  const [deleteConfirmId, setDeleteConfirmId] = useState<string | null>(null);
  const renameInputRef = useRef<HTMLInputElement>(null);

  // ---- Chat State ----
  const [messages, setMessages] = useState<Message[]>([]);
  const [inputValue, setInputValue] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [streamingId, setStreamingId] = useState<string | null>(null);
  const [isStreaming, setIsStreaming] = useState(false);

  // ---- Trial State Machine ----
  // trialBotResponses: counts ONLY assistant messages. User messages never increment this.
  // isStreaming: true while fetch is in-flight. Paywall NEVER shows while true.
  const [trialBotResponses, setTrialBotResponses] = useState(0);
  const [streamDisconnectedId, setStreamDisconnectedId] = useState<string | null>(null);

  // ---- Plan Gate State ----
  const [hasActivePlan, setHasActivePlan] = useState<boolean | null>(null);
  const [userPlanType, setUserPlanType] = useState<string>('');
  const [checkingPlan, setCheckingPlan] = useState(false);
  const [trialInfo, setTrialInfo] = useState<{ plan: string; hoursLeft: number; isActive: boolean } | null>(null);

  // ---- Alarm State ----
  const [showAlarmScheduler, setShowAlarmScheduler] = useState(false);
  const [showAlarmPaywall, setShowAlarmPaywall] = useState(false);
  const [alarmMsgContent, setAlarmMsgContent] = useState('');
  const [alarmTime, setAlarmTime] = useState('');
  const [alarmSaving, setAlarmSaving] = useState(false);
  const [sharedId, setSharedId] = useState<string | null>(null);

  // ---- Auto-refresh trial badge every 10 minutes ----
  useEffect(() => {
    if (!trialInfo?.isActive || !tenantId || !isAuthenticated) return;
    const interval = setInterval(async () => {
      try {
        const res = await fetch(`/api?action=trial_status&tenantId=${tenantId}`);
        const data = await res.json();
        if (data.trial?.isActive) {
          setTrialInfo({ plan: data.trial.plan, hoursLeft: data.trial.hoursLeft, isActive: true });
        } else {
          // Trial expired while user was active — refresh plan status
          setTrialInfo(null);
          checkPlanAfterLogin(tenantId);
        }
      } catch {}
    }, 10 * 60 * 1000); // Every 10 min
    return () => clearInterval(interval);
  }, [trialInfo?.isActive, tenantId, isAuthenticated]);

  // ---- Expand State ----
  const [expandingId, setExpandingId] = useState<string | null>(null);

  // ---- Copy State ----
  const [copiedId, setCopiedId] = useState<string | null>(null);

  // ---- Document Upload State ----
  const [documentText, setDocumentText] = useState<string | null>(null);
  const [documentName, setDocumentName] = useState<string>('');
  const [isAnalyzingDocument, setIsAnalyzingDocument] = useState(false);
  const [showPdfPaywall, setShowPdfPaywall] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // ---- Voice State (Web Speech API) ----
  const [isListening, setIsListening] = useState(false);
  const [isLocked, setIsLocked] = useState(false);
  const [speechSupported, setSpeechSupported] = useState(true);
  const recognitionRef = useRef<any>(null);
  const startYRef = useRef<number>(0);
  const shouldAutoSendRef = useRef(false);
  const isLockedRef = useRef(false);
  const inputValueRef = useRef(inputValue);
  inputValueRef.current = inputValue;

  // ---- Refs ----
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);

  // ---- Settings State ----
  const [token, setToken] = useState('');
  const [showSettings, setShowSettings] = useState(false);

  // ========================================
  // INIT: Determine auth state
  // ========================================
  useEffect(() => {
    // ---- CHECK FOR OAUTH CALLBACK PARAMS ----
    const params = new URLSearchParams(window.location.search);

    // ---- OAUTH ERROR ----
    const authError = params.get('_auth_error');
    if (authError) {
      window.history.replaceState({}, '', '/');
      console.error('[OAUTH ERROR]', authError);
      // Show error to user via alert so we can debug
      alert(`Error de autenticación: ${decodeURIComponent(authError)}. Contacta soporte.`);
      return;
    }

    // ---- OAUTH SUCCESS ----
    const authParam = params.get('_auth');
    if (authParam === '1') {
      const oauthToken = params.get('token');
      const oauthTenantId = params.get('tenantId');
      const oauthUser = params.get('user');

      if (oauthToken && oauthTenantId && oauthUser) {
        localStorage.setItem('atlas_token', oauthToken);
        localStorage.setItem('atlas_tenant_id', oauthTenantId);
        localStorage.setItem('atlas_user', decodeURIComponent(oauthUser));

        // Clean URL (remove auth params)
        window.history.replaceState({}, '', '/');

        // Now proceed with normal auth flow
        setToken(oauthToken);
        try {
          const user = JSON.parse(decodeURIComponent(oauthUser));
          setUserInfo(user);
        } catch {}
        setIsAuthenticated(true);
        setTenantId(oauthTenantId);
        checkPlanAfterLogin(oauthTenantId);
        fetchSessions(oauthTenantId);
        return;
      }
    }

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
              // ---- CHECK PLAN TYPE AFTER LOGIN ----
              checkPlanAfterLogin(savedTenantId);
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
      const savedBotCount = parseInt(localStorage.getItem(TRIAL_BOT_KEY) || '0', 10);
      setTrialBotResponses(savedBotCount);

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

  // ---- UNIFIED PAYWALL ----
  // Shows at 5 responses for EVERYONE (guest + logged-in).
  // Only way to dismiss: Supabase confirms plan_type valid (hasActivePlan === true).
  // Modal content changes: guest sees "Iniciar Sesion", logged-in sees "Ver Planes".

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
    setTrialBotResponses(0);
    localStorage.removeItem(TRIAL_BOT_KEY);
  };

  // ========================================
  // WEB SPEECH API — Browser-native voice input
  // ========================================

  useEffect(() => {
    const SpeechRecognition = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
    if (!SpeechRecognition) {
      setSpeechSupported(false);
      return;
    }

    const recognition = new SpeechRecognition();
    recognition.lang = 'es-419';
    recognition.continuous = true;
    recognition.interimResults = true;

    recognition.onresult = (event: any) => {
      let interimTranscript = '';
      let finalTranscript = '';
      for (let i = event.resultIndex; i < event.results.length; i++) {
        const transcript = event.results[i][0].transcript;
        if (event.results[i].isFinal) {
          finalTranscript += transcript;
        } else {
          interimTranscript += transcript;
        }
      }
      // Show interim results in input in real-time + auto-scroll
      if (interimTranscript || finalTranscript) {
        setInputValue(finalTranscript + interimTranscript);
        requestAnimationFrame(() => {
          const el = document.getElementById('chat-input') as HTMLTextAreaElement | null;
          if (el) el.scrollTop = el.scrollHeight;
        });
      }
    };

    recognition.onerror = (event: any) => {
      if (event.error === 'not-allowed') {
        alert('Se requiere permiso de micrófono para usar la función de voz.');
      }
      setIsListening(false);
      setIsLocked(false);
      isLockedRef.current = false;
      shouldAutoSendRef.current = false;
    };

    recognition.onend = () => {
      // If locked mode: auto-restart so user can keep talking
      if (isLockedRef.current) {
        try { recognition.start(); } catch {}
        return;
      }
      // If we need to auto-send (quick press release)
      if (shouldAutoSendRef.current) {
        shouldAutoSendRef.current = false;
        setIsListening(false);
        setIsLocked(false);
        const text = inputValueRef.current.trim();
        if (text) {
          setInputValue('');
          sendMessage(text);
        }
        return;
      }
      setIsListening(false);
    };

    recognitionRef.current = recognition;

    return () => {
      try { recognition.abort(); } catch {}
    };
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // Keep isLockedRef in sync
  useEffect(() => { isLockedRef.current = isLocked; }, [isLocked]);

  // ---- Mic: Press & Hold + Slide-to-Lock ----
  const handleMicPointerDown = useCallback((e: React.PointerEvent<HTMLButtonElement>) => {
    if (isLoading || isStreaming || isAnalyzingDocument) return;
    e.preventDefault();
    startYRef.current = e.clientY;
    setIsLocked(false);
    isLockedRef.current = false;
    shouldAutoSendRef.current = false;
    if (recognitionRef.current && !isListening) {
      try {
        recognitionRef.current.start();
        setIsListening(true);
      } catch {}
    }
    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
  }, [isLoading, isStreaming, isAnalyzingDocument, isListening]);

  const handleMicPointerMove = useCallback((e: React.PointerEvent<HTMLButtonElement>) => {
    if (!isListening || isLocked) return;
    const diff = startYRef.current - e.clientY;
    if (diff > 60) {
      setIsLocked(true);
      isLockedRef.current = true;
      shouldAutoSendRef.current = false;
    }
  }, [isListening, isLocked]);

  const handleMicPointerUp = useCallback((e: React.PointerEvent<HTMLButtonElement>) => {
    (e.currentTarget as HTMLElement).releasePointerCapture(e.pointerId);
    if (!isListening) return;
    if (!isLocked) {
      // Not locked: stop and auto-send
      shouldAutoSendRef.current = true;
      try { recognitionRef.current?.stop(); } catch {}
      // Actual send happens in onend handler
    }
    // If locked: do nothing, recording continues
  }, [isListening, isLocked]);

  const handleLockedSend = useCallback(() => {
    shouldAutoSendRef.current = true;
    isLockedRef.current = false;
    setIsLocked(false);
    try { recognitionRef.current?.stop(); } catch {}
    // Actual send happens in onend handler
  }, []);

  // ========================================
  // PLAN GATE — Post-login subscription check
  // ========================================

  const checkPlanAfterLogin = async (tId: string) => {
    setCheckingPlan(true);
    try {
      // Fetch subscription AND trial status in parallel
      const [subRes, trialRes] = await Promise.all([
        fetch(`/api?action=subscription&tenantId=${tId}`),
        fetch(`/api?action=trial_status&tenantId=${tId}`),
      ]);
      const subData = await subRes.json();
      const trialData = await trialRes.json();

      const sub = subData.subscription;
      const planType = sub?.status === 'active' ? 'active' : null;

      // CHECK 1: Has paid plan?
      if (planType) {
        setHasActivePlan(true);
        setTrialInfo(null);
        // Store actual plan name for feature gating
        const pName = sub?.planId || sub?.planName?.toLowerCase() || '';
        setUserPlanType(pName);
        return;
      }

      // CHECK 2: Has active trial?
      if (trialData.trial?.isActive) {
        setHasActivePlan(true);
        setTrialInfo({
          plan: trialData.trial.plan,
          hoursLeft: trialData.trial.hoursLeft,
          isActive: true,
        });
        setUserPlanType(trialData.trial.plan || 'pro');
        return;
      }

      // CHECK 3: No plan, no trial — show plans immediately
      setHasActivePlan(false);
      setTrialInfo(null);
      // Auto-open plan selection sidebar so user can choose and pay
      setTimeout(() => setShowSettings(true), 500);
    } catch {
      setHasActivePlan(false);
      setTrialInfo(null);
    } finally {
      setCheckingPlan(false);
    }
  };

  const openPlanGate = () => {
    setShowSettings(true);
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

  const fetchSessions = async (tId: string, archived = false) => {
    try {
      const res = await fetch(`/api/session?tenantId=${tId}&archived=${archived}`);
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
      setDeleteConfirmId(null);
      if (sessionId === sId) {
        setSessionId('');
        setMessages([]);
        setSessionReady(false);
      }
    } catch (error) {
      console.error('[SESION] Error al eliminar:', error);
    }
  };

  const renameSession = async (sId: string, newTitle: string) => {
    if (!newTitle.trim()) {
      setRenamingId(null);
      return;
    }
    try {
      await fetch('/api/session', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'rename', sessionId: sId, title: newTitle.trim() }),
      });
      setSessions((prev) =>
        prev.map((s) => (s.id === sId ? { ...s, title: newTitle.trim() } : s))
      );
    } catch (error) {
      console.error('[SESION] Error al renombrar:', error);
    }
    setRenamingId(null);
  };

  const archiveSession = async (sId: string) => {
    try {
      await fetch('/api/session', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'archive', sessionId: sId }),
      });
      // Optimistic: remove from list instantly
      setSessions((prev) => prev.filter((s) => s.id !== sId));
      if (sessionId === sId) {
        setSessionId('');
        setMessages([]);
        setSessionReady(false);
      }
    } catch (error) {
      console.error('[SESION] Error al archivar:', error);
    }
  };

  const unarchiveSession = async (sId: string) => {
    try {
      await fetch('/api/session', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'unarchive', sessionId: sId }),
      });
      setSessions((prev) => prev.filter((s) => s.id !== sId));
    } catch (error) {
      console.error('[SESION] Error al desarchivar:', error);
    }
  };

  const toggleArchivedView = () => {
    const next = !showArchived;
    setShowArchived(next);
    setDeleteConfirmId(null);
    setRenamingId(null);
    if (tenantId) fetchSessions(tenantId, next);
  };

  const startRename = (sId: string, currentTitle: string) => {
    setRenamingId(sId);
    setRenameValue(currentTitle);
    setTimeout(() => renameInputRef.current?.focus(), 50);
  };

  const finishRename = (sId: string) => {
    renameSession(sId, renameValue);
  };

  const cancelRename = () => {
    setRenamingId(null);
    setRenameValue('');
  };

  // ========================================
  // SEND MESSAGE — Guest + Auth flow
  // ========================================

  const sendMessage = useCallback(
    async (text: string) => {
      // ---- UNIFIED PAYWALL GATE ----
      // Block if 5+ responses reached and no confirmed paid plan
      if (trialBotResponses >= FREE_BOT_RESPONSES && hasActivePlan !== true) {
        if (isAuthenticated) openPlanGate();
        return;
      }

      if (!text.trim() || isLoading || isStreaming) return;

      // ---- CHECK PLAN FOR DOCUMENT UPLOADS ----
      if (documentText && isAuthenticated) {
        const isPro = await checkUserPlan();
        if (!isPro) {
          setDocumentText(null);
          setDocumentName('');
          setShowPdfPaywall(true);
          return;
        }
      }

      // ---- NO GUEST LIMIT CHECK HERE ----
      // The input is ALWAYS unlocked. The paywall modal appears ONLY after
      // trialBotResponses >= 5 && !isStreaming (pure render condition).

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
      setIsStreaming(true); // ---- PASO 3: Activar streaming ANTES del fetch ----

      try {
        const res = await fetch('/api/chat', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            sessionId: currentSessionId,
            message: text.trim(),
            tenantId,
            ...(documentText ? { documentText } : {}),
          }),
        });

        const contentType = res.headers.get('content-type') || '';

        // ---- PLAN GATE: Backend no longer sends 403 PLAN_REQUIRED ----
        // Paywall is purely frontend-driven via trialBotResponses counter.
        // First 5 messages always work. After 5, input is blocked + modal shown.

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
          let streamError = false;

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
                  // Backend stream error — mark as disconnected
                  streamError = true;
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

          // ---- STREAM FINISHED: set final content ----
          const finalText = fullText || 'Sin respuesta.';
          setMessages((prev) =>
            prev.map((m) =>
              m.id === aId
                ? { ...m, content: finalText }
                : m
            )
          );

          // Mark stream disconnection if backend sent error
          if (streamError) {
            setStreamDisconnectedId(aId);
          }
          setStreamingId(null);

          // ---- PASO 4: INCREMENT COUNTER ONLY ON SUCCESSFUL ASSISTANT RESPONSE ----
          if (fullText && fullText !== 'Sin respuesta.') {
            setTrialBotResponses((prev) => {
              const next = prev + 1;
              localStorage.setItem(TRIAL_BOT_KEY, String(next));
              return next;
            });
          }

          // ---- PASO 3: Desactivar streaming DESPUES de terminar ----
          setIsStreaming(false);

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

          // ---- PASO 4: INCREMENT COUNTER ONLY ON SUCCESSFUL ASSISTANT RESPONSE ----
          if (assistantMsg.content && assistantMsg.content !== 'Sin respuesta.' && assistantMsg.content !== 'Error de comunicacion.') {
            setTrialBotResponses((prev) => {
              const next = prev + 1;
              localStorage.setItem(TRIAL_BOT_KEY, String(next));
              return next;
            });
          }

          // ---- PASO 3: Desactivar streaming ----
          setIsStreaming(false);
        }

        // Clear document after sending
        if (documentText) {
          setDocumentText(null);
          setDocumentName('');
        }

        if (tenantId && isAuthenticated) fetchSessions(tenantId);
      } catch (error) {
        console.error('[CEREBRO] Error:', error);
        // Detect stream disconnection during active streaming
        if (streamingId) {
          // Mark the existing partial message as disconnected — don't add a new error message
          setStreamDisconnectedId(streamingId);
        } else {
          // Non-streaming error (fetch failed before stream started)
          setMessages((prev) => [
            ...prev,
            {
              id: `error-${Date.now()}`,
              role: 'assistant',
              content: 'Error de conexion. Intenta de nuevo.',
              timestamp: new Date().toISOString(),
            },
          ]);
        }
      } finally {
        setIsLoading(false);
        setStreamingId(null);
        setIsStreaming(false); // ---- SIEMPRE apagar isStreaming en finally ----
        inputRef.current?.focus();
      }
    },
    [sessionId, tenantId, isLoading, isStreaming, createNewSession, isAuthenticated, documentText]
  );

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



  // When opening drawer, reset to active view
  useEffect(() => {
    if (showSessions) {
      setDeleteConfirmId(null);
      setRenamingId(null);
      if (showArchived && tenantId) {
        setShowArchived(false);
        fetchSessions(tenantId, false);
      }
    }
  }, [showSessions]);

  // ========================================
  // DOCUMENT UPLOAD — PDF/TXT for Pro plan
  // ========================================

  const checkUserPlan = async (): Promise<boolean> => {
    if (!isAuthenticated || !tenantId) return false;
    try {
      const res = await fetch(`/api?action=subscription&tenantId=${tenantId}`);
      const data = await res.json();
      const sub = data.subscription;
      const planId = sub?.planId || sub?.planName?.toLowerCase() || '';
      return planId.includes('pro') || planId.includes('elite') || planId.includes('ejecutivo') || sub?.status === 'active';
    } catch {
      return false;
    }
  };

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    // Reset file input so same file can be re-selected
    e.target.value = '';

    // Check plan
    const isPro = await checkUserPlan();
    if (!isPro) {
      setShowPdfPaywall(true);
      return;
    }

    setIsAnalyzingDocument(true);
    setDocumentName(file.name);

    try {
      const isPdf = file.type === 'application/pdf' || file.name.toLowerCase().endsWith('.pdf');
      let text = '';
      let charCount = 0;
      let tokenEstimate = 0;

      if (isPdf) {
        const { extractPdfText, validateDocumentSize } = await import('@/lib/pdf-extractor');
        const result = await extractPdfText(file);
        text = result.text;
        charCount = result.charCount;
        tokenEstimate = result.tokenEstimate;

        const validation = validateDocumentSize(charCount, tokenEstimate);
        if (!validation.valid) {
          setMessages((prev) => [
            ...prev,
            {
              id: `error-${Date.now()}`,
              role: 'assistant',
              content: validation.error || 'Documento demasiado largo.',
              timestamp: new Date().toISOString(),
            },
          ]);
          setIsAnalyzingDocument(false);
          setDocumentName('');
          return;
        }
      } else {
        const { extractTxtTextAsync, validateDocumentSize } = await import('@/lib/pdf-extractor');
        const result = await extractTxtTextAsync(file);
        text = result.text;
        charCount = result.charCount;
        tokenEstimate = result.tokenEstimate;

        const validation = validateDocumentSize(charCount, tokenEstimate);
        if (!validation.valid) {
          setMessages((prev) => [
            ...prev,
            {
              id: `error-${Date.now()}`,
              role: 'assistant',
              content: validation.error || 'Documento demasiado largo.',
              timestamp: new Date().toISOString(),
            },
          ]);
          setIsAnalyzingDocument(false);
          setDocumentName('');
          return;
        }
      }

      if (!text || text.trim().length < 10) {
        setMessages((prev) => [
          ...prev,
          {
            id: `error-${Date.now()}`,
            role: 'assistant',
            content: 'No se pudo extraer texto del documento. Asegurate de que el archivo contenga texto seleccionable.',
            timestamp: new Date().toISOString(),
          },
        ]);
        setIsAnalyzingDocument(false);
        setDocumentName('');
        return;
      }

      setDocumentText(text);
      inputRef.current?.focus();
    } catch (error) {
      console.error('[DOC] Error al procesar:', error);
      setMessages((prev) => [
        ...prev,
        {
          id: `error-${Date.now()}`,
          role: 'assistant',
          content: 'Error al procesar el documento. Intenta con otro archivo.',
          timestamp: new Date().toISOString(),
        },
      ]);
    } finally {
      setIsAnalyzingDocument(false);
    }
  };

  const clearDocument = () => {
    setDocumentText(null);
    setDocumentName('');
  };

  // ========================================
  // COPY MESSAGE — Clipboard API
  // ========================================

  // ---- Helper: Strip HTML to plain text ----
  const toPlainText = (html: string) =>
    html
      .replace(/<br\s*\/?>/gi, '\n')
      .replace(/<[^>]+>/g, '')
      .replace(/&amp;/g, '&')
      .replace(/&lt;/g, '<')
      .replace(/&gt;/g, '>')
      .replace(/&quot;/g, '"')
      .replace(/&#39;/g, "'");

  // ---- Helper: Count words ----
  const wordCount = (text: string) => text.split(/\s+/).filter(Boolean).length;

  const copyMessage = useCallback(async (msgId: string, content: string) => {
    try {
      const plainText = toPlainText(content);
      await navigator.clipboard.writeText(plainText);
      setCopiedId(msgId);
      setTimeout(() => setCopiedId(null), 1500);
    } catch (error) {
      console.error('[COPIAR] Error:', error);
    }
  }, []);

  // ========================================
  // SHARE MESSAGE — Web Share API + fallback
  // ========================================

  const shareMessage = useCallback(async (msgId: string, content: string) => {
    try {
      const plainText = toPlainText(content);
      const shareText = `${plainText}\n\n— Resuelto por Atlas, tu Asesor Estrategico 24/7. Pribalo en: https://atlas-9mv.pages.dev`;

      if (typeof navigator !== 'undefined' && navigator.share) {
        await navigator.share({
          title: 'Consejo de Atlas',
          text: shareText,
        });
      } else {
        // Fallback: copy to clipboard with toast
        await navigator.clipboard.writeText(shareText);
        setSharedId(msgId);
        setTimeout(() => setSharedId(null), 2000);
      }
    } catch (error) {
      // User cancelled share dialog — ignore
      if ((error as DOMException)?.name === 'AbortError') return;
      console.error('[COMPARTIR] Error:', error);
    }
  }, []);

  // ========================================
  // ALARM SCHEDULING — Executive plan feature
  // ========================================

  const handleAlarmClick = useCallback((content: string) => {
    if (!isAuthenticated) {
      setShowAlarmPaywall(true);
      return;
    }
    if (userPlanType !== 'ejecutivo') {
      setShowAlarmPaywall(true);
      return;
    }
    // Executive user — open scheduler
    setAlarmMsgContent(content);
    setShowAlarmScheduler(true);
  }, [isAuthenticated, userPlanType]);

  const saveAlarm = useCallback(async () => {
    if (!alarmTime || !tenantId) return;
    setAlarmSaving(true);
    try {
      const plainText = toPlainText(alarmMsgContent);
      // Truncate for storage
      const truncated = plainText.length > 500 ? plainText.substring(0, 500) + '...' : plainText;
      const scheduledFor = new Date(alarmTime).toISOString();

      const res = await fetch('/api', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'save_alarm',
          tenantId,
          content: truncated,
          scheduledFor,
        }),
      });

      if (res.ok) {
        setShowAlarmScheduler(false);
        setAlarmTime('');
        setAlarmMsgContent('');
      } else {
        console.error('[ALARMA] Error al guardar:', await res.text());
      }
    } catch (error) {
      console.error('[ALARMA] Error:', error);
    } finally {
      setAlarmSaving(false);
    }
  }, [alarmTime, alarmMsgContent, tenantId]);

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

  // ---- INPUT BLOCKED: Unified paywall active ----
  // Only block after 5 responses AND no active plan confirmed AND not checking
  const isInputBlocked = !isStreaming && trialBotResponses >= FREE_BOT_RESPONSES && hasActivePlan !== true && !checkingPlan;

  const remainingResponses = Math.max(0, FREE_BOT_RESPONSES - trialBotResponses);

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
          let expandStreamError = false;

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
                } else if (parsed.error) {
                  expandStreamError = true;
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
          if (expandStreamError) {
            setStreamDisconnectedId(msgId);
          }
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
        setStreamDisconnectedId(msgId);
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
        onClose={() => {
          // Cannot close sidebar when paywall is active (no plan)
          if (isAuthenticated && hasActivePlan === false) return;
          setShowSettings(false);
        }}
        user={userInfo ? { ...userInfo, tenantId } : null}
        token={token || ''}
        forcePaywall={isAuthenticated && hasActivePlan === false}
        userPlanType={userPlanType}
      />

      {/* ===== HEADER ===== */}
      <header className="flex items-center justify-between px-3 sm:px-4 py-2.5 sm:py-3 bg-gray-900/90 backdrop-blur-md border-b border-gray-800/40 z-20 shrink-0">
        <div className="flex items-center gap-2 sm:gap-3 min-w-0">
          <button
            onClick={() => setShowSessions(!showSessions)}
            className="p-2 rounded-full hover:bg-gray-800/60 transition-colors shrink-0"
            aria-label="Historial de sesiones"
          >
            <MessageSquare className="w-4 h-4 sm:w-5 sm:h-5 text-emerald-400" />
          </button>
          <div className="min-w-0">
            <h1 className="text-sm sm:text-[15px] font-bold text-white tracking-tight">
              ATLAS
            </h1>
            <div className="flex items-center gap-2">
              <p className="text-[9px] sm:text-[10px] text-emerald-400/70 font-medium tracking-wide uppercase truncate">
                Coach Cognitivo de Elite
              </p>
              {trialInfo?.isActive && (
                <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded-full bg-amber-500/15 border border-amber-500/30 text-[8px] sm:text-[9px] text-amber-400 font-semibold shrink-0">
                  Prueba {trialInfo.plan === 'pro' ? 'Pro' : 'Ejecutivo'}
                </span>
              )}
            </div>
          </div>
        </div>
        <div className="flex items-center gap-1 sm:gap-1.5 shrink-0">
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
              {/* Iniciar Sesion button — always visible for guests */}
              <a
                href="/login"
                className="flex items-center justify-center gap-1 sm:gap-1.5 px-2.5 sm:px-4 py-1.5 sm:py-2 rounded-full bg-emerald-600 hover:bg-emerald-500 text-white text-[10px] sm:text-xs font-semibold transition-all active:scale-95 shadow-lg shadow-emerald-500/15 whitespace-nowrap"
              >
                <LogIn className="w-3 h-3 sm:w-4 sm:h-4" />
                <span>Iniciar</span>
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
              onClick={() => { setShowSessions(false); cancelRename(); setDeleteConfirmId(null); }}
            />
            <motion.div
              initial={{ x: -300, opacity: 0 }}
              animate={{ x: 0, opacity: 1 }}
              exit={{ x: -300, opacity: 0 }}
              transition={{ type: 'spring', damping: 28, stiffness: 260 }}
              className="fixed inset-y-0 left-0 w-[300px] bg-gray-900 z-30 shadow-2xl border-r border-gray-800/40 flex flex-col"
            >
              {/* Header */}
              <div className="flex items-center justify-between p-4 border-b border-gray-800/40">
                <h2 className="text-sm font-semibold text-gray-300">
                  {showArchived ? 'Archivados' : 'Conversaciones'}
                </h2>
                <button
                  onClick={() => { setShowSessions(false); cancelRename(); setDeleteConfirmId(null); }}
                  className="p-1 rounded-full hover:bg-gray-800/60"
                >
                  <X className="w-4 h-4 text-gray-400" />
                </button>
              </div>

              {/* Session List */}
              <div className="flex-1 overflow-y-auto p-2 space-y-0.5">
                {sessions.length === 0 && (
                  <p className="text-xs text-gray-600 text-center mt-10">
                    {showArchived ? 'Sin chats archivados' : 'Sin conversaciones aun'}
                  </p>
                )}
                {sessions.map((session) => (
                  <div
                    key={session.id}
                    className="group relative rounded-xl transition-all"
                    onMouseEnter={() => { if (renamingId !== session.id) setDeleteConfirmId(null); }}
                  >
                    {/* ---- RENAMING MODE ---- */}
                    {renamingId === session.id ? (
                      <div className="flex items-center gap-1 p-2.5 bg-emerald-500/5 border border-emerald-500/20 rounded-xl">
                        <input
                          ref={renameInputRef}
                          type="text"
                          value={renameValue}
                          onChange={(e) => setRenameValue(e.target.value)}
                          onKeyDown={(e) => {
                            if (e.key === 'Enter') finishRename(session.id);
                            if (e.key === 'Escape') cancelRename();
                          }}
                          onBlur={() => finishRename(session.id)}
                          className="flex-1 bg-gray-800/60 border border-gray-700/50 rounded-lg px-2.5 py-1.5 text-sm text-white placeholder-gray-500 focus:outline-none focus:ring-1 focus:ring-emerald-500/40 min-w-0"
                          placeholder="Nuevo nombre..."
                        />
                        <button
                          onClick={() => finishRename(session.id)}
                          className="p-1.5 rounded-lg bg-emerald-500/10 hover:bg-emerald-500/20 transition-colors shrink-0"
                        >
                          <Check className="w-3.5 h-3.5 text-emerald-400" />
                        </button>
                        <button
                          onClick={cancelRename}
                          className="p-1.5 rounded-lg hover:bg-gray-800/60 transition-colors shrink-0"
                        >
                          <X className="w-3.5 h-3.5 text-gray-500" />
                        </button>
                      </div>
                    ) : (
                      /* ---- NORMAL MODE / DELETE CONFIRM ---- */
                      <>
                        <div
                          className={`flex items-center p-3 rounded-xl cursor-pointer transition-all ${
                            session.id === sessionId && !showArchived
                              ? 'bg-emerald-500/10 border border-emerald-500/20'
                              : 'hover:bg-gray-800/40 border border-transparent'
                          }`}
                          onClick={() => !showArchived && loadSession(session.id)}
                        >
                          <div className="flex-1 min-w-0">
                            <p className="text-sm text-gray-300 truncate">
                              {session.title}
                            </p>
                            <p className="text-[10px] text-gray-600 mt-0.5">
                              {session._count?.messages || 0} mensajes
                            </p>
                          </div>

                          {/* Hover actions — visible on hover (desktop) / tap (mobile) / always if delete confirm */}
                          <div className={`flex items-center gap-0.5 ml-2 shrink-0 transition-opacity sm:opacity-0 sm:group-hover:opacity-100 ${
                            deleteConfirmId === session.id
                              ? 'opacity-100'
                              : 'opacity-60'
                          }`}>
                            {/* Delete confirmation */}
                            {deleteConfirmId === session.id ? (
                              <>
                                <span className="text-[10px] text-red-400 mr-1 whitespace-nowrap">
                                  Eliminar?
                                </span>
                                <button
                                  onClick={(e) => { e.stopPropagation(); deleteSession(session.id); }}
                                  className="p-1.5 rounded-lg bg-red-500/15 hover:bg-red-500/25 transition-colors"
                                >
                                  <Trash2 className="w-3 h-3 text-red-400" />
                                </button>
                                <button
                                  onClick={(e) => { e.stopPropagation(); setDeleteConfirmId(null); }}
                                  className="p-1.5 rounded-lg hover:bg-gray-800/60 transition-colors"
                                >
                                  <X className="w-3 h-3 text-gray-500" />
                                </button>
                              </>
                            ) : (
                              <>
                                {/* Rename */}
                                <button
                                  onClick={(e) => { e.stopPropagation(); startRename(session.id, session.title); }}
                                  className="p-1.5 rounded-lg hover:bg-gray-700/40 transition-colors"
                                  title="Renombrar"
                                >
                                  <Pencil className="w-3 h-3 text-gray-500 hover:text-gray-300" />
                                </button>
                                {/* Archive / Unarchive */}
                                <button
                                  onClick={(e) => { e.stopPropagation(); showArchived ? unarchiveSession(session.id) : archiveSession(session.id); }}
                                  className="p-1.5 rounded-lg hover:bg-gray-700/40 transition-colors"
                                  title={showArchived ? 'Desarchivar' : 'Archivar'}
                                >
                                  {showArchived ? (
                                    <ArchiveRestore className="w-3 h-3 text-gray-500 hover:text-emerald-400" />
                                  ) : (
                                    <Archive className="w-3 h-3 text-gray-500 hover:text-yellow-400" />
                                  )}
                                </button>
                                {/* Delete */}
                                <button
                                  onClick={(e) => { e.stopPropagation(); setDeleteConfirmId(session.id); }}
                                  className="p-1.5 rounded-lg hover:bg-red-500/10 transition-colors"
                                  title="Eliminar"
                                >
                                  <Trash2 className="w-3 h-3 text-gray-500 hover:text-red-400" />
                                </button>
                              </>
                            )}
                          </div>
                        </div>
                      </>
                    )}
                  </div>
                ))}
              </div>

              {/* Archive toggle button */}
              <div className="border-t border-gray-800/40 p-2">
                <button
                  onClick={toggleArchivedView}
                  className="w-full flex items-center gap-2 px-3 py-2 rounded-xl hover:bg-gray-800/40 transition-colors text-left"
                >
                  {showArchived ? (
                    <>
                      <MessageSquare className="w-4 h-4 text-gray-500" />
                      <span className="text-xs text-gray-400">Ver activos</span>
                    </>
                  ) : (
                    <>
                      <Archive className="w-4 h-4 text-gray-500" />
                      <span className="text-xs text-gray-400">Archivados</span>
                    </>
                  )}
                </button>
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
                {/* Stream disconnection error — subtle warning below text */}
                {msg.role === 'assistant' && msg.id === streamDisconnectedId && (
                  <p className="text-[11px] text-amber-400/80 mt-2 flex items-center gap-1">
                    <span className="inline-block w-1 h-1 rounded-full bg-amber-400/80" />
                    Conexion interrumpida. La respuesta se corto.
                  </p>
                )}
                <p
                  className={`text-[9px] mt-1.5 ${
                    msg.role === 'user'
                      ? 'text-emerald-200/50'
                      : 'text-gray-600'
                  }`}
                >
                  {formatTime(msg.timestamp)}
                </p>

                {/* Action buttons — always visible, subtle until hover */}
                {msg.role === 'assistant' && msg.id !== streamingId && msg.content && !msg.content.startsWith('Error') && (
                  <div className="flex items-center flex-wrap gap-2 opacity-40 hover:opacity-100 transition-opacity mt-1.5 ml-0.5">
                    {/* Copy */}
                    <button
                      onClick={() => copyMessage(msg.id, msg.content)}
                      className="inline-flex items-center gap-1 px-1.5 py-1 rounded-lg text-[11px] font-medium text-gray-400 hover:text-emerald-400 hover:bg-emerald-500/10 transition-all active:scale-95 cursor-pointer select-none"
                      title={copiedId === msg.id ? 'Copiado' : 'Copiar texto'}
                    >
                      {copiedId === msg.id ? (
                        <Check className="w-3.5 h-3.5 text-emerald-400" />
                      ) : (
                        <Copy className="w-3.5 h-3.5" />
                      )}
                      <span>
                        {copiedId === msg.id ? 'Copiado' : 'Copiar'}
                      </span>
                    </button>

                    {/* Share */}
                    <button
                      onClick={() => shareMessage(msg.id, msg.content)}
                      className="inline-flex items-center gap-1 px-1.5 py-1 rounded-lg text-[11px] font-medium text-gray-400 hover:text-blue-400 hover:bg-blue-500/10 transition-all active:scale-95 cursor-pointer select-none"
                      title="Compartir consejo"
                    >
                      {sharedId === msg.id ? (
                        <>
                          <Check className="w-3.5 h-3.5 text-blue-400" />
                          <span className="text-blue-400">Enlace copiado</span>
                        </>
                      ) : (
                        <>
                          <Share2 className="w-3.5 h-3.5" />
                          <span>Compartir</span>
                        </>
                      )}
                    </button>

                    {/* Alarm — only for substantive messages (50+ words) */}
                    {wordCount(msg.content) > 50 && (
                      <button
                        onClick={() => handleAlarmClick(msg.content)}
                        className="inline-flex items-center gap-1 px-1.5 py-1 rounded-lg text-[11px] font-medium text-gray-400 hover:text-amber-400 hover:bg-amber-500/10 transition-all active:scale-95 cursor-pointer select-none"
                        title="Programar alarma"
                      >
                        <Bell className="w-3.5 h-3.5" />
                        <span>Alarma</span>
                      </button>
                    )}

                    {/* Expand — only for short responses (15-90 words) */}
                    {msg.id !== expandingId && isShortResponse(msg.content) && (
                      <ExpandButton
                        onExpand={() => expandMessage(msg.id)}
                        isExpanding={false}
                      />
                    )}
                  </div>
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
      <div className="shrink-0 border-t border-gray-800/40 bg-gray-900/90 backdrop-blur-md px-2.5 sm:px-3 py-2 sm:py-2.5 pb-[max(0.5rem,env(safe-area-inset-bottom))] z-10">
        {/* Guest remaining responses bar */}
        {!isAuthenticated && remainingResponses > 0 && (
          <div className="text-center mb-1.5 sm:mb-2">
            <span className="text-[9px] sm:text-[10px] text-gray-600">
              Tienes <span className="text-emerald-400 font-semibold">{remainingResponses}</span> respuesta{remainingResponses !== 1 ? 's' : ''} gratuita{remainingResponses !== 1 ? 's' : ''} del asistente.{' '}
              <a href="/login" className="text-emerald-400 hover:text-emerald-300 underline">
                Inicia sesion
              </a>{' '}
              para obtener mas funciones profesionales.
            </span>
          </div>
        )}

        <form onSubmit={handleSubmit} className="flex items-center gap-2 max-w-3xl mx-auto">
          <textarea
            ref={inputRef}
            id="chat-input"
            value={inputValue}
            onChange={(e) => setInputValue(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder={'Escribe o habla tu mensaje...'}
            rows={1}
            className={`flex-1 min-w-0 bg-gray-800/50 border border-gray-700/40 rounded-2xl px-3.5 sm:px-4 py-2.5 sm:py-3 text-[13px] sm:text-[14px] text-white placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-emerald-500/30 focus:border-emerald-500/30 transition-all disabled:opacity-50 resize-none overflow-y-auto max-h-28 leading-5 ${isListening ? 'border-red-500/50 ring-1 ring-red-500/20' : ''}`}
            disabled={isLoading || isStreaming}
          />

          {/* Send — hidden when voice locked (locked send button replaces it) */}
          {!isLocked && (
            <button
              type="submit"
              disabled={!inputValue.trim() || isLoading || isStreaming || isListening}
              className="w-10 h-10 sm:w-11 sm:h-11 rounded-full bg-emerald-600 hover:bg-emerald-500 disabled:bg-gray-700/50 disabled:opacity-30 flex items-center justify-center transition-all active:scale-90 shrink-0"
              aria-label="Enviar"
            >
              <Send className="w-[18px] h-[18px] text-white" />
            </button>
          )}

          {/* Paperclip — Document Upload (Pro/Ejecutivo only) */}
          <input
            ref={fileInputRef}
            type="file"
            accept=".pdf,.txt,application/pdf,text/plain"
            onChange={handleFileUpload}
            className="hidden"
          />
          <button
            type="button"
            onClick={() => {
              const plan = (userPlanType || '').toLowerCase();
              if (plan === 'pro' || plan === 'ejecutivo' || plan === 'elite') {
                fileInputRef.current?.click();
              } else {
                setShowPdfPaywall(true);
              }
            }}
            disabled={isLoading || isStreaming || isAnalyzingDocument}
            className={`w-10 h-10 sm:w-[52px] sm:h-[52px] rounded-full flex items-center justify-center transition-all active:scale-90 shrink-0 disabled:opacity-30 ${
              isAnalyzingDocument
                ? 'bg-blue-500/15 border-2 border-blue-500/40'
                : documentText
                  ? 'bg-blue-500/10 border-2 border-blue-500/30'
                  : 'bg-gray-800 hover:bg-gray-700/80 border-2 border-gray-700/30 hover:border-blue-500/40'
            }`}
            aria-label="Adjuntar documento (PDF/TXT)"
            title="Adjuntar documento"
          >
            {isAnalyzingDocument ? (
              <Loader2 className="w-4 h-4 sm:w-5 sm:h-5 text-blue-400 animate-spin" />
            ) : documentText ? (
              <FileText className="w-4 h-4 sm:w-5 sm:h-5 text-blue-400" />
            ) : (
              <Paperclip className="w-4 h-4 sm:w-5 sm:h-5 text-gray-400" />
            )}
          </button>

          {/* Microphone — Slide-to-Lock + Auto-Send */}
          {speechSupported && (
            isLocked ? (
              /* LOCKED STATE — Send button */
              <motion.button
                key="mic-locked"
                type="button"
                onClick={handleLockedSend}
                initial={{ scale: 0.5, opacity: 0 }}
                animate={{ scale: 1, opacity: 1 }}
                transition={{ type: 'spring', damping: 15, stiffness: 300 }}
                disabled={isLoading || isStreaming}
                className="w-10 h-10 sm:w-[52px] sm:h-[52px] rounded-full bg-emerald-600 hover:bg-emerald-500 shadow-xl shadow-emerald-500/40 flex items-center justify-center transition-all active:scale-90 shrink-0 select-none touch-none"
                aria-label="Enviar mensaje de voz"
              >
                <Send className="w-4 h-4 sm:w-6 sm:h-6 text-white" />
              </motion.button>
            ) : (
              /* NORMAL STATE — Mic button (press & hold, slide up to lock) */
              <button
                key="mic-normal"
                type="button"
                onPointerDown={handleMicPointerDown}
                onPointerMove={handleMicPointerMove}
                onPointerUp={handleMicPointerUp}
                onPointerCancel={handleMicPointerUp}
                onContextMenu={(e) => e.preventDefault()}
                disabled={isLoading || isStreaming || isAnalyzingDocument}
                className={`w-10 h-10 sm:w-[52px] sm:h-[52px] rounded-full flex items-center justify-center transition-all duration-200 shrink-0 select-none touch-none ${
                  isListening
                    ? 'bg-red-500 hover:bg-red-400 shadow-xl shadow-red-500/40 scale-110'
                    : 'bg-gray-800 hover:bg-gray-700/80 border-2 border-emerald-500/30 hover:border-emerald-500/60'
                }`}
                aria-label="Hablar (manten presionado, desliza arriba para bloquear)"
              >
                {isListening ? (
                  <span className="relative flex h-4 w-4 sm:h-6 sm:w-6">
                    <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-white opacity-75" />
                    <Mic className="relative inline-flex h-4 w-4 sm:h-6 sm:w-6 text-white" />
                  </span>
                ) : (
                  <Mic className="w-4 h-4 sm:w-6 sm:h-6 text-emerald-400" />
                )}
              </button>
            )
          )}
        </form>

        {/* Listening / Locked / Document analyzing indicator */}
        <AnimatePresence>
          {(isListening || isAnalyzingDocument) && (
            <motion.div
              initial={{ opacity: 0, y: -4 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -4 }}
              className="flex items-center justify-center gap-2 mt-2"
            >
              <span
                className={`w-2 h-2 rounded-full animate-pulse ${
                  isLocked ? 'bg-emerald-500' : isListening ? 'bg-red-500' : 'bg-blue-400'
                }`}
              />
              <span
                className={`text-[11px] font-medium ${
                  isLocked ? 'text-emerald-400' : isListening ? 'text-red-400' : 'text-blue-400'
                }`}
              >
                {isLocked
                  ? 'Grabacion bloqueada. Toca el boton para enviar.'
                  : isListening
                    ? 'Escuchando... desliza arriba para bloquear, suelta para enviar'
                    : 'Atlas esta analizando el documento...'}
              </span>
            </motion.div>
          )}
        </AnimatePresence>

        {/* Document attached chip */}
        <AnimatePresence>
          {documentText && documentName && !isAnalyzingDocument && (
            <motion.div
              initial={{ opacity: 0, y: -4 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -4 }}
              className="flex items-center gap-2 mt-2 px-3 py-1.5 rounded-lg bg-blue-500/10 border border-blue-500/20 max-w-[400px]"
            >
              <FileText className="w-3.5 h-3.5 text-blue-400 shrink-0" />
              <span className="text-[11px] text-blue-300 truncate flex-1">
                {documentName}
              </span>
              <span className="text-[9px] text-blue-400/60 shrink-0">
                Listo
              </span>
              <button
                onClick={clearDocument}
                className="p-0.5 rounded hover:bg-blue-500/20 transition-colors shrink-0"
              >
                <X className="w-3 h-3 text-blue-400/60 hover:text-blue-300" />
              </button>
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      {/* ====================================================================
          UNIFIED PAYWALL — 5 trial responses, then plans required for ALL users
          REGLA: !isStreaming && trialBotResponses >= 5 && hasActivePlan !== true
          - Guest: sees plan selection + login CTA
          - Logged-in no plan: sees plan selection + logout
          - Logged-in with plan: paywall NEVER shows (hasActivePlan === true)
          - During plan check: loading overlay handles it (checkingPlan === true)
          ==================================================================== */}
      {!isStreaming && trialBotResponses >= FREE_BOT_RESPONSES && hasActivePlan !== true && !checkingPlan && (
        <>
          <div className="fixed inset-0 bg-black/70 backdrop-blur-sm z-50" />
          <div className="fixed inset-x-4 top-1/2 -translate-y-1/2 z-50 max-w-sm mx-auto">
            <div className="bg-gray-900 border border-gray-700/50 rounded-2xl p-6 shadow-2xl">
              {/* Icon */}
              <div className="text-center mb-5">
                <div className="w-16 h-16 rounded-2xl flex items-center justify-center mx-auto mb-4 bg-gradient-to-br from-amber-500/20 to-amber-600/5 border border-amber-500/20">
                  <AlertTriangle className="w-8 h-8 text-amber-400" />
                </div>
                <h2 className="text-xl font-bold text-white">
                  Selecciona un plan para continuar
                </h2>
                <p className="text-sm text-gray-400 mt-2 leading-relaxed">
                  Has utilizado tus {FREE_BOT_RESPONSES} mensajes de prueba. Activa una suscripcion para seguir usando tu Asesor Estrategico de Elite.
                </p>
              </div>

              {/* Action Buttons */}
              <div className="space-y-3">
                {isAuthenticated ? (
                  <button
                    onClick={() => setShowSettings(true)}
                    className="w-full flex items-center justify-center gap-2 py-3 rounded-xl bg-amber-500 hover:bg-amber-400 text-gray-950 text-sm font-bold transition-all active:scale-[0.98] shadow-lg shadow-amber-500/20"
                  >
                    <Settings className="w-4 h-4" />
                    Ver Planes
                  </button>
                ) : (
                  <>
                    <a
                      href="/login"
                      className="w-full flex items-center justify-center gap-2 py-3 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white text-sm font-semibold transition-all active:scale-[0.98] shadow-lg shadow-emerald-500/15"
                    >
                      Iniciar Sesion y Ver Planes
                      <LogIn className="w-4 h-4" />
                    </a>
                  </>
                )}
              </div>
            </div>
          </div>
        </>
      )}

      {/* ===== PLAN CHECK LOADING ===== */}
      {isAuthenticated && checkingPlan && (
        <div className="fixed inset-0 z-[55] bg-gray-950 flex items-center justify-center">
          <div className="text-center">
            <div className="w-8 h-8 border-2 border-emerald-500/30 border-t-emerald-500 rounded-full animate-spin mx-auto mb-3" />
            <p className="text-sm text-gray-500">Verificando tu suscripcion...</p>
          </div>
        </div>
      )}

      {/* ===== ALARM PAYWALL MODAL — Executive plan required ===== */}
      <AnimatePresence>
        {showAlarmPaywall && (
          <>
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="fixed inset-0 bg-black/70 backdrop-blur-sm z-50"
              onClick={() => setShowAlarmPaywall(false)}
            />
            <motion.div
              initial={{ opacity: 0, scale: 0.9, y: 20 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.9, y: 20 }}
              transition={{ type: 'spring', damping: 25, stiffness: 300 }}
              className="fixed inset-x-4 top-1/2 -translate-y-1/2 z-50 max-w-sm mx-auto"
            >
              <div className="bg-gray-900 border border-gray-700/50 rounded-2xl p-6 shadow-2xl">
                <div className="flex items-center justify-between mb-4">
                  <div className="w-12 h-12 rounded-xl bg-amber-500/15 flex items-center justify-center">
                    <Bell className="w-6 h-6 text-amber-400" />
                  </div>
                  <button
                    onClick={() => setShowAlarmPaywall(false)}
                    className="p-1.5 rounded-full hover:bg-gray-800/60 transition-colors"
                  >
                    <X className="w-5 h-5 text-gray-500" />
                  </button>
                </div>
                <h2 className="text-lg font-bold text-white mb-2">
                  Alarmas Inteligentes
                </h2>
                <p className="text-sm text-gray-400 leading-relaxed mb-5">
                  Esta funcion es exclusiva del <span className="text-amber-400 font-semibold">Plan Ejecutivo (S/ 60/mes)</span>.
                  Programa recordatorios con los consejos de Atlas para que no olvides tus objetivos.
                </p>
                <div className="space-y-2 mb-4">
                  {[
                    'Programa alarmas con los consejos de Atlas',
                    'Recibe recordatorios de tus metas clave',
                    'Nunca olvides una accion importante',
                  ].map((feat) => (
                    <li key={feat} className="flex items-start gap-2 text-sm text-gray-400">
                      <span className="text-amber-400 mt-0.5">{'\u2022'}</span>
                      {feat}
                    </li>
                  ))}
                </div>
                <div className="space-y-2">
                  <button
                    onClick={() => { setShowAlarmPaywall(false); setShowSettings(true); }}
                    className="w-full flex items-center justify-center gap-2 py-3 rounded-xl bg-amber-500 hover:bg-amber-400 text-gray-950 text-sm font-bold transition-all active:scale-[0.98] shadow-lg shadow-amber-500/20"
                  >
                    <Star className="w-4 h-4" />
                    Obtener Plan Ejecutivo
                  </button>
                  <button
                    onClick={() => setShowAlarmPaywall(false)}
                    className="w-full py-2.5 rounded-xl text-gray-500 text-sm hover:text-gray-400 transition-colors"
                  >
                    Despues
                  </button>
                </div>
              </div>
            </motion.div>
          </>
        )}
      </AnimatePresence>

      {/* ===== ALARM SCHEDULER MODAL — Executive users ===== */}
      <AnimatePresence>
        {showAlarmScheduler && (
          <>
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="fixed inset-0 bg-black/70 backdrop-blur-sm z-50"
              onClick={() => { setShowAlarmScheduler(false); setAlarmTime(''); }}
            />
            <motion.div
              initial={{ opacity: 0, scale: 0.9, y: 20 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.9, y: 20 }}
              transition={{ type: 'spring', damping: 25, stiffness: 300 }}
              className="fixed inset-x-4 top-1/2 -translate-y-1/2 z-50 max-w-sm mx-auto"
            >
              <div className="bg-gray-900 border border-gray-700/50 rounded-2xl p-6 shadow-2xl">
                <div className="flex items-center justify-between mb-4">
                  <div className="w-12 h-12 rounded-xl bg-amber-500/15 flex items-center justify-center">
                    <Bell className="w-6 h-6 text-amber-400" />
                  </div>
                  <button
                    onClick={() => { setShowAlarmScheduler(false); setAlarmTime(''); }}
                    className="p-1.5 rounded-full hover:bg-gray-800/60 transition-colors"
                  >
                    <X className="w-5 h-5 text-gray-500" />
                  </button>
                </div>
                <h2 className="text-lg font-bold text-white mb-1">
                  Programar Alarma
                </h2>
                <p className="text-sm text-gray-400 leading-relaxed mb-4">
                  Elige la fecha y hora para que Atlas te recuerde este consejo.
                </p>

                {/* Preview of the message */}
                <div className="bg-gray-800/50 rounded-xl p-3 mb-4 max-h-24 overflow-y-auto">
                  <p className="text-xs text-gray-400 line-clamp-3">
                    {toPlainText(alarmMsgContent).substring(0, 200)}
                    {toPlainText(alarmMsgContent).length > 200 ? '...' : ''}
                  </p>
                </div>

                {/* Date/time picker */}
                <div className="mb-5">
                  <label className="block text-xs text-gray-500 font-medium mb-1.5">
                    Fecha y hora de la alarma
                  </label>
                  <input
                    type="datetime-local"
                    value={alarmTime}
                    onChange={(e) => setAlarmTime(e.target.value)}
                    min={new Date().toISOString().slice(0, 16)}
                    className="w-full bg-gray-800/50 border border-gray-700/50 rounded-xl px-3 py-2.5 text-sm text-white focus:outline-none focus:ring-2 focus:ring-amber-500/30 focus:border-amber-500/30 transition-all [color-scheme:dark]"
                  />
                </div>

                <div className="space-y-2">
                  <button
                    onClick={saveAlarm}
                    disabled={!alarmTime || alarmSaving}
                    className="w-full flex items-center justify-center gap-2 py-3 rounded-xl bg-amber-500 hover:bg-amber-400 disabled:bg-gray-700/50 disabled:opacity-40 text-gray-950 text-sm font-bold transition-all active:scale-[0.98] shadow-lg shadow-amber-500/20"
                  >
                    {alarmSaving ? (
                      <Loader2 className="w-4 h-4 animate-spin" />
                    ) : (
                      <Bell className="w-4 h-4" />
                    )}
                    {alarmSaving ? 'Programando...' : 'Confirmar Alarma'}
                  </button>
                  <button
                    onClick={() => { setShowAlarmScheduler(false); setAlarmTime(''); }}
                    disabled={alarmSaving}
                    className="w-full py-2.5 rounded-xl text-gray-500 text-sm hover:text-gray-400 transition-colors"
                  >
                    Cancelar
                  </button>
                </div>
              </div>
            </motion.div>
          </>
        )}
      </AnimatePresence>

      {/* ===== PDF PAYWALL MODAL ===== */}
      <AnimatePresence>
        {showPdfPaywall && (
          <>
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="fixed inset-0 bg-black/70 backdrop-blur-sm z-50"
              onClick={() => setShowPdfPaywall(false)}
            />
            <motion.div
              initial={{ opacity: 0, scale: 0.9, y: 20 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.9, y: 20 }}
              transition={{ type: 'spring', damping: 25, stiffness: 300 }}
              className="fixed inset-x-4 top-1/2 -translate-y-1/2 z-50 max-w-sm mx-auto"
            >
              <div className="bg-gray-900 border border-gray-700/50 rounded-2xl p-6 shadow-2xl">
                <div className="flex items-center justify-between mb-4">
                  <div className="w-12 h-12 rounded-xl bg-blue-500/15 flex items-center justify-center">
                    <FileText className="w-6 h-6 text-blue-400" />
                  </div>
                  <button
                    onClick={() => setShowPdfPaywall(false)}
                    className="p-1.5 rounded-full hover:bg-gray-800/60 transition-colors"
                  >
                    <XCircleIcon className="w-5 h-5 text-gray-500" />
                  </button>
                </div>
                <h2 className="text-lg font-bold text-white mb-2">
                  Auditoria de Documentos
                </h2>
                <p className="text-sm text-gray-400 leading-relaxed mb-5">
                  La auditoria de documentos es exclusiva del <span className="text-blue-400 font-semibold">Plan Pro (S/ 40)</span>.
                  Sube PDFs y documentos de texto para que Atlas los analice por ti.
                </p>
                <div className="space-y-2 mb-4">
                  {[
                    'Extrae informacion clave de cualquier PDF',
                    'Analisis profundo de documentos de texto',
                    'Preguntas basadas en el contenido',
                  ].map((feat) => (
                    <li key={feat} className="flex items-start gap-2 text-sm text-gray-400">
                      <span className="text-blue-400 mt-0.5">{'\u2022'}</span>
                      {feat}
                    </li>
                  ))}
                </div>
                <div className="space-y-2">
                  <button
                    onClick={() => { setShowPdfPaywall(false); if (isAuthenticated) setShowSettings(true); }}
                    className="w-full flex items-center justify-center gap-2 py-3 rounded-xl bg-blue-600 hover:bg-blue-500 text-white text-sm font-semibold transition-all active:scale-[0.98] shadow-lg shadow-blue-500/15"
                  >
                    <Star className="w-4 h-4" />
                    {isAuthenticated ? 'Ver Planes' : 'Obtener Plan Pro'}
                  </button>
                  <button
                    onClick={() => setShowPdfPaywall(false)}
                    className="w-full py-2.5 rounded-xl text-gray-500 text-sm hover:text-gray-400 transition-colors"
                  >
                    Despues
                  </button>
                </div>
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
