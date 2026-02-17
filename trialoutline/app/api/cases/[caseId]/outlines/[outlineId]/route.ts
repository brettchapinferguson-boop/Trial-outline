import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/db'
import { editOutline } from '@/lib/ai/generate-outline'
import { z } from 'zod'
import type { OutlineData } from '@/lib/types'

export const runtime = 'nodejs'
export const maxDuration = 120

// GET /api/cases/[caseId]/outlines/[outlineId] — Get outline with full data
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
        versions: {
          orderBy: { createdAt: 'desc' },
          take: 20,
        },
      },
    })

    if (!outline) {
      return NextResponse.json({ error: 'Outline not found' }, { status: 404 })
    }

    return NextResponse.json(outline)
  } catch (error) {
    console.error('Error fetching outline:', error)
    return NextResponse.json({ error: 'Failed to fetch outline' }, { status: 500 })
  }
}

// PATCH /api/cases/[caseId]/outlines/[outlineId] — Edit outline with AI
const editSchema = z.object({
  apiKey: z.string().min(1),
  editInstructions: z.string().min(1),
})

export async function PATCH(
  req: NextRequest,
  { params }: { params: { caseId: string; outlineId: string } }
) {
  try {
    const session = await getServerSession(authOptions)
    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const body = await req.json()
    const { apiKey, editInstructions } = editSchema.parse(body)

    // Get current outline
    const outline = await prisma.outline.findFirst({
      where: {
        id: params.outlineId,
        caseId: params.caseId,
        case: { userId: session.user.id },
      },
    })

    if (!outline) {
      return NextResponse.json({ error: 'Outline not found' }, { status: 404 })
    }

    // Get documents for context
    const documents = await prisma.document.findMany({
      where: { caseId: params.caseId, status: 'ready' },
      include: {
        pages: { orderBy: { pageNumber: 'asc' } },
      },
    })

    const documentTexts = documents.map((doc) => ({
      fileName: doc.title || doc.fileName,
      text: doc.pages.map((p) => `--- Page ${p.pageNumber} ---\n${p.text}`).join('\n\n'),
    }))

    // Run AI edit
    const currentData = outline.chapters as unknown as OutlineData
    const updatedData = await editOutline(apiKey, currentData, editInstructions, documentTexts)

    // Save new version
    await prisma.outlineVersion.create({
      data: {
        outlineId: params.outlineId,
        chapters: updatedData as any,
        editNote: editInstructions,
      },
    })

    // Update the outline
    const updated = await prisma.outline.update({
      where: { id: params.outlineId },
      data: {
        chapters: updatedData as any,
        title: updatedData.title || outline.title,
      },
    })

    return NextResponse.json({
      outline: updated,
      data: updatedData,
    })
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json({ error: error.errors[0].message }, { status: 400 })
    }
    console.error('Outline edit error:', error)
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Edit failed' },
      { status: 500 }
    )
  }
}
