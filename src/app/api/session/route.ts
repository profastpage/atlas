import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { v4 as uuidv4 } from 'uuid';

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { tenantId, sessionId } = body;

    // If no tenantId, create a new tenant
    let tenant;
    if (!tenantId) {
      tenant = await db.tenant.create({
        data: {
          id: uuidv4(),
          profile: {
            create: {
              summary: '',
              keyTopics: '[]',
            },
          },
        },
        include: { profile: true },
      });
    } else {
      tenant = await db.tenant.findUnique({
        where: { id: tenantId },
        include: { profile: true },
      });
      if (!tenant) {
        return NextResponse.json({ error: 'Tenant not found' }, { status: 404 });
      }
    }

    // Create a new session for this tenant
    const session = await db.session.create({
      data: {
        id: uuidv4(),
        tenantId: tenant.id,
      },
    });

    return NextResponse.json({
      tenantId: tenant.id,
      sessionId: session.id,
      isNew: !tenantId,
    });
  } catch (error) {
    console.error('Session creation error:', error);
    return NextResponse.json(
      { error: 'Failed to create session' },
      { status: 500 }
    );
  }
}

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const tenantId = searchParams.get('tenantId');

    if (!tenantId) {
      return NextResponse.json({ error: 'tenantId required' }, { status: 400 });
    }

    const sessions = await db.session.findMany({
      where: { tenantId },
      orderBy: { updatedAt: 'desc' },
      take: 20,
      include: {
        _count: { select: { messages: true } },
      },
    });

    return NextResponse.json({ sessions });
  } catch (error) {
    console.error('Session fetch error:', error);
    return NextResponse.json(
      { error: 'Failed to fetch sessions' },
      { status: 500 }
    );
  }
}
