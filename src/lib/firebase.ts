// ========================================
// FIREBASE CONFIGURATION — Google Auth
// Client-side initialization
// ========================================

import { initializeApp, getApps } from 'firebase/app';
import { getAuth, GoogleAuthProvider } from 'firebase/auth';

const firebaseConfig = {
  apiKey: "AIzaSyA3INDSDZ7Ab5SsG4Uu9YHG7cCMG1mpcLg",
  authDomain: "asistente-ia-atlas-23dac.firebaseapp.com",
  projectId: "asistente-ia-atlas-23dac",
  storageBucket: "asistente-ia-atlas-23dac.firebasestorage.app",
  messagingSenderId: "163630435096",
  appId: "1:163630435096:web:fd0bf81409b0b92eddec6d"
};

// Initialize Firebase (prevent re-initialization in dev)
const app = getApps().length === 0 ? initializeApp(firebaseConfig) : getApps()[0];

export const auth = getAuth(app);
export const googleProvider = new GoogleAuthProvider();

// Configure Google provider with additional scopes
googleProvider.addScope('email');
googleProvider.addScope('profile');

export default app;
