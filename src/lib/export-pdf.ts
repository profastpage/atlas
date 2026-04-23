// ========================================
// ATLAS — Export Chat to Professional PDF
// Uses jsPDF directly (no html2canvas dependency)
// for clean, fast, brand-consistent output.
// ========================================

import jsPDF from 'jspdf';

interface Message {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  timestamp: string;
}

// Brand colors
const EMERALD_HEX = '#059669';
const DARK_BG = '#0f0f0f';
const WHITE = '#ffffff';
const GRAY_300 = '#d1d5db';
const GRAY_500 = '#6b7280';
const GRAY_700 = '#374151';
const GRAY_100 = '#f3f4f6';
const GRAY_50 = '#f9fafb';

export async function exportChatToPDF(messages: Message[], userName?: string): Promise<void> {
  if (messages.length === 0) return;

  const doc = new jsPDF({ unit: 'mm', format: 'a4' });
  const pageW = doc.internal.pageSize.getWidth();
  const pageH = doc.internal.pageSize.getHeight();
  const marginX = 20;
  const contentW = pageW - marginX * 2;
  let y = 0;

  // ---- Helper: add page if needed ----
  const ensureSpace = (needed: number) => {
    if (y + needed > pageH - 25) {
      doc.addPage();
      y = 15;
      // Subtle header line on continuation pages
      doc.setDrawColor(EMERALD_HEX);
      doc.setLineWidth(0.3);
      doc.line(marginX, y, pageW - marginX, y);
      y += 6;
    }
  };

  // ---- Helper: multi-line text with word wrap ----
  const drawText = (text: string, x: number, lineHeight: number, maxWidth: number, color: string, fontStyle: string = 'normal') => {
    doc.setFont('helvetica', fontStyle);
    doc.setTextColor(color);
    const lines = doc.splitTextToSize(text, maxWidth);
    for (const line of lines) {
      ensureSpace(lineHeight + 1);
      doc.text(line, x, y);
      y += lineHeight;
    }
    return lines.length * lineHeight;
  };

  // ========================================
  // PAGE 1 — COVER / HEADER
  // ========================================

  // Top emerald accent bar
  doc.setFillColor(EMERALD_HEX);
  doc.rect(0, 0, pageW, 4, 'F');

  y = 30;

  // Brand mark: ATLAS logo text
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(32);
  doc.setTextColor(EMERALD_HEX);
  doc.text('ATLAS', pageW / 2, y, { align: 'center' });
  y += 8;

  // Subtitle
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(10);
  doc.setTextColor(GRAY_500);
  doc.text('Consultor Estrategico con IA', pageW / 2, y, { align: 'center' });
  y += 14;

  // Divider line
  doc.setDrawColor(EMERALD_HEX);
  doc.setLineWidth(0.5);
  doc.line(marginX + 20, y, pageW - marginX - 20, y);
  y += 10;

  // Report title
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(18);
  doc.setTextColor(DARK_BG);
  doc.text('Reporte de Consultoria Estrategica', pageW / 2, y, { align: 'center' });
  y += 10;

  // Date
  const now = new Date();
  const dateStr = now.toLocaleDateString('es-PE', {
    weekday: 'long',
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  });
  const timeStr = now.toLocaleTimeString('es-PE', { hour: '2-digit', minute: '2-digit' });

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(9);
  doc.setTextColor(GRAY_500);
  doc.text(`${dateStr} — ${timeStr}`, pageW / 2, y, { align: 'center' });
  y += 6;

  // User name if available
  if (userName && userName.trim()) {
    doc.text(`Preparado para: ${userName.trim()}`, pageW / 2, y, { align: 'center' });
    y += 6;
  }

  // Summary
  const userMsgCount = messages.filter(m => m.role === 'user').length;
  const assistantMsgCount = messages.filter(m => m.role === 'assistant').length;
  y += 4;
  doc.setFontSize(8);
  doc.setTextColor(GRAY_500);
  doc.text(`${userMsgCount} consulta${userMsgCount !== 1 ? 's' : ''} · ${assistantMsgCount} respuesta${assistantMsgCount !== 1 ? 's' : ''}`, pageW / 2, y, { align: 'center' });

  y += 14;

  // Another divider
  doc.setDrawColor(GRAY_100);
  doc.setLineWidth(0.2);
  doc.line(marginX, y, pageW - marginX, y);
  y += 10;

  // ========================================
  // CONVERSATION BODY
  // ========================================

  // Filter out empty/system messages
  const chatMessages = messages.filter(m => m.content && m.content.trim().length > 0);

  for (let i = 0; i < chatMessages.length; i++) {
    const msg = chatMessages[i];
    const isUser = msg.role === 'user';

    ensureSpace(16);

    // Role label
    const roleLabel = isUser ? 'Tú' : 'Atlas';
    const roleColor = isUser ? GRAY_700 : EMERALD_HEX;

    // Role badge background
    doc.setFillColor(isUser ? GRAY_50 : '#ecfdf5'); // light gray or light green
    const labelW = doc.getTextWidth(roleLabel) + 6;
    doc.roundedRect(marginX, y - 3.5, Math.max(labelW, 12), 5, 1.5, 1.5, 'F');
    doc.setFont('helvetica', isUser ? 'normal' : 'bold');
    doc.setFontSize(8);
    doc.setTextColor(roleColor);
    doc.text(roleLabel, marginX + 3, y);

    // Timestamp on the right
    if (msg.timestamp) {
      try {
        const msgDate = new Date(msg.timestamp);
        const time = msgDate.toLocaleTimeString('es-PE', { hour: '2-digit', minute: '2-digit' });
        const dateLabel = msgDate.toLocaleDateString('es-PE', { day: 'numeric', month: 'short' });
        doc.setFont('helvetica', 'normal');
        doc.setFontSize(7);
        doc.setTextColor(GRAY_500);
        doc.text(`${dateLabel}, ${time}`, pageW - marginX, y, { align: 'right' });
      } catch {
        // ignore bad timestamp
      }
    }

    y += 5;

    // Message content — strip markdown formatting for clean text
    const cleanContent = stripMarkdown(msg.content);
    drawText(cleanContent, marginX + 2, 4, contentW - 4, isUser ? GRAY_700 : DARK_BG);

    // Spacing between messages
    y += 3;

    // Light divider every 2 messages
    if ((i + 1) % 2 === 0 && i < chatMessages.length - 1) {
      ensureSpace(4);
      doc.setDrawColor(GRAY_100);
      doc.setLineWidth(0.1);
      doc.line(marginX + 10, y, pageW - marginX - 10, y);
      y += 4;
    }
  }

  // ========================================
  // FOOTER — on every page
  // ========================================
  const totalPages = doc.getNumberOfPages();
  for (let p = 1; p <= totalPages; p++) {
    doc.setPage(p);
    const footerY = pageH - 12;

    // Emerald accent line
    doc.setDrawColor(EMERALD_HEX);
    doc.setLineWidth(0.3);
    doc.line(marginX, footerY, pageW - marginX, footerY);

    // Footer text
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(7);
    doc.setTextColor(GRAY_500);
    doc.text('Generado por Atlas — Consultor Estrategico con IA', marginX, footerY + 4);

    // Page number
    doc.text(`${p} / ${totalPages}`, pageW - marginX, footerY + 4, { align: 'right' });

    // Top emerald bar on every page
    doc.setFillColor(EMERALD_HEX);
    doc.rect(0, 0, pageW, 2, 'F');
  }

  // ========================================
  // SAVE
  // ========================================
  const dateSlug = now.toISOString().slice(0, 10).replace(/-/g, '_');
  doc.save(`Reporte_Atlas_${dateSlug}.pdf`);
}

// ---- Strip basic markdown for clean PDF text ----
function stripMarkdown(text: string): string {
  return text
    // Remove bold/italic markers
    .replace(/\*\*(.+?)\*\*/g, '$1')
    .replace(/\*(.+?)\*/g, '$1')
    .replace(/__(.+?)__/g, '$1')
    .replace(/_(.+?)_/g, '$1')
    // Remove headings markers
    .replace(/^#{1,6}\s+/gm, '')
    // Remove links, keep text
    .replace(/\[([^\]]+)\]\([^)]+\)/g, '$1')
    // Remove code blocks (keep content)
    .replace(/```[\s\S]*?```/g, (match) => {
      const lines = match.split('\n').filter((l, i) => i > 0);
      return lines.join('\n').replace(/```/g, '');
    })
    // Remove inline code
    .replace(/`([^`]+)`/g, '$1')
    // Remove horizontal rules
    .replace(/^---+$/gm, '—')
    // Remove bullet markers
    .replace(/^\s*[-*+]\s+/gm, '• ')
    // Remove numbered list markers (keep number)
    .replace(/^\s*\d+\.\s+/gm, (match) => match.trim() + ' ')
    // Remove blockquotes
    .replace(/^\s*>\s+/gm, '')
    // Clean extra whitespace
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}
