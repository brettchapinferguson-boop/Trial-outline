import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/db'
import { parsePDF, parseDOCX, parseTXT, classifyDocumentType } from '@/lib/document-parser'
import { extractDocumentMetadata } from '@/lib/ai/generate-outline'

export const runtime = 'nodejs'
export const maxDuration = 300 // 5 minutes

// POST /api/cases/[caseId]/process — Process all pending documents
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

    const body = await req.json().catch(() => ({}))
    const apiKey = body.apiKey

    // Get pending documents
    const pendingDocs = await prisma.document.findMany({
      where: { caseId: params.caseId, status: 'pending' },
    })

    if (!pendingDocs.length) {
      return NextResponse.json({ message: 'No pending documents to process', processed: 0 })
    }

    const results: Array<{ id: string; fileName: string; status: string; pageCount?: number; error?: string }> = []

    for (const doc of pendingDocs) {
      try {
        // Mark as processing
        await prisma.document.update({
          where: { id: doc.id },
          data: { status: 'processing' },
        })

        // Step 1: Extract text per page
        let pages: Array<{ pageNumber: number; text: string }> = []
        const ext = doc.fileName.split('.').pop()?.toLowerCase()

        if (ext === 'pdf') {
          pages = await parsePDF(doc.storagePath)
        } else if (ext === 'docx' || ext === 'doc') {
          pages = await parseDOCX(doc.storagePath)
        } else if (ext === 'txt' || ext === 'rtf') {
          pages = await parseTXT(doc.storagePath)
        } else {
          throw new Error(`Unsupported file type: ${ext}`)
        }

        if (pages.length === 0) {
          throw new Error('No text could be extracted from this document')
        }

        // Step 2: Store pages in database
        await prisma.documentPage.createMany({
          data: pages.map((p) => ({
            documentId: doc.id,
            pageNumber: p.pageNumber,
            text: p.text,
          })),
        })

        // Step 3: Classify document type (heuristic)
        const fullText = pages.map((p) => p.text).join('\n')
        const docType = classifyDocumentType(fullText, doc.fileName)

        // Step 4: Extract metadata with AI (if API key provided)
        let metadata: any = {}
        let title = doc.fileName
        let author: string | null = null
        let date: Date | null = null
        let summary: string | null = null

        if (apiKey) {
          try {
            const aiMetadata = await extractDocumentMetadata(
              apiKey,
              doc.fileName,
              pages.map((p) => p.text)
            )
            metadata = aiMetadata
            title = aiMetadata.title || doc.fileName
            author = aiMetadata.author || null
            summary = aiMetadata.summary || null
            if (aiMetadata.date) {
              const parsed = new Date(aiMetadata.date)
              if (!isNaN(parsed.getTime())) date = parsed
            }
          } catch (aiErr) {
            console.error(`AI metadata extraction failed for ${doc.fileName}:`, aiErr)
            // Non-fatal — continue with heuristic results
          }
        }

        // Step 5: Update document record
        await prisma.document.update({
          where: { id: doc.id },
          data: {
            status: 'ready',
            docType,
            title,
            author,
            date,
            summary,
            pageCount: pages.length,
            metadata,
          },
        })

        results.push({
          id: doc.id,
          fileName: doc.fileName,
          status: 'ready',
          pageCount: pages.length,
        })
      } catch (err) {
        const errorMsg = err instanceof Error ? err.message : 'Processing failed'
        console.error(`Error processing ${doc.fileName}:`, err)

        await prisma.document.update({
          where: { id: doc.id },
          data: { status: 'error', errorMessage: errorMsg },
        })

        results.push({
          id: doc.id,
          fileName: doc.fileName,
          status: 'error',
          error: errorMsg,
        })
      }
    }

    // Update case status
    const readyCount = results.filter((r) => r.status === 'ready').length
    if (readyCount > 0) {
      await prisma.case.update({
        where: { id: params.caseId },
        data: { status: 'ready' },
      })
    }

    return NextResponse.json({
      processed: results.length,
      results,
    })
  } catch (error) {
    console.error('Processing error:', error)
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Processing failed' },
      { status: 500 }
    )
  }
}
