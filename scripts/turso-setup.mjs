import { createClient } from '@libsql/client';

const url = 'libsql://asistente-ia-fast-page-pro.aws-us-east-1.turso.io';
const token = 'eyJhbGciOiJFZERTQSIsInR5cCI6IkpXVCJ9.eyJhIjoicnciLCJpYXQiOjE3NzY3NDk5OTIsImlkIjoiMDE5ZGFlOGMtNDIwMS03ODM0LWIxYmYtZTVjN2ZmNTRlZjc5IiwicmlkIjoiMjI1OTIzNTEtZjYyMy00YjE5LWFlOGYtNzM3ZTJjOTMyNjZmIn0._-eX8wORBBC7rVg3Hhr2_xWub95l96762o2KfmfS7RcrhW765sOCLURgRdYC6KMA_bR7UuubpirucD1vD3cmCg';

const db = createClient({ url, authToken: token });

async function hashPassword(password) {
  const encoder = new TextEncoder();
  const salt = crypto.getRandomValues(new Uint8Array(16));
  const keyMaterial = await crypto.subtle.importKey('raw', encoder.encode(password), 'PBKDF2', false, ['deriveBits']);
  const derivedBits = await crypto.subtle.deriveBits({ name: 'PBKDF2', salt, iterations: 100000, hash: 'SHA-256' }, keyMaterial, 256);
  const saltB64 = btoa(String.fromCharCode(...salt));
  const hashB64 = btoa(String.fromCharCode(...new Uint8Array(derivedBits)));
  return `${saltB64}:${hashB64}`;
}

async function run() {
  console.log('=== Creating Turso tables ===');

  // Add isAdmin column to AuthUser if it doesn't exist
  try {
    await db.execute(`ALTER TABLE AuthUser ADD COLUMN isAdmin BOOLEAN NOT NULL DEFAULT 0`);
    console.log('Added isAdmin column to AuthUser');
  } catch (e) {
    console.log('isAdmin column likely already exists:', e.message?.substring(0, 60));
  }

  const tables = [
    `CREATE TABLE IF NOT EXISTS SubscriptionPlan (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      price REAL NOT NULL,
      currency TEXT NOT NULL DEFAULT 'PEN',
      maxMessages INTEGER NOT NULL DEFAULT 100,
      features TEXT NOT NULL DEFAULT '[]',
      isActive INTEGER NOT NULL DEFAULT 1,
      sortOrder INTEGER NOT NULL DEFAULT 0,
      createdAt TEXT NOT NULL DEFAULT (datetime('now')),
      updatedAt TEXT NOT NULL DEFAULT (datetime('now'))
    )`,
    `CREATE TABLE IF NOT EXISTS Subscription (
      id TEXT PRIMARY KEY,
      tenantId TEXT NOT NULL UNIQUE,
      planId TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'free',
      startDate TEXT NOT NULL DEFAULT (datetime('now')),
      endDate TEXT NOT NULL,
      autoRenew INTEGER NOT NULL DEFAULT 0,
      createdAt TEXT NOT NULL DEFAULT (datetime('now')),
      updatedAt TEXT NOT NULL DEFAULT (datetime('now')),
      FOREIGN KEY (tenantId) REFERENCES Tenant(id) ON DELETE CASCADE,
      FOREIGN KEY (planId) REFERENCES SubscriptionPlan(id)
    )`,
    `CREATE TABLE IF NOT EXISTS Payment (
      id TEXT PRIMARY KEY,
      tenantId TEXT NOT NULL,
      subscriptionId TEXT NOT NULL,
      amount REAL NOT NULL,
      currency TEXT NOT NULL DEFAULT 'PEN',
      status TEXT NOT NULL DEFAULT 'pending',
      method TEXT NOT NULL DEFAULT 'manual',
      reference TEXT NOT NULL DEFAULT '',
      createdAt TEXT NOT NULL DEFAULT (datetime('now')),
      FOREIGN KEY (subscriptionId) REFERENCES Subscription(id)
    )`,
    `CREATE TABLE IF NOT EXISTS ApiUsage (
      id TEXT PRIMARY KEY,
      tenantId TEXT NOT NULL,
      type TEXT NOT NULL,
      tokensIn INTEGER NOT NULL DEFAULT 0,
      tokensOut INTEGER NOT NULL DEFAULT 0,
      costUsd REAL NOT NULL DEFAULT 0,
      createdAt TEXT NOT NULL DEFAULT (datetime('now'))
    )`,
    `CREATE TABLE IF NOT EXISTS CostMetric (
      id TEXT PRIMARY KEY,
      category TEXT NOT NULL,
      description TEXT NOT NULL,
      amountUsd REAL NOT NULL,
      month TEXT NOT NULL,
      createdAt TEXT NOT NULL DEFAULT (datetime('now'))
    )`,
    `CREATE TABLE IF NOT EXISTS AppConfig (
      id TEXT PRIMARY KEY DEFAULT 'global',
      key TEXT NOT NULL UNIQUE,
      value TEXT NOT NULL DEFAULT '',
      updatedAt TEXT NOT NULL DEFAULT (datetime('now'))
    )`,
  ];

  for (const sql of tables) {
    try {
      await db.execute(sql);
      console.log('Table created');
    } catch (e) {
      console.log('Error:', e.message?.substring(0, 100));
    }
  }

  console.log('\n=== Seeding data ===');

  // Seed subscription plans
  const plans = [
    { id: 'plan_basico', name: 'Basico', price: 20, maxMessages: 200, features: JSON.stringify(['Chat con Atlas', 'Historial de sesiones', '200 mensajes/mes']), sortOrder: 1 },
    { id: 'plan_profesional', name: 'Profesional', price: 40, maxMessages: 1000, features: JSON.stringify(['Todo lo de Basico', 'Memoria contextual avanzada', '1000 mensajes/mes', 'Soporte prioritario']), sortOrder: 2 },
    { id: 'plan_elite', name: 'Elite', price: 60, maxMessages: -1, features: JSON.stringify(['Todo lo de Profesional', 'Mensajes ilimitados', 'Acceso anticipado', 'API access', 'Soporte dedicado']), sortOrder: 3 },
  ];

  for (const p of plans) {
    await db.execute({
      sql: `INSERT OR IGNORE INTO SubscriptionPlan (id, name, price, currency, maxMessages, features, isActive, sortOrder) VALUES (?, ?, ?, 'PEN', ?, ?, 1, ?)`,
      args: [p.id, p.name, p.price, p.maxMessages, p.features, p.sortOrder],
    });
    console.log(`  Plan seeded: ${p.name}`);
  }

  // Seed admin user
  const adminEmail = 'admin@atlas.app';
  const adminPasswordHash = await hashPassword('Admin@123');
  const now = new Date().toISOString();

  const existing = await db.execute({ sql: `SELECT id FROM AuthUser WHERE email = ?`, args: [adminEmail] });
  if (existing.rows.length === 0) {
    await db.execute({ sql: `INSERT INTO Tenant (id, createdAt, updatedAt) VALUES (?, ?, ?)`, args: ['tenant_admin', now, now] });
    await db.execute({
      sql: `INSERT INTO AuthUser (id, email, passwordHash, name, isAdmin, tenantId, createdAt, updatedAt) VALUES (?, ?, ?, ?, 1, ?, ?, ?)`,
      args: ['user_admin', adminEmail, adminPasswordHash, 'Atlas Admin', 'tenant_admin', now, now],
    });
    console.log('  Admin user created');
  } else {
    await db.execute({ sql: `UPDATE AuthUser SET isAdmin = 1 WHERE email = ?`, args: [adminEmail] });
    console.log('  Admin user updated');
  }

  // Seed app config
  const configs = [
    { key: 'app_name', value: 'Atlas IA' },
    { key: 'app_description', value: 'Asistente inteligente de salud mental' },
    { key: 'maintenance_mode', value: 'false' },
    { key: 'max_free_messages', value: '50' },
    { key: 'stripe_public_key', value: '' },
    { key: 'stripe_secret_key', value: '' },
    { key: 'welcome_message', value: 'Hola! Soy Atlas, tu asistente de bienestar. En que puedo ayudarte hoy?' },
  ];

  for (const c of configs) {
    await db.execute({
      sql: `INSERT OR IGNORE INTO AppConfig (id, key, value, updatedAt) VALUES (?, ?, ?, ?)`,
      args: ['global', c.key, c.value, now],
    });
    console.log(`  Config seeded: ${c.key}`);
  }

  console.log('\n=== All done! ===');
}

run().catch(console.error);
