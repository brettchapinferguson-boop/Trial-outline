import { NextRequest, NextResponse } from 'next/server'
import Anthropic from '@anthropic-ai/sdk'

export async function POST(req: NextRequest) {
  try {
    const { apiKey, documents, extractedData, request, currentOutline, editInstructions } = await req.json()
    
    if (!apiKey) {
      return NextResponse.json({ message: 'API key is required' }, { status: 400 })
    }
    
    const client = new Anthropic({ apiKey })
    
    // Different prompts for initial generation vs editing
    const isEdit = currentOutline && editInstructions
    
    const systemPrompt = `You are an expert trial attorney specializing in creating examination outlines. You have extensive experience in family law custody cases and expert witness cross-examination.

${isEdit ? `
EDITING MODE: You are revising an existing outline based on the user's feedback. Make ONLY the changes requested while preserving everything else. Be precise and surgical with edits.

Current outline being edited:
${JSON.stringify(currentOutline, null, 2)}

User's edit request: "${editInstructions}"

Apply the requested changes and return the updated outline.
` : `
GENERATION MODE: Create a comprehensive examination outline based on the documents provided.
`}

CRITICAL REQUIREMENTS:
1. Every question MUST cite specific page numbers from the source documents
2. Questions should be in proper examination form (leading for cross, open-ended for direct)
3. Include expected answer based on what the document actually says
4. Color-code by category

Categories and colors:
- "blue" = CREDENTIALS - Qualifications/background
- "yellow" = METHODOLOGY - Process/procedures  
- "orange" = BIAS - Inconsistencies/bias indicators
- "green" = FAVORABLE - Admissions that help your case
- "red" = DAMAGING - Impeachment/contradictions
- "purple" = CLOSING - Summary/undeniable facts

Return JSON with EXACTLY this structure:
{
  "title": "Cross-Examination of [Name]" or "Direct Examination of [Name]",
  "witness": "Full name with credentials",
  "type": "Cross-Examination" or "Direct Examination",
  "steps": [
    {
      "id": 1,
      "category": "CREDENTIALS",
      "question": "The exact question to ask",
      "purpose": "Strategic goal of this question",
      "expectedAnswer": "What witness will say based on document",
      "citation": "Document Name, Page X",
      "color": "blue",
      "followUp": "Follow-up question if needed" or null,
      "documentExcerpt": "Relevant quote from source"
    }
  ]
}

For cross-examination structure:
1. Establish credentials (to later limit them)
2. Lock in favorable testimony early  
3. Expose methodology weaknesses
4. Highlight bias/inconsistencies
5. Build to most damaging points
6. End with undeniable facts

Generate 8-15 items. Return ONLY valid JSON.`

    const userContent = isEdit 
      ? `Apply these edits to the outline: "${editInstructions}"\n\nSource documents for reference:\n${documents}`
      : `Case Information:\n${JSON.stringify(extractedData, null, 2)}\n\nSource Documents:\n${documents}\n\nRequest: ${request}\n\nGenerate the examination outline. Every question MUST cite a specific page from the documents.`

    const response = await client.messages.create({
      model: 'claude-sonnet-4-20250514',
      max_tokens: 8192,
      system: systemPrompt,
      messages: [{ role: 'user', content: userContent }]
    })
    
    const content = response.content[0]
    if (content.type !== 'text') {
      throw new Error('Unexpected response type')
    }
    
    // Parse JSON response
    let outline
    try {
      let jsonText = content.text.trim()
      if (jsonText.startsWith('```json')) jsonText = jsonText.slice(7)
      if (jsonText.startsWith('```')) jsonText = jsonText.slice(3)
      if (jsonText.endsWith('```')) jsonText = jsonText.slice(0, -3)
      outline = JSON.parse(jsonText.trim())
    } catch (e) {
      console.error('Failed to parse outline:', content.text)
      throw new Error('Failed to parse outline results')
    }
    
    if (!outline.title || !outline.witness || !outline.steps || !Array.isArray(outline.steps)) {
      throw new Error('Invalid outline structure')
    }
    
    return NextResponse.json(outline)
    
  } catch (error) {
    console.error('Generation error:', error)
    return NextResponse.json(
      { message: error instanceof Error ? error.message : 'Generation failed' },
      { status: 500 }
    )
  }
}
