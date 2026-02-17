import Anthropic from '@anthropic-ai/sdk'
import {
  buildOutlineGenerationPrompt,
  WITNESS_PROFILE_PROMPT,
  OUTLINE_EDIT_PROMPT,
  DOCUMENT_EXTRACTION_PROMPT,
  METADATA_EXTRACTION_PROMPT,
} from './prompts'
import type { OutlineData, ExamType, WitnessProfile } from '../types'

function getClient(apiKey: string): Anthropic {
  return new Anthropic({ apiKey })
}

function parseAIJson<T>(text: string): T {
  let jsonText = text.trim()
  // Strip markdown code fences if present
  if (jsonText.startsWith('```json')) jsonText = jsonText.slice(7)
  else if (jsonText.startsWith('```')) jsonText = jsonText.slice(3)
  if (jsonText.endsWith('```')) jsonText = jsonText.slice(0, -3)
  return JSON.parse(jsonText.trim())
}

// ─── Case Extraction ─────────────────────────────────────────────

export async function extractCaseInfo(
  apiKey: string,
  documentTexts: Array<{ fileName: string; text: string }>
) {
  const client = getClient(apiKey)

  // For large document sets, process in batches
  const MAX_CHARS = 180000 // Leave room for system prompt and response
  let combinedText = ''
  const truncatedDocs: string[] = []

  for (const doc of documentTexts) {
    const docText = `\n--- ${doc.fileName} ---\n${doc.text}`
    if (combinedText.length + docText.length < MAX_CHARS) {
      combinedText += docText
    } else {
      // Truncate this doc to fit
      const remaining = MAX_CHARS - combinedText.length
      if (remaining > 1000) {
        combinedText += docText.slice(0, remaining) + '\n[... truncated ...]'
      }
      truncatedDocs.push(doc.fileName)
    }
  }

  const response = await client.messages.create({
    model: 'claude-sonnet-4-20250514',
    max_tokens: 8192,
    system: DOCUMENT_EXTRACTION_PROMPT,
    messages: [
      {
        role: 'user',
        content: `Analyze these legal documents and extract all case information:\n\n${combinedText}`,
      },
    ],
  })

  const content = response.content[0]
  if (content.type !== 'text') throw new Error('Unexpected response type')

  const result = parseAIJson<any>(content.text)

  if (truncatedDocs.length > 0) {
    result._truncatedDocuments = truncatedDocs
  }

  return result
}

// ─── Document Metadata Extraction ────────────────────────────────

export async function extractDocumentMetadata(
  apiKey: string,
  fileName: string,
  pageTexts: string[]
) {
  const client = getClient(apiKey)

  // Send first few pages for metadata extraction (usually enough)
  const sampleText = pageTexts.slice(0, 5).join('\n\n--- PAGE BREAK ---\n\n')

  const response = await client.messages.create({
    model: 'claude-sonnet-4-20250514',
    max_tokens: 4096,
    system: METADATA_EXTRACTION_PROMPT,
    messages: [
      {
        role: 'user',
        content: `Extract metadata from this document (filename: "${fileName}"):\n\n${sampleText}`,
      },
    ],
  })

  const content = response.content[0]
  if (content.type !== 'text') throw new Error('Unexpected response type')

  return parseAIJson<any>(content.text)
}

// ─── Witness Profile Building ────────────────────────────────────

export async function buildWitnessProfile(
  apiKey: string,
  witnessName: string,
  witnessType: string,
  witnessSide: string,
  caseTheory: string,
  documentTexts: Array<{ fileName: string; text: string }>
): Promise<WitnessProfile> {
  const client = getClient(apiKey)

  // Combine documents with size limit
  const MAX_CHARS = 180000
  let combinedText = ''

  for (const doc of documentTexts) {
    const docText = `\n--- ${doc.fileName} ---\n${doc.text}`
    if (combinedText.length + docText.length < MAX_CHARS) {
      combinedText += docText
    } else {
      const remaining = MAX_CHARS - combinedText.length
      if (remaining > 1000) {
        combinedText += docText.slice(0, remaining) + '\n[... truncated ...]'
      }
      break
    }
  }

  const response = await client.messages.create({
    model: 'claude-sonnet-4-20250514',
    max_tokens: 16384,
    system: WITNESS_PROFILE_PROMPT,
    messages: [
      {
        role: 'user',
        content: `Build a comprehensive witness profile for trial preparation.

WITNESS: ${witnessName}
TYPE: ${witnessType}
SIDE: ${witnessSide}
ATTORNEY'S CASE THEORY: ${caseTheory}

SOURCE DOCUMENTS:
${combinedText}

Analyze every document for information about ${witnessName}. Extract all facts, statements, opinions, and potential inconsistencies.`,
      },
    ],
  })

  const content = response.content[0]
  if (content.type !== 'text') throw new Error('Unexpected response type')

  return parseAIJson<WitnessProfile>(content.text)
}

// ─── Outline Generation ──────────────────────────────────────────

export async function generateOutline(
  apiKey: string,
  examType: ExamType,
  witnessName: string,
  witnessProfile: any,
  caseInfo: any,
  caseTheory: string,
  caseTheme: string,
  documentTexts: Array<{ fileName: string; text: string }>,
  additionalInstructions?: string
): Promise<OutlineData> {
  const client = getClient(apiKey)

  const systemPrompt = buildOutlineGenerationPrompt(examType as 'cross' | 'direct')

  // Build the document context
  const MAX_CHARS = 150000
  let combinedText = ''

  for (const doc of documentTexts) {
    const docText = `\n--- ${doc.fileName} ---\n${doc.text}`
    if (combinedText.length + docText.length < MAX_CHARS) {
      combinedText += docText
    } else {
      const remaining = MAX_CHARS - combinedText.length
      if (remaining > 1000) {
        combinedText += docText.slice(0, remaining) + '\n[... truncated ...]'
      }
      break
    }
  }

  const userContent = `Generate a ${examType}-examination outline for ${witnessName}.

CASE INFORMATION:
${JSON.stringify(caseInfo, null, 2)}

CASE THEORY: ${caseTheory}

CASE THEME: ${caseTheme}

WITNESS PROFILE:
${JSON.stringify(witnessProfile, null, 2)}

SOURCE DOCUMENTS:
${combinedText}

${additionalInstructions ? `\nADDITIONAL INSTRUCTIONS FROM ATTORNEY:\n${additionalInstructions}` : ''}

Generate the ${examType}-examination outline following the Chapter Method. Every question MUST cite a specific document and page number. Include impeachment readiness for key questions.`

  const response = await client.messages.create({
    model: 'claude-sonnet-4-20250514',
    max_tokens: 16384,
    system: systemPrompt,
    messages: [{ role: 'user', content: userContent }],
  })

  const content = response.content[0]
  if (content.type !== 'text') throw new Error('Unexpected response type')

  const outline = parseAIJson<OutlineData>(content.text)

  // Validate structure
  if (!outline.title || !outline.witness || !outline.chapters || !Array.isArray(outline.chapters)) {
    throw new Error('Invalid outline structure returned by AI')
  }

  return outline
}

// ─── Outline Editing ─────────────────────────────────────────────

export async function editOutline(
  apiKey: string,
  currentOutline: OutlineData,
  editInstructions: string,
  documentTexts: Array<{ fileName: string; text: string }>
): Promise<OutlineData> {
  const client = getClient(apiKey)

  const MAX_CHARS = 100000
  let combinedText = ''

  for (const doc of documentTexts) {
    const docText = `\n--- ${doc.fileName} ---\n${doc.text}`
    if (combinedText.length + docText.length < MAX_CHARS) {
      combinedText += docText
    } else {
      break
    }
  }

  const response = await client.messages.create({
    model: 'claude-sonnet-4-20250514',
    max_tokens: 16384,
    system: OUTLINE_EDIT_PROMPT,
    messages: [
      {
        role: 'user',
        content: `CURRENT OUTLINE:
${JSON.stringify(currentOutline, null, 2)}

EDIT INSTRUCTIONS:
${editInstructions}

SOURCE DOCUMENTS FOR REFERENCE:
${combinedText}

Apply the requested edits and return the complete updated outline.`,
      },
    ],
  })

  const content = response.content[0]
  if (content.type !== 'text') throw new Error('Unexpected response type')

  const updatedOutline = parseAIJson<OutlineData>(content.text)

  if (!updatedOutline.title || !updatedOutline.chapters) {
    throw new Error('Invalid outline structure after edit')
  }

  return updatedOutline
}
