import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/db'
import { z } from 'zod'

// GET /api/cases/[caseId] — Get a single case with all related data
export async function GET(
  _req: NextRequest,
  { params }: { params: { caseId: string } }
) {
  try {
    const session = await getServerSession(authOptions)
    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const caseData = await prisma.case.findFirst({
      where: {
        id: params.caseId,
        userId: session.user.id,
      },
      include: {
        parties: true,
        documents: {
          select: {
            id: true,
            fileName: true,
            originalName: true,
            docType: true,
            title: true,
            date: true,
            author: true,
            summary: true,
            pageCount: true,
            status: true,
            fileSize: true,
            createdAt: true,
          },
          orderBy: { createdAt: 'asc' },
        },
        witnesses: {
          include: {
            _count: { select: { outlines: true } },
          },
        },
        outlines: {
          select: {
            id: true,
            witnessId: true,
            examType: true,
            title: true,
            status: true,
            createdAt: true,
            updatedAt: true,
            witness: { select: { name: true } },
          },
          orderBy: { updatedAt: 'desc' },
        },
      },
    })

    if (!caseData) {
      return NextResponse.json({ error: 'Case not found' }, { status: 404 })
    }

    return NextResponse.json(caseData)
  } catch (error) {
    console.error('Error fetching case:', error)
    return NextResponse.json({ error: 'Failed to fetch case' }, { status: 500 })
  }
}

// PATCH /api/cases/[caseId] — Update case details (interview answers)
const updateCaseSchema = z.object({
  title: z.string().min(1).optional(),
  caseNumber: z.string().optional(),
  court: z.string().optional(),
  jurisdiction: z.string().optional(),
  caseType: z.enum(['civil', 'family', 'criminal']).optional(),
  theory: z.string().optional(),
  theme: z.string().optional(),
  clientName: z.string().optional(),
  clientRole: z.string().optional(),
  keyIssues: z.array(z.string()).optional(),
  status: z.enum(['setup', 'processing', 'ready', 'archived']).optional(),
  parties: z
    .array(
      z.object({
        name: z.string(),
        role: z.string(),
        side: z.enum(['our_client', 'opposing', 'neutral']),
        attorney: z.string().optional(),
      })
    )
    .optional(),
  witnesses: z
    .array(
      z.object({
        name: z.string(),
        type: z.enum(['fact', 'expert', 'party', 'character']),
        side: z.enum(['friendly', 'adverse', 'neutral']),
      })
    )
    .optional(),
})

export async function PATCH(
  req: NextRequest,
  { params }: { params: { caseId: string } }
) {
  try {
    const session = await getServerSession(authOptions)
    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    // Verify ownership
    const existing = await prisma.case.findFirst({
      where: { id: params.caseId, userId: session.user.id },
    })
    if (!existing) {
      return NextResponse.json({ error: 'Case not found' }, { status: 404 })
    }

    const body = await req.json()
    const data = updateCaseSchema.parse(body)

    // Extract parties and witnesses to handle separately
    const { parties, witnesses, ...caseFields } = data

    // Update case fields
    const updatedCase = await prisma.case.update({
      where: { id: params.caseId },
      data: caseFields,
    })

    // Update parties if provided
    if (parties) {
      // Delete existing parties and recreate
      await prisma.party.deleteMany({ where: { caseId: params.caseId } })
      await prisma.party.createMany({
        data: parties.map((p) => ({ ...p, caseId: params.caseId })),
      })
    }

    // Update witnesses if provided
    if (witnesses) {
      for (const w of witnesses) {
        await prisma.witness.upsert({
          where: {
            caseId_name: { caseId: params.caseId, name: w.name },
          },
          create: { ...w, caseId: params.caseId },
          update: { type: w.type, side: w.side },
        })
      }
    }

    return NextResponse.json(updatedCase)
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json({ error: error.errors[0].message }, { status: 400 })
    }
    console.error('Error updating case:', error)
    return NextResponse.json({ error: 'Failed to update case' }, { status: 500 })
  }
}
