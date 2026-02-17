import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/db'
import { extractCaseInfo } from '@/lib/ai/generate-outline'

export const runtime = 'nodejs'
export const maxDuration = 120

// POST /api/cases/[caseId]/extract — AI extraction of case info from all documents
export async function POST(
  req: NextRequest,
  { params }: { params: { caseId: string } }
) {
  try {
    const session = await getServerSession(authOptions)
    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const caseData = await prisma.case.findFirst({
      where: { id: params.caseId, userId: session.user.id },
    })
    if (!caseData) {
      return NextResponse.json({ error: 'Case not found' }, { status: 404 })
    }

    const body = await req.json()
    const { apiKey } = body
    if (!apiKey) {
      return NextResponse.json({ error: 'API key is required' }, { status: 400 })
    }

    // Get all processed documents with their page text
    const documents = await prisma.document.findMany({
      where: { caseId: params.caseId, status: 'ready' },
      include: {
        pages: {
          orderBy: { pageNumber: 'asc' },
        },
      },
    })

    if (!documents.length) {
      return NextResponse.json(
        { error: 'No processed documents found. Upload and process documents first.' },
        { status: 400 }
      )
    }

    // Build document texts for AI
    const documentTexts = documents.map((doc) => ({
      fileName: doc.title || doc.fileName,
      text: doc.pages.map((p) => `--- Page ${p.pageNumber} ---\n${p.text}`).join('\n\n'),
    }))

    // Run AI extraction
    const extracted = await extractCaseInfo(apiKey, documentTexts)

    // Auto-populate case fields from extraction
    const updateData: any = {}
    if (extracted.caseInfo?.caseName && !caseData.title.includes('v.')) {
      updateData.title = extracted.caseInfo.caseName
    }
    if (extracted.caseInfo?.caseNumber) updateData.caseNumber = extracted.caseInfo.caseNumber
    if (extracted.caseInfo?.court) updateData.court = extracted.caseInfo.court
    if (extracted.caseInfo?.jurisdiction) updateData.jurisdiction = extracted.caseInfo.jurisdiction
    if (extracted.keyIssues?.length) updateData.keyIssues = extracted.keyIssues

    if (Object.keys(updateData).length > 0) {
      await prisma.case.update({
        where: { id: params.caseId },
        data: updateData,
      })
    }

    // Auto-create parties
    if (extracted.parties?.length) {
      for (const party of extracted.parties) {
        await prisma.party.upsert({
          where: {
            id: `${params.caseId}-${party.name}`, // Will fail on first run, that's fine
          },
          create: {
            caseId: params.caseId,
            name: party.name,
            role: party.role,
            side: 'neutral',
            attorney: party.attorney || null,
          },
          update: {},
        }).catch(() => {
          // Upsert by composite key not available, create if doesn't exist
          return prisma.party.create({
            data: {
              caseId: params.caseId,
              name: party.name,
              role: party.role,
              side: 'neutral',
              attorney: party.attorney || null,
            },
          }).catch(() => {}) // Ignore duplicates
        })
      }
    }

    // Auto-create witnesses
    if (extracted.witnesses?.length) {
      for (const w of extracted.witnesses) {
        await prisma.witness.upsert({
          where: {
            caseId_name: { caseId: params.caseId, name: w.name },
          },
          create: {
            caseId: params.caseId,
            name: w.name,
            type: w.type || 'fact',
            side: 'neutral',
          },
          update: {},
        })
      }
    }

    return NextResponse.json(extracted)
  } catch (error) {
    console.error('Extraction error:', error)
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Extraction failed' },
      { status: 500 }
    )
  }
}
