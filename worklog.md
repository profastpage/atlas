---
Task ID: 1
Agent: Main Agent
Task: Clone Atlas repo, add PWA install in settings, Firebase Google Auth, fix voice notes

Work Log:
- Cloned https://github.com/profastpage/atlas.git to /home/z/my-project/atlas-project
- Analyzed full project structure (Next.js 16, Turso DB, Supabase OAuth, PWA)
- Installed firebase package (v12.12.1)
- Created src/lib/firebase.ts with Firebase config and Google Auth provider
- Created /api/auth/firebase-sync route (Edge-compatible, verifies Firebase ID token via REST API)
- Updated SettingsSidebar.tsx: Added PWA install card with beforeinstallprompt listener
- Updated login/page.tsx: Replaced Supabase OAuth with Firebase signInWithPopup
- Updated register/page.tsx: Replaced Supabase OAuth with Firebase signInWithPopup
- Updated page.tsx main init: Replaced Supabase onAuthStateChanged with Firebase onAuthStateChanged
- Fixed voice notes in page.tsx: Word-level dedup, sendingVoiceRef lock, 1000ms restart debounce, maxAlternatives=1
- Git commit 377159d pushed to main

Stage Summary:
- All 3 features implemented: PWA install button, Firebase Google Auth, voice fix
- No TypeScript errors in modified files
- Changes pushed to https://github.com/profastpage/atlas.git (main branch)
