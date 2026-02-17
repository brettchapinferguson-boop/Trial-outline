import StreamZip from 'node-stream-zip'
import { saveFile } from './storage'
import { basename, extname } from 'path'

const SUPPORTED_EXTENSIONS = new Set(['.pdf', '.docx', '.doc', '.txt', '.rtf'])
const IGNORED_PREFIXES = ['__MACOSX', '.DS_Store', 'Thumbs.db']

interface ExtractedFile {
  fileName: string
  storagePath: string
  fileSize: number
  mimeType: string
}

export async function extractZip(
  zipBuffer: Buffer,
  caseId: string
): Promise<ExtractedFile[]> {
  // Write ZIP to a temp file since node-stream-zip needs a path
  const { writeFile, unlink } = await import('fs/promises')
  const { join } = await import('path')
  const { tmpdir } = await import('os')
  const { v4: uuidv4 } = await import('uuid')

  const tempPath = join(tmpdir(), `trialoutline-${uuidv4()}.zip`)
  await writeFile(tempPath, zipBuffer)

  const extractedFiles: ExtractedFile[] = []

  try {
    const zip = new StreamZip.async({ file: tempPath })
    const entries = await zip.entries()

    for (const [name, entry] of Object.entries(entries)) {
      // Skip directories
      if (entry.isDirectory) continue

      // Skip hidden/system files
      if (IGNORED_PREFIXES.some((prefix) => name.includes(prefix))) continue

      // Skip unsupported file types
      const ext = extname(name).toLowerCase()
      if (!SUPPORTED_EXTENSIONS.has(ext)) continue

      // Skip empty files
      if (entry.size === 0) continue

      try {
        const data = await zip.entryData(name)
        const fileName = basename(name)

        const { storagePath, fileSize } = await saveFile(caseId, fileName, Buffer.from(data))

        const mimeType = getMimeType(ext)

        extractedFiles.push({
          fileName,
          storagePath,
          fileSize,
          mimeType,
        })
      } catch (err) {
        console.error(`Failed to extract ${name} from ZIP:`, err)
        // Continue with other files
      }
    }

    await zip.close()
  } finally {
    // Clean up temp file
    await unlink(tempPath).catch(() => {})
  }

  return extractedFiles
}

function getMimeType(ext: string): string {
  const types: Record<string, string> = {
    '.pdf': 'application/pdf',
    '.docx': 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    '.doc': 'application/msword',
    '.txt': 'text/plain',
    '.rtf': 'application/rtf',
  }
  return types[ext] || 'application/octet-stream'
}
