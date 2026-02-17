import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/db'
import type { OutlineData, Chapter, Question, CATEGORY_CONFIG } from '@/lib/types'

export const runtime = 'nodejs'

// GET /api/cases/[caseId]/outlines/[outlineId]/export — Export as landscape HTML
export async function GET(
  _req: NextRequest,
  { params }: { params: { caseId: string; outlineId: string } }
) {
  try {
    const session = await getServerSession(authOptions)
    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const outline = await prisma.outline.findFirst({
      where: {
        id: params.outlineId,
        caseId: params.caseId,
        case: { userId: session.user.id },
      },
      include: {
        witness: true,
        case: {
          select: { title: true, caseNumber: true, court: true, clientName: true },
        },
      },
    })

    if (!outline) {
      return NextResponse.json({ error: 'Outline not found' }, { status: 404 })
    }

    const data = outline.chapters as unknown as OutlineData
    const html = generateExportHTML(data, outline.case)

    return new NextResponse(html, {
      headers: {
        'Content-Type': 'text/html; charset=utf-8',
        'Content-Disposition': `attachment; filename="${data.title.replace(/[^a-zA-Z0-9\s-]/g, '').replace(/\s+/g, '_')}.html"`,
      },
    })
  } catch (error) {
    console.error('Export error:', error)
    return NextResponse.json({ error: 'Export failed' }, { status: 500 })
  }
}

function generateExportHTML(
  data: OutlineData,
  caseInfo: { title: string; caseNumber: string | null; court: string | null; clientName: string | null }
): string {
  const categoryColors: Record<string, { bg: string; text: string; border: string }> = {
    credentials: { bg: '#dbeafe', text: '#1e40af', border: '#3b82f6' },
    methodology: { bg: '#fef9c3', text: '#854d0e', border: '#eab308' },
    favorable_admissions: { bg: '#dcfce7', text: '#166534', border: '#22c55e' },
    bias: { bg: '#ffedd5', text: '#9a3412', border: '#f97316' },
    prior_inconsistencies: { bg: '#fee2e2', text: '#991b1b', border: '#ef4444' },
    damaging_facts: { bg: '#fee2e2', text: '#991b1b', border: '#ef4444' },
    foundation: { bg: '#cffafe', text: '#155e75', border: '#06b6d4' },
    closing_setup: { bg: '#f3e8ff', text: '#6b21a8', border: '#a855f7' },
  }

  const categoryLabels: Record<string, string> = {
    credentials: 'CREDENTIALS',
    methodology: 'METHODOLOGY',
    favorable_admissions: 'FAVORABLE ADMISSIONS',
    bias: 'BIAS / INTEREST',
    prior_inconsistencies: 'IMPEACHMENT',
    damaging_facts: 'DAMAGING FACTS',
    foundation: 'FOUNDATION',
    closing_setup: 'CLOSING SETUP',
  }

  let totalQuestions = 0
  data.chapters.forEach((ch) => (totalQuestions += ch.questions.length))

  let pageNum = 0
  const totalPages = data.chapters.reduce((sum, ch) => sum + ch.questions.length, 0) + 1 // +1 for cover

  const questionPages = data.chapters
    .flatMap((chapter) =>
      chapter.questions.map((question) => {
        pageNum++
        const colors = categoryColors[chapter.category] || categoryColors.credentials
        const label = categoryLabels[chapter.category] || chapter.category.toUpperCase()

        return `
    <div class="page">
      <div class="page-header">
        <div class="page-title">${escapeHtml(data.title)}</div>
        <div class="page-meta">${escapeHtml(chapter.title)} &bull; Page ${pageNum + 1} of ${totalPages}</div>
      </div>

      <div class="content-grid">
        <!-- LEFT: Question Panel -->
        <div class="question-panel">
          <div class="category-badge" style="background:${colors.bg};color:${colors.text};border-color:${colors.border}">
            ${label}
          </div>

          <div class="chapter-goal">
            <strong>CHAPTER GOAL:</strong> ${escapeHtml(chapter.goal)}
          </div>

          <div class="question-box">
            <div class="question-label">Q${pageNum}:</div>
            <div class="question-text">"${escapeHtml(question.text)}"</div>
          </div>

          <div class="info-row">
            <div class="info-block purpose">
              <div class="info-label">PURPOSE</div>
              <div class="info-value">${escapeHtml(question.purpose)}</div>
            </div>
          </div>

          <div class="info-row">
            <div class="info-block expected">
              <div class="info-label">EXPECTED ANSWER</div>
              <div class="info-value">"${escapeHtml(question.expectedAnswer)}"</div>
            </div>
          </div>

          ${
            question.ifDenied
              ? `
          <div class="info-row">
            <div class="info-block impeachment">
              <div class="info-label">IF DENIED &mdash; IMPEACHMENT</div>
              <div class="info-value">${escapeHtml(question.ifDenied)}</div>
            </div>
          </div>
          `
              : ''
          }

          ${
            question.followUp?.length
              ? `
          <div class="info-row">
            <div class="info-block followup">
              <div class="info-label">FOLLOW-UP</div>
              ${question.followUp.map((f) => `<div class="info-value">"${escapeHtml(f)}"</div>`).join('')}
            </div>
          </div>
          `
              : ''
          }

          ${
            question.notes
              ? `
          <div class="info-row">
            <div class="info-block notes">
              <div class="info-label">NOTES</div>
              <div class="info-value">${escapeHtml(question.notes)}</div>
            </div>
          </div>
          `
              : ''
          }
        </div>

        <!-- RIGHT: Exhibit Panel -->
        <div class="exhibit-panel">
          <div class="exhibit-header">
            <div class="exhibit-icon">&#128196;</div>
            <div>
              <div class="exhibit-title">${escapeHtml(question.citation?.documentTitle || 'Source Document')}</div>
              <div class="exhibit-page">Page ${question.citation?.pageNumber || '—'}${question.citation?.exhibitNumber ? ` &bull; ${escapeHtml(question.citation.exhibitNumber)}` : ''}</div>
            </div>
          </div>

          <div class="exhibit-content">
            <div class="exhibit-excerpt">
              <div class="excerpt-label">RELEVANT EXCERPT</div>
              <div class="excerpt-text">
                ${escapeHtml(question.documentExcerpt || 'See cited document')}
              </div>
            </div>
          </div>

          <div class="citation-footer">
            Citation: ${escapeHtml(question.citation?.documentTitle || '')}${question.citation?.pageNumber ? `, Page ${question.citation.pageNumber}` : ''}${question.citation?.lineNumber ? `, Line ${question.citation.lineNumber}` : ''}
          </div>
        </div>
      </div>
    </div>`
      })
    )
    .join('\n')

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${escapeHtml(data.title)}</title>
  <style>
    @page {
      size: landscape;
      margin: 0.5in;
    }

    * {
      box-sizing: border-box;
      margin: 0;
      padding: 0;
    }

    body {
      font-family: 'Georgia', 'Times New Roman', serif;
      color: #1a1a2e;
      background: #ffffff;
      font-size: 11pt;
      line-height: 1.5;
      print-color-adjust: exact;
      -webkit-print-color-adjust: exact;
    }

    .page {
      width: 100%;
      min-height: 100vh;
      padding: 0.5in;
      page-break-after: always;
      display: flex;
      flex-direction: column;
    }

    .page:last-child {
      page-break-after: auto;
    }

    /* Cover page */
    .cover-page {
      display: flex;
      flex-direction: column;
      justify-content: center;
      align-items: center;
      text-align: center;
      min-height: 100vh;
      padding: 2in;
      page-break-after: always;
    }

    .cover-page h1 {
      font-size: 28pt;
      font-weight: bold;
      margin-bottom: 0.3in;
      color: #1a1a2e;
      border-bottom: 3px solid #1a1a2e;
      padding-bottom: 0.2in;
    }

    .cover-page h2 {
      font-size: 18pt;
      font-weight: normal;
      color: #475569;
      margin-bottom: 0.5in;
    }

    .cover-meta {
      font-size: 12pt;
      color: #64748b;
      line-height: 2;
    }

    .cover-toc {
      margin-top: 0.5in;
      text-align: left;
      max-width: 5in;
    }

    .cover-toc h3 {
      font-size: 14pt;
      margin-bottom: 0.15in;
      border-bottom: 1px solid #e2e8f0;
      padding-bottom: 0.1in;
    }

    .toc-item {
      display: flex;
      justify-content: space-between;
      padding: 4px 0;
      font-size: 11pt;
    }

    .toc-category {
      display: inline-block;
      padding: 1px 8px;
      border-radius: 10px;
      font-size: 8pt;
      font-weight: bold;
      border: 1px solid;
      margin-left: 8px;
    }

    /* Page header */
    .page-header {
      display: flex;
      justify-content: space-between;
      align-items: baseline;
      border-bottom: 2px solid #1a1a2e;
      padding-bottom: 6px;
      margin-bottom: 12px;
      flex-shrink: 0;
    }

    .page-title {
      font-size: 12pt;
      font-weight: bold;
    }

    .page-meta {
      font-size: 9pt;
      color: #64748b;
    }

    /* Main content grid */
    .content-grid {
      display: grid;
      grid-template-columns: 1fr 1fr;
      gap: 20px;
      flex: 1;
    }

    /* Question panel (left) */
    .question-panel {
      display: flex;
      flex-direction: column;
      gap: 8px;
    }

    .category-badge {
      display: inline-block;
      padding: 2px 12px;
      border-radius: 12px;
      font-size: 9pt;
      font-weight: bold;
      border: 1.5px solid;
      align-self: flex-start;
      letter-spacing: 0.5px;
    }

    .chapter-goal {
      font-size: 9pt;
      color: #475569;
      padding: 4px 0;
    }

    .question-box {
      background: #f8fafc;
      border: 1px solid #e2e8f0;
      border-radius: 6px;
      padding: 12px;
    }

    .question-label {
      font-size: 9pt;
      font-weight: bold;
      color: #64748b;
      margin-bottom: 4px;
    }

    .question-text {
      font-size: 13pt;
      font-weight: 600;
      line-height: 1.4;
      color: #0f172a;
    }

    .info-row {
      display: flex;
      gap: 8px;
    }

    .info-block {
      flex: 1;
      padding: 6px 10px;
      border-radius: 4px;
      border-left: 3px solid;
    }

    .info-label {
      font-size: 7pt;
      font-weight: bold;
      letter-spacing: 0.5px;
      color: #64748b;
      margin-bottom: 2px;
    }

    .info-value {
      font-size: 10pt;
    }

    .info-block.purpose {
      background: #f8fafc;
      border-color: #94a3b8;
    }

    .info-block.expected {
      background: #f0fdf4;
      border-color: #22c55e;
    }

    .info-block.expected .info-value {
      color: #166534;
      font-style: italic;
    }

    .info-block.impeachment {
      background: #fef2f2;
      border-color: #ef4444;
    }

    .info-block.impeachment .info-value {
      color: #991b1b;
      font-weight: 600;
    }

    .info-block.followup {
      background: #eff6ff;
      border-color: #3b82f6;
    }

    .info-block.notes {
      background: #fefce8;
      border-color: #eab308;
    }

    /* Exhibit panel (right) */
    .exhibit-panel {
      background: #ffffff;
      border: 2px solid #e2e8f0;
      border-radius: 8px;
      display: flex;
      flex-direction: column;
      overflow: hidden;
    }

    .exhibit-header {
      display: flex;
      align-items: center;
      gap: 10px;
      padding: 10px 14px;
      background: #f1f5f9;
      border-bottom: 1px solid #e2e8f0;
    }

    .exhibit-icon {
      font-size: 20pt;
    }

    .exhibit-title {
      font-size: 11pt;
      font-weight: bold;
      color: #0f172a;
    }

    .exhibit-page {
      font-size: 9pt;
      color: #64748b;
    }

    .exhibit-content {
      flex: 1;
      padding: 14px;
      overflow-y: auto;
    }

    .exhibit-excerpt {
      background: #fffbeb;
      border: 1px solid #fde68a;
      border-radius: 6px;
      padding: 12px;
    }

    .excerpt-label {
      font-size: 7pt;
      font-weight: bold;
      letter-spacing: 0.5px;
      color: #92400e;
      margin-bottom: 6px;
    }

    .excerpt-text {
      font-size: 10.5pt;
      line-height: 1.6;
      color: #1a1a2e;
      white-space: pre-wrap;
    }

    .citation-footer {
      padding: 6px 14px;
      background: #f8fafc;
      border-top: 1px solid #e2e8f0;
      font-size: 8pt;
      color: #64748b;
      text-align: right;
    }

    /* Print styles */
    @media print {
      body {
        background: white;
      }

      .page {
        padding: 0;
        min-height: auto;
        height: 100vh;
      }

      .cover-page {
        padding: 1in;
      }
    }

    /* Screen navigation */
    @media screen {
      body {
        background: #e2e8f0;
      }

      .page {
        max-width: 11in;
        margin: 20px auto;
        background: white;
        box-shadow: 0 2px 8px rgba(0,0,0,0.1);
        border-radius: 4px;
        min-height: 8.5in;
      }

      .cover-page {
        max-width: 11in;
        margin: 20px auto;
        background: white;
        box-shadow: 0 2px 8px rgba(0,0,0,0.1);
        border-radius: 4px;
      }
    }
  </style>
</head>
<body>
  <!-- Cover Page -->
  <div class="cover-page">
    <h1>${escapeHtml(data.title)}</h1>
    <h2>${escapeHtml(data.witness)}</h2>
    <div class="cover-meta">
      ${caseInfo.title ? `<div><strong>Case:</strong> ${escapeHtml(caseInfo.title)}</div>` : ''}
      ${caseInfo.caseNumber ? `<div><strong>Case No:</strong> ${escapeHtml(caseInfo.caseNumber)}</div>` : ''}
      ${caseInfo.court ? `<div><strong>Court:</strong> ${escapeHtml(caseInfo.court)}</div>` : ''}
      <div><strong>Type:</strong> ${data.examType === 'cross' ? 'Cross-Examination' : 'Direct Examination'}</div>
      <div><strong>Total Questions:</strong> ${totalQuestions} across ${data.chapters.length} chapters</div>
    </div>

    ${
      data.overallGoals?.length
        ? `
    <div class="cover-toc" style="margin-top:0.3in">
      <h3>Strategic Goals</h3>
      ${data.overallGoals.map((g) => `<div class="toc-item">${escapeHtml(g)}</div>`).join('')}
    </div>
    `
        : ''
    }

    <div class="cover-toc">
      <h3>Chapters</h3>
      ${data.chapters
        .map((ch) => {
          const colors = categoryColors[ch.category] || categoryColors.credentials
          const label = categoryLabels[ch.category] || ch.category
          return `<div class="toc-item">
          <span>${escapeHtml(ch.title)} (${ch.questions.length} questions)</span>
          <span class="toc-category" style="background:${colors.bg};color:${colors.text};border-color:${colors.border}">${label}</span>
        </div>`
        })
        .join('')}
    </div>
  </div>

  <!-- Question Pages -->
  ${questionPages}
</body>
</html>`
}

function escapeHtml(text: string): string {
  if (!text) return ''
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;')
}
