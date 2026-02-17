import { readStoredFile } from './storage'
import type { PageContent, DocType, SpeakerAttribution } from './types'

// ─── PDF Parsing ─────────────────────────────────────────────────

export async function parsePDF(storagePath: string): Promise<PageContent[]> {
  const pdfParse = (await import('pdf-parse')).default
  const buffer = await readStoredFile(storagePath)

  const pages: PageContent[] = []

  // pdf-parse gives us the full text, but we need per-page
  // Use a custom page renderer to capture text per page
  let currentPage = 0
  const pageTexts: string[] = []

  const data = await pdfParse(buffer, {
    pagerender: async function (pageData: any) {
      const textContent = await pageData.getTextContent()
      const strings = textContent.items.map((item: any) => item.str)
      const pageText = strings.join(' ')
      pageTexts.push(pageText)
      return pageText
    },
  })

  // Build page content array
  for (let i = 0; i < pageTexts.length; i++) {
    pages.push({
      pageNumber: i + 1,
      text: pageTexts[i] || '',
    })
  }

  // If page rendering didn't work, fall back to splitting by page markers
  if (pages.length === 0 && data.text) {
    // Try to split by common page break indicators
    const fullText = data.text
    const pageChunks = fullText.split(/\f/) // form feed character

    if (pageChunks.length > 1) {
      pageChunks.forEach((chunk, i) => {
        pages.push({ pageNumber: i + 1, text: chunk.trim() })
      })
    } else {
      // Single page fallback
      pages.push({ pageNumber: 1, text: fullText })
    }
  }

  return pages.filter((p) => p.text.trim().length > 0)
}

// ─── DOCX Parsing ────────────────────────────────────────────────

export async function parseDOCX(storagePath: string): Promise<PageContent[]> {
  const mammoth = await import('mammoth')
  const buffer = await readStoredFile(storagePath)

  const result = await mammoth.extractRawText({ buffer })
  const text = result.value

  // DOCX doesn't have page numbers, so we chunk by ~3000 chars
  const CHUNK_SIZE = 3000
  const pages: PageContent[] = []
  const paragraphs = text.split('\n\n')
  let currentChunk = ''
  let pageNum = 1

  for (const para of paragraphs) {
    if (currentChunk.length + para.length > CHUNK_SIZE && currentChunk.length > 0) {
      pages.push({ pageNumber: pageNum, text: currentChunk.trim() })
      pageNum++
      currentChunk = ''
    }
    currentChunk += para + '\n\n'
  }

  if (currentChunk.trim()) {
    pages.push({ pageNumber: pageNum, text: currentChunk.trim() })
  }

  return pages
}

// ─── TXT Parsing ─────────────────────────────────────────────────

export async function parseTXT(storagePath: string): Promise<PageContent[]> {
  const buffer = await readStoredFile(storagePath)
  const text = buffer.toString('utf-8')

  // Split into pages of ~3000 chars at paragraph boundaries
  const CHUNK_SIZE = 3000
  const pages: PageContent[] = []
  const paragraphs = text.split('\n\n')
  let currentChunk = ''
  let pageNum = 1

  for (const para of paragraphs) {
    if (currentChunk.length + para.length > CHUNK_SIZE && currentChunk.length > 0) {
      pages.push({ pageNumber: pageNum, text: currentChunk.trim() })
      pageNum++
      currentChunk = ''
    }
    currentChunk += para + '\n\n'
  }

  if (currentChunk.trim()) {
    pages.push({ pageNumber: pageNum, text: currentChunk.trim() })
  }

  return pages
}

// ─── Document Type Classification ────────────────────────────────

export function classifyDocumentType(text: string, fileName: string): DocType {
  const lowerText = text.toLowerCase()
  const lowerName = fileName.toLowerCase()

  // Deposition detection
  if (
    /\bq\.\s+/m.test(text) &&
    /\ba\.\s+/m.test(text) &&
    (/deposition|examination|transcript/i.test(text) || /depo/i.test(lowerName))
  ) {
    return 'deposition'
  }

  // Expert report
  if (
    /\b(report of|expert report|opinion|methodology|findings)\b/i.test(text) &&
    /\b(dr\.|ph\.d|m\.d|expert|professional|evaluation)\b/i.test(text)
  ) {
    return 'expert_report'
  }

  // Court filing
  if (
    /\b(in the|circuit court|district court|superior court|court of)\b/i.test(text) &&
    /\b(plaintiff|defendant|petitioner|respondent|motion|order|complaint|answer)\b/i.test(text)
  ) {
    return 'court_filing'
  }

  // Text messages
  if (
    /\d{1,2}[/:]\d{2}\s*(am|pm)/i.test(text) &&
    /\b(sent|delivered|read|imessage|sms)\b/i.test(text)
  ) {
    return 'text_messages'
  }

  // Email / correspondence
  if (/\b(from|to|subject|cc|bcc):\s/i.test(text) && /\b(sent|date|re:|fwd:)\b/i.test(text)) {
    return 'correspondence'
  }

  // Contract
  if (
    /\b(agreement|contract|hereby|witnesseth|whereas|party of the first part)\b/i.test(text) &&
    /\b(shall|term|consideration|covenant)\b/i.test(text)
  ) {
    return 'contract'
  }

  // Financial
  if (
    /\b(balance|account|statement|invoice|payment|income|expense|tax)\b/i.test(text) &&
    /\$[\d,]+/.test(text)
  ) {
    return 'financial'
  }

  // Medical
  if (
    /\b(diagnosis|treatment|patient|medical|clinical|symptoms|prognosis)\b/i.test(text)
  ) {
    return 'medical'
  }

  // File name hints
  if (/exhibit/i.test(lowerName)) return 'exhibit'
  if (/depo/i.test(lowerName)) return 'deposition'
  if (/report/i.test(lowerName)) return 'expert_report'
  if (/contract|agreement/i.test(lowerName)) return 'contract'

  return 'other'
}

// ─── Speaker Attribution ─────────────────────────────────────────

export function extractDepositionSpeakers(text: string): SpeakerAttribution[] {
  const attributions: SpeakerAttribution[] = []
  const lines = text.split('\n')
  let currentSpeaker = ''
  let currentPage = 1

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i].trim()

    // Page number detection
    const pageMatch = line.match(/^(?:Page\s+)?(\d+)$/)
    if (pageMatch && parseInt(pageMatch[1]) === currentPage + 1) {
      currentPage = parseInt(pageMatch[1])
      continue
    }

    // Attorney identification: "BY MR. SMITH:" or "BY MS. JONES:"
    const attorneyMatch = line.match(/^BY\s+(MR\.|MS\.|MRS\.|DR\.)\s*([A-Z][A-Z\s'-]+):?\s*$/i)
    if (attorneyMatch) {
      currentSpeaker = `${attorneyMatch[1]} ${attorneyMatch[2]}`.trim()
      continue
    }

    // "THE WITNESS:", "THE COURT:", etc.
    const theMatch = line.match(/^THE\s+(WITNESS|COURT|REPORTER|CLERK|VIDEOGRAPHER)\s*:(.*)$/i)
    if (theMatch) {
      const statement = theMatch[2]?.trim()
      if (statement) {
        attributions.push({
          speakerName: `The ${theMatch[1]}`,
          pageNumber: currentPage,
          text: statement,
          context: 'interjection',
        })
      }
      continue
    }

    // Q. / A. pattern
    const qaMatch = line.match(/^\s*(Q|A)\.\s+(.+)$/)
    if (qaMatch) {
      const speaker = qaMatch[1] === 'Q' ? currentSpeaker || 'Examining Attorney' : 'The Witness'
      const statement = qaMatch[2].trim()

      // Capture multi-line Q/A (lines that don't start with Q. or A.)
      let fullStatement = statement
      for (let j = i + 1; j < lines.length; j++) {
        const nextLine = lines[j].trim()
        if (
          nextLine.match(/^\s*(Q|A)\.\s/) ||
          nextLine.match(/^BY\s+/i) ||
          nextLine.match(/^THE\s+/i) ||
          nextLine === ''
        ) {
          break
        }
        fullStatement += ' ' + nextLine
      }

      attributions.push({
        speakerName: speaker,
        pageNumber: currentPage,
        text: fullStatement,
        context: qaMatch[1] === 'Q' ? 'question' : 'answer',
      })
    }
  }

  return attributions
}

export function extractTextMessageSpeakers(text: string): SpeakerAttribution[] {
  const attributions: SpeakerAttribution[] = []
  const lines = text.split('\n')
  let currentPage = 1

  for (const line of lines) {
    // Common text message export formats:
    // "[1/15/24, 2:30:45 PM] John Smith: Hey there"
    // "1/15/24 2:30 PM - John Smith: Hey there"
    // "John Smith (1/15/24 2:30 PM): Hey there"

    const patterns = [
      /^\[?(\d{1,2}\/\d{1,2}\/\d{2,4}),?\s+(\d{1,2}:\d{2}(?::\d{2})?\s*(?:AM|PM)?)\]?\s*[-–]?\s*(.+?):\s*(.+)$/i,
      /^(\d{1,2}\/\d{1,2}\/\d{2,4})\s+(\d{1,2}:\d{2}\s*(?:AM|PM)?)\s*[-–]\s*(.+?):\s*(.+)$/i,
      /^(.+?)\s*\((\d{1,2}\/\d{1,2}\/\d{2,4}\s+\d{1,2}:\d{2}\s*(?:AM|PM)?)\):\s*(.+)$/i,
    ]

    for (const pattern of patterns) {
      const match = line.match(pattern)
      if (match) {
        const speakerName = match[3].trim()
        const messageText = match[4]?.trim() || match[3]?.trim()

        if (speakerName && messageText) {
          attributions.push({
            speakerName,
            pageNumber: currentPage,
            text: messageText,
            context: 'text_message',
          })
        }
        break
      }
    }
  }

  return attributions
}

export function extractEmailSpeakers(text: string): SpeakerAttribution[] {
  const attributions: SpeakerAttribution[] = []
  const emails = text.split(/(?=From:\s)/i)
  let currentPage = 1

  for (const email of emails) {
    const fromMatch = email.match(/From:\s*(.+?)(?:\n|$)/i)
    const dateMatch = email.match(/(?:Date|Sent):\s*(.+?)(?:\n|$)/i)

    if (fromMatch) {
      // Extract just the name from "Name <email>" format
      let sender = fromMatch[1].trim()
      const nameMatch = sender.match(/^"?([^"<]+)"?\s*</)
      if (nameMatch) {
        sender = nameMatch[1].trim()
      }

      // Get the body (everything after the headers)
      const bodyStart = email.search(/\n\s*\n/)
      if (bodyStart > -1) {
        const body = email.slice(bodyStart).trim()
        if (body) {
          attributions.push({
            speakerName: sender,
            pageNumber: currentPage,
            text: body.slice(0, 500), // Truncate long emails
            context: 'email',
          })
        }
      }
    }
    currentPage++
  }

  return attributions
}
