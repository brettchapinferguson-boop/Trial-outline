import { NextRequest, NextResponse } from 'next/server'
import Anthropic from '@anthropic-ai/sdk'

export async function POST(req: NextRequest) {
  try {
    const { apiKey, documents } = await req.json()
    
    if (!apiKey) {
      return NextResponse.json(
        { message: 'API key is required' },
        { status: 400 }
      )
    }
    
    const client = new Anthropic({ apiKey })
    
    const systemPrompt = `You are a legal document analyst specializing in family law and civil litigation. 
Your task is to extract structured information from legal documents including custody evaluations, depositions, pleadings, and exhibits.

Extract and return a JSON object with EXACTLY this structure:
{
  "caseInfo": {
    "caseName": "Party v. Party",
    "caseNumber": "case number if found",
    "court": "court name if found"
  },
  "parties": [
    { "name": "Full Name", "role": "Petitioner/Respondent/Plaintiff/Defendant", "attorney": "attorney name if known" }
  ],
  "witnesses": [
    { "name": "Full Name", "role": "description of their role", "type": "expert|party|fact|child" }
  ],
  "documents": [
    { "name": "Document title", "pages": number_of_pages, "type": "expert_report|deposition|exhibit|pleading" }
  ],
  "keyIssues": [
    "Issue 1",
    "Issue 2"
  ]
}

Be thorough in identifying all parties, witnesses, and key issues. For custody cases, always identify:
- Both parents
- Any children (with ages if mentioned)
- Custody evaluators (730 evaluators)
- Therapists, teachers, or other collateral contacts
- Key custody/visitation issues

Return ONLY the JSON object, no additional text.`

    const response = await client.messages.create({
      model: 'claude-sonnet-4-20250514',
      max_tokens: 4096,
      system: systemPrompt,
      messages: [
        {
          role: 'user',
          content: `Analyze these legal documents and extract the case information:\n\n${documents}`
        }
      ]
    })
    
    const content = response.content[0]
    if (content.type !== 'text') {
      throw new Error('Unexpected response type')
    }
    
    // Parse the JSON response
    let extracted
    try {
      // Handle potential markdown code blocks
      let jsonText = content.text.trim()
      if (jsonText.startsWith('```json')) {
        jsonText = jsonText.slice(7)
      }
      if (jsonText.startsWith('```')) {
        jsonText = jsonText.slice(3)
      }
      if (jsonText.endsWith('```')) {
        jsonText = jsonText.slice(0, -3)
      }
      extracted = JSON.parse(jsonText.trim())
    } catch (e) {
      console.error('Failed to parse extraction response:', content.text)
      throw new Error('Failed to parse document extraction results')
    }
    
    return NextResponse.json(extracted)
    
  } catch (error) {
    console.error('Extraction error:', error)
    return NextResponse.json(
      { message: error instanceof Error ? error.message : 'Extraction failed' },
      { status: 500 }
    )
  }
}
