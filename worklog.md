---
Task ID: 1
Agent: main
Task: Complete Atlas FASE 2 — Admin Panel + Subscription Plans + verify deployment

Work Log:
- Verified current git state: commit 1d4f9d2 already replaced Prisma with libsql, bundle 2.8MB
- Installed npm dependencies (464 packages)
- Built for Cloudflare Pages: 8 Edge Functions, 38 prerendered routes, bundle 2.85 MiB
- Verified all 12 DB tables exist in Turso: Tenant, Session, Message, UserMemory, AuthUser, AuthToken, SubscriptionPlan, Subscription, Payment, ApiUsage, CostMetric, AppConfig
- Verified admin user (admin@atlas.app) and 3 subscription plans seeded in DB
- Added admin API endpoints to existing /api route (zero new functions):
  ?action=metrics, ?action=users, ?action=plans, ?action=config, ?action=subscription
- Created /admin page with login, dashboard metrics, user management, plan display, config viewer
- Updated SettingsSidebar with expandable subscription plans and admin link
- Updated page.tsx to navigate to /admin from settings
- Final bundle: 2.85 MiB (under 3 MiB Cloudflare limit, 152KB headroom)
- Git commit 97907dc pushed to origin/main

Stage Summary:
- All FASE 2 features re-implemented in lightweight form
- Bundle size maintained under 3 MiB Cloudflare Pages limit
- No new Edge Functions created (admin endpoints merged into existing /api route)
- Admin Panel at /admin, Login at /login, Register at /register
- DB fully seeded with plans and admin user
