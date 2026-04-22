'use client';

import { useState, useEffect, useRef, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Mic, Send, Plus, MessageSquare, Trash2,
  X, LogOut, LogIn, Settings, Lock, ShieldCheck, XCircle,
  Pencil, Archive, ArchiveRestore, Check, AlertTriangle,
  Paperclip, FileText, XCircle as XCircleIcon, Loader2,
  Copy, Share2, Bell, Star, Hash, PencilLine,
  Sparkles, RotateCcw, ChevronRight, Wand2, RefreshCw, Image
} from 'lucide-react';
import { auth } from '@/lib/firebase';
import { onAuthStateChanged } from 'firebase/auth';
import {
  trackMessageSent,
  trackPaywallShown,
  trackPaywallDismissed,
  trackLogin,
  trackSignUp,
  trackLogout,
  trackActionButton,
  trackVoiceStart,
  trackVoiceLocked,
  trackVoiceError,
  trackAlarmCreated,
  trackSessionCreated,
  identifyUser,
  resetIdentity,
} from '@/lib/analytics';
import { WELCOME_MESSAGE_NEW } from '@/lib/atlas';
import SettingsSidebar from '@/components/SettingsSidebar';
import BuyImagesModal from '@/components/BuyImagesModal';
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

interface Highlight {
  id: string;
  messageId: string;
  sessionId: string;
  number: number;
  text: string;
  createdAt: string;
}

interface FavoriteSession {
  sessionId: string;
  title: string;
  savedAt: string;
  messageCount: number;
}

// ========================================
// CONSTANTS
// ========================================

const GUEST_FREE_MESSAGES = 10;
const REGISTERED_FREE_MESSAGES = 20;
const GUEST_TENANT_KEY = 'atlas_guest_tenant_id';
const TRIAL_BOT_KEY = 'atlas_trial_bot_count';
const REG_MSGS_KEY_PREFIX = 'atlas_reg_msgs_'; // atlas_reg_msgs_YYYY-MM

const IMAGE_LIMITS: Record<string, number> = {
  basico: 20,
  pro: 50,
  executive: 100,
  free: 0,
};

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
  const [registeredMsgCount, setRegisteredMsgCount] = useState(0);
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
  // ---- Image Upload State (Base64, no Supabase) ----
  const [imageBase64, setImageBase64] = useState<string | null>(null);
  const [imageName, setImageName] = useState<string>('');
  const [showPaywallModal, setShowPaywallModal] = useState(false); // Controlled paywall modal
  const fileInputRef = useRef<HTMLInputElement>(null);

  // ---- Attach Prompt State ----
  const [showAttachPrompt, setShowAttachPrompt] = useState(false);
  const [attachPromptType, setAttachPromptType] = useState<'login' | 'image' | 'pdf' | null>(null);

  // ---- Image Generation State ----
  const [showBuyImagesModal, setShowBuyImagesModal] = useState(false);
  const [isGeneratingImage, setIsGeneratingImage] = useState(false);
  const [imageQuota, setImageQuota] = useState<{ remaining: number; total: number } | null>(null);
  const [hasPaidExtraImages, setHasPaidExtraImages] = useState(false); // Local flag after Yape

  // ---- Voice State (Web Speech API) ----
  const [isListening, setIsListening] = useState(false);
  const [isLocked, setIsLocked] = useState(false);
  const [speechSupported, setSpeechSupported] = useState(true);
  const recognitionRef = useRef<any>(null);
  const startYRef = useRef<number>(0);
  const shouldAutoSendRef = useRef(false);
  const isLockedRef = useRef(false);
  const voiceTranscriptRef = useRef(''); // Accumulates final voice text across recognition restarts (locked mode)
  const lockedStartYRef = useRef(0);
  const [isSwipeCanceling, setIsSwipeCanceling] = useState(false);
  const micCancelRef = useRef(false); // Prevents auto-send when swipe-down cancels
  const isTouchingRef = useRef(false); // Prevent double fire (touch + pointer)
  const restartTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null); // Voice restart timer — accessible outside useEffect
  const sendMessageRef = useRef<((text: string) => Promise<void>) | null>(null); // Latest sendMessage — no stale closure
  const inputValueRef = useRef(inputValue);
  inputValueRef.current = inputValue;
  const sendingVoiceRef = useRef(false); // Prevents double-send of voice messages
  const lastFinalResultTimeRef = useRef(0); // Debounces final results to prevent rapid duplicate sends

  // ---- PWA Install Prompt State ----
  const [showInstallPrompt, setShowInstallPrompt] = useState(false);
  const loginPromptShownRef = useRef(false);

  // ---- Refs ----
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);

  // ---- Settings State ----
  const [token, setToken] = useState('');
  const [showSettings, setShowSettings] = useState(false);

  // ---- Favorites State ----
  const [showFavoritesModal, setShowFavoritesModal] = useState(false);
  const [favoriteSessions, setFavoriteSessions] = useState<FavoriteSession[]>([]);
  const [favoritesTab, setFavoritesTab] = useState<'favorites' | 'numbers'>('favorites');
  const [favoriteMessageIds, setFavoriteMessageIds] = useState<Set<string>>(new Set());
  const [showSuggestions, setShowSuggestions] = useState(true);

  // ---- Numbered Highlights State ----
  const [highlights, setHighlights] = useState<Highlight[]>([]);
  const [showNumberPicker, setShowNumberPicker] = useState<{ messageId: string; msgContent: string; rect: DOMRect } | null>(null);
  const [selectedText, setSelectedText] = useState('');

  // ---- Edit Response State ----
  const [editingMessageId, setEditingMessageId] = useState<string | null>(null);
  const [editText, setEditText] = useState('');
  const [editOriginalContent, setEditOriginalContent] = useState('');

  // ---- Suggestions State ----
  const [suggestions, setSuggestions] = useState<string[]>([]);
  const [suggestionOffset, setSuggestionOffset] = useState(0);

  // ---- Favorites & Highlights: Load from localStorage ----
  const FAV_KEY = 'atlas_favorites';
  const FAV_MSG_KEY = 'atlas_favorite_messages';
  const HL_KEY = 'atlas_highlights';

  useEffect(() => {
    try {
      const savedFavs = localStorage.getItem(FAV_KEY);
      if (savedFavs) setFavoriteSessions(JSON.parse(savedFavs));
      const savedFavMsgs = localStorage.getItem(FAV_MSG_KEY);
      if (savedFavMsgs) setFavoriteMessageIds(new Set(JSON.parse(savedFavMsgs)));
      const savedHl = localStorage.getItem(HL_KEY);
      if (savedHl) setHighlights(JSON.parse(savedHl));
    } catch {}
  }, []);

  // Persist favorites
  useEffect(() => {
    try { localStorage.setItem(FAV_KEY, JSON.stringify(favoriteSessions)); } catch {}
  }, [favoriteSessions]);

  // Persist favorite messages
  useEffect(() => {
    try { localStorage.setItem(FAV_MSG_KEY, JSON.stringify([...favoriteMessageIds])); } catch {}
  }, [favoriteMessageIds]);

  // Persist highlights
  useEffect(() => {
    try { localStorage.setItem(HL_KEY, JSON.stringify(highlights)); } catch {}
  }, [highlights]);

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
      const decodedError = decodeURIComponent(authError);
      // Provide actionable error messages
      if (decodedError === 'no_code') {
        alert('El inicio de sesion con Google fue interrumpido. Por favor intenta de nuevo.\n\nSi el problema persiste, verifica que tu navegador acepte cookies de terceros.');
      } else {
        alert(`Error de autenticación: ${decodedError}.\n\nSi el problema persiste, intenta limpiar cookies o usa otro navegador.`);
      }
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
        trackLogin({ method: 'google_oauth' });
        try {
          const parsedUser = JSON.parse(decodeURIComponent(oauthUser));
          setUserInfo(parsedUser);
          identifyUser({ id: oauthTenantId, email: parsedUser.email || '', name: parsedUser.name || '', tenantId: oauthTenantId });
        } catch {}
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
              trackLogin({ method: 'token_restore' });
              if (savedUser) {
                try {
                  const parsed = JSON.parse(savedUser);
                  setUserInfo(parsed);
                  identifyUser({ id: savedTenantId, email: parsed.email || '', name: parsed.name || '', tenantId: savedTenantId });
                } catch {}
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
      // No token — check if Firebase session exists (from Google sign-in)
      try {
        const unsubscribe = onAuthStateChanged(auth, async (firebaseUser) => {
          unsubscribe(); // Only listen once
          if (firebaseUser) {
            try {
              const idToken = await firebaseUser.getIdToken();
              const res = await fetch('/api/auth/firebase-sync', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ idToken }),
              });
              if (res.ok) {
                const authData = await res.json();
                if (authData.token && authData.tenantId) {
                  localStorage.setItem('atlas_token', authData.token);
                  localStorage.setItem('atlas_tenant_id', authData.tenantId);
                  localStorage.setItem('atlas_user', JSON.stringify(authData.user));
                  // Reload to apply auth state
                  window.location.reload();
                  return;
                }
              }
            } catch (e) {
              console.warn('[FIREBASE_SYNC] Sync failed:', e);
            }
          }
          // No Firebase session — Guest mode
          startGuestMode();
        });
      } catch {
        // Firebase not available — Guest mode
        startGuestMode();
      }
    }
  }, []);

  const startGuestMode = () => {
    const guestTenantId = localStorage.getItem(GUEST_TENANT_KEY);
    const savedBotCount = parseInt(localStorage.getItem(TRIAL_BOT_KEY) || '0', 10);
    setTrialBotResponses(savedBotCount);
    // Load registered monthly counter
    const monthKey = REG_MSGS_KEY_PREFIX + new Date().toISOString().slice(0, 7);
    const savedRegCount = parseInt(localStorage.getItem(monthKey) || '0', 10);
    setRegisteredMsgCount(savedRegCount);

    if (guestTenantId) {
      setTenantId(guestTenantId);
    }

    // Auto-init session for guest
    initGuestSession(guestTenantId);
  };

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

  // Show install prompt after 7 bot responses (guest) or after login (registered)
  useEffect(() => {
    // Don't trigger if already installed
    if (typeof window !== 'undefined' && localStorage.getItem('atlas_pwa_installed') === 'true') return;
    if (typeof window !== 'undefined' && window.matchMedia('(display-mode: standalone)').matches) return;

    if (!isAuthenticated) {
      // Guest: trigger after 7 bot responses
      if (trialBotResponses >= 7 && !loginPromptShownRef.current) {
        loginPromptShownRef.current = true;
        setShowInstallPrompt(true);
      }
    } else if (!loginPromptShownRef.current) {
      // Registered: trigger shortly after login (1.5s delay for smooth UX)
      loginPromptShownRef.current = true;
      const timer = setTimeout(() => setShowInstallPrompt(true), 1500);
      return () => clearTimeout(timer);
    }
  }, [messages.length, isAuthenticated, trialBotResponses]);

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  };

  const scrollToMessage = (msgId: string) => {
    setShowFavoritesModal(false);
    // Wait for DOM update after closing modal
    setTimeout(() => {
      const el = document.querySelector(`[data-msg-id="${msgId}"]`);
      if (el) {
        el.scrollIntoView({ behavior: 'smooth', block: 'center' });
        // Flash highlight effect
        el.classList.add('ring-2', 'ring-amber-400/50');
        setTimeout(() => el.classList.remove('ring-2', 'ring-amber-400/50'), 2000);
      } else {
        // Message not in current view — might be in a different session
        scrollToBottom();
      }
    }, 100);
  };

  // ========================================
  // AUTH LOGIC
  // ========================================

  // ---- UNIFIED PAYWALL ----
  // Shows at 5 responses for EVERYONE (guest + logged-in).
  // Only way to dismiss: Supabase confirms plan_type valid (hasActivePlan === true).
  // Modal content changes: guest sees "Iniciar Sesion", logged-in sees "Ver Planes".

  const logout = () => {
    trackLogout();
    resetIdentity();
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
  // Helper: reset accumulated voice text (defined outside useEffect for reuse)
  const resetVoiceAccumulation = useCallback(() => {
    voiceTranscriptRef.current = '';
  }, []);

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
    recognition.maxAlternatives = 1; // Only one result to prevent duplicates

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

      // === ROBUST DEDUP: find longest suffix of acc that matches prefix of newTxt ===
      // Uses normalized words (no punctuation, case-insensitive) for comparison.
      // No artificial 10-word limit — scans up to full text length.
      // Then removes consecutive duplicate words at the boundary.
      const normWord = (w: string) => w.toLowerCase().replace(/[^a-záéíóúñü0-9]/g, '');

      const dedupAgainst = (accText: string, newText: string): string => {
        const accTrimmed = accText.trimEnd();
        const newTrimmed = newText.trim();
        if (!accTrimmed || !newTrimmed) return newTrimmed;

        const accNorm = accTrimmed.split(/\s+/).map(normWord).filter(Boolean);
        const newWords = newTrimmed.split(/\s+/);
        const newNorm = newWords.map(normWord);

        // Find longest suffix of accNorm that is a prefix of newNorm
        let overlap = 0;
        const maxOv = Math.min(accNorm.length, newNorm.length);
        for (let len = maxOv; len >= 1; len--) {
          let ok = true;
          for (let i = 0; i < len; i++) {
            if (accNorm[accNorm.length - len + i] !== newNorm[i]) { ok = false; break; }
          }
          if (ok) { overlap = len; break; }
        }

        let result = newWords.slice(overlap);

        // Safety: skip first result word if it matches last accumulated word
        if (result.length > 0 && accNorm.length > 0 && normWord(result[0]) === accNorm[accNorm.length - 1]) {
          result = result.slice(1);
        }

        // Remove ALL consecutive duplicate words in the result (API stutter artifact)
        if (result.length > 1) {
          const clean: string[] = [];
          for (let i = 0; i < result.length; i++) {
            const cn = normWord(result[i]);
            const pn = i > 0 ? normWord(result[i - 1]) : (clean.length === 0 && accNorm.length > 0 ? accNorm[accNorm.length - 1] : '');
            if (cn && cn !== pn) clean.push(result[i]);
          }
          result = clean;
        }

        return result.join(' ');
      };

      if (finalTranscript) {
        const acc = voiceTranscriptRef.current;
        const newTxt = finalTranscript.trim();
        if (acc.length > 0 && newTxt.length > 0) {
          const deduped = dedupAgainst(acc, newTxt);
          if (deduped) {
            voiceTranscriptRef.current = (voiceTranscriptRef.current.trimEnd() + ' ' + deduped).trim();
          }
        } else {
          voiceTranscriptRef.current = newTxt;
        }
      }

      if (interimTranscript) {
        const acc = voiceTranscriptRef.current;
        const interTrimmed = interimTranscript.trim();
        if (acc.length > 0 && interTrimmed.length > 0) {
          interimTranscript = dedupAgainst(acc, interTrimmed);
        }
      }

      // Show accumulated final + current interim in real-time
      const displayText = (voiceTranscriptRef.current + ' ' + interimTranscript).trim();
      if (displayText) {
        setInputValue(displayText);
        requestAnimationFrame(() => {
          const el = document.getElementById('chat-input') as HTMLTextAreaElement | null;
          if (el) el.scrollTop = el.scrollHeight;
        });
      }
    };

    recognition.onerror = (event: any) => {
      trackVoiceError({ error: event.error || 'unknown' });
      if (event.error === 'not-allowed') {
        alert('Se requiere permiso de microfono para usar la funcion de voz.');
      }
      // CRITICAL: Clear any pending restart timer to prevent ghost sessions
      if (restartTimerRef.current) { clearTimeout(restartTimerRef.current); restartTimerRef.current = null; }
      resetVoiceAccumulation();
      sendingVoiceRef.current = false;
      setIsListening(false);
      setIsLocked(false);
      isLockedRef.current = false;
      shouldAutoSendRef.current = false;
    };

    recognition.onend = () => {
      // If locked mode: debounced auto-restart with longer delay (1000ms)
      // to avoid race with browser's continuous-mode auto-restart
      if (isLockedRef.current) {
        if (restartTimerRef.current) clearTimeout(restartTimerRef.current);
        restartTimerRef.current = setTimeout(() => {
          restartTimerRef.current = null;
          // Only restart if still in locked mode
          if (isLockedRef.current) {
            try { recognition.start(); } catch {}
          }
        }, 1000);
        return;
      }
      // If we need to auto-send (quick press release)
      if (shouldAutoSendRef.current) {
        shouldAutoSendRef.current = false;
        setIsListening(false);
        setIsLocked(false);
        // Prevent double-send
        if (sendingVoiceRef.current) {
          resetVoiceAccumulation();
          return;
        }
        sendingVoiceRef.current = true;
        // Use voiceTranscriptRef (sync) — NOT inputValueRef (async React state)
        const text = voiceTranscriptRef.current.trim();
        resetVoiceAccumulation();
        if (text) {
          setInputValue('');
          // Small delay to ensure React state is cleared before send
          setTimeout(() => {
            sendMessageRef.current?.(text);
            setTimeout(() => { sendingVoiceRef.current = false; }, 500);
          }, 50);
        } else {
          sendingVoiceRef.current = false;
        }
        return;
      }
      resetVoiceAccumulation();
      setIsListening(false);
    };

    recognitionRef.current = recognition;

    return () => {
      if (restartTimerRef.current) { clearTimeout(restartTimerRef.current); restartTimerRef.current = null; }
      try { recognition.abort(); } catch {}
    };
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // Keep isLockedRef in sync
  useEffect(() => { isLockedRef.current = isLocked; }, [isLocked]);
  // NOTE: sendMessageRef sync is after sendMessage declaration (line ~969) to avoid TDZ

  // ========================================
  // MIC: Touch events (mobile) + Pointer events (desktop)
  // ========================================

  const _startListening = useCallback(() => {
    if (recognitionRef.current && !isListening) {
      try {
        // Always reset accumulation when starting fresh
        voiceTranscriptRef.current = '';
        setInputValue('');
        recognitionRef.current.start();
        setIsListening(true);
      } catch {}
    }
  }, [isListening]);

  // ---- TOUCH EVENTS (Mobile-first) ----
  const handleMicTouchStart = useCallback((e: React.TouchEvent<HTMLButtonElement>) => {
    isTouchingRef.current = true;
    if (isLoading || isStreaming || isAnalyzingDocument) return;
    e.preventDefault();
    const touch = e.touches[0];
    startYRef.current = touch.clientY;
    setIsLocked(false);
    isLockedRef.current = false;
    shouldAutoSendRef.current = false;
    trackVoiceStart();
    _startListening();
  }, [isLoading, isStreaming, isAnalyzingDocument, _startListening]);

  const handleMicTouchMove = useCallback((e: React.TouchEvent<HTMLButtonElement>) => {
    if (!isListening || isLockedRef.current) return;
    e.preventDefault();
    const touch = e.touches[0];
    const diff = startYRef.current - touch.clientY;
    // Swipe DOWN to cancel
    if (diff < -40) {
      micCancelRef.current = true;
      setIsSwipeCanceling(true);
      return;
    }
    micCancelRef.current = false;
    setIsSwipeCanceling(false);
    // Swipe UP to lock
    if (diff > 60 && !isLockedRef.current) {
      setIsLocked(true);
      isLockedRef.current = true;
      shouldAutoSendRef.current = false;
      trackVoiceLocked();
    }
  }, [isListening, isLocked]);

  const handleMicTouchEnd = useCallback((e: React.TouchEvent<HTMLButtonElement>) => {
    e.preventDefault();
    isTouchingRef.current = false;
    if (!isListening) return;
    if (micCancelRef.current) {
      // Swipe-down cancel: discard without sending
      micCancelRef.current = false;
      setIsSwipeCanceling(false);
      resetVoiceAccumulation();
      shouldAutoSendRef.current = false;
      try { recognitionRef.current?.stop(); } catch {}
      setIsListening(false);
      return;
    }
    if (!isLockedRef.current) {
      shouldAutoSendRef.current = true;
      try { recognitionRef.current?.stop(); } catch {}
    }
  }, [isListening, isLocked, resetVoiceAccumulation]);

  // ---- POINTER EVENTS (Desktop fallback — skipped on touch devices) ----
  const handleMicPointerDown = useCallback((e: React.PointerEvent<HTMLButtonElement>) => {
    if (isTouchingRef.current) return;
    if (isLoading || isStreaming || isAnalyzingDocument) return;
    e.preventDefault();
    startYRef.current = e.clientY;
    setIsLocked(false);
    isLockedRef.current = false;
    shouldAutoSendRef.current = false;
    trackVoiceStart();
    _startListening();
    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
  }, [isLoading, isStreaming, isAnalyzingDocument, _startListening]);

  const handleMicPointerMove = useCallback((e: React.PointerEvent<HTMLButtonElement>) => {
    if (isTouchingRef.current) return;
    if (!isListening || isLockedRef.current) return;
    const diff = startYRef.current - e.clientY;
    // Swipe DOWN to cancel
    if (diff < -40) {
      micCancelRef.current = true;
      setIsSwipeCanceling(true);
      return;
    }
    micCancelRef.current = false;
    setIsSwipeCanceling(false);
    // Swipe UP to lock
    if (diff > 60 && !isLockedRef.current) {
      setIsLocked(true);
      isLockedRef.current = true;
      shouldAutoSendRef.current = false;
      trackVoiceLocked();
    }
  }, [isListening, isLocked]);

  const handleMicPointerUp = useCallback((e: React.PointerEvent<HTMLButtonElement>) => {
    if (isTouchingRef.current) return;
    (e.currentTarget as HTMLElement).releasePointerCapture(e.pointerId);
    if (!isListening) return;
    if (micCancelRef.current) {
      // Swipe-down cancel: discard without sending
      micCancelRef.current = false;
      setIsSwipeCanceling(false);
      resetVoiceAccumulation();
      shouldAutoSendRef.current = false;
      try { recognitionRef.current?.stop(); } catch {}
      setIsListening(false);
      return;
    }
    if (!isLockedRef.current) {
      shouldAutoSendRef.current = true;
      try { recognitionRef.current?.stop(); } catch {}
    }
  }, [isListening, isLocked, resetVoiceAccumulation]);

  const handleLockedSend = useCallback(() => {
    // CRITICAL: Clear any pending restart timer to prevent ghost recognition sessions
    if (restartTimerRef.current) { clearTimeout(restartTimerRef.current); restartTimerRef.current = null; }
    // Prevent double-fire: don't start if already sending or auto-send pending
    if (sendingVoiceRef.current || shouldAutoSendRef.current) return;
    // DO NOT set sendingVoiceRef here — let onend handle it to avoid blocking the send
    shouldAutoSendRef.current = true;
    isLockedRef.current = false;
    setIsLocked(false);
    setIsSwipeCanceling(false);
    try { recognitionRef.current?.stop(); } catch {}
    // Safety net: if onend never fires, force send after 2s
    setTimeout(() => {
      if (shouldAutoSendRef.current) {
        shouldAutoSendRef.current = false;
        setIsListening(false);
        const text = voiceTranscriptRef.current.trim();
        resetVoiceAccumulation();
        if (text && !sendingVoiceRef.current) {
          sendingVoiceRef.current = true;
          setInputValue('');
          sendMessageRef.current?.(text);
          setTimeout(() => { sendingVoiceRef.current = false; }, 500);
        } else {
          sendingVoiceRef.current = false;
        }
      }
    }, 2000);
    // Actual send happens in onend handler
  }, []);

  // Cancel voice recording from locked state (swipe down or X button)
  // KEEPS the transcribed text in inputValue so user can manually send or edit
  const handleLockedCancel = useCallback(() => {
    // CRITICAL: Clear any pending restart timer to prevent ghost recognition sessions
    if (restartTimerRef.current) { clearTimeout(restartTimerRef.current); restartTimerRef.current = null; }
    shouldAutoSendRef.current = false;
    isLockedRef.current = false;
    setIsLocked(false);
    setIsSwipeCanceling(false);
    sendingVoiceRef.current = false;
    // NOTE: We do NOT clear inputValue here — the transcribed text stays in the input
    // so the user can review it and send manually or edit it
    resetVoiceAccumulation(); // Only clears voiceTranscriptRef, not inputValue
    try { recognitionRef.current?.stop(); } catch {}
    setIsListening(false);
  }, [resetVoiceAccumulation]);

  // ---- LOCKED BUTTON: Touch events for swipe-down to cancel ----
  const handleLockedTouchStart = useCallback((e: React.TouchEvent<HTMLButtonElement>) => {
    const touch = e.touches[0];
    lockedStartYRef.current = touch.clientY;
    setIsSwipeCanceling(false);
  }, []);

  const handleLockedTouchMove = useCallback((e: React.TouchEvent<HTMLButtonElement>) => {
    e.preventDefault();
    const touch = e.touches[0];
    const diff = touch.clientY - lockedStartYRef.current;
    if (diff > 40) {
      setIsSwipeCanceling(true);
    } else {
      setIsSwipeCanceling(false);
    }
  }, []);

  const handleLockedTouchEnd = useCallback((e: React.TouchEvent<HTMLButtonElement>) => {
    e.preventDefault();
    if (isSwipeCanceling) {
      handleLockedCancel();
    }
    setIsSwipeCanceling(false);
  }, [isSwipeCanceling, handleLockedCancel]);

  // ---- LOCKED BUTTON: Pointer events (desktop) for swipe-down to cancel ----
  const handleLockedPointerDown = useCallback((e: React.PointerEvent<HTMLButtonElement>) => {
    if (isTouchingRef.current) return;
    lockedStartYRef.current = e.clientY;
    setIsSwipeCanceling(false);
    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
  }, []);

  const handleLockedPointerMove = useCallback((e: React.PointerEvent<HTMLButtonElement>) => {
    if (isTouchingRef.current) return;
    const diff = e.clientY - lockedStartYRef.current;
    if (diff > 40) {
      setIsSwipeCanceling(true);
    } else {
      setIsSwipeCanceling(false);
    }
  }, []);

  const handleLockedPointerUp = useCallback((e: React.PointerEvent<HTMLButtonElement>) => {
    if (isTouchingRef.current) return;
    (e.currentTarget as HTMLElement).releasePointerCapture(e.pointerId);
    if (isSwipeCanceling) {
      handleLockedCancel();
    }
    setIsSwipeCanceling(false);
  }, [isSwipeCanceling, handleLockedCancel]);

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
        // PostHog: Identify user with plan type
        const currentEmail = userInfo?.email || '';
        const currentName = userInfo?.name || '';
        identifyUser({ id: tId, email: currentEmail, name: currentName, planType: pName, tenantId: tId });
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
        const trialPlan = trialData.trial.plan || 'pro';
        setUserPlanType(trialPlan);
        // PostHog: Identify user with trial plan
        const currentEmail = userInfo?.email || '';
        const currentName = userInfo?.name || '';
        identifyUser({ id: tId, email: currentEmail, name: currentName, planType: `trial_${trialPlan}`, tenantId: tId });
        return;
      }

      // CHECK 3: No plan, no trial — let user use free messages first
      setHasActivePlan(false);
      setTrialInfo(null);
      // Don't auto-open settings/paywall. User starts with free messages.
      // Plan modal appears only after exhausting the free limit (sendMessage gate).
    } catch {
      setHasActivePlan(false);
      setTrialInfo(null);
    } finally {
      setCheckingPlan(false);
    }

    // Fetch image quota
    fetch(`/api/generate-image?tenantId=${tId}`)
      .then((r) => r.json())
      .then((data) => {
        if (data.remaining !== undefined) {
          setImageQuota({ remaining: data.remaining, total: data.total_available });
        }
      })
      .catch(() => {});
  };

  // Get current monthly key for registered users
  const getRegMonthKey = () => REG_MSGS_KEY_PREFIX + new Date().toISOString().slice(0, 7);

  // Reset registered monthly counter when month changes
  useEffect(() => {
    const monthKey = getRegMonthKey();
    const saved = parseInt(localStorage.getItem(monthKey) || '0', 10);
    setRegisteredMsgCount(saved);
  }, []);

  const openPlanGate = () => {
    // Open settings sidebar directly to plan selection
    setShowPaywallModal(false);
    setShowSettings(true);
  };

  // ========================================
  // LOGIN MODAL (inline, no separate route needed in page)
  // ========================================

  // ========================================
  // SESSION MANAGEMENT
  // ========================================

  const createNewSession = useCallback(async (skipWelcome = false) => {
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

      if (!skipWelcome) {
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
      } else {
        setSessionReady(true);
      }

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
      // Guest: 10 free messages, then register prompt
      // Registered (no plan): 20/month, then plan selection
      // Registered (with plan): unlimited
      if (hasActivePlan !== true) {
        if (isAuthenticated) {
          // Registered free user: check monthly limit (20)
          if (registeredMsgCount >= REGISTERED_FREE_MESSAGES) {
            setShowPaywallModal(true); // Show plan selection modal
            return;
          }
        } else {
          // Guest: check limit (10)
          if (trialBotResponses >= GUEST_FREE_MESSAGES) {
            setShowPaywallModal(true); // Show register prompt
            return;
          }
        }
      }

      if ((!text.trim() && !imageBase64 && !documentText) || isLoading || isStreaming) return;

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
      let currentTenantId = tenantId;
      if (!currentSessionId) {
        const sessionData = await createNewSession(true);
        if (!sessionData) return;
        currentSessionId = sessionData.sessionId;
        currentTenantId = sessionData.tenantId;
      }

      // Safety: if tenantId is still empty (race condition on first load), block send
      if (!currentTenantId) {
        console.warn('[SEND] tenantId vacio, esperando inicializacion...');
        return;
      }

      const userMsg: Message = {
        id: `user-${Date.now()}`,
        role: 'user',
        content: text.trim(),
        timestamp: new Date().toISOString(),
      };

      setMessages((prev) => [...prev, userMsg]);
      setInputValue('');
      voiceTranscriptRef.current = ''; // Clear voice accumulation on send
      setIsLoading(true);
      setIsStreaming(true); // ---- PASO 3: Activar streaming ANTES del fetch ----

      // ---- POSTHOG: Track mensaje enviado ----
      trackMessageSent({
        hasPlan: hasActivePlan === true,
        planType: userPlanType || undefined,
        hasDocument: !!documentText,
        isVoice: false, // se sobreescribe desde voice handler cuando aplica
        messageLength: text.trim().length,
      });

      try {
        const res = await fetch('/api/chat', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            sessionId: currentSessionId,
            message: text.trim(),
            tenantId: currentTenantId,
            ...(documentText ? { documentText } : {}),
            ...(imageBase64 ? { imageBase64 } : {}),
          }),
        });

        // ---- CHECK FOR HTTP ERRORS FIRST ----
        if (!res.ok) {
          let errorMsg = 'Error de comunicacion. Intenta de nuevo.';
          try {
            const errData = await res.json();
            errorMsg = errData.detail || errData.error || errorMsg;
          } catch {}
          console.error('[CEREBRO] Backend error:', res.status, errorMsg);
          setMessages((prev) => [
            ...prev,
            {
              id: `error-${Date.now()}`,
              role: 'assistant',
              content: errorMsg,
              timestamp: new Date().toISOString(),
            },
          ]);
          return; // Don't continue to streaming/non-streaming
        }

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
            if (isAuthenticated) {
              // Registered user: increment monthly counter
              setRegisteredMsgCount((prev) => {
                const next = prev + 1;
                const monthKey = getRegMonthKey();
                localStorage.setItem(monthKey, String(next));
                return next;
              });
            } else {
              // Guest: increment guest counter
              setTrialBotResponses((prev) => {
                const next = prev + 1;
                localStorage.setItem(TRIAL_BOT_KEY, String(next));
                return next;
              });
            }
          }

          // ---- PASO 3: Desactivar streaming DESPUES de terminar ----
          setIsStreaming(false);

        } else {
          // ====== NON-STREAMING MODE (fallback) ======
          const data = await res.json();
          const responseContent = data.response || data.error || '';
          const assistantMsg: Message = {
            id: `assistant-${Date.now()}`,
            role: 'assistant',
            content: responseContent || 'Sin respuesta. Intenta de nuevo.',
            timestamp: new Date().toISOString(),
          };
          setMessages((prev) => [...prev, assistantMsg]);

          // ---- PASO 4: INCREMENT COUNTER ONLY ON SUCCESSFUL ASSISTANT RESPONSE ----
          if (assistantMsg.content && assistantMsg.content !== 'Sin respuesta.' && assistantMsg.content !== 'Error de comunicacion.' && !data.error) {
            if (isAuthenticated) {
              setRegisteredMsgCount((prev) => {
                const next = prev + 1;
                const monthKey = getRegMonthKey();
                localStorage.setItem(monthKey, String(next));
                return next;
              });
            } else {
              setTrialBotResponses((prev) => {
                const next = prev + 1;
                localStorage.setItem(TRIAL_BOT_KEY, String(next));
                return next;
              });
            }
          }

          // ---- PASO 3: Desactivar streaming ----
          setIsStreaming(false);
        }

        // Clear document/image after sending
        if (documentText || imageBase64) {
          setDocumentText(null);
          setDocumentName('');
          setImageBase64(null);
          setImageName('');
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
    [sessionId, tenantId, isLoading, isStreaming, createNewSession, isAuthenticated, documentText, imageBase64]
  );

  // Keep sendMessageRef current — fixes stale closure in recognition.onend
  // MUST be AFTER sendMessage declaration to avoid Temporal Dead Zone (TDZ)
  useEffect(() => {
    sendMessageRef.current = sendMessage;
  }, [sendMessage]);

  // ---- IMAGE GENERATION (FLUX) ----
  const handleGenerateImage = useCallback(async () => {
    if (!isAuthenticated || !tenantId || isGeneratingImage) return;

    // Check plan — only Pro and Executive can generate
    const planLower = userPlanType.toLowerCase();
    if (!IMAGE_LIMITS[planLower] && !hasPaidExtraImages) {
      setShowBuyImagesModal(true);
      return;
    }

    // Check quota from local state
    if (imageQuota && imageQuota.remaining <= 0 && !hasPaidExtraImages) {
      setShowBuyImagesModal(true);
      return;
    }

    // Get the prompt from input
    const prompt = inputValue.trim();
    if (!prompt) return;

    // Create session if needed
    let currentSessionId = sessionId;
    if (!currentSessionId) {
      const sessionData = await createNewSession();
      if (!sessionData) return;
      currentSessionId = sessionData.sessionId;
      await new Promise((r) => setTimeout(r, 500));
    }

    // Add user message
    const userMsg: Message = {
      id: `user-${Date.now()}`,
      role: 'user',
      content: `[Generar imagen] ${prompt}`,
      timestamp: new Date().toISOString(),
    };
    setMessages((prev) => [...prev, userMsg]);
    setInputValue('');
    setIsGeneratingImage(true);

    try {
      const res = await fetch('/api/generate-image', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          prompt,
          tenantId,
        }),
      });

      const data = await res.json();

      if (!res.ok) {
        if (data.error === 'limit_reached') {
          // Show buy modal
          setShowBuyImagesModal(true);
          // Update local quota
          setImageQuota({ remaining: 0, total: data.totalAvailable });
          return;
        }
        if (data.error === 'pending_payment') {
          setMessages((prev) => [
            ...prev,
            {
              id: `error-${Date.now()}`,
              role: 'assistant',
              content: 'Tu pago esta siendo verificado por el administrador. Por favor espera la aprobacion.',
              timestamp: new Date().toISOString(),
            },
          ]);
          return;
        }
        throw new Error(data.message || data.detail || 'Error al generar imagen');
      }

      // Show generated image in chat as assistant message
      const assistantMsg: Message = {
        id: `assistant-${Date.now()}`,
        role: 'assistant',
        content: data.image, // base64 data URL
        timestamp: new Date().toISOString(),
      };
      setMessages((prev) => [...prev, assistantMsg]);

      // Update local quota
      setImageQuota({ remaining: data.remaining, total: data.remaining + data.used });

      // Save messages to DB
      try {
        await fetch('/api/chat', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            sessionId: currentSessionId,
            message: `[Imagen generada] ${prompt}`,
            tenantId,
          }),
        });
      } catch {}
    } catch (error: any) {
      setMessages((prev) => [
        ...prev,
        {
          id: `error-${Date.now()}`,
          role: 'assistant',
          content: `Error al generar imagen: ${error.message || 'Intenta de nuevo.'}`,
          timestamp: new Date().toISOString(),
        },
      ]);
    } finally {
      setIsGeneratingImage(false);
    }
  }, [isAuthenticated, tenantId, isGeneratingImage, inputValue, sessionId, userPlanType, imageQuota, hasPaidExtraImages]);

  const handleImagePaymentConfirmed = useCallback(async (quantity: number, amount: number) => {
    setShowBuyImagesModal(false);
    setHasPaidExtraImages(true);

    // Update Supabase pending payment flag
    try {
      const { createClient } = await import('@supabase/supabase-js');
      const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
      const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
      if (url && key) {
        const sb = createClient(url, key);
        await sb
          .from('profiles')
          .update({
            pending_image_payment: true,
            image_payment_amount: amount,
          })
          .eq('id', tenantId);
      }
    } catch {}
  }, [tenantId]);

  // ---- Form Handlers ----
  const handleSubmit = useCallback((e: React.FormEvent) => {
    e.preventDefault();
    if (isLoading || isStreaming) return;
    sendMessage(inputValue);
  }, [isLoading, isStreaming, sendMessage, inputValue]);

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

    // ---- GATE: Must be authenticated to upload files ----
    if (!isAuthenticated) {
      setAttachPromptType('login');
      setShowAttachPrompt(true);
      return;
    }

    // Detect image files
    const isImage = file.type.startsWith('image/') || /\.(jpg|jpeg|png|webp|gif)$/i.test(file.name);

    if (isImage) {
      // ---- GATE: Free users cannot upload images ----
      if (hasActivePlan !== true) {
        setAttachPromptType('image');
        setShowAttachPrompt(true);
        return;
      }

      // IMAGE PIPELINE: Convert to Base64, no Supabase upload
      if (file.size > 10 * 1024 * 1024) {
        setMessages((prev) => [
          ...prev,
          {
            id: `error-${Date.now()}`,
            role: 'assistant',
            content: 'La imagen excede el limite de 10 MB. Reduce el tamano e intenta de nuevo.',
            timestamp: new Date().toISOString(),
          },
        ]);
        return;
      }

      setIsAnalyzingDocument(true);
      setImageName(file.name);

      try {
        const reader = new FileReader();
        const base64Promise = new Promise<string>((resolve, reject) => {
          reader.onload = () => resolve(reader.result as string);
          reader.onerror = () => reject(new Error('No se pudo leer la imagen'));
        });
        reader.readAsDataURL(file);
        const dataUrl = await base64Promise;
        setImageBase64(dataUrl);
        inputRef.current?.focus();
      } catch (error) {
        console.error('[IMG] Error al procesar imagen:', error);
        setMessages((prev) => [
          ...prev,
          {
            id: `error-${Date.now()}`,
            role: 'assistant',
            content: 'Error al procesar la imagen. Intenta con otro archivo.',
            timestamp: new Date().toISOString(),
          },
        ]);
        setImageName('');
      } finally {
        setIsAnalyzingDocument(false);
      }
      return;
    }

    // PDF / TXT pipeline — requires active plan (Pro/Ejecutivo)
    if (hasActivePlan !== true) {
      setAttachPromptType('pdf');
      setShowAttachPrompt(true);
      return;
    }

    const isPro = await checkUserPlan();
    if (!isPro) {
      setAttachPromptType('pdf');
      setShowAttachPrompt(true);
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
    setImageBase64(null);
    setImageName('');
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
      trackActionButton({ action: 'copy' });
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
      trackActionButton({ action: 'share' });
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
      trackPaywallShown({ reason: 'alarm_gate', messagesSent: trialBotResponses, isAuthenticated: false });
      setShowAlarmPaywall(true);
      return;
    }
    if (userPlanType !== 'ejecutivo') {
      trackPaywallShown({ reason: 'alarm_gate', messagesSent: trialBotResponses, isAuthenticated: true });
      setShowAlarmPaywall(true);
      return;
    }
    trackActionButton({ action: 'alarm' });
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
  // Guest: block after 10. Registered free: block after 20/month. Plan users: never block.
  const isInputBlocked = !isStreaming && !checkingPlan && hasActivePlan !== true && (
    (!isAuthenticated && trialBotResponses >= GUEST_FREE_MESSAGES) ||
    (isAuthenticated && registeredMsgCount >= REGISTERED_FREE_MESSAGES)
  );

  // Remaining responses depends on auth state
  const remainingResponses = isAuthenticated
    ? Math.max(0, REGISTERED_FREE_MESSAGES - registeredMsgCount)
    : Math.max(0, GUEST_FREE_MESSAGES - trialBotResponses);

  const messageLimit = isAuthenticated ? REGISTERED_FREE_MESSAGES : GUEST_FREE_MESSAGES;

  // ---- POSTHOG: Track paywall cuando se muestra ----
  const paywallShownRef = useRef(false);
  useEffect(() => {
    if (isInputBlocked && !paywallShownRef.current) {
      paywallShownRef.current = true;
      trackPaywallShown({
        reason: 'trial_exceeded',
        messagesSent: trialBotResponses,
        isAuthenticated: !!isAuthenticated,
      });
    }
    if (!isInputBlocked) {
      paywallShownRef.current = false;
    }
  }, [isInputBlocked, trialBotResponses, isAuthenticated]);

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
      trackActionButton({ action: 'expand' });

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
  // FAVORITES — Star icon, save sessions + messages
  // ========================================

  const toggleFavoriteSession = useCallback((sId: string, sTitle: string, msgCount: number) => {
    setFavoriteSessions(prev => {
      const exists = prev.find(f => f.sessionId === sId);
      if (exists) {
        return prev.filter(f => f.sessionId !== sId);
      }
      return [...prev, { sessionId: sId, title: sTitle || 'Sin titulo', savedAt: new Date().toISOString(), messageCount: msgCount || 0 }];
    });
    trackActionButton({ action: 'favorite' });
  }, []);

  const isSessionFavorited = useCallback((sId: string) => {
    return favoriteSessions.some(f => f.sessionId === sId);
  }, [favoriteSessions]);

  // Per-message favorite toggle
  const toggleFavoriteMessage = useCallback((msgId: string) => {
    setFavoriteMessageIds(prev => {
      const next = new Set(prev);
      if (next.has(msgId)) {
        next.delete(msgId);
      } else {
        next.add(msgId);
      }
      return next;
    });
    trackActionButton({ action: 'favorite_message' });
  }, []);

  // ========================================
  // HIGHLIGHTS — Number system (1-99)
  // ========================================

  const handleTextSelection = useCallback(() => {
    const selection = window.getSelection();
    if (!selection || selection.isCollapsed || selection.toString().trim().length < 5) return;

    // Check if selection is within a message
    const anchorNode = selection.anchorNode;
    if (!anchorNode) return;

    const msgEl = (anchorNode as HTMLElement).closest('[data-msg-id]');
    if (!msgEl) return;

    const msgId = msgEl.getAttribute('data-msg-id');
    if (!msgId) return;

    // Get the plain text content of the message
    const textContent = msgEl.textContent || '';

    const range = selection.getRangeAt(0);
    const rect = range.getBoundingClientRect();

    setSelectedText(selection.toString().trim());
    setShowNumberPicker({ messageId: msgId, msgContent: textContent, rect });
  }, []);

  // ---- Text selection listener for highlights ----
  useEffect(() => {
    const onMouseUp = () => handleTextSelection();
    const onTouchEnd = () => setTimeout(handleTextSelection, 300);
    document.addEventListener('mouseup', onMouseUp);
    document.addEventListener('touchend', onTouchEnd);
    return () => {
      document.removeEventListener('mouseup', onMouseUp);
      document.removeEventListener('touchend', onTouchEnd);
    };
  }, [handleTextSelection]);

  const addHighlight = useCallback((number: number) => {
    if (!showNumberPicker || !selectedText) return;

    const newHighlight: Highlight = {
      id: `hl-${Date.now()}`,
      messageId: showNumberPicker.messageId,
      sessionId: sessionId,
      number,
      text: selectedText,
      createdAt: new Date().toISOString(),
    };

    setHighlights(prev => [...prev, newHighlight]);
    setShowNumberPicker(null);
    setSelectedText('');
    window.getSelection()?.removeAllRanges();
    trackActionButton({ action: `highlight_${number}` });
  }, [showNumberPicker, selectedText, sessionId]);

  const removeHighlight = useCallback((hlId: string) => {
    setHighlights(prev => prev.filter(h => h.id !== hlId));
  }, []);

  // ========================================
  // EDIT RESPONSE — Edit bot text + regenerate
  // ========================================

  const startEditResponse = useCallback((msgId: string, content: string) => {
    setEditingMessageId(msgId);
    setEditText(toPlainText(content));
    setEditOriginalContent(content);
  }, []);

  const cancelEdit = useCallback(() => {
    setEditingMessageId(null);
    setEditText('');
    setEditOriginalContent('');
  }, []);

  const saveEditOnly = useCallback(() => {
    if (!editingMessageId || !editText.trim()) return;
    // Just update the message content locally (visual only)
    const formatted = editText.trim().replace(/\n/g, '<br/>');
    setMessages(prev => prev.map(m => m.id === editingMessageId ? { ...m, content: formatted } : m));
    setEditingMessageId(null);
    setEditText('');
    setEditOriginalContent('');
    trackActionButton({ action: 'edit_save' });
  }, [editingMessageId, editText]);

  const editAndRegenerate = useCallback(async () => {
    if (!editingMessageId || !editText.trim() || !sessionId || !tenantId) return;
    if (isLoading || isStreaming) return;

    setEditingMessageId(null);

    // Send the edited text as a new user message asking for revision
    const revisionPrompt = `[EDICION DE RESPUESTA] El usuario edito tu respuesta anterior. A partir de esta version editada, genera una nueva respuesta mejorada que mantenga la esencia pero incorpore los cambios:\n\n${editText.trim()}`;

    setEditText('');
    setEditOriginalContent('');

    // Use sendMessage via ref
    await sendMessageRef.current?.(revisionPrompt);
    trackActionButton({ action: 'edit_regenerate' });
  }, [editingMessageId, editText, sessionId, tenantId, isLoading, isStreaming]);

  // ========================================
  // SUGGESTIONS — Atlas suggests questions
  // ========================================

  const generateSuggestions = useCallback((lastUserMsg: string, lastBotMsg: string) => {
    const topic = (lastUserMsg + ' ' + lastBotMsg).toLowerCase();
    const suggestionsList: string[] = [];

    // Context-aware suggestions based on keywords from both user and bot
    if (topic.includes('estrategia') || topic.includes('plan') || topic.includes('negocio')) {
      suggestionsList.push(
        'Dame un plan de accion paso a paso', 'Que riesgos debo considerar?', 'Como mido el progreso?',
        'Cuales son los KPIs clave?', 'Como lo diferencio de la competencia?', 'Que inversor deberia buscar?'
      );
    } else if (topic.includes('estres') || topic.includes('ansiedad') || topic.includes('miedo') || topic.includes('panico')) {
      suggestionsList.push(
        'Dame una tecnica de respiracion rapida', 'Como manejo esto en el trabajo?', 'Que habito diario me ayudaria?',
        'Que ejercicio físico me recomiendas?', 'Como afecta mi sueño?', 'Cuando deberia buscar ayuda profesional?'
      );
    } else if (topic.includes('estudio') || topic.includes('aprender') || topic.includes('examen') || topic.includes('universidad')) {
      suggestionsList.push(
        'Hazme un cronograma de estudio', 'Que tecnica de aprendizaje me recomiendas?', 'Como evito la procrastinacion?',
        'Que metodo de toma de notas es mejor?', 'Como manejo el tiempo en examenes?', 'Que recursos online me sugieres?'
      );
    } else if (topic.includes('pareja') || topic.includes('relacion') || topic.includes('amor') || topic.includes('matrimonio')) {
      suggestionsList.push(
        'Como mejoro la comunicacion?', 'Que puedo hacer yo ahora mismo?', 'Como manejo las diferencias?',
        'Como reconstruyo la confianza?', 'Que lenguaje del amor usa?', 'Como evito discusiones repetitivas?'
      );
    } else if (topic.includes('dinero') || topic.includes('ahorro') || topic.includes('presupuesto') || topic.includes('deuda')) {
      suggestionsList.push(
        'Hazme un presupuesto mensual', 'Como genero ingreso extra?', 'Que debo priorizar pagar primero?',
        'Como inicio un fondo de emergencia?', 'Que inversiones me recomiendas?', 'Como elimino deudas rapido?'
      );
    } else if (topic.includes('trabajo') || topic.includes('jefe') || topic.includes('empleo') || topic.includes('sueldo')) {
      suggestionsList.push(
        'Como negocio un aumento?', 'Que hago si quiero renunciar?', 'Como destaco en mi trabajo?',
        'Como prepuro una entrevista?', 'Que habilidades debo aprender?', 'Como manejo el burnout laboral?'
      );
    } else if (topic.includes('salud') || topic.includes('dieta') || topic.includes('ejercicio') || topic.includes('peso')) {
      suggestionsList.push(
        'Hazme una rutina semanal de ejercicio', 'Que dieta me recomiendas?', 'Como mantengo la motivacion?',
        'Cuantas horas de sueño necesito?', 'Que suplementos son esenciales?', 'Como evito lesiones entrenando?'
      );
    } else if (topic.includes('ventas') || topic.includes('marketing') || topic.includes('cliente') || topic.includes('negocio')) {
      suggestionsList.push(
        'Como atraigo mas clientes?', 'Que estrategia de precios uso?', 'Como cierro mas ventas?',
        'Que canales de marketing son mejores?', 'Como fidelizo a mis clientes?', 'Como creo una marca personal?'
      );
    }

    // Default suggestions
    if (suggestionsList.length === 0) {
      suggestionsList.push(
        'Dame un ejemplo practico', 'Que hago si no funciona?', 'Cual es el siguiente paso?',
        'Que alternativas tengo?', 'Como aplico esto en mi vida?', 'Que recursos necesito?'
      );
    }

    // Show 3 at a time, store all for "more" cycling
    setSuggestions(suggestionsList);
    setSuggestionOffset(0);
    setShowSuggestions(true);
  }, []);

  // Generate suggestions after each response
  useEffect(() => {
    if (messages.length < 2 || isStreaming || isLoading) {
      setSuggestions([]);
      return;
    }

    const lastBot = [...messages].reverse().find(m => m.role === 'assistant');
    const lastUser = [...messages].reverse().find(m => m.role === 'user');
    if (lastBot && lastUser) {
      generateSuggestions(lastUser.content, lastBot.content);
    }
  }, [messages.length, isStreaming, isLoading, generateSuggestions, messages]);

  // ========================================
  // MAIN CHAT SCREEN (accessible for all)
  // ========================================

  return (
    <div className="flex flex-col h-[100dvh] max-h-[100dvh] w-full min-h-0 bg-[#0a0a0a] text-white overflow-hidden" style={{ WebkitOverflowScrolling: 'touch' }}>
      {/* ===== SETTINGS SIDEBAR ===== */}
      <SettingsSidebar
        isOpen={showSettings}
        onClose={() => {
          setShowSettings(false);
        }}
        user={userInfo ? { ...userInfo, tenantId } : null}
        token={token || ''}
        forcePaywall={false}
        userPlanType={userPlanType}
        remainingMessages={remainingResponses}
        messageLimit={messageLimit}
        userHasPlan={hasActivePlan === true}
      />

      {/* ===== HEADER ===== */}
      <header className="flex items-center justify-between px-3 sm:px-4 py-2.5 sm:py-3 bg-[#111111] border-b border-gray-800/30 z-20 shrink-0">
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
          {/* Favorites Star */}
          <button
            onClick={() => setShowFavoritesModal(true)}
            className="p-2 rounded-full hover:bg-gray-800/60 transition-colors relative"
            aria-label="Favoritos"
            title="Favoritos y destacados"
          >
            <Star className={`w-5 h-5 ${favoriteSessions.length > 0 || highlights.length > 0 || favoriteMessageIds.size > 0 ? 'text-amber-400 fill-amber-400' : 'text-gray-400'}`} />
            {(favoriteSessions.length > 0 || highlights.length > 0 || favoriteMessageIds.size > 0) && (
              <span className="absolute -top-0.5 -right-0.5 w-3.5 h-3.5 bg-amber-500 rounded-full text-[8px] text-white flex items-center justify-center font-bold">
                {favoriteSessions.length + highlights.length + favoriteMessageIds.size}
              </span>
            )}
          </button>
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
                                {/* Favorite toggle */}
                                <button
                                  onClick={(e) => { e.stopPropagation(); toggleFavoriteSession(session.id, session.title, session._count?.messages || 0); }}
                                  className="p-1.5 rounded-lg hover:bg-gray-700/40 transition-colors"
                                  title={isSessionFavorited(session.id) ? 'Quitar de favoritos' : 'Agregar a favoritos'}
                                >
                                  <Star className={`w-3 h-3 ${isSessionFavorited(session.id) ? 'text-amber-400 fill-amber-400' : 'text-gray-500 hover:text-amber-400'}`} />
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
      <div className="flex-1 min-h-0 overflow-y-auto overscroll-contain px-3 sm:px-4 py-3 space-y-3" style={{ WebkitOverflowScrolling: 'touch' }}>
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
                data-msg-id={msg.id}
                className={`relative max-w-[85%] sm:max-w-[70%] px-3.5 py-2 sm:py-2.5 shadow-sm min-w-[120px] ${
                  msg.role === 'user'
                    ? 'bg-[#005c4b] text-white rounded-2xl rounded-br-sm'
                    : 'bg-[#1f2722] text-gray-100 rounded-2xl rounded-bl-sm'
                }`}
              >
                {msg.role === 'assistant' && (
                  <div className="flex items-center justify-between mb-1">
                    <div className="flex items-center gap-1.5">
                      <span className="text-xs">{'\uD83E\uDDED'}</span>
                      <span className="text-[9px] font-bold text-emerald-400 uppercase tracking-widest">
                        Atlas
                      </span>
                    </div>
                    <span className="text-[9px] text-gray-600">
                      {formatTime(msg.timestamp)}
                    </span>
                  </div>
                )}
                {/* Highlight number badges */}
                {msg.role === 'assistant' && highlights.filter(h => h.messageId === msg.id).length > 0 && (
                  <div className="flex items-center gap-1 ml-1.5 mb-1.5">
                    {highlights.filter(h => h.messageId === msg.id).sort((a, b) => a.number - b.number).map(hl => (
                      <span
                        key={hl.id}
                        className="inline-flex items-center justify-center w-5 h-5 rounded-full bg-amber-500/20 border border-amber-500/40 text-[9px] font-bold text-amber-400"
                        title={hl.text.substring(0, 50) + (hl.text.length > 50 ? '...' : '')}
                      >
                        {hl.number}
                      </span>
                    ))}
                  </div>
                )}
                {/* Check if content is a base64 image (generated image) */}
                {msg.role === 'assistant' && msg.content.startsWith('data:image/') && (
                  <img
                    src={msg.content}
                    alt="Imagen generada por IA"
                    className="rounded-xl max-w-full max-h-[400px] object-contain"
                  />
                )}
                {/* Message content — skip rendering text for generated images */}
                {!(msg.role === 'assistant' && msg.content.startsWith('data:image/')) && (
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
                )}
                {/* Stream disconnection error — subtle warning below text */}
                {msg.role === 'assistant' && msg.id === streamDisconnectedId && (
                  <p className="text-[11px] text-amber-400/80 mt-2 flex items-center gap-1">
                    <span className="inline-block w-1 h-1 rounded-full bg-amber-400/80" />
                    Conexion interrumpida. La respuesta se corto.
                  </p>
                )}
                {msg.role === 'user' && (
                  <p className="text-[9px] text-emerald-200/50 mt-1 text-right">
                    {formatTime(msg.timestamp)}
                  </p>
                )}

                {/* Action buttons — always visible, brighter on hover */}
                {msg.role === 'assistant' && msg.id !== streamingId && msg.content && !msg.content.startsWith('Error') && (
                  <div className="flex items-center gap-1 opacity-40 hover:opacity-100 transition-opacity duration-200 mt-1.5 ml-0.5">
                    {/* Copy */}
                    <button
                      onClick={() => copyMessage(msg.id, msg.content)}
                      className="p-1 rounded-lg text-gray-400 hover:text-emerald-400 hover:bg-emerald-500/10 transition-all active:scale-90 cursor-pointer select-none"
                      title={copiedId === msg.id ? 'Copiado' : 'Copiar'}
                    >
                      {copiedId === msg.id ? (
                        <Check className="w-3.5 h-3.5 text-emerald-400" />
                      ) : (
                        <Copy className="w-3.5 h-3.5" />
                      )}
                    </button>

                    {/* Share */}
                    <button
                      onClick={() => shareMessage(msg.id, msg.content)}
                      className="p-1 rounded-lg text-gray-400 hover:text-blue-400 hover:bg-blue-500/10 transition-all active:scale-90 cursor-pointer select-none"
                      title={sharedId === msg.id ? 'Enlace copiado' : 'Compartir'}
                    >
                      {sharedId === msg.id ? (
                        <Check className="w-3.5 h-3.5 text-blue-400" />
                      ) : (
                        <Share2 className="w-3.5 h-3.5" />
                      )}
                    </button>

                    {/* Alarm — only for substantive messages (50+ words) */}
                    {wordCount(msg.content) > 50 && (
                      <button
                        onClick={() => handleAlarmClick(msg.content)}
                        className="p-1 rounded-lg text-gray-400 hover:text-amber-400 hover:bg-amber-500/10 transition-all active:scale-90 cursor-pointer select-none"
                        title="Programar alarma"
                      >
                        <Bell className="w-3.5 h-3.5" />
                      </button>
                    )}

                    {/* Star Favorite — per message */}
                    <button
                      onClick={() => toggleFavoriteMessage(msg.id)}
                      className="p-1 rounded-lg transition-all active:scale-90 cursor-pointer select-none"
                      title={favoriteMessageIds.has(msg.id) ? 'Quitar de favoritos' : 'Agregar a favoritos'}
                    >
                      <Star className={`w-3.5 h-3.5 ${favoriteMessageIds.has(msg.id) ? 'text-amber-400 fill-amber-400' : 'text-gray-400 hover:text-amber-400'}`} />
                    </button>

                    {/* Highlight / Number */}
                    {msg.id !== streamingId && msg.id !== expandingId && (
                      <button
                        onClick={() => {
                          const plainText = toPlainText(msg.content);
                          setSelectedText(plainText);
                          setShowNumberPicker({ messageId: msg.id, msgContent: plainText, rect: { top: 0, left: 0, bottom: 0, right: 0, width: 0, height: 0, x: 0, y: 0, toJSON: () => '' } });
                        }}
                        className="p-1 rounded-lg text-gray-400 hover:text-purple-400 hover:bg-purple-500/10 transition-all active:scale-90 cursor-pointer select-none"
                        title="Numerar / Destacar"
                      >
                        <Hash className="w-3.5 h-3.5" />
                      </button>
                    )}

                    {/* Edit Response */}
                    {msg.id !== editingMessageId && msg.id !== streamingId && msg.id !== expandingId && (
                      <button
                        onClick={() => startEditResponse(msg.id, msg.content)}
                        className="p-1 rounded-lg text-gray-400 hover:text-blue-400 hover:bg-blue-500/10 transition-all active:scale-90 cursor-pointer select-none"
                        title="Editar respuesta"
                      >
                        <PencilLine className="w-3.5 h-3.5" />
                      </button>
                    )}

                    {/* Expand — only for short responses (15-90 words) — FULL BUTTON, the only one with text */}
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
                {/* Edit Mode */}
                {msg.role === 'assistant' && editingMessageId === msg.id && (
                  <div className="mt-2 space-y-2">
                    <textarea
                      value={editText}
                      onChange={(e) => setEditText(e.target.value)}
                      className="w-full bg-gray-800/60 border border-gray-700/50 rounded-lg px-3 py-2 text-[13px] text-white placeholder-gray-500 focus:outline-none focus:ring-1 focus:ring-blue-500/40 resize-none min-h-[80px] leading-relaxed"
                      placeholder="Edita la respuesta..."
                      rows={4}
                      autoFocus
                    />
                    <div className="flex items-center gap-2">
                      <button
                        onClick={saveEditOnly}
                        className="flex items-center gap-1 px-2.5 py-1.5 rounded-lg bg-blue-600 hover:bg-blue-500 text-white text-[11px] font-semibold transition-all active:scale-95"
                      >
                        <Check className="w-3 h-3" />
                        Guardar
                      </button>
                      <button
                        onClick={editAndRegenerate}
                        disabled={isLoading || isStreaming}
                        className="flex items-center gap-1 px-2.5 py-1.5 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white text-[11px] font-semibold transition-all active:scale-95 disabled:opacity-50"
                      >
                        <Sparkles className="w-3 h-3" />
                        Nueva respuesta
                      </button>
                      <button
                        onClick={cancelEdit}
                        className="flex items-center gap-1 px-2.5 py-1.5 rounded-lg hover:bg-gray-800/60 text-gray-400 text-[11px] font-medium transition-all"
                      >
                        <X className="w-3 h-3" />
                        Cancelar
                      </button>
                    </div>
                  </div>
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
      <div className="shrink-0 border-t border-gray-800/20 bg-[#111111] px-2 sm:px-3 py-2 sm:py-2.5 pb-[max(0.5rem,env(safe-area-inset-bottom))] z-10">
        {/* Remaining responses bar — guests AND registered free users */}
        {remainingResponses > 0 && hasActivePlan !== true && !checkingPlan && (
          <div className="text-center mb-1.5 sm:mb-2">
            <span className="text-[9px] sm:text-[10px] text-gray-600">
              {!isAuthenticated ? (
                <>
                  Tienes <span className="text-emerald-400 font-semibold">{remainingResponses}</span> de {messageLimit} respuestas gratis.{' '}
                  <a href="/login" className="text-emerald-400 hover:text-emerald-300 underline">
                    Registrate gratis
                  </a>{' '}
                  y obten 20 extra al mes.
                </>
              ) : (
                <>
                  Te quedan <span className="text-emerald-400 font-semibold">{remainingResponses}</span> de {messageLimit} respuestas este mes.
                </>
              )}
            </span>
          </div>
        )}

        {/* Listening / Locked / Document analyzing indicator — ABOVE the input */}
        <AnimatePresence>
          {isLocked && (
            <motion.div
              initial={{ opacity: 0, y: 8, scale: 0.95 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, y: 8, scale: 0.95 }}
              transition={{ type: 'spring', damping: 20, stiffness: 300 }}
              className="mb-2 mx-auto max-w-xs px-3 py-2.5 rounded-xl bg-emerald-600/20 border border-emerald-500/30 backdrop-blur-sm"
            >
              <div className="flex items-center justify-between gap-2">
                <div className="flex items-center justify-center gap-2 flex-1 min-w-0">
                  <span className={`w-2.5 h-2.5 rounded-full animate-pulse shrink-0 ${isSwipeCanceling ? 'bg-red-500' : 'bg-emerald-500'}`} />
                  <span className={`text-[12px] sm:text-[13px] font-semibold transition-colors truncate ${isSwipeCanceling ? 'text-red-300' : 'text-emerald-300'}`}>
                    {isSwipeCanceling
                      ? 'Suelta para cancelar grabacion'
                      : 'Toca para enviar. Desliza abajo para cancelar.'}
                  </span>
                </div>
                {/* X cancel button — keeps transcribed text in input */}
                {!isSwipeCanceling && (
                  <button
                    type="button"
                    onClick={(e) => { e.stopPropagation(); handleLockedCancel(); }}
                    className="w-7 h-7 rounded-full bg-red-500/20 hover:bg-red-500/40 border border-red-500/30 flex items-center justify-center shrink-0 transition-colors active:scale-90"
                    aria-label="Cancelar grabacion"
                  >
                    <X className="w-3.5 h-3.5 text-red-400" />
                  </button>
                )}
              </div>
            </motion.div>
          )}
        </AnimatePresence>
        <AnimatePresence>
          {(isListening && !isLocked) && (
            <motion.div
              initial={{ opacity: 0, y: -4 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -4 }}
              className="flex items-center justify-center gap-2 mb-2"
            >
              <span className={`w-2 h-2 rounded-full animate-pulse ${isSwipeCanceling ? 'bg-red-400' : 'bg-red-500'}`} />
              <span className={`text-[11px] font-medium transition-colors ${isSwipeCanceling ? 'text-orange-400' : 'text-red-400'}`}>
                {isSwipeCanceling
                  ? 'Suelta para cancelar'
                  : 'Desliza arriba para bloquear, suelta para enviar'}
              </span>
              {!isSwipeCanceling && (
                <span className="text-[9px] text-red-400/50">
                  &nbsp;| Desliza hacia abajo para dejar de grabar
                </span>
              )}
            </motion.div>
          )}
        </AnimatePresence>
        <AnimatePresence>
          {isAnalyzingDocument && (
            <motion.div
              initial={{ opacity: 0, y: -4 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -4 }}
              className="flex items-center justify-center gap-2 mb-2"
            >
              <span className="w-2 h-2 rounded-full bg-blue-400 animate-pulse" />
              <span className="text-[11px] font-medium text-blue-400">
                Atlas esta analizando el documento...
              </span>
            </motion.div>
          )}
        </AnimatePresence>

        {/* Image Generation Loading */}
        <AnimatePresence>
          {isGeneratingImage && (
            <motion.div
              initial={{ opacity: 0, y: -4 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -4 }}
              className="flex items-center gap-2 mt-2 px-3 py-1.5 rounded-lg bg-purple-500/10 border border-purple-500/20 max-w-[400px]"
            >
              <Loader2 className="w-3.5 h-3.5 text-purple-400 animate-spin shrink-0" />
              <span className="text-[11px] text-purple-300">Generando obra de arte...</span>
            </motion.div>
          )}
        </AnimatePresence>

        <form onSubmit={handleSubmit} className="flex items-center gap-2 max-w-3xl mx-auto">
          <textarea
            ref={inputRef}
            id="chat-input"
            value={inputValue}
            onChange={(e) => setInputValue(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder={'Escribe o habla tu mensaje...'}
            rows={1}
            className={`flex-1 min-w-0 bg-[#1a1a1a] border border-gray-800/40 rounded-full px-4 py-2.5 sm:py-3 text-[13px] sm:text-[14px] text-white placeholder-gray-500 focus:outline-none focus:ring-1 focus:ring-emerald-500/40 focus:border-emerald-500/30 transition-all disabled:opacity-50 resize-none overflow-y-auto max-h-28 leading-5 ${isListening ? 'border-red-500/40 ring-1 ring-red-500/20' : ''}`}
            disabled={isLoading || isStreaming}
          />

          {/* Send — hidden when voice locked (locked send button replaces it) */}
          {!isLocked && (
            <button
              type="submit"
              disabled={(!inputValue.trim() && !imageBase64) || isLoading || isStreaming || isListening}
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
            accept=".pdf,.txt,.jpg,.jpeg,.png,.webp,.gif,image/jpeg,image/png,image/webp,application/pdf,text/plain"
            onChange={handleFileUpload}
            className="hidden"
          />
          <button
            type="button"
            onClick={() => {
              trackActionButton({ action: 'attach' });
              fileInputRef.current?.click();
            }}
            disabled={isLoading || isStreaming || isAnalyzingDocument}
            className={`w-10 h-10 sm:w-[52px] sm:h-[52px] rounded-full flex items-center justify-center transition-all active:scale-90 shrink-0 disabled:opacity-30 ${
              isAnalyzingDocument
                ? 'bg-blue-500/15 border-2 border-blue-500/40'
                : documentText || imageBase64
                  ? 'bg-blue-500/10 border-2 border-blue-500/30'
                  : 'bg-gray-800 hover:bg-gray-700/80 border-2 border-gray-700/30 hover:border-blue-500/40'
            }`}
            aria-label="Adjuntar archivo (PDF, TXT, Imagen)"
            title="Adjuntar archivo"
          >
            {isAnalyzingDocument ? (
              <Loader2 className="w-4 h-4 sm:w-5 sm:h-5 text-blue-400 animate-spin" />
            ) : documentText || imageBase64 ? (
              <FileText className="w-4 h-4 sm:w-5 sm:h-5 text-blue-400" />
            ) : (
              <Paperclip className="w-4 h-4 sm:w-5 sm:h-5 text-gray-400" />
            )}
          </button>

          {/* Image Generation — Pro/Executive only */}
          {(IMAGE_LIMITS[userPlanType?.toLowerCase()] > 0 || userPlanType?.startsWith('trial_') || hasPaidExtraImages) && (
            <button
              type="button"
              onClick={handleGenerateImage}
              disabled={isLoading || isStreaming || isGeneratingImage || !inputValue.trim()}
              className="w-10 h-10 sm:w-[52px] sm:h-[52px] rounded-full flex items-center justify-center transition-all active:scale-90 shrink-0 disabled:opacity-30 bg-gray-800 hover:bg-purple-500/20 border-2 border-gray-700/30 hover:border-purple-500/40"
              aria-label="Generar imagen con IA"
              title="Generar imagen"
            >
              {isGeneratingImage ? (
                <Loader2 className="w-4 h-4 sm:w-5 sm:h-5 text-purple-400 animate-spin" />
              ) : (
                <Image className="w-4 h-4 sm:w-5 sm:h-5 text-purple-400" />
              )}
            </button>
          )}

          {/* Microphone — Slide-to-Lock + Auto-Send */}
          {speechSupported && (
            isLocked ? (
              /* LOCKED STATE — Send button (swipe down to cancel) */
              <motion.button
                key="mic-locked"
                type="button"
                onClick={handleLockedSend}
                onTouchStart={handleLockedTouchStart}
                onTouchMove={handleLockedTouchMove}
                onTouchEnd={handleLockedTouchEnd}
                onTouchCancel={handleLockedTouchEnd}
                onPointerDown={handleLockedPointerDown}
                onPointerMove={handleLockedPointerMove}
                onPointerUp={handleLockedPointerUp}
                onPointerCancel={handleLockedPointerUp}
                initial={{ scale: 0.5, opacity: 0 }}
                animate={{ scale: isSwipeCanceling ? 1.1 : 1, opacity: 1, backgroundColor: isSwipeCanceling ? '#ef4444' : '#059669' }}
                transition={{ type: 'spring', damping: 15, stiffness: 300 }}
                disabled={isLoading || isStreaming}
                className={`w-10 h-10 sm:w-[52px] sm:h-[52px] rounded-full shadow-xl flex items-center justify-center transition-all active:scale-90 shrink-0 select-none touch-none ${
                  isSwipeCanceling
                    ? 'bg-red-500 shadow-red-500/40'
                    : 'bg-emerald-600 hover:bg-emerald-500 shadow-emerald-500/40'
                }`}
                aria-label="Enviar mensaje de voz"
              >
                {isSwipeCanceling ? (
                  <X className="w-4 h-4 sm:w-6 sm:h-6 text-white" />
                ) : (
                  <Send className="w-4 h-4 sm:w-6 sm:h-6 text-white" />
                )}
              </motion.button>
            ) : (
              /* NORMAL STATE — Mic button (press & hold, slide up to lock) */
              <button
                key="mic-normal"
                type="button"
                // Touch events (mobile-first)
                onTouchStart={handleMicTouchStart}
                onTouchMove={handleMicTouchMove}
                onTouchEnd={handleMicTouchEnd}
                onTouchCancel={handleMicTouchEnd}
                // Pointer events (desktop fallback)
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

        {/* Suggestions — horizontal chips, scrollable, side by side */}
        <AnimatePresence>
          {suggestions.length > 0 && !isLoading && !isStreaming && !isLocked && showSuggestions && (
            <motion.div
              initial={{ opacity: 0, y: 6 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: 6 }}
              transition={{ type: 'spring', damping: 25, stiffness: 300 }}
              className="mt-2 mx-auto max-w-3xl"
            >
              <div className="flex items-center gap-2 overflow-x-auto pb-1 scrollbar-hide px-1" style={{ scrollbarWidth: 'none', msOverflowStyle: 'none' }}>
                {/* Visible suggestion chips (3 at a time) */}
                {suggestions.slice(suggestionOffset, suggestionOffset + 3).map((sug, i) => (
                  <motion.button
                    key={`${suggestionOffset}-${i}`}
                    initial={{ opacity: 0, x: 20, scale: 0.95 }}
                    animate={{ opacity: 1, x: 0, scale: 1 }}
                    transition={{ delay: i * 0.06, type: 'spring', damping: 25, stiffness: 300 }}
                    onClick={() => { setShowSuggestions(false); setSuggestions([]); sendMessage(sug); }}
                    className="shrink-0 text-left px-3 py-1.5 rounded-full bg-gray-800/60 border border-gray-700/25 text-[12px] text-gray-300 hover:text-emerald-400 hover:border-emerald-500/40 hover:bg-emerald-500/10 transition-all active:scale-95 whitespace-nowrap cursor-pointer max-w-[200px] truncate"
                  >
                    {sug}
                  </motion.button>
                ))}
                {/* More suggestions button */}
                {suggestions.length > 3 && (
                  <motion.button
                    key="more-sug"
                    initial={{ opacity: 0, scale: 0.8 }}
                    animate={{ opacity: 1, scale: 1 }}
                    transition={{ delay: 0.15, type: 'spring', damping: 25, stiffness: 300 }}
                    onClick={() => {
                      setSuggestionOffset((prev) => (prev + 3) % suggestions.length);
                    }}
                    className="shrink-0 flex items-center gap-1 px-2.5 py-1.5 rounded-full text-[11px] font-medium text-amber-400/80 hover:text-amber-400 bg-amber-500/10 border border-amber-500/20 hover:bg-amber-500/20 transition-all active:scale-95 cursor-pointer whitespace-nowrap"
                  >
                    <Wand2 className="w-3 h-3" />
                    Mas
                  </motion.button>
                )}
                {/* Regenerate suggestions */}
                <button
                  onClick={() => {
                    const lastBot = [...messages].reverse().find(m => m.role === 'assistant');
                    const lastUser = [...messages].reverse().find(m => m.role === 'user');
                    if (lastBot && lastUser) generateSuggestions(lastUser.content, lastBot.content);
                  }}
                  className="shrink-0 p-1.5 rounded-full text-gray-600 hover:text-emerald-400 hover:bg-emerald-500/10 transition-all active:scale-90 cursor-pointer"
                  title="Regenerar sugerencias"
                >
                  <RefreshCw className="w-3.5 h-3.5" />
                </button>
                {/* Close suggestions */}
                <button
                  onClick={() => { setShowSuggestions(false); setSuggestions([]); }}
                  className="shrink-0 p-1.5 rounded-full text-gray-600 hover:text-gray-300 hover:bg-gray-800/60 transition-all active:scale-90 cursor-pointer"
                  title="Ocultar sugerencias"
                >
                  <X className="w-3 h-3" />
                </button>
              </div>
            </motion.div>
          )}
        </AnimatePresence>

        {/* Document / Image attached chip */}
        <AnimatePresence>
          {(documentText || imageBase64) && (documentName || imageName) && !isAnalyzingDocument && (
            <motion.div
              initial={{ opacity: 0, y: -4 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -4 }}
              className="flex items-center gap-2 mt-2 px-3 py-1.5 rounded-lg bg-blue-500/10 border border-blue-500/20 max-w-[400px]"
            >
              {imageBase64 ? (
                <img src={imageBase64} alt="Preview" className="w-6 h-6 rounded object-cover shrink-0" />
              ) : (
                <FileText className="w-3.5 h-3.5 text-blue-400 shrink-0" />
              )}
              <span className="text-[11px] text-blue-300 truncate flex-1">
                {documentName || imageName}
              </span>
              <span className="text-[9px] text-blue-400/60 shrink-0">
                {imageBase64 ? 'Imagen' : 'Listo'}
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
          UNIFIED PAYWALL — Controlled modal, shown only on send attempt
          REGLA: showPaywallModal === true (triggered by send)
          - Guest (10 used): register CTA → get 20 extra/month
          - Logged-in no plan (20 used): plan selection modal
          - Logged-in with plan: paywall NEVER shows (hasActivePlan === true)
          - Close button returns to chat (user can read history)
          ==================================================================== */}
      {showPaywallModal && !isStreaming && !checkingPlan && (
        <>
          <div className="fixed inset-0 bg-black/70 backdrop-blur-sm z-50" onClick={() => setShowPaywallModal(false)} />
          <div className="fixed inset-x-4 top-1/2 -translate-y-1/2 z-50 max-w-sm mx-auto">
            <div className="bg-gray-900 border border-gray-700/50 rounded-2xl p-6 shadow-2xl">
              {/* Close button */}
              <div className="flex justify-end mb-1">
                <button
                  onClick={() => setShowPaywallModal(false)}
                  className="p-1.5 rounded-full hover:bg-gray-800 transition-colors"
                  aria-label="Cerrar"
                >
                  <X className="w-5 h-5 text-gray-400" />
                </button>
              </div>

              {/* Icon */}
              <div className="text-center mb-5">
                <div className="w-16 h-16 rounded-2xl flex items-center justify-center mx-auto mb-4 bg-gradient-to-br from-amber-500/20 to-amber-600/5 border border-amber-500/20">
                  <AlertTriangle className="w-8 h-8 text-amber-400" />
                </div>
                {!isAuthenticated ? (
                  <>
                    <h2 className="text-xl font-bold text-white">
                      Quieres mas respuestas?
                    </h2>
                    <p className="text-sm text-gray-400 mt-2 leading-relaxed">
                      Has usado tus {GUEST_FREE_MESSAGES} mensajes gratis. Registrate de forma gratuita y obtén <span className="text-emerald-400 font-semibold">20 respuestas extras al mes</span> de tu asesor Atlas.
                    </p>
                  </>
                ) : (
                  <>
                    <h2 className="text-xl font-bold text-white">
                      Selecciona un plan para continuar
                    </h2>
                    <p className="text-sm text-gray-400 mt-2 leading-relaxed">
                      Has utilizado tus {REGISTERED_FREE_MESSAGES} mensajes este mes. Activa una suscripcion para obtener respuestas ilimitadas.
                    </p>
                  </>
                )}
              </div>

              {/* Action Buttons */}
              <div className="space-y-3">
                {!isAuthenticated ? (
                  <a
                    href="/login"
                    className="w-full flex items-center justify-center gap-2 py-3 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white text-sm font-semibold transition-all active:scale-[0.98] shadow-lg shadow-emerald-500/15"
                  >
                    Registrate Gratis — Obten 20 Extra
                    <LogIn className="w-4 h-4" />
                  </a>
                ) : (
                  <button
                    onClick={() => { setShowPaywallModal(false); setShowSettings(true); }}
                    className="w-full flex items-center justify-center gap-2 py-3 rounded-xl bg-amber-500 hover:bg-amber-400 text-gray-950 text-sm font-bold transition-all active:scale-[0.98] shadow-lg shadow-amber-500/20"
                  >
                    <Settings className="w-4 h-4" />
                    Ver Planes
                  </button>
                )}
              </div>

              {/* Subtle close hint */}
              <p className="text-center text-[11px] text-gray-600 mt-4">
                Toca fuera o cierra para volver a tu historial
              </p>
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

      {/* ===== ATTACH PROMPT MODAL — Login / Plan required ===== */}
      <AnimatePresence>
        {showAttachPrompt && attachPromptType && (
          <>
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="fixed inset-0 bg-black/70 backdrop-blur-sm z-50"
              onClick={() => { setShowAttachPrompt(false); setAttachPromptType(null); }}
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
                <div className="flex justify-end mb-1">
                  <button
                    onClick={() => { setShowAttachPrompt(false); setAttachPromptType(null); }}
                    className="p-1.5 rounded-full hover:bg-gray-800 transition-colors"
                    aria-label="Cerrar"
                  >
                    <X className="w-5 h-5 text-gray-400" />
                  </button>
                </div>

                {/* Icon */}
                <div className="text-center mb-5">
                  <div className="w-16 h-16 rounded-2xl flex items-center justify-center mx-auto mb-4 bg-gradient-to-br from-blue-500/20 to-blue-600/5 border border-blue-500/20">
                    <Paperclip className="w-8 h-8 text-blue-400" />
                  </div>

                  {attachPromptType === 'login' && (
                    <>
                      <h2 className="text-xl font-bold text-white">
                        Registrate o inicia sesion
                      </h2>
                      <p className="text-sm text-gray-400 mt-2 leading-relaxed">
                        Para acceder a mejores beneficios como subir imagenes, analizar PDFs y mas, necesitas tener una cuenta.
                      </p>
                      <p className="text-sm text-emerald-400/80 mt-2">
                        Al registrarte obtienes <span className="font-semibold">20 mensajes gratis al mes</span>.
                      </p>
                    </>
                  )}

                  {attachPromptType === 'image' && (
                    <>
                      <h2 className="text-xl font-bold text-white">
                        Sube imagenes con Plan Basico
                      </h2>
                      <p className="text-sm text-gray-400 mt-2 leading-relaxed">
                        Para enviar imagenes y obtener respuestas visuales de Atlas, necesitas un <span className="text-emerald-400 font-semibold">Plan Basico o superior</span>.
                      </p>
                      <div className="space-y-1.5 mt-3 text-sm text-gray-400">
                        <div className="flex items-center gap-2">
                          <span className="text-emerald-400">{'\u2713'}</span>
                          <span>Sube imagenes y recibe respuestas visuales</span>
                        </div>
                        <div className="flex items-center gap-2">
                          <span className="text-emerald-400">{'\u2713'}</span>
                          <span>Mensajes ilimitados</span>
                        </div>
                        <div className="flex items-center gap-2">
                          <span className="text-emerald-400">{'\u2713'}</span>
                          <span>Genera hasta 20 imagenes al mes</span>
                        </div>
                      </div>
                    </>
                  )}

                  {attachPromptType === 'pdf' && (
                    <>
                      <h2 className="text-xl font-bold text-white">
                        Analiza PDFs con Plan Pro
                      </h2>
                      <p className="text-sm text-gray-400 mt-2 leading-relaxed">
                        Para adjuntar y analizar documentos PDF, necesitas el <span className="text-blue-400 font-semibold">Plan Pro (S/40)</span> o superior.
                      </p>
                      <div className="space-y-1.5 mt-3 text-sm text-gray-400">
                        <div className="flex items-center gap-2">
                          <span className="text-blue-400">{'\u2713'}</span>
                          <span>Extrae informacion clave de cualquier PDF</span>
                        </div>
                        <div className="flex items-center gap-2">
                          <span className="text-blue-400">{'\u2713'}</span>
                          <span>Analisis profundo de documentos</span>
                        </div>
                        <div className="flex items-center gap-2">
                          <span className="text-blue-400">{'\u2713'}</span>
                          <span>Preguntas basadas en el contenido</span>
                        </div>
                      </div>
                    </>
                  )}
                </div>

                {/* Action Buttons */}
                <div className="space-y-2">
                  {attachPromptType === 'login' ? (
                    <a
                      href="/login"
                      className="w-full flex items-center justify-center gap-2 py-3 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white text-sm font-semibold transition-all active:scale-[0.98] shadow-lg shadow-emerald-500/15"
                    >
                      Iniciar Sesion o Registrarse
                      <LogIn className="w-4 h-4" />
                    </a>
                  ) : (
                    <button
                      onClick={() => { setShowAttachPrompt(false); setAttachPromptType(null); setShowSettings(true); }}
                      className="w-full flex items-center justify-center gap-2 py-3 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white text-sm font-semibold transition-all active:scale-[0.98] shadow-lg shadow-emerald-500/15"
                    >
                      <Settings className="w-4 h-4" />
                      Ver Planes Disponibles
                    </button>
                  )}
                  <button
                    onClick={() => { setShowAttachPrompt(false); setAttachPromptType(null); }}
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

      {/* ===== NUMBER PICKER POPUP ===== */}
      <AnimatePresence>
        {showNumberPicker && (
          <>
            <div className="fixed inset-0 z-[60]" onClick={() => { setShowNumberPicker(null); setSelectedText(''); window.getSelection()?.removeAllRanges(); }} />
            <motion.div
              initial={{ opacity: 0, scale: 0.9 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.9 }}
              className="fixed z-[70] bg-gray-900 border border-gray-700/50 rounded-xl p-3 shadow-2xl max-w-[200px]"
              style={{
                top: Math.min(showNumberPicker.rect.top - 10, window.innerHeight - 300),
                left: Math.max(10, Math.min(showNumberPicker.rect.left, window.innerWidth - 210)),
              }}
            >
              <p className="text-[11px] text-gray-400 mb-2 font-medium">Selecciona un numero</p>
              <div className="grid grid-cols-5 gap-1 max-h-[200px] overflow-y-auto">
                {Array.from({ length: 20 }, (_, i) => i + 1).map(n => {
                  const used = highlights.some(h => h.number === n && h.messageId !== showNumberPicker.messageId);
                  const currentMsgUsed = highlights.some(h => h.number === n && h.messageId === showNumberPicker.messageId);
                  return (
                    <button
                      key={n}
                      onClick={() => !used && addHighlight(n)}
                      disabled={used}
                      className={`w-8 h-8 rounded-lg text-[12px] font-bold transition-all ${
                        currentMsgUsed
                          ? 'bg-amber-500/30 border border-amber-500/50 text-amber-400'
                          : used
                            ? 'bg-gray-800/30 text-gray-600 cursor-not-allowed'
                            : 'bg-gray-800/60 text-gray-300 hover:bg-amber-500/20 hover:text-amber-400 hover:border-amber-500/30 border border-transparent'
                      }`}
                    >
                      {n}
                    </button>
                  );
                })}
              </div>
              {selectedText && (
                <p className="text-[9px] text-gray-600 mt-2 line-clamp-2 italic">
                  &quot;{selectedText.substring(0, 80)}{selectedText.length > 80 ? '...' : ''}&quot;
                </p>
              )}
            </motion.div>
          </>
        )}
      </AnimatePresence>

      {/* ===== FAVORITES MODAL ===== */}
      <AnimatePresence>
        {showFavoritesModal && (
          <>
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="fixed inset-0 bg-black/70 backdrop-blur-sm z-50"
              onClick={() => setShowFavoritesModal(false)}
            />
            <motion.div
              initial={{ opacity: 0, y: 40 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: 40 }}
              transition={{ type: 'spring', damping: 25, stiffness: 300 }}
              className="fixed inset-x-4 bottom-4 top-auto z-50 max-w-sm mx-auto max-h-[70vh] flex flex-col"
            >
              <div className="bg-gray-900 border border-gray-700/50 rounded-2xl shadow-2xl flex flex-col max-h-[70vh]">
                {/* Header */}
                <div className="flex items-center justify-between p-4 border-b border-gray-800/40 shrink-0">
                  <div className="flex items-center gap-2">
                    <Star className="w-4 h-4 text-amber-400 fill-amber-400" />
                    <h2 className="text-sm font-semibold text-white">Mis Destacados</h2>
                  </div>
                  <button
                    onClick={() => setShowFavoritesModal(false)}
                    className="p-1.5 rounded-full hover:bg-gray-800 transition-colors"
                  >
                    <X className="w-4 h-4 text-gray-400" />
                  </button>
                </div>

                {/* Tabs */}
                <div className="flex border-b border-gray-800/40 shrink-0">
                  <button
                    onClick={() => setFavoritesTab('favorites')}
                    className={`flex-1 py-2.5 text-[12px] font-semibold transition-all ${
                      favoritesTab === 'favorites'
                        ? 'text-amber-400 border-b-2 border-amber-400'
                        : 'text-gray-500 hover:text-gray-300'
                    }`}
                  >
                    <Star className="w-3 h-3 inline mr-1" />
                    Favoritos ({favoriteSessions.length + favoriteMessageIds.size})
                  </button>
                  <button
                    onClick={() => setFavoritesTab('numbers')}
                    className={`flex-1 py-2.5 text-[12px] font-semibold transition-all ${
                      favoritesTab === 'numbers'
                        ? 'text-amber-400 border-b-2 border-amber-400'
                        : 'text-gray-500 hover:text-gray-300'
                    }`}
                  >
                    <Hash className="w-3 h-3 inline mr-1" />
                    Numeros ({highlights.length})
                  </button>
                </div>

                {/* Content */}
                <div className="flex-1 overflow-y-auto p-3 space-y-2">
                  {favoritesTab === 'favorites' ? (
                    (favoriteSessions.length === 0 && favoriteMessageIds.size === 0) ? (
                      <div className="text-center py-8">
                        <Star className="w-8 h-8 text-gray-700 mx-auto mb-2" />
                        <p className="text-xs text-gray-500">Sin favoritos</p>
                        <p className="text-[10px] text-gray-600 mt-1">Toca la estrella en cualquier mensaje o conversacion</p>
                      </div>
                    ) : (
                      <>
                        {/* Favorited messages */}
                        {favoriteMessageIds.size > 0 && (
                          <div className="space-y-1.5">
                            <p className="text-[10px] font-semibold text-gray-500 uppercase tracking-wider px-1">Mensajes destacados</p>
                            {[...favoriteMessageIds].map(msgId => {
                              const msg = messages.find(m => m.id === msgId);
                              if (!msg) return null;
                              return (
                                <div
                                  key={msgId}
                                  className="p-2.5 rounded-xl bg-gray-800/40 border border-gray-700/30 group"
                                >
                                  <div
                                    className="flex items-start gap-2 cursor-pointer"
                                    onClick={() => scrollToMessage(msgId)}
                                  >
                                    <Star className="w-3.5 h-3.5 text-amber-400 fill-amber-400 shrink-0 mt-0.5" />
                                    <p className="text-[12px] text-gray-300 leading-relaxed line-clamp-3">{msg.content.substring(0, 150)}{msg.content.length > 150 ? '...' : ''}</p>
                                  </div>
                                  <div className="flex items-center justify-between mt-1.5 ml-5.5">
                                    <span className="text-[9px] text-gray-600">{formatTime(msg.timestamp)}</span>
                                    <div className="flex items-center gap-1">
                                      <button
                                        onClick={() => scrollToMessage(msgId)}
                                        className="p-1 rounded hover:bg-emerald-500/10 transition-colors"
                                        title="Ir al chat"
                                      >
                                        <Send className="w-2.5 h-2.5 text-gray-500 hover:text-emerald-400" />
                                      </button>
                                      <button
                                        onClick={() => {
                                          navigator.clipboard.writeText(msg.content).catch(() => {});
                                        }}
                                        className="p-1 rounded hover:bg-blue-500/10 transition-colors"
                                        title="Copiar texto"
                                      >
                                        <Copy className="w-2.5 h-2.5 text-gray-500 hover:text-blue-400" />
                                      </button>
                                      <button
                                        onClick={() => toggleFavoriteMessage(msgId)}
                                        className="p-1 rounded hover:bg-red-500/10 transition-colors"
                                        title="Quitar de favoritos"
                                      >
                                        <X className="w-2.5 h-2.5 text-gray-500 hover:text-red-400" />
                                      </button>
                                    </div>
                                  </div>
                                </div>
                              );
                            })}
                          </div>
                        )}
                        {/* Favorited sessions */}
                        {favoriteSessions.length > 0 && (
                          <div className="space-y-1.5">
                            <p className="text-[10px] font-semibold text-gray-500 uppercase tracking-wider px-1 pt-1">Chats favoritos</p>
                            {favoriteSessions.map(fav => (
                              <div
                                key={fav.sessionId}
                                className="flex items-center p-3 rounded-xl bg-gray-800/40 border border-gray-700/30 hover:border-gray-600/40 transition-all group"
                              >
                                <Star className="w-4 h-4 text-amber-400 fill-amber-400 shrink-0 mr-2.5" />
                                <div
                                  className="flex-1 min-w-0 cursor-pointer"
                                  onClick={() => {
                                    loadSession(fav.sessionId);
                                    setShowFavoritesModal(false);
                                  }}
                                >
                                  <p className="text-[13px] text-gray-200 truncate font-medium">{fav.title}</p>
                                  <p className="text-[10px] text-gray-500 mt-0.5">{fav.messageCount} mensajes</p>
                                </div>
                                <div className="flex items-center gap-0.5 shrink-0">
                                  <button
                                    onClick={() => {
                                      loadSession(fav.sessionId);
                                      setShowFavoritesModal(false);
                                    }}
                                    className="p-1.5 rounded-lg hover:bg-emerald-500/10 transition-colors"
                                    title="Reaccionar chat"
                                  >
                                    <MessageSquare className="w-3.5 h-3.5 text-gray-500 hover:text-emerald-400" />
                                  </button>
                                  <button
                                    onClick={() => {
                                      navigator.clipboard.writeText(fav.title).catch(() => {});
                                    }}
                                    className="p-1.5 rounded-lg hover:bg-blue-500/10 transition-colors"
                                    title="Copiar titulo"
                                  >
                                    <Copy className="w-3.5 h-3.5 text-gray-500 hover:text-blue-400" />
                                  </button>
                                  <button
                                    onClick={() => toggleFavoriteSession(fav.sessionId, fav.title, fav.messageCount)}
                                    className="p-1.5 rounded-lg hover:bg-red-500/10 transition-colors"
                                    title="Quitar de favoritos"
                                  >
                                    <X className="w-3.5 h-3.5 text-gray-500 hover:text-red-400" />
                                  </button>
                                </div>
                              </div>
                            ))}
                          </div>
                        )}
                      </>
                    )
                  ) : (
                    highlights.length === 0 ? (
                      <div className="text-center py-8">
                        <Hash className="w-8 h-8 text-gray-700 mx-auto mb-2" />
                        <p className="text-xs text-gray-500">Sin textos numerados</p>
                        <p className="text-[10px] text-gray-600 mt-1">Selecciona texto en una respuesta y ponle un numero</p>
                      </div>
                    ) : (
                      highlights.sort((a, b) => a.number - b.number).map(hl => (
                        <div
                          key={hl.id}
                          className="p-3 rounded-xl bg-gray-800/40 border border-gray-700/30 cursor-pointer hover:border-gray-600/40 transition-all"
                          onClick={() => scrollToMessage(hl.messageId)}
                        >
                          <div className="flex items-center justify-between mb-1.5">
                            <span className="inline-flex items-center justify-center w-5 h-5 rounded-full bg-amber-500/20 border border-amber-500/40 text-[9px] font-bold text-amber-400">
                              {hl.number}
                            </span>
                            <div className="flex items-center gap-0.5">
                              <button
                                onClick={(e) => { e.stopPropagation(); scrollToMessage(hl.messageId); }}
                                className="p-1 rounded hover:bg-emerald-500/10 transition-colors"
                                title="Ir al chat"
                              >
                                <Send className="w-2.5 h-2.5 text-gray-500 hover:text-emerald-400" />
                              </button>
                              <button
                                onClick={(e) => { e.stopPropagation(); navigator.clipboard.writeText(hl.text).catch(() => {}); }}
                                className="p-1 rounded hover:bg-blue-500/10 transition-colors"
                                title="Copiar texto"
                              >
                                <Copy className="w-2.5 h-2.5 text-gray-500 hover:text-blue-400" />
                              </button>
                              <button
                                onClick={(e) => { e.stopPropagation(); removeHighlight(hl.id); }}
                                className="p-1 rounded hover:bg-red-500/10 transition-colors"
                                title="Eliminar"
                              >
                                <X className="w-3 h-3 text-gray-500 hover:text-red-400" />
                              </button>
                            </div>
                          </div>
                          <p className="text-[12px] text-gray-300 leading-relaxed line-clamp-3">{hl.text}</p>
                        </div>
                      ))
                    )
                  )}
                </div>
              </div>
            </motion.div>
          </>
        )}
      </AnimatePresence>

      {/* ===== PWA INSTALL PROMPT ===== */}
      <InstallPrompt trigger={showInstallPrompt} />

      {/* Buy Images Modal */}
      <BuyImagesModal
        isOpen={showBuyImagesModal}
        onClose={() => setShowBuyImagesModal(false)}
        yapeNumber="Fabio Herrera"
        onPaymentConfirmed={handleImagePaymentConfirmed}
      />
    </div>
  );
}
