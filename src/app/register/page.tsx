'use client';

import { useState } from 'react';
import { motion } from 'framer-motion';
import { Eye, EyeOff, Mail, Lock, User, Loader2, ArrowRight } from 'lucide-react';
import Link from 'next/link';
import { auth, googleProvider } from '@/lib/firebase';
import { signInWithPopup } from 'firebase/auth';

// ========================================
// REGISTER PAGE — /register
// Mobile First, Dark Theme, Emerald Accent
// ========================================

export default function RegisterPage() {
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [googleLoading, setGoogleLoading] = useState(false);
  const [error, setError] = useState('');

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');

    if (password !== confirmPassword) {
      setError('Las contrasenas no coinciden');
      return;
    }

    if (password.length < 6) {
      setError('La contrasena debe tener al menos 6 caracteres');
      return;
    }

    setIsLoading(true);

    try {
      const res = await fetch('/api/auth/register', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, password, name }),
      });

      const data = await res.json();

      if (!res.ok) {
        setError(data.error || 'Error desconocido');
        return;
      }

      // Guardar sesion y redirigir al chat
      localStorage.setItem('atlas_token', data.token);
      localStorage.setItem('atlas_tenant_id', data.tenantId);
      localStorage.setItem('atlas_user', JSON.stringify(data.user));

      window.location.href = '/';
    } catch {
      setError('Error de conexion. Intenta de nuevo.');
    } finally {
      setIsLoading(false);
    }
  };

  const handleGoogleAuth = async () => {
    setGoogleLoading(true);
    setError('');
    try {
      // Firebase Google Sign-In (popup - no redirect needed)
      const result = await signInWithPopup(auth, googleProvider);
      const idToken = await result.user.getIdToken();

      if (!idToken) {
        setError('No se obtuvo el token de Firebase. Intenta de nuevo.');
        return;
      }

      // Exchange Firebase token for Turso auth token
      const res = await fetch('/api/auth/firebase-sync', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ idToken }),
      });

      const data = await res.json();

      if (!res.ok) {
        const errorMsg = data.error || 'Error al autenticar con Google';
        setError(errorMsg);
        console.error('[GOOGLE_AUTH] Error:', res.status, errorMsg, data);
        return;
      }

      // Save session and redirect to chat
      localStorage.setItem('atlas_token', data.token);
      localStorage.setItem('atlas_tenant_id', data.tenantId);
      localStorage.setItem('atlas_user', JSON.stringify(data.user));

      window.location.href = '/';
    } catch (err: any) {
      console.error('[GOOGLE_AUTH]', err);
      if (err?.code === 'auth/popup-closed-by-user') {
        return;
      }
      if (err?.code === 'auth/cancelled-popup-request') {
        return;
      }
      setError('Error de conexion con Google. Intenta de nuevo.');
    } finally {
      setGoogleLoading(false);
    }
  };

  return (
    <div className="flex flex-col items-center justify-center min-h-dvh bg-gray-950 px-6">
      {/* Background gradient effect */}
      <div className="fixed inset-0 overflow-hidden pointer-events-none">
        <div className="absolute top-[-50%] left-[-20%] w-[80%] h-[80%] rounded-full bg-emerald-500/5 blur-3xl" />
        <div className="absolute bottom-[-40%] right-[-20%] w-[70%] h-[70%] rounded-full bg-emerald-600/3 blur-3xl" />
      </div>

      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.4, ease: 'easeOut' }}
        className="relative w-full max-w-sm"
      >
        {/* Logo & Title */}
        <div className="text-center mb-8">
          <Link href="/" className="inline-block">
            <motion.div
              initial={{ scale: 0.8 }}
              animate={{ scale: 1 }}
              transition={{ delay: 0.1, type: 'spring', stiffness: 200 }}
              className="w-20 h-20 rounded-2xl bg-gradient-to-br from-emerald-500/20 to-emerald-600/5 flex items-center justify-center mx-auto mb-5 border border-emerald-500/20"
            >
              <span className="text-4xl">{'\uD83E\uDDED'}</span>
            </motion.div>
          </Link>
          <h1 className="text-2xl font-bold text-white tracking-tight">
            Crear Cuenta
          </h1>
          <p className="text-sm text-gray-500 mt-1">
            Registrate en Atlas para guardar tu progreso
          </p>
        </div>

        {/* Form Card */}
        <div className="bg-gray-900/80 backdrop-blur-md rounded-2xl border border-gray-800/50 p-6 shadow-2xl">
          {/* Google Button */}
          <button
            onClick={handleGoogleAuth}
            disabled={googleLoading}
            className="w-full flex items-center justify-center gap-3 py-3 px-4 rounded-xl bg-white/5 border border-gray-700/50 text-white text-sm font-medium hover:bg-white/10 transition-all mb-4 active:scale-[0.98] disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {googleLoading ? (
              <Loader2 className="w-5 h-5 animate-spin" />
            ) : (
              <svg className="w-5 h-5" viewBox="0 0 24 24">
                <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92a5.06 5.06 0 0 1-2.2 3.32v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.1z" />
                <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" />
                <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" />
                <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" />
              </svg>
            )}
            {googleLoading ? 'Conectando con Google...' : 'Registrarse con Google'}
          </button>

          {/* Divider */}
          <div className="flex items-center gap-3 mb-5">
            <div className="flex-1 h-px bg-gray-800" />
            <span className="text-xs text-gray-600 uppercase tracking-wider">o</span>
            <div className="flex-1 h-px bg-gray-800" />
          </div>

          {/* Form */}
          <form onSubmit={handleSubmit} className="space-y-4">
            {/* Name */}
            <div className="relative">
              <User className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-500" />
              <input
                type="text"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="Tu nombre"
                className="w-full bg-gray-800/50 border border-gray-700/50 rounded-xl pl-11 pr-4 py-3 text-sm text-white placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-emerald-500/30 focus:border-emerald-500/30 transition-all"
                required
              />
            </div>

            {/* Email */}
            <div className="relative">
              <Mail className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-500" />
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="Email"
                className="w-full bg-gray-800/50 border border-gray-700/50 rounded-xl pl-11 pr-4 py-3 text-sm text-white placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-emerald-500/30 focus:border-emerald-500/30 transition-all"
                autoComplete="email"
                required
              />
            </div>

            {/* Password */}
            <div className="relative">
              <Lock className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-500" />
              <input
                type={showPassword ? 'text' : 'password'}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="Contrasena"
                className="w-full bg-gray-800/50 border border-gray-700/50 rounded-xl pl-11 pr-12 py-3 text-sm text-white placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-emerald-500/30 focus:border-emerald-500/30 transition-all"
                autoComplete="new-password"
                required
              />
              <button
                type="button"
                onClick={() => setShowPassword(!showPassword)}
                className="absolute right-3 top-1/2 -translate-y-1/2 p-1 text-gray-500 hover:text-gray-300 transition-colors"
                aria-label={showPassword ? 'Ocultar contrasena' : 'Mostrar contrasena'}
              >
                {showPassword ? (
                  <EyeOff className="w-4 h-4" />
                ) : (
                  <Eye className="w-4 h-4" />
                )}
              </button>
            </div>

            {/* Confirm Password */}
            <div className="relative">
              <Lock className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-500" />
              <input
                type={showPassword ? 'text' : 'password'}
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                placeholder="Confirmar contrasena"
                className="w-full bg-gray-800/50 border border-gray-700/50 rounded-xl pl-11 pr-4 py-3 text-sm text-white placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-emerald-500/30 focus:border-emerald-500/30 transition-all"
                autoComplete="new-password"
                required
              />
            </div>

            {/* Error message */}
            {error && (
              <motion.div
                initial={{ opacity: 0, y: -4 }}
                animate={{ opacity: 1, y: 0 }}
                className="text-xs text-red-400 bg-red-500/10 border border-red-500/20 rounded-lg px-3 py-2"
              >
                {error}
              </motion.div>
            )}

            {/* Submit */}
            <button
              type="submit"
              disabled={isLoading || !email || !password || !name || !confirmPassword}
              className="w-full flex items-center justify-center gap-2 py-3 rounded-xl bg-emerald-600 hover:bg-emerald-500 disabled:bg-gray-700/50 disabled:opacity-40 text-white text-sm font-semibold transition-all active:scale-[0.98] shadow-lg shadow-emerald-500/15"
            >
              {isLoading ? (
                <Loader2 className="w-4 h-4 animate-spin" />
              ) : (
                <>
                  Crear Cuenta
                  <ArrowRight className="w-4 h-4" />
                </>
              )}
            </button>
          </form>

          {/* Footer link */}
          <p className="text-center text-xs text-gray-600 mt-5">
            Ya tienes cuenta?{' '}
            <Link
              href="/login"
              className="text-emerald-400 hover:text-emerald-300 font-medium"
            >
              Inicia sesion
            </Link>
          </p>
        </div>

        {/* Back to chat */}
        <div className="text-center mt-6">
          <Link
            href="/"
            className="text-xs text-gray-500 hover:text-gray-400 transition-colors"
          >
            Volver al chat
          </Link>
        </div>

        {/* Terms */}
        <p className="text-center text-[10px] text-gray-700 mt-4">
          Al continuar, aceptas los terminos de uso y politica de privacidad
        </p>
      </motion.div>
    </div>
  );
}
