import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/db'
import { saveFile, ensureUploadDir } from '@/lib/storage'
import { extractZip } from '@/lib/zip-extractor'

export const runtime = 'nodejs'

// Max body size handled by next.config.js (500MB)
export async function POST(
  req: NextRequest,
  { params }: { params: { caseId: string } }
) {
  try {
    const session = await getServerSession(authOptions)
    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    // Verify case ownership
    const caseData = await prisma.case.findFirst({
      where: { id: params.caseId, userId: session.user.id },
    })
    if (!caseData) {
      return NextResponse.json({ error: 'Case not found' }, { status: 404 })
    }

    await ensureUploadDir()

    const formData = await req.formData()
    const files = formData.getAll('files') as File[]

    if (!files.length) {
      return NextResponse.json({ error: 'No files provided' }, { status: 400 })
    }

    const uploadedDocuments: any[] = []

    for (const file of files) {
      const buffer = Buffer.from(await file.arrayBuffer())
      const fileName = file.name
      const isZip =
        file.type === 'application/zip' ||
        file.type === 'application/x-zip-compressed' ||
        fileName.toLowerCase().endsWith('.zip')

      if (isZip) {
        // Extract ZIP and create individual document records
        const extractedFiles = await extractZip(buffer, params.caseId)

        for (const extracted of extractedFiles) {
          const doc = await prisma.document.create({
            data: {
              caseId: params.caseId,
              fileName: extracted.fileName,
              originalName: extracted.fileName,
              fileSize: extracted.fileSize,
              mimeType: extracted.mimeType,
              storagePath: extracted.storagePath,
              status: 'pending',
            },
          })
          uploadedDocuments.push(doc)
        }
      } else {
        // Single file upload
        const { storagePath, fileSize } = await saveFile(params.caseId, fileName, buffer)

        const doc = await prisma.document.create({
          data: {
            caseId: params.caseId,
            fileName,
            originalName: fileName,
            fileSize,
            mimeType: file.type || getMimeType(fileName),
            storagePath,
            status: 'pending',
          },
        })
        uploadedDocuments.push(doc)
      }
    }

    return NextResponse.json({
      uploaded: uploadedDocuments.length,
      documents: uploadedDocuments.map((d) => ({
        id: d.id,
        fileName: d.fileName,
        fileSize: d.fileSize,
        status: d.status,
      })),
    })
  } catch (error) {
    console.error('Upload error:', error)
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Upload failed' },
      { status: 500 }
    )
  }
}

function getMimeType(fileName: string): string {
  const ext = fileName.split('.').pop()?.toLowerCase()
  const types: Record<string, string> = {
    pdf: 'application/pdf',
    docx: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    doc: 'application/msword',
    txt: 'text/plain',
    rtf: 'application/rtf',
  }
  return types[ext || ''] || 'application/octet-stream'
}
