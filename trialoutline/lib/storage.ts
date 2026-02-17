import { mkdir, writeFile, readFile, unlink, stat } from 'fs/promises'
import { join } from 'path'
import { v4 as uuidv4 } from 'uuid'

const UPLOAD_DIR = process.env.UPLOAD_DIR || join(process.cwd(), 'uploads')

export async function ensureUploadDir(): Promise<void> {
  try {
    await stat(UPLOAD_DIR)
  } catch {
    await mkdir(UPLOAD_DIR, { recursive: true })
  }
}

export async function ensureCaseDir(caseId: string): Promise<string> {
  const caseDir = join(UPLOAD_DIR, caseId)
  try {
    await stat(caseDir)
  } catch {
    await mkdir(caseDir, { recursive: true })
  }
  return caseDir
}

export async function saveFile(
  caseId: string,
  fileName: string,
  buffer: Buffer
): Promise<{ storagePath: string; fileSize: number }> {
  const caseDir = await ensureCaseDir(caseId)
  const ext = fileName.split('.').pop() || 'bin'
  const uniqueName = `${uuidv4()}.${ext}`
  const storagePath = join(caseDir, uniqueName)

  await writeFile(storagePath, buffer)

  return {
    storagePath,
    fileSize: buffer.length,
  }
}

export async function readStoredFile(storagePath: string): Promise<Buffer> {
  return readFile(storagePath)
}

export async function deleteStoredFile(storagePath: string): Promise<void> {
  try {
    await unlink(storagePath)
  } catch {
    // File may already be deleted
  }
}
