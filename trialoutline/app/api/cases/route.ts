import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/db'
import { z } from 'zod'

// GET /api/cases — List all cases for the current user
export async function GET() {
  try {
    const session = await getServerSession(authOptions)
    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const cases = await prisma.case.findMany({
      where: { userId: session.user.id },
      include: {
        _count: {
          select: {
            documents: true,
            witnesses: true,
            outlines: true,
          },
        },
      },
      orderBy: { updatedAt: 'desc' },
    })

    return NextResponse.json(cases)
  } catch (error) {
    console.error('Error fetching cases:', error)
    return NextResponse.json({ error: 'Failed to fetch cases' }, { status: 500 })
  }
}

// POST /api/cases — Create a new case
const createCaseSchema = z.object({
  title: z.string().min(1),
  caseNumber: z.string().optional(),
  court: z.string().optional(),
  jurisdiction: z.string().optional(),
  caseType: z.enum(['civil', 'family', 'criminal']).default('civil'),
})

export async function POST(req: NextRequest) {
  try {
    const session = await getServerSession(authOptions)
    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const body = await req.json()
    const data = createCaseSchema.parse(body)

    const newCase = await prisma.case.create({
      data: {
        ...data,
        userId: session.user.id,
      },
    })

    return NextResponse.json(newCase)
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json({ error: error.errors[0].message }, { status: 400 })
    }
    console.error('Error creating case:', error)
    return NextResponse.json({ error: 'Failed to create case' }, { status: 500 })
  }
}
