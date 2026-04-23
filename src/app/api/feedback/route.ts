// ========================================
// FEEDBACK API — Like/Dislike con almacenamiento persistente
// Permite mejorar el bot analizando patrones de respuestas buenas/malas
// ========================================

export const runtime = 'edge';

import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/sql';

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { messageId, type, content, sessionId } = body;

    if (!messageId || !type || !sessionId) {
      return NextResponse.json(
        { error: 'Faltan campos requeridos: messageId, type, sessionId' },
        { status: 400 }
      );
    }

    if (type !== 'up' && type !== 'down') {
      return NextResponse.json(
        { error: 'type debe ser "up" o "down"' },
        { status: 400 }
      );
    }

    // Crear tabla si no existe (idempotente)
    try {
      await db.execute(`
        CREATE TABLE IF NOT EXISTS Feedback (
          id TEXT PRIMARY KEY,
          messageId TEXT NOT NULL,
          sessionId TEXT NOT NULL,
          type TEXT NOT NULL CHECK(type IN ('up', 'down')),
          content TEXT,
          createdAt TEXT NOT NULL
        )
      `);
      // Indice para consultas rapidas
      await db.execute(`
        CREATE INDEX IF NOT EXISTS idx_feedback_type ON Feedback(type)
      `);
      await db.execute(`
        CREATE INDEX IF NOT EXISTS idx_feedback_session ON Feedback(sessionId)
      `);
    } catch {
      // Tabla ya existe, continuar
    }

    // Check if feedback already exists for this message (toggle)
    let existing: any = null;
    try {
      const result = await db.execute({
        sql: 'SELECT id, type FROM Feedback WHERE messageId = ?',
        args: [messageId],
      });
      existing = result.rows[0] || null;
    } catch {}

    if (existing) {
      if (existing.type === type) {
        // Same feedback — remove it (toggle off)
        await db.execute({
          sql: 'DELETE FROM Feedback WHERE messageId = ?',
          args: [messageId],
        });
        return NextResponse.json({ action: 'removed', type });
      } else {
        // Different feedback — update it
        await db.execute({
          sql: 'UPDATE Feedback SET type = ?, content = ?, createdAt = ? WHERE messageId = ?',
          args: [type, content || null, new Date().toISOString(), messageId],
        });
        return NextResponse.json({ action: 'updated', type });
      }
    } else {
      // New feedback
      const id = crypto.randomUUID();
      await db.execute({
        sql: 'INSERT INTO Feedback (id, messageId, sessionId, type, content, createdAt) VALUES (?, ?, ?, ?, ?, ?)',
        args: [id, messageId, sessionId, type, content || null, new Date().toISOString()],
      });
      return NextResponse.json({ action: 'created', type });
    }
  } catch (error) {
    console.error('[FEEDBACK] Error:', error);
    return NextResponse.json(
      { error: 'Error interno del servidor' },
      { status: 500 }
    );
  }
}
