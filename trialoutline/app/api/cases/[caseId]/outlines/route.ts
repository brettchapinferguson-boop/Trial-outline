import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/db'
import { buildWitnessProfile, generateOutline } from '@/lib/ai/generate-outline'
import { z } from 'zod'
import type { ExamType } from '@/lib/types'

export const runtime = 'nodejs'
export const maxDuration = 300

// GET /api/cases/[caseId]/outlines — List outlines for case
export async function GET(
  _req: NextRequest,
  { params }: { params: { caseId: string } }
) {
  try {
    const session = await getServerSession(authOptions)
    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const outlines = await prisma.outline.findMany({
      where: {
        caseId: params.caseId,
        case: { userId: session.user.id },
      },
      include: {
        witness: { select: { name: true, type: true } },
      },
      orderBy: { updatedAt: 'desc' },
    })

    return NextResponse.json(outlines)
  } catch (error) {
    console.error('Error fetching outlines:', error)
    return NextResponse.json({ error: 'Failed to fetch outlines' }, { status: 500 })
  }
}

// POST /api/cases/[caseId]/outlines — Generate a new outline
const generateSchema = z.object({
  apiKey: z.string().min(1),
  witnessId: z.string().min(1),
  examType: z.enum(['cross', 'direct', 'redirect', 'recross']),
  primaryGoal: z.string().optional(),
  additionalInstructions: z.string().optional(),
})

export async function POST(
  req: NextRequest,
  { params }: { params: { caseId: string } }
) {
  try {
    const session = await getServerSession(authOptions)
    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const body = await req.json()
    const { apiKey, witnessId, examType, primaryGoal, additionalInstructions } = generateSchema.parse(body)

    // Verify case ownership and get case data
    const caseData = await prisma.case.findFirst({
      where: { id: params.caseId, userId: session.user.id },
      include: { parties: true },
    })
    if (!caseData) {
      return NextResponse.json({ error: 'Case not found' }, { status: 404 })
    }

    // Get witness
    const witness = await prisma.witness.findFirst({
      where: { id: witnessId, caseId: params.caseId },
    })
    if (!witness) {
      return NextResponse.json({ error: 'Witness not found' }, { status: 404 })
    }

    // Get all processed documents with text
    const documents = await prisma.document.findMany({
      where: { caseId: params.caseId, status: 'ready' },
      include: {
        pages: { orderBy: { pageNumber: 'asc' } },
      },
    })

    if (!documents.length) {
      return NextResponse.json(
        { error: 'No processed documents found' },
        { status: 400 }
      )
    }

    const documentTexts = documents.map((doc) => ({
      fileName: doc.title || doc.fileName,
      text: doc.pages.map((p) => `--- Page ${p.pageNumber} ---\n${p.text}`).join('\n\n'),
    }))

    // Step 1: Build/refresh witness profile
    const profile = await buildWitnessProfile(
      apiKey,
      witness.name,
      witness.type,
      witness.side,
      caseData.theory || 'Not specified',
      documentTexts
    )

    // Store the profile
    await prisma.witness.update({
      where: { id: witnessId },
      data: { profile: profile as any },
    })

    // Step 2: Generate the outline
    const caseInfo = {
      title: caseData.title,
      caseNumber: caseData.caseNumber,
      court: caseData.court,
      jurisdiction: caseData.jurisdiction,
      caseType: caseData.caseType,
      parties: caseData.parties,
      keyIssues: caseData.keyIssues,
      clientName: caseData.clientName,
      clientRole: caseData.clientRole,
    }

    const outlineData = await generateOutline(
      apiKey,
      examType as ExamType,
      witness.name,
      profile,
      caseInfo,
      caseData.theory || 'Not specified',
      caseData.theme || 'Not specified',
      documentTexts,
      [primaryGoal, additionalInstructions].filter(Boolean).join('\n')
    )

    // Step 3: Save to database
    const outline = await prisma.outline.create({
      data: {
        caseId: params.caseId,
        witnessId,
        examType,
        title: outlineData.title,
        chapters: outlineData as any,
        status: 'draft',
        versions: {
          create: {
            chapters: outlineData as any,
            editNote: 'Initial generation',
          },
        },
      },
      include: {
        witness: { select: { name: true } },
      },
    })

    return NextResponse.json({
      outline: {
        id: outline.id,
        title: outline.title,
        examType: outline.examType,
        witness: outline.witness.name,
        status: outline.status,
      },
      data: outlineData,
      profile,
    })
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json({ error: error.errors[0].message }, { status: 400 })
    }
    console.error('Outline generation error:', error)
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Generation failed' },
      { status: 500 }
    )
  }
}
