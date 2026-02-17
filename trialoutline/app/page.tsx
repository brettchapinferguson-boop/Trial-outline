'use client'

import { useState, useRef, useEffect } from 'react'
import { 
  Upload, FileText, MessageSquare, Send, ChevronLeft, ChevronRight, 
  X, Eye, Trash2, Loader2, Download, Printer, Settings, Edit3, RefreshCw, Undo, Redo
} from 'lucide-react'

interface CaseFile {
  id: string
  name: string
  size: number
  content?: string
  type: string
}

interface ExtractionResult {
  caseInfo: {
    caseName: string
    caseNumber: string
    court: string
  }
  parties: Array<{ name: string; role: string; attorney?: string }>
  witnesses: Array<{ name: string; role: string; type: string }>
  documents: Array<{ name: string; pages: number; type: string }>
  keyIssues: string[]
}

interface OutlineStep {
  id: number
  category: string
  question: string
  purpose: string
  expectedAnswer: string
  citation: string
  color: string
  followUp?: string
  documentExcerpt?: string
}

interface GeneratedOutline {
  title: string
  witness: string
  type: string
  steps: OutlineStep[]
}

interface ChatMessage {
  role: 'user' | 'assistant'
  content: string
}

export default function TrialOutline() {
  const [files, setFiles] = useState<CaseFile[]>([])
  const [chatMessages, setChatMessages] = useState<ChatMessage[]>([])
  const [chatInput, setChatInput] = useState('')
  const [currentView, setCurrentView] = useState<'builder' | 'viewer'>('builder')
  const [isProcessing, setIsProcessing] = useState(false)
  const [processingStage, setProcessingStage] = useState('')
  const [extractedData, setExtractedData] = useState<ExtractionResult | null>(null)
  const [generatedOutline, setGeneratedOutline] = useState<GeneratedOutline | null>(null)
  const [currentStep, setCurrentStep] = useState(0)
  const [apiKey, setApiKey] = useState('')
  const [showSettings, setShowSettings] = useState(false)
  
  // Human review state
  const [showEditPanel, setShowEditPanel] = useState(false)
  const [editMessages, setEditMessages] = useState<ChatMessage[]>([])
  const [editInput, setEditInput] = useState('')
  const [isEditing, setIsEditing] = useState(false)
  const [outlineHistory, setOutlineHistory] = useState<GeneratedOutline[]>([])
  const [historyIndex, setHistoryIndex] = useState(-1)
  
  const fileInputRef = useRef<HTMLInputElement>(null)
  const messagesEndRef = useRef<HTMLDivElement>(null)
  const editMessagesEndRef = useRef<HTMLDivElement>(null)

  // Load API key from localStorage
  useEffect(() => {
    const saved = localStorage.getItem('anthropic_api_key')
    if (saved) setApiKey(saved)
  }, [])

  const saveApiKey = (key: string) => {
    setApiKey(key)
    localStorage.setItem('anthropic_api_key', key)
    setShowSettings(false)
  }

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [chatMessages, isProcessing])

  useEffect(() => {
    editMessagesEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [editMessages, isEditing])

  // Keyboard navigation
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (currentView !== 'viewer' || !generatedOutline) return
      if (showEditPanel && (e.target as HTMLElement).tagName === 'INPUT') return
      
      if (e.key === 'ArrowRight' || e.key === ' ') {
        e.preventDefault()
        setCurrentStep(prev => Math.min(generatedOutline.steps.length - 1, prev + 1))
      } else if (e.key === 'ArrowLeft') {
        e.preventDefault()
        setCurrentStep(prev => Math.max(0, prev - 1))
      } else if (e.key === 'Escape') {
        if (showEditPanel) {
          setShowEditPanel(false)
        } else {
          setCurrentView('builder')
        }
      } else if (e.key === 'e' && !showEditPanel) {
        setShowEditPanel(true)
      }
    }
    
    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [currentView, generatedOutline, showEditPanel])

  // Parse PDF client-side
  const parsePDF = async (file: File): Promise<string> => {
    const pdfjsLib = await import('pdfjs-dist')
    pdfjsLib.GlobalWorkerOptions.workerSrc = `//cdnjs.cloudflare.com/ajax/libs/pdf.js/4.0.379/pdf.worker.min.js`
    
    const arrayBuffer = await file.arrayBuffer()
    const pdf = await pdfjsLib.getDocument({ data: arrayBuffer }).promise
    
    let fullText = ''
    for (let i = 1; i <= pdf.numPages; i++) {
      const page = await pdf.getPage(i)
      const textContent = await page.getTextContent()
      const pageText = textContent.items
        .map((item: any) => item.str)
        .join(' ')
      fullText += `\n--- Page ${i} ---\n${pageText}`
    }
    
    return fullText
  }

  const readFileContent = async (file: File): Promise<string> => {
    if (file.type === 'application/pdf' || file.name.toLowerCase().endsWith('.pdf')) {
      try {
        return await parsePDF(file)
      } catch (e) {
        console.error('PDF parsing failed:', e)
        return `[PDF parsing failed for: ${file.name}. Try uploading as text.]`
      }
    }
    
    return new Promise((resolve) => {
      const reader = new FileReader()
      reader.onload = (e) => {
        const result = e.target?.result
        resolve(typeof result === 'string' ? result : `[Could not read: ${file.name}]`)
      }
      reader.onerror = () => resolve(`[Error reading: ${file.name}]`)
      reader.readAsText(file)
    })
  }

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const uploadedFiles = Array.from(e.target.files || [])
    
    setIsProcessing(true)
    
    const newFiles: CaseFile[] = []
    for (const file of uploadedFiles) {
      setProcessingStage(`Reading ${file.name}...`)
      const content = await readFileContent(file)
      newFiles.push({
        id: `${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
        name: file.name,
        size: file.size,
        type: file.type,
        content
      })
    }
    
    setFiles(prev => [...prev, ...newFiles])
    setIsProcessing(false)
    setProcessingStage('')
  }

  const removeFile = (id: string) => {
    setFiles(files.filter(f => f.id !== id))
  }

  const extractCaseInfo = async (): Promise<ExtractionResult> => {
    if (!apiKey) throw new Error('Please set your Anthropic API key in settings')

    const fileContents = files.map(f => `--- ${f.name} ---\n${f.content}`).join('\n\n')
    
    const response = await fetch('/api/extract', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ apiKey, documents: fileContents })
    })
    
    if (!response.ok) {
      const error = await response.json()
      throw new Error(error.message || 'Extraction failed')
    }
    
    return response.json()
  }

  const generateOutline = async (request: string, editInstructions?: string): Promise<GeneratedOutline> => {
    if (!apiKey) throw new Error('Please set your Anthropic API key in settings')

    const fileContents = files.map(f => `--- ${f.name} ---\n${f.content}`).join('\n\n')
    
    const response = await fetch('/api/generate', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        apiKey,
        documents: fileContents,
        extractedData,
        request,
        currentOutline: editInstructions ? generatedOutline : undefined,
        editInstructions
      })
    })
    
    if (!response.ok) {
      const error = await response.json()
      throw new Error(error.message || 'Generation failed')
    }
    
    return response.json()
  }

  const handleSendMessage = async () => {
    if (!chatInput.trim()) return
    
    const userMessage = chatInput.trim()
    setChatInput('')
    setChatMessages(prev => [...prev, { role: 'user', content: userMessage }])
    
    try {
      if (files.length > 0 && !extractedData) {
        setIsProcessing(true)
        setProcessingStage('Analyzing documents...')
        
        const extracted = await extractCaseInfo()
        setExtractedData(extracted)
        
        setIsProcessing(false)
        setChatMessages(prev => [...prev, {
          role: 'assistant',
          content: `I've analyzed your documents:\n\n**Case:** ${extracted.caseInfo.caseName}\n**Court:** ${extracted.caseInfo.court}\n\n**Parties:**\n${extracted.parties.map(p => `• ${p.name} (${p.role})`).join('\n')}\n\n**Witnesses:**\n${extracted.witnesses.map(w => `• ${w.name} - ${w.role}`).join('\n')}\n\n**Key Issues:**\n${extracted.keyIssues.map(i => `• ${i}`).join('\n')}\n\nWhat outline would you like me to generate?`
        }])
        return
      }
      
      const isOutlineRequest = /cross|direct|exam|outline|question/i.test(userMessage)
      
      if (isOutlineRequest && extractedData) {
        setIsProcessing(true)
        setProcessingStage('Generating examination outline...')
        
        const outline = await generateOutline(userMessage)
        setGeneratedOutline(outline)
        setOutlineHistory([outline])
        setHistoryIndex(0)
        setCurrentStep(0)
        setEditMessages([])
        
        setIsProcessing(false)
        setChatMessages(prev => [...prev, {
          role: 'assistant',
          content: `Generated **${outline.type}** for **${outline.witness}** with ${outline.steps.length} items.\n\nClick **"View Outline"** to review. Press **E** to open the edit panel and make revisions.`
        }])
      } else {
        setChatMessages(prev => [...prev, {
          role: 'assistant',
          content: files.length === 0 
            ? 'Upload your case files first, then I can create examination outlines.'
            : 'What examination outline do you need? Try:\n• "Cross-examination of Dr. [Name]"\n• "Direct examination of [Client]"'
        }])
      }
    } catch (error) {
      setIsProcessing(false)
      setChatMessages(prev => [...prev, {
        role: 'assistant',
        content: `Error: ${error instanceof Error ? error.message : 'Something went wrong'}`
      }])
    }
  }

  // Human review: send edit request
  const handleSendEdit = async () => {
    if (!editInput.trim() || !generatedOutline) return
    
    const userEdit = editInput.trim()
    setEditInput('')
    setEditMessages(prev => [...prev, { role: 'user', content: userEdit }])
    
    try {
      setIsEditing(true)
      
      const updatedOutline = await generateOutline(
        `${generatedOutline.type} of ${generatedOutline.witness}`,
        userEdit
      )
      
      // Save to history for undo/redo
      const newHistory = [...outlineHistory.slice(0, historyIndex + 1), updatedOutline]
      setOutlineHistory(newHistory)
      setHistoryIndex(newHistory.length - 1)
      setGeneratedOutline(updatedOutline)
      
      setIsEditing(false)
      setEditMessages(prev => [...prev, {
        role: 'assistant',
        content: `✓ Updated! Now ${updatedOutline.steps.length} items. Review the changes or continue editing.`
      }])
    } catch (error) {
      setIsEditing(false)
      setEditMessages(prev => [...prev, {
        role: 'assistant',
        content: `Error: ${error instanceof Error ? error.message : 'Update failed'}`
      }])
    }
  }

  const undoOutline = () => {
    if (historyIndex > 0) {
      setHistoryIndex(prev => prev - 1)
      setGeneratedOutline(outlineHistory[historyIndex - 1])
    }
  }

  const redoOutline = () => {
    if (historyIndex < outlineHistory.length - 1) {
      setHistoryIndex(prev => prev + 1)
      setGeneratedOutline(outlineHistory[historyIndex + 1])
    }
  }

  const exportHTML = () => {
    if (!generatedOutline) return
    
    const html = `<!DOCTYPE html>
<html><head><title>${generatedOutline.title}</title>
<style>
body{font-family:Georgia,serif;max-width:800px;margin:40px auto;padding:20px;line-height:1.6}
h1{border-bottom:2px solid #1e293b;padding-bottom:10px}
.step{margin:30px 0;padding:20px;border:1px solid #e2e8f0;border-radius:8px;page-break-inside:avoid}
.category{display:inline-block;padding:4px 12px;border-radius:20px;font-size:12px;font-weight:bold;margin-bottom:10px;background:#e2e8f0}
.question{font-size:18px;font-weight:600;margin:10px 0}
.purpose{color:#64748b;margin:10px 0}
.expected{color:#22c55e;font-style:italic;margin:10px 0}
.citation{background:#fef3c7;padding:10px;border-radius:4px;margin:10px 0}
.followup{background:#dbeafe;padding:10px;border-radius:4px;margin:10px 0}
</style></head><body>
<h1>${generatedOutline.title}</h1>
<p><strong>Witness:</strong> ${generatedOutline.witness}</p>
<p><strong>Type:</strong> ${generatedOutline.type}</p>
${generatedOutline.steps.map((step, i) => `
<div class="step">
<div class="category">${step.category}</div>
<div class="question">Q${i + 1}: "${step.question}"</div>
<div class="purpose"><strong>Purpose:</strong> ${step.purpose}</div>
<div class="expected"><strong>Expected:</strong> "${step.expectedAnswer}"</div>
<div class="citation"><strong>Citation:</strong> ${step.citation}</div>
${step.followUp ? `<div class="followup"><strong>Follow-up:</strong> "${step.followUp}"</div>` : ''}
</div>`).join('')}
</body></html>`
    
    const blob = new Blob([html], { type: 'text/html' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `${generatedOutline.title.replace(/\s+/g, '_')}.html`
    a.click()
    URL.revokeObjectURL(url)
  }

  const getCategoryClass = (color: string) => {
    const classes: Record<string, string> = {
      blue: 'badge-credentials',
      yellow: 'badge-methodology',
      orange: 'badge-bias',
      green: 'badge-favorable',
      red: 'badge-damaging',
      purple: 'badge-closing'
    }
    return classes[color] || 'badge-credentials'
  }

  // Settings Modal
  const SettingsModal = () => (
    <div className="fixed inset-0 bg-black/70 flex items-center justify-center z-50">
      <div className="bg-slate-800 rounded-xl p-6 w-full max-w-md mx-4">
        <h2 className="text-xl font-bold mb-4">Settings</h2>
        <div className="mb-4">
          <label className="block text-sm text-slate-400 mb-2">Anthropic API Key</label>
          <input
            type="password"
            value={apiKey}
            onChange={(e) => setApiKey(e.target.value)}
            placeholder="sk-ant-..."
            className="w-full bg-slate-900 border border-slate-600 rounded-lg px-4 py-3 text-white"
          />
          <p className="text-xs text-slate-500 mt-2">Get your key at console.anthropic.com</p>
        </div>
        <div className="flex gap-3">
          <button onClick={() => setShowSettings(false)} className="flex-1 py-2 bg-slate-700 hover:bg-slate-600 rounded-lg">Cancel</button>
          <button onClick={() => saveApiKey(apiKey)} className="flex-1 py-2 bg-blue-600 hover:bg-blue-500 rounded-lg">Save</button>
        </div>
      </div>
    </div>
  )

  // VIEWER MODE
  if (currentView === 'viewer' && generatedOutline) {
    const step = generatedOutline.steps[currentStep]
    
    return (
      <div className="min-h-screen bg-slate-900 text-white">
        {/* Header */}
        <header className="bg-slate-800 border-b border-slate-700 px-4 lg:px-6 py-3">
          <div className="flex items-center justify-between">
            <div className="min-w-0">
              <h1 className="text-lg font-bold truncate">{generatedOutline.title}</h1>
              <p className="text-slate-400 text-sm">{generatedOutline.witness}</p>
            </div>
            <div className="flex items-center gap-2 flex-shrink-0">
              {outlineHistory.length > 1 && (
                <>
                  <button onClick={undoOutline} disabled={historyIndex === 0} className="p-2 bg-slate-700 hover:bg-slate-600 disabled:opacity-40 rounded-lg" title="Undo">
                    <Undo className="w-4 h-4" />
                  </button>
                  <button onClick={redoOutline} disabled={historyIndex === outlineHistory.length - 1} className="p-2 bg-slate-700 hover:bg-slate-600 disabled:opacity-40 rounded-lg" title="Redo">
                    <Redo className="w-4 h-4" />
                  </button>
                  <span className="text-xs text-slate-500 hidden sm:block">v{historyIndex + 1}</span>
                </>
              )}
              <button onClick={() => setShowEditPanel(!showEditPanel)} className={`p-2 rounded-lg ${showEditPanel ? 'bg-blue-600' : 'bg-slate-700 hover:bg-slate-600'}`} title="Edit (E)">
                <Edit3 className="w-5 h-5" />
              </button>
              <button onClick={exportHTML} className="p-2 bg-slate-700 hover:bg-slate-600 rounded-lg hidden sm:block" title="Export">
                <Download className="w-5 h-5" />
              </button>
              <button onClick={() => setCurrentView('builder')} className="px-3 py-2 bg-slate-700 hover:bg-slate-600 rounded-lg flex items-center gap-1">
                <X className="w-4 h-4" /> <span className="hidden sm:inline">Exit</span>
              </button>
            </div>
          </div>
        </header>
        
        {/* Progress */}
        <div className="bg-slate-800/50 px-4 lg:px-6 py-2">
          <div className="flex items-center gap-3">
            <span className="text-sm text-slate-400">Step {currentStep + 1}/{generatedOutline.steps.length}</span>
            <div className="flex-1 bg-slate-700 rounded-full h-1.5">
              <div className="bg-blue-500 h-1.5 rounded-full transition-all" style={{ width: `${((currentStep + 1) / generatedOutline.steps.length) * 100}%` }} />
            </div>
          </div>
        </div>
        
        {/* Main Content */}
        <div className="flex flex-col lg:flex-row" style={{ height: 'calc(100vh - 160px)' }}>
          {/* Question Panel */}
          <div className={`${showEditPanel ? 'lg:w-[35%]' : 'lg:w-1/2'} p-4 lg:p-6 border-b lg:border-b-0 lg:border-r border-slate-700 overflow-y-auto`}>
            <div className={`inline-block px-3 py-1 rounded-full text-xs font-bold mb-4 border ${getCategoryClass(step.color)}`}>
              {step.category}
            </div>
            
            <h2 className="text-xl lg:text-2xl font-semibold mb-4 leading-relaxed">"{step.question}"</h2>
            
            <div className="space-y-3">
              <div className="bg-slate-800 rounded-lg p-4">
                <h3 className="text-xs font-bold text-slate-400 mb-1 uppercase">Purpose</h3>
                <p className="text-slate-200">{step.purpose}</p>
              </div>
              
              <div className="bg-slate-800 rounded-lg p-4">
                <h3 className="text-xs font-bold text-slate-400 mb-1 uppercase">Expected Answer</h3>
                <p className="text-green-400 italic">"{step.expectedAnswer}"</p>
              </div>
              
              {step.followUp && (
                <div className="bg-blue-900/30 border border-blue-600 rounded-lg p-4">
                  <h3 className="text-xs font-bold text-blue-400 mb-1 uppercase">→ Follow-Up</h3>
                  <p className="text-blue-200">"{step.followUp}"</p>
                </div>
              )}
            </div>
          </div>
          
          {/* Citation Panel */}
          <div className={`${showEditPanel ? 'lg:w-[30%]' : 'lg:w-1/2'} ${showEditPanel ? 'hidden lg:block' : ''} p-4 lg:p-6 bg-slate-800/50 overflow-y-auto border-r border-slate-700`}>
            <div className="mb-4">
              <h3 className="text-xs font-bold text-slate-400 mb-2 uppercase">Citation</h3>
              <div className="bg-amber-900/40 border border-amber-600 rounded-lg p-4 flex items-start gap-3">
                <FileText className="w-5 h-5 text-amber-400 flex-shrink-0" />
                <span className="text-amber-200">{step.citation}</span>
              </div>
            </div>
            
            <div className="bg-white rounded-lg p-5 text-slate-900">
              <div className="text-xs text-slate-500 mb-3 uppercase font-bold">Document Excerpt</div>
              <div className="space-y-2 text-sm leading-relaxed font-serif">
                <p className="text-slate-400">[...]</p>
                <p className="bg-yellow-200 px-1 -mx-1 rounded">{step.expectedAnswer}</p>
                <p className="text-slate-400">[...]</p>
              </div>
              <div className="mt-4 pt-3 border-t border-slate-200 text-xs text-slate-500 text-right">{step.citation}</div>
            </div>
          </div>
          
          {/* Edit Panel */}
          {showEditPanel && (
            <div className="lg:w-[35%] flex flex-col bg-slate-900 border-l border-slate-700">
              <div className="p-4 border-b border-slate-700">
                <h3 className="font-bold flex items-center gap-2">
                  <Edit3 className="w-5 h-5 text-blue-400" />
                  Edit Outline
                </h3>
                <p className="text-sm text-slate-400 mt-1">Describe changes to regenerate</p>
              </div>
              
              <div className="flex-1 overflow-y-auto p-4">
                {editMessages.length === 0 ? (
                  <div className="text-center text-slate-500 mt-4">
                    <p className="text-sm mb-3">Try:</p>
                    <ul className="text-xs space-y-1 text-left max-w-[200px] mx-auto">
                      <li>• "Make Q3 more aggressive"</li>
                      <li>• "Add question about missed visits"</li>
                      <li>• "Remove question 5"</li>
                      <li>• "Fix citation on Q2 - it's page 31"</li>
                      <li>• "Move credentials to the end"</li>
                    </ul>
                  </div>
                ) : (
                  <div className="space-y-3">
                    {editMessages.map((msg, i) => (
                      <div key={i} className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}>
                        <div className={`max-w-[90%] rounded-xl p-3 text-sm ${msg.role === 'user' ? 'bg-blue-600' : 'bg-slate-800'}`}>
                          {msg.content}
                        </div>
                      </div>
                    ))}
                    {isEditing && (
                      <div className="flex justify-start">
                        <div className="bg-slate-800 rounded-xl p-3 flex items-center gap-2">
                          <Loader2 className="w-4 h-4 text-blue-400 animate-spin" />
                          <span className="text-sm">Updating...</span>
                        </div>
                      </div>
                    )}
                    <div ref={editMessagesEndRef} />
                  </div>
                )}
              </div>
              
              <div className="p-4 border-t border-slate-700">
                <div className="flex gap-2">
                  <input
                    type="text"
                    value={editInput}
                    onChange={e => setEditInput(e.target.value)}
                    onKeyPress={e => e.key === 'Enter' && !isEditing && handleSendEdit()}
                    placeholder="Describe your edit..."
                    disabled={isEditing}
                    className="flex-1 bg-slate-800 border border-slate-600 rounded-lg px-3 py-2 text-sm placeholder-slate-500 focus:outline-none focus:border-blue-500 disabled:opacity-50"
                  />
                  <button onClick={handleSendEdit} disabled={isEditing || !editInput.trim()} className="px-3 py-2 bg-blue-600 hover:bg-blue-500 disabled:opacity-40 rounded-lg">
                    <Send className="w-4 h-4" />
                  </button>
                </div>
              </div>
            </div>
          )}
        </div>
        
        {/* Navigation */}
        <div className="fixed bottom-0 left-0 right-0 bg-slate-800 border-t border-slate-700 px-4 py-3">
          <div className="flex items-center justify-between max-w-screen-xl mx-auto">
            <button onClick={() => setCurrentStep(prev => Math.max(0, prev - 1))} disabled={currentStep === 0} className="px-4 py-2 bg-slate-700 hover:bg-slate-600 disabled:opacity-40 rounded-lg flex items-center gap-1">
              <ChevronLeft className="w-5 h-5" /> Prev
            </button>
            
            <div className="flex gap-1.5 overflow-x-auto max-w-[40%]">
              {generatedOutline.steps.map((_, i) => (
                <button key={i} onClick={() => setCurrentStep(i)} className={`w-2.5 h-2.5 rounded-full flex-shrink-0 ${i === currentStep ? 'bg-blue-500' : 'bg-slate-600'}`} />
              ))}
            </div>
            
            <button onClick={() => setCurrentStep(prev => Math.min(generatedOutline.steps.length - 1, prev + 1))} disabled={currentStep === generatedOutline.steps.length - 1} className="px-4 py-2 bg-blue-600 hover:bg-blue-500 disabled:opacity-40 rounded-lg flex items-center gap-1">
              Next <ChevronRight className="w-5 h-5" />
            </button>
          </div>
        </div>
      </div>
    )
  }

  // BUILDER MODE
  return (
    <div className="min-h-screen bg-slate-900 text-white flex flex-col lg:flex-row">
      {showSettings && <SettingsModal />}
      
      {/* Files Panel */}
      <div className="w-full lg:w-72 bg-slate-800 border-b lg:border-b-0 lg:border-r border-slate-700 flex flex-col">
        <div className="p-4 border-b border-slate-700 flex items-center justify-between">
          <h2 className="font-bold flex items-center gap-2">
            <FileText className="w-5 h-5 text-blue-400" />
            Case Files
          </h2>
          <button onClick={() => setShowSettings(true)} className="p-2 hover:bg-slate-700 rounded-lg">
            <Settings className="w-5 h-5 text-slate-400" />
          </button>
        </div>
        
        <div className="flex-1 overflow-y-auto p-4">
          {files.length === 0 ? (
            <div onClick={() => fileInputRef.current?.click()} className="border-2 border-dashed border-slate-600 rounded-xl p-6 text-center cursor-pointer hover:border-blue-500 transition-all">
              <Upload className="w-10 h-10 mx-auto mb-3 text-slate-500" />
              <p className="text-slate-300 font-medium">Upload Files</p>
              <p className="text-slate-500 text-sm mt-1">PDF, DOCX, TXT</p>
            </div>
          ) : (
            <div className="space-y-2">
              {files.map(file => (
                <div key={file.id} className="flex items-center gap-2 bg-slate-700 rounded-lg p-2.5 group">
                  <FileText className="w-4 h-4 text-blue-400 flex-shrink-0" />
                  <div className="flex-1 min-w-0">
                    <p className="text-sm truncate">{file.name}</p>
                    <p className="text-xs text-slate-500">{file.content ? `${(file.content.length / 1000).toFixed(0)}k chars` : '...'}</p>
                  </div>
                  <button onClick={() => removeFile(file.id)} className="opacity-0 group-hover:opacity-100 p-1 hover:bg-slate-600 rounded">
                    <Trash2 className="w-3.5 h-3.5 text-slate-400" />
                  </button>
                </div>
              ))}
              <button onClick={() => fileInputRef.current?.click()} className="w-full py-2 border border-dashed border-slate-600 rounded-lg text-slate-400 hover:border-blue-500 text-sm">
                + Add More
              </button>
            </div>
          )}
        </div>
        
        <input ref={fileInputRef} type="file" multiple accept=".pdf,.docx,.doc,.txt" onChange={handleFileUpload} className="hidden" />
        
        {extractedData && (
          <div className="p-4 border-t border-slate-700 bg-green-900/20">
            <p className="text-sm text-green-400 font-medium">✓ {extractedData.caseInfo.caseName}</p>
            <p className="text-xs text-slate-400 mt-1">{extractedData.parties.length} parties, {extractedData.witnesses.length} witnesses</p>
          </div>
        )}
      </div>
      
      {/* Chat Panel */}
      <div className="flex-1 flex flex-col">
        <header className="p-4 border-b border-slate-700 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 bg-blue-600 rounded-xl flex items-center justify-center">
              <MessageSquare className="w-5 h-5" />
            </div>
            <div>
              <h1 className="font-bold text-lg">TrialOutline</h1>
              <p className="text-slate-400 text-xs">AI examination outlines</p>
            </div>
          </div>
          
          {generatedOutline && (
            <button onClick={() => setCurrentView('viewer')} className="px-4 py-2 bg-blue-600 hover:bg-blue-500 rounded-lg flex items-center gap-2 font-medium">
              <Eye className="w-4 h-4" /> View Outline
            </button>
          )}
        </header>
        
        <div className="flex-1 overflow-y-auto p-4">
          {chatMessages.length === 0 ? (
            <div className="h-full flex items-center justify-center">
              <div className="text-center max-w-md">
                <MessageSquare className="w-12 h-12 mx-auto mb-4 text-slate-600" />
                <h3 className="text-xl font-bold mb-2">Build Your Outline</h3>
                <p className="text-slate-400">
                  {!apiKey ? 'Add your API key in settings first.' : files.length === 0 ? 'Upload case files to get started.' : 'Send a message to analyze your documents.'}
                </p>
              </div>
            </div>
          ) : (
            <div className="space-y-3 max-w-2xl mx-auto">
              {chatMessages.map((msg, i) => (
                <div key={i} className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}>
                  <div className={`max-w-[85%] rounded-2xl p-4 ${msg.role === 'user' ? 'bg-blue-600' : 'bg-slate-800'}`}>
                    <div className="whitespace-pre-wrap text-sm">{msg.content}</div>
                  </div>
                </div>
              ))}
              {isProcessing && (
                <div className="flex justify-start">
                  <div className="bg-slate-800 rounded-2xl p-4 flex items-center gap-3">
                    <Loader2 className="w-5 h-5 text-blue-400 animate-spin" />
                    <span className="text-slate-300">{processingStage}</span>
                  </div>
                </div>
              )}
              <div ref={messagesEndRef} />
            </div>
          )}
        </div>
        
        <div className="p-4 border-t border-slate-700">
          <div className="max-w-2xl mx-auto flex gap-2">
            <input
              type="text"
              value={chatInput}
              onChange={e => setChatInput(e.target.value)}
              onKeyPress={e => e.key === 'Enter' && !isProcessing && handleSendMessage()}
              placeholder={!apiKey ? 'Add API key first...' : files.length === 0 ? 'Upload files first...' : 'Ask for an outline...'}
              disabled={!apiKey || files.length === 0 || isProcessing}
              className="flex-1 bg-slate-800 border border-slate-600 rounded-xl px-4 py-3 placeholder-slate-500 focus:outline-none focus:border-blue-500 disabled:opacity-50"
            />
            <button onClick={handleSendMessage} disabled={!apiKey || files.length === 0 || isProcessing || !chatInput.trim()} className="px-5 py-3 bg-blue-600 hover:bg-blue-500 disabled:opacity-40 rounded-xl">
              <Send className="w-5 h-5" />
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}
