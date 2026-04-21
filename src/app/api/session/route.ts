export const runtime = 'edge';

// ========================================
// MÓDULO DE SESIÓN — Gestión Multi-Tenant
// Crea Tenant + UserMemory + Session
// ========================================

import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { tenantId } = body;

    let tenant;
    const isNew = !tenantId;

    if (!tenantId) {
      // Crear nuevo tenant + user_memory vacío + primera sesión
      tenant = await db.tenant.create({
        data: {
          userMemory: {
            create: {
              userName: '',
              contextSummary: '',
              lastTopic: '',
            },
          },
        },
        include: { userMemory: true },
      });
    } else {
      tenant = await db.tenant.findUnique({
        where: { id: tenantId },
        include: { userMemory: true },
      });
      if (!tenant) {
        return NextResponse.json({ error: 'Tenant no encontrado' }, { status: 404 });
      }
    }

    // Crear nueva sesión
    const session = await db.session.create({
      data: {
        tenantId: tenant.id,
      },
    });

    // Determinar si es un usuario nuevo (sin memoria previa)
    const isNewUser = !tenant.userMemory?.contextSummary;

    return NextResponse.json({
      tenantId: tenant.id,
      sessionId: session.id,
      isNewTenant: isNew,
      isNewUser,
      userName: tenant.userMemory?.userName || '',
      contextSummary: tenant.userMemory?.contextSummary || '',
    });
  } catch (error) {
    console.error('[SESIÓN] Error:', error);
    return NextResponse.json({ error: 'Error al crear sesión' }, { status: 500 });
  }
}

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const tenantId = searchParams.get('tenantId');

    if (!tenantId) {
      return NextResponse.json({ error: 'tenantId requerido' }, { status: 400 });
    }

    const sessions = await db.session.findMany({
      where: { tenantId },
      orderBy: { updatedAt: 'desc' },
      take: 20,
      include: { _count: { select: { messages: true } } },
    });

    return NextResponse.json({ sessions });
  } catch (error) {
    console.error('[SESIÓN] Error al listar:', error);
    return NextResponse.json({ error: 'Error interno' }, { status: 500 });
  }
}
