import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { ATLAS_SYSTEM_PROMPT, SAFETY_KEYWORDS } from '@/lib/atlas';
import ZAI from 'z-ai-web-dev-sdk';

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { sessionId, message, tenantId } = body;

    if (!sessionId || !message || !tenantId) {
      return NextResponse.json(
        { error: 'sessionId, message, and tenantId are required' },
        { status: 400 }
      );
    }

    // Safety check
    const lowerMessage = message.toLowerCase();
    for (const keyword of SAFETY_KEYWORDS) {
      if (lowerMessage.includes(keyword)) {
        const safetyResponse = 'Por favor, contacta a la línea de prevención del suicidio de tu país ahora mismo. Tu vida importa y hay expertos listos para ayudarte. 🙏';
        // Save both messages
        await db.message.create({
          data: { sessionId, role: 'user', content: message },
        });
        await db.message.create({
          data: { sessionId, role: 'assistant', content: safetyResponse },
        });
        return NextResponse.json({ response: safetyResponse });
      }
    }

    // Save user message
    await db.message.create({
      data: { sessionId, role: 'user', content: message },
    });

    // Fetch conversation history (last 20 messages)
    const history = await db.message.findMany({
      where: { sessionId },
      orderBy: { timestamp: 'asc' },
      take: 20,
    });

    // Fetch user memories for context
    const memories = await db.memory.findMany({
      where: { tenantId },
      orderBy: { importance: 'desc' },
      take: 10,
    });

    const profile = await db.userProfile.findUnique({
      where: { tenantId },
    });

    // Build memory context
    let memoryContext = '';
    if (profile && profile.summary) {
      memoryContext += `Perfil del usuario: ${profile.summary}\n`;
    }
    if (memories.length > 0) {
      memoryContext += 'Memorias importantes del usuario:\n';
      memories.forEach((m) => {
        memoryContext += `- [${m.category}] ${m.content}\n`;
      });
    }
    if (!memoryContext) {
      memoryContext = 'No hay información previa del usuario. Esta es la primera interacción.';
    }

    // Build messages array for LLM
    const systemPrompt = ATLAS_SYSTEM_PROMPT.replace('{memory_context}', memoryContext);
    const messages: Array<{ role: string; content: string }> = [
      { role: 'system', content: systemPrompt },
    ];

    for (const msg of history) {
      if (msg.role === 'user' || msg.role === 'assistant') {
        messages.push({ role: msg.role, content: msg.content });
      }
    }

    // Call LLM via z-ai-web-dev-sdk
    const zai = await ZAI.create();
    const completion = await zai.chat.completions.create({
      messages,
      temperature: 0.7,
      max_tokens: 300,
    });

    const responseText = completion.choices[0]?.message?.content || 'Lo siento, no pude generar una respuesta en este momento. ¿Puedes repetir?';

    // Save assistant response
    await db.message.create({
      data: { sessionId, role: 'assistant', content: responseText },
    });

    // Update session timestamp
    await db.session.update({
      where: { id: sessionId },
      data: { updatedAt: new Date() },
    });

    // Extract and save memories asynchronously (best effort)
    try {
      await extractAndSaveMemories(tenantId, message, responseText, profile);
    } catch (e) {
      // Memory extraction is best-effort, don't fail the request
      console.log('Memory extraction skipped:', e);
    }

    return NextResponse.json({ response: responseText });
  } catch (error) {
    console.error('Chat API error:', error);
    return NextResponse.json(
      { error: 'Failed to process message' },
      { status: 500 }
    );
  }
}

// Simple memory extraction using keyword patterns
async function extractAndSaveMemories(
  tenantId: string,
  userMessage: string,
  _assistantResponse: string,
  existingProfile: { summary?: string; id?: string } | null
) {
  const lower = userMessage.toLowerCase();

  // Extract potential personal info patterns
  const nameMatch = userMessage.match(/(?:me llamo|mi nombre es|soy)\s+([A-Z][a-záéíóúñ]+)/i);
  const goalMatch = lower.match(/(?:quiero|mi meta es|mi objetivo es|aspiro a|necesito)\s+(.+?)(?:\.|,|$)/i);
  const feelingMatch = lower.match(/(?:me siento|estoy sintiendo|me hace sentir)\s+(.+?)(?:\.|,|$)/i);
  const challengeMatch = lower.match(/(?:mi problema es|tengo problemas con|mi dificultad es|me cuesta)\s+(.+?)(?:\.|,|$)/i);

  if (nameMatch && nameMatch[1]) {
    await db.memory.upsert({
      where: { id: `name-${tenantId}` },
      create: {
        id: `name-${tenantId}`,
        tenantId,
        category: 'personal',
        content: `Se llama ${nameMatch[1]}`,
        importance: 10,
      },
      update: { content: `Se llama ${nameMatch[1]}`, updatedAt: new Date() },
    });
  }

  if (goalMatch && goalMatch[1]) {
    await db.memory.create({
      data: {
        tenantId,
        category: 'goal',
        content: goalMatch[1].trim(),
        importance: 8,
      },
    });
  }

  if (feelingMatch && feelingMatch[1]) {
    await db.memory.create({
      data: {
        tenantId,
        category: 'insight',
        content: `Expresó sentirse: ${feelingMatch[1].trim()}`,
        importance: 6,
      },
    });
  }

  if (challengeMatch && challengeMatch[1]) {
    await db.memory.create({
      data: {
        tenantId,
        category: 'challenge',
        content: challengeMatch[1].trim(),
        importance: 9,
      },
    });
  }

  // Update profile summary periodically
  const memoryCount = await db.memory.count({ where: { tenantId } });
  if (memoryCount > 0 && memoryCount % 3 === 0) {
    const allMemories = await db.memory.findMany({
      where: { tenantId },
      orderBy: { importance: 'desc' },
      take: 8,
    });
    const summaryParts = allMemories.map((m) => `${m.category}: ${m.content}`);
    const newSummary = summaryParts.join('; ');

    if (existingProfile) {
      await db.userProfile.update({
        where: { tenantId },
        data: { summary: newSummary, updatedAt: new Date() },
      });
    } else {
      await db.userProfile.create({
        data: { tenantId, summary: newSummary, keyTopics: '[]' },
      });
    }
  }
}

// GET endpoint to load chat history
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const sessionId = searchParams.get('sessionId');

    if (!sessionId) {
      return NextResponse.json({ error: 'sessionId required' }, { status: 400 });
    }

    const messages = await db.message.findMany({
      where: { sessionId },
      orderBy: { timestamp: 'asc' },
    });

    return NextResponse.json({ messages });
  } catch (error) {
    console.error('Chat history error:', error);
    return NextResponse.json(
      { error: 'Failed to fetch chat history' },
      { status: 500 }
    );
  }
}
