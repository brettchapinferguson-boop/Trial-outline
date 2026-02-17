'use client'

import { useState, useEffect, useRef, useCallback } from 'react'
import { useSession } from 'next-auth/react'
import { useRouter, useParams } from 'next/navigation'
import {
  ArrowLeft, Upload, FileText, Users, ScrollText, Settings, ChevronRight,
  Loader2, Trash2, Plus, Check, AlertCircle, Download, Brain,
  ChevronDown, ChevronUp, X, Eye, Send, Edit3, Undo, Redo,
} from 'lucide-react'
import type { OutlineData, Chapter, ChapterCategory, CATEGORY_CONFIG } from '@/lib/types'

// ─── Types ───────────────────────────────────────────────────────

interface CaseData {
  id: string
  title: string
  caseNumber: string | null
  court: string | null
  jurisdiction: string | null
  caseType: string
  theory: string | null
  theme: string | null
  clientName: string | null
  clientRole: string | null
  keyIssues: string[]
  status: string
  parties: Array<{ id: string; name: string; role: string; side: string; attorney: string | null }>
  documents: Array<{
    id: string; fileName: string; originalName: string; docType: string | null
    title: string | null; date: string | null; author: string | null
    summary: string | null; pageCount: number | null; status: string; fileSize: number
  }>
  witnesses: Array<{
    id: string; name: string; type: string; side: string
    _count: { outlines: number }
  }>
  outlines: Array<{
    id: string; witnessId: string; examType: string; title: string
    status: string; createdAt: string; witness: { name: string }
  }>
}

type Tab = 'documents' | 'interview' | 'outlines'

// ─── Main Component ──────────────────────────────────────────────

export default function CaseDetailPage() {
  const { data: session, status } = useSession()
  const router = useRouter()
  const params = useParams()
  const caseId = params.caseId as string

  const [caseData, setCaseData] = useState<CaseData | null>(null)
  const [loading, setLoading] = useState(true)
  const [activeTab, setActiveTab] = useState<Tab>('documents')
  const [apiKey, setApiKey] = useState('')

  useEffect(() => {
    if (status === 'unauthenticated') router.push('/login')
  }, [status, router])

  useEffect(() => {
    const saved = localStorage.getItem('anthropic_api_key')
    if (saved) setApiKey(saved)
  }, [])

  const fetchCase = useCallback(async () => {
    try {
      const res = await fetch(`/api/cases/${caseId}`)
      if (res.ok) {
        const data = await res.json()
        setCaseData(data)
        // Auto-select tab based on progress
        if (data.documents.length === 0) setActiveTab('documents')
        else if (!data.theory) setActiveTab('interview')
        else setActiveTab('outlines')
      } else {
        router.push('/dashboard')
      }
    } catch {
      router.push('/dashboard')
    } finally {
      setLoading(false)
    }
  }, [caseId, router])

  useEffect(() => {
    if (status === 'authenticated') fetchCase()
  }, [status, fetchCase])

  if (loading || !caseData) {
    return (
      <div className="min-h-screen bg-navy-950 flex items-center justify-center">
        <Loader2 className="w-8 h-8 text-blue-400 animate-spin" />
      </div>
    )
  }

  const tabs: { key: Tab; label: string; icon: any; count?: number }[] = [
    { key: 'documents', label: 'Documents', icon: FileText, count: caseData.documents.length },
    { key: 'interview', label: 'Case Setup', icon: Settings },
    { key: 'outlines', label: 'Outlines', icon: ScrollText, count: caseData.outlines.length },
  ]

  return (
    <div className="min-h-screen bg-navy-950">
      {/* Header */}
      <header className="bg-slate-800/50 border-b border-slate-700">
        <div className="max-w-6xl mx-auto px-4 py-4">
          <div className="flex items-center gap-3 mb-3">
            <button onClick={() => router.push('/dashboard')} className="p-1 hover:bg-slate-700 rounded transition-colors">
              <ArrowLeft className="w-5 h-5 text-slate-400" />
            </button>
            <div className="min-w-0">
              <h1 className="font-bold text-xl truncate">{caseData.title}</h1>
              <div className="flex items-center gap-3 text-sm text-slate-400">
                {caseData.caseNumber && <span>{caseData.caseNumber}</span>}
                <span className="capitalize">{caseData.caseType}</span>
                {caseData.court && <span>{caseData.court}</span>}
              </div>
            </div>
          </div>

          {/* Tabs */}
          <div className="flex gap-1">
            {tabs.map((tab) => (
              <button
                key={tab.key}
                onClick={() => setActiveTab(tab.key)}
                className={`px-4 py-2 rounded-t-lg flex items-center gap-2 text-sm font-medium transition-colors ${
                  activeTab === tab.key
                    ? 'bg-slate-900 text-white border-b-2 border-blue-500'
                    : 'text-slate-400 hover:text-white hover:bg-slate-800'
                }`}
              >
                <tab.icon className="w-4 h-4" />
                {tab.label}
                {tab.count !== undefined && (
                  <span className="bg-slate-700 text-slate-300 px-1.5 py-0.5 rounded text-xs">
                    {tab.count}
                  </span>
                )}
              </button>
            ))}
          </div>
        </div>
      </header>

      {/* Tab Content */}
      <main className="max-w-6xl mx-auto px-4 py-6">
        {activeTab === 'documents' && (
          <DocumentsTab
            caseId={caseId}
            documents={caseData.documents}
            apiKey={apiKey}
            onRefresh={fetchCase}
          />
        )}
        {activeTab === 'interview' && (
          <InterviewTab
            caseId={caseId}
            caseData={caseData}
            apiKey={apiKey}
            onRefresh={fetchCase}
          />
        )}
        {activeTab === 'outlines' && (
          <OutlinesTab
            caseId={caseId}
            caseData={caseData}
            apiKey={apiKey}
            onRefresh={fetchCase}
          />
        )}
      </main>
    </div>
  )
}

// ─── Documents Tab ───────────────────────────────────────────────

function DocumentsTab({
  caseId,
  documents,
  apiKey,
  onRefresh,
}: {
  caseId: string
  documents: CaseData['documents']
  apiKey: string
  onRefresh: () => void
}) {
  const fileInputRef = useRef<HTMLInputElement>(null)
  const [uploading, setUploading] = useState(false)
  const [processing, setProcessing] = useState(false)
  const [uploadProgress, setUploadProgress] = useState('')

  const handleUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files || [])
    if (!files.length) return

    setUploading(true)
    setUploadProgress(`Uploading ${files.length} file(s)...`)

    try {
      const formData = new FormData()
      files.forEach((f) => formData.append('files', f))

      const res = await fetch(`/api/cases/${caseId}/upload`, {
        method: 'POST',
        body: formData,
      })

      if (!res.ok) {
        const err = await res.json()
        throw new Error(err.error || 'Upload failed')
      }

      const result = await res.json()
      setUploadProgress(`Uploaded ${result.uploaded} file(s). Processing...`)

      // Auto-process if API key is set
      if (apiKey) {
        setProcessing(true)
        const processRes = await fetch(`/api/cases/${caseId}/process`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ apiKey }),
        })

        if (processRes.ok) {
          const processResult = await processRes.json()
          setUploadProgress(`Processed ${processResult.processed} document(s).`)
        }
        setProcessing(false)
      }

      onRefresh()
    } catch (err) {
      setUploadProgress(err instanceof Error ? err.message : 'Upload failed')
    } finally {
      setUploading(false)
      if (fileInputRef.current) fileInputRef.current.value = ''
    }
  }

  const processDocuments = async () => {
    if (!apiKey) {
      alert('Please set your Anthropic API key in the dashboard settings first.')
      return
    }

    setProcessing(true)
    setUploadProgress('Processing documents with AI...')

    try {
      const res = await fetch(`/api/cases/${caseId}/process`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ apiKey }),
      })

      if (res.ok) {
        const result = await res.json()
        setUploadProgress(`Done! Processed ${result.processed} document(s).`)
        onRefresh()
      } else {
        const err = await res.json()
        setUploadProgress(err.error || 'Processing failed')
      }
    } catch {
      setUploadProgress('Processing failed')
    } finally {
      setProcessing(false)
    }
  }

  const pendingCount = documents.filter((d) => d.status === 'pending').length
  const readyCount = documents.filter((d) => d.status === 'ready').length

  return (
    <div>
      {/* Upload Area */}
      <div
        onClick={() => !uploading && fileInputRef.current?.click()}
        className="border-2 border-dashed border-slate-600 rounded-xl p-8 text-center cursor-pointer hover:border-blue-500 transition-all mb-6"
      >
        {uploading || processing ? (
          <div className="flex items-center justify-center gap-3">
            <Loader2 className="w-8 h-8 text-blue-400 animate-spin" />
            <span className="text-slate-300">{uploadProgress}</span>
          </div>
        ) : (
          <>
            <Upload className="w-12 h-12 mx-auto mb-3 text-slate-500" />
            <p className="text-slate-300 font-medium text-lg">Upload Case Documents</p>
            <p className="text-slate-500 mt-1">
              PDF, DOCX, TXT, or ZIP files containing multiple documents
            </p>
            <p className="text-slate-600 text-sm mt-2">
              Drag & drop or click to browse. ZIP files will be automatically extracted.
            </p>
          </>
        )}
      </div>

      <input
        ref={fileInputRef}
        type="file"
        multiple
        accept=".pdf,.docx,.doc,.txt,.zip"
        onChange={handleUpload}
        className="hidden"
      />

      {/* Actions */}
      {pendingCount > 0 && (
        <div className="bg-amber-900/20 border border-amber-600 rounded-lg px-4 py-3 mb-4 flex items-center justify-between">
          <span className="text-amber-200 text-sm">
            {pendingCount} document(s) pending processing
          </span>
          <button
            onClick={processDocuments}
            disabled={processing}
            className="px-3 py-1.5 bg-amber-600 hover:bg-amber-500 rounded-lg text-sm font-medium flex items-center gap-2 transition-colors"
          >
            {processing ? <Loader2 className="w-4 h-4 animate-spin" /> : <Brain className="w-4 h-4" />}
            Process Now
          </button>
        </div>
      )}

      {uploadProgress && !uploading && !processing && (
        <div className="bg-slate-800 rounded-lg px-4 py-2 mb-4 text-sm text-slate-400">
          {uploadProgress}
        </div>
      )}

      {/* Document List */}
      {documents.length === 0 ? (
        <div className="text-center py-12 text-slate-500">
          <FileText className="w-12 h-12 mx-auto mb-3 opacity-50" />
          <p>No documents uploaded yet.</p>
        </div>
      ) : (
        <div className="space-y-2">
          <div className="flex items-center justify-between mb-2 text-sm text-slate-400">
            <span>{documents.length} document(s) — {readyCount} processed</span>
          </div>
          {documents.map((doc) => (
            <div
              key={doc.id}
              className="bg-slate-800 border border-slate-700 rounded-lg p-4 flex items-center gap-4"
            >
              <FileText className={`w-5 h-5 flex-shrink-0 ${
                doc.status === 'ready' ? 'text-green-400' :
                doc.status === 'processing' ? 'text-blue-400' :
                doc.status === 'error' ? 'text-red-400' :
                'text-slate-500'
              }`} />
              <div className="flex-1 min-w-0">
                <p className="font-medium truncate">{doc.title || doc.fileName}</p>
                <div className="flex items-center gap-3 text-xs text-slate-500 mt-0.5">
                  {doc.docType && <span className="bg-slate-700 px-1.5 py-0.5 rounded capitalize">{doc.docType.replace('_', ' ')}</span>}
                  {doc.pageCount && <span>{doc.pageCount} pages</span>}
                  {doc.author && <span>by {doc.author}</span>}
                  <span>{(doc.fileSize / 1024).toFixed(0)} KB</span>
                </div>
                {doc.summary && (
                  <p className="text-xs text-slate-500 mt-1 line-clamp-1">{doc.summary}</p>
                )}
              </div>
              <span className={`px-2 py-1 rounded text-xs font-medium ${
                doc.status === 'ready' ? 'bg-green-900/30 text-green-400' :
                doc.status === 'processing' ? 'bg-blue-900/30 text-blue-400' :
                doc.status === 'error' ? 'bg-red-900/30 text-red-400' :
                'bg-slate-700 text-slate-400'
              }`}>
                {doc.status === 'ready' && <Check className="w-3 h-3 inline mr-1" />}
                {doc.status === 'error' && <AlertCircle className="w-3 h-3 inline mr-1" />}
                {doc.status}
              </span>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

// ─── Interview Tab ───────────────────────────────────────────────

function InterviewTab({
  caseId,
  caseData,
  apiKey,
  onRefresh,
}: {
  caseId: string
  caseData: CaseData
  apiKey: string
  onRefresh: () => void
}) {
  const [saving, setSaving] = useState(false)
  const [extracting, setExtracting] = useState(false)
  const [theory, setTheory] = useState(caseData.theory || '')
  const [theme, setTheme] = useState(caseData.theme || '')
  const [clientName, setClientName] = useState(caseData.clientName || '')
  const [clientRole, setClientRole] = useState(caseData.clientRole || 'plaintiff')
  const [keyIssues, setKeyIssues] = useState(caseData.keyIssues.join('\n') || '')
  const [parties, setParties] = useState(caseData.parties)
  const [witnesses, setWitnesses] = useState(caseData.witnesses.map((w) => ({ name: w.name, type: w.type, side: w.side })))

  const runExtraction = async () => {
    if (!apiKey) {
      alert('Please set your Anthropic API key in the dashboard settings first.')
      return
    }

    setExtracting(true)
    try {
      const res = await fetch(`/api/cases/${caseId}/extract`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ apiKey }),
      })

      if (res.ok) {
        const result = await res.json()
        // Update local state with extracted data
        if (result.keyIssues) setKeyIssues(result.keyIssues.join('\n'))
        onRefresh()
      } else {
        const err = await res.json()
        alert(err.error || 'Extraction failed')
      }
    } catch {
      alert('Extraction failed')
    } finally {
      setExtracting(false)
    }
  }

  const saveInterview = async () => {
    setSaving(true)
    try {
      const res = await fetch(`/api/cases/${caseId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          theory,
          theme,
          clientName,
          clientRole,
          keyIssues: keyIssues.split('\n').filter((i) => i.trim()),
          parties: parties.map((p) => ({
            name: p.name,
            role: p.role,
            side: p.side as 'our_client' | 'opposing' | 'neutral',
            attorney: p.attorney,
          })),
          witnesses: witnesses.map((w) => ({
            name: w.name,
            type: w.type as 'fact' | 'expert' | 'party' | 'character',
            side: w.side as 'friendly' | 'adverse' | 'neutral',
          })),
          status: 'ready',
        }),
      })

      if (res.ok) {
        onRefresh()
      }
    } catch {
      alert('Save failed')
    } finally {
      setSaving(false)
    }
  }

  const readyDocs = caseData.documents.filter((d) => d.status === 'ready').length

  return (
    <div className="max-w-3xl mx-auto">
      {/* AI Extraction Button */}
      {readyDocs > 0 && (
        <div className="bg-blue-900/20 border border-blue-600 rounded-lg px-4 py-3 mb-6 flex items-center justify-between">
          <div>
            <span className="text-blue-200 text-sm font-medium">Auto-extract case info with AI</span>
            <p className="text-blue-400 text-xs mt-0.5">
              Analyzes {readyDocs} document(s) to identify parties, witnesses, and key issues
            </p>
          </div>
          <button
            onClick={runExtraction}
            disabled={extracting}
            className="px-4 py-2 bg-blue-600 hover:bg-blue-500 rounded-lg text-sm font-medium flex items-center gap-2 transition-colors"
          >
            {extracting ? <Loader2 className="w-4 h-4 animate-spin" /> : <Brain className="w-4 h-4" />}
            {extracting ? 'Extracting...' : 'Extract'}
          </button>
        </div>
      )}

      <div className="space-y-6">
        {/* Client Info */}
        <section className="bg-slate-800 border border-slate-700 rounded-xl p-6">
          <h3 className="font-bold text-lg mb-4">Your Client</h3>
          <div className="grid md:grid-cols-2 gap-4">
            <div>
              <label className="block text-sm text-slate-400 mb-1">Client Name</label>
              <input
                type="text"
                value={clientName}
                onChange={(e) => setClientName(e.target.value)}
                placeholder="John Smith"
                className="w-full bg-slate-900 border border-slate-600 rounded-lg px-4 py-2.5 text-white placeholder-slate-500 focus:outline-none focus:border-blue-500"
              />
            </div>
            <div>
              <label className="block text-sm text-slate-400 mb-1">Client Role</label>
              <select
                value={clientRole}
                onChange={(e) => setClientRole(e.target.value)}
                className="w-full bg-slate-900 border border-slate-600 rounded-lg px-4 py-2.5 text-white focus:outline-none focus:border-blue-500"
              >
                <option value="plaintiff">Plaintiff</option>
                <option value="defendant">Defendant</option>
                <option value="petitioner">Petitioner</option>
                <option value="respondent">Respondent</option>
              </select>
            </div>
          </div>
        </section>

        {/* Theory & Theme */}
        <section className="bg-slate-800 border border-slate-700 rounded-xl p-6">
          <h3 className="font-bold text-lg mb-4">Case Theory & Theme</h3>
          <div className="space-y-4">
            <div>
              <label className="block text-sm text-slate-400 mb-1">
                Case Theory <span className="text-slate-600">(What happened and why)</span>
              </label>
              <textarea
                value={theory}
                onChange={(e) => setTheory(e.target.value)}
                rows={4}
                placeholder="The defendant breached the contract by failing to deliver the goods on time, causing our client significant financial losses..."
                className="w-full bg-slate-900 border border-slate-600 rounded-lg px-4 py-2.5 text-white placeholder-slate-500 focus:outline-none focus:border-blue-500 resize-none"
              />
            </div>
            <div>
              <label className="block text-sm text-slate-400 mb-1">
                Case Theme <span className="text-slate-600">(One-sentence emotional hook)</span>
              </label>
              <input
                type="text"
                value={theme}
                onChange={(e) => setTheme(e.target.value)}
                placeholder="They made a promise, took the money, and walked away."
                className="w-full bg-slate-900 border border-slate-600 rounded-lg px-4 py-2.5 text-white placeholder-slate-500 focus:outline-none focus:border-blue-500"
              />
            </div>
          </div>
        </section>

        {/* Key Issues */}
        <section className="bg-slate-800 border border-slate-700 rounded-xl p-6">
          <h3 className="font-bold text-lg mb-4">Key Issues</h3>
          <textarea
            value={keyIssues}
            onChange={(e) => setKeyIssues(e.target.value)}
            rows={4}
            placeholder="Enter key issues, one per line:&#10;Whether defendant breached the contract&#10;Extent of damages&#10;Credibility of expert testimony"
            className="w-full bg-slate-900 border border-slate-600 rounded-lg px-4 py-2.5 text-white placeholder-slate-500 focus:outline-none focus:border-blue-500 resize-none"
          />
        </section>

        {/* Witnesses */}
        <section className="bg-slate-800 border border-slate-700 rounded-xl p-6">
          <div className="flex items-center justify-between mb-4">
            <h3 className="font-bold text-lg">Witnesses</h3>
            <button
              onClick={() => setWitnesses([...witnesses, { name: '', type: 'fact', side: 'neutral' }])}
              className="px-3 py-1.5 bg-slate-700 hover:bg-slate-600 rounded-lg text-sm flex items-center gap-1 transition-colors"
            >
              <Plus className="w-3 h-3" /> Add
            </button>
          </div>
          <div className="space-y-3">
            {witnesses.map((w, i) => (
              <div key={i} className="grid grid-cols-12 gap-2 items-center">
                <input
                  type="text"
                  value={w.name}
                  onChange={(e) => {
                    const next = [...witnesses]
                    next[i] = { ...next[i], name: e.target.value }
                    setWitnesses(next)
                  }}
                  placeholder="Witness name"
                  className="col-span-5 bg-slate-900 border border-slate-600 rounded-lg px-3 py-2 text-sm text-white placeholder-slate-500 focus:outline-none focus:border-blue-500"
                />
                <select
                  value={w.type}
                  onChange={(e) => {
                    const next = [...witnesses]
                    next[i] = { ...next[i], type: e.target.value }
                    setWitnesses(next)
                  }}
                  className="col-span-3 bg-slate-900 border border-slate-600 rounded-lg px-2 py-2 text-sm text-white focus:outline-none focus:border-blue-500"
                >
                  <option value="fact">Fact</option>
                  <option value="expert">Expert</option>
                  <option value="party">Party</option>
                  <option value="character">Character</option>
                </select>
                <select
                  value={w.side}
                  onChange={(e) => {
                    const next = [...witnesses]
                    next[i] = { ...next[i], side: e.target.value }
                    setWitnesses(next)
                  }}
                  className="col-span-3 bg-slate-900 border border-slate-600 rounded-lg px-2 py-2 text-sm text-white focus:outline-none focus:border-blue-500"
                >
                  <option value="friendly">Friendly</option>
                  <option value="adverse">Adverse</option>
                  <option value="neutral">Neutral</option>
                </select>
                <button
                  onClick={() => setWitnesses(witnesses.filter((_, j) => j !== i))}
                  className="col-span-1 p-2 hover:bg-slate-700 rounded transition-colors"
                >
                  <X className="w-4 h-4 text-slate-500" />
                </button>
              </div>
            ))}
            {witnesses.length === 0 && (
              <p className="text-sm text-slate-500 text-center py-4">
                No witnesses added. Use AI extraction or add manually.
              </p>
            )}
          </div>
        </section>

        {/* Save */}
        <div className="flex justify-end">
          <button
            onClick={saveInterview}
            disabled={saving}
            className="px-6 py-3 bg-blue-600 hover:bg-blue-500 disabled:opacity-50 rounded-lg font-semibold flex items-center gap-2 transition-colors"
          >
            {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Check className="w-4 h-4" />}
            Save Case Setup
          </button>
        </div>
      </div>
    </div>
  )
}

// ─── Outlines Tab ────────────────────────────────────────────────

function OutlinesTab({
  caseId,
  caseData,
  apiKey,
  onRefresh,
}: {
  caseId: string
  caseData: CaseData
  apiKey: string
  onRefresh: () => void
}) {
  const router = useRouter()
  const [generating, setGenerating] = useState(false)
  const [showGenerate, setShowGenerate] = useState(false)
  const [selectedWitness, setSelectedWitness] = useState('')
  const [examType, setExamType] = useState<'cross' | 'direct'>('cross')
  const [primaryGoal, setPrimaryGoal] = useState('')
  const [additionalInstructions, setAdditionalInstructions] = useState('')
  const [generationStatus, setGenerationStatus] = useState('')

  // Outline viewer state
  const [viewingOutline, setViewingOutline] = useState<{ id: string; data: OutlineData } | null>(null)
  const [editMode, setEditMode] = useState(false)
  const [editInput, setEditInput] = useState('')
  const [editing, setEditing] = useState(false)
  const [outlineHistory, setOutlineHistory] = useState<OutlineData[]>([])
  const [historyIndex, setHistoryIndex] = useState(-1)

  const generateOutline = async () => {
    if (!selectedWitness || !apiKey) return
    setGenerating(true)
    setGenerationStatus('Building witness profile...')

    try {
      setGenerationStatus('Generating examination outline (this may take a minute)...')

      const res = await fetch(`/api/cases/${caseId}/outlines`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          apiKey,
          witnessId: selectedWitness,
          examType,
          primaryGoal,
          additionalInstructions,
        }),
      })

      if (!res.ok) {
        const err = await res.json()
        throw new Error(err.error || 'Generation failed')
      }

      const result = await res.json()
      setShowGenerate(false)
      setGenerationStatus('')

      // Open the generated outline
      setViewingOutline({ id: result.outline.id, data: result.data })
      setOutlineHistory([result.data])
      setHistoryIndex(0)

      onRefresh()
    } catch (err) {
      setGenerationStatus(err instanceof Error ? err.message : 'Generation failed')
    } finally {
      setGenerating(false)
    }
  }

  const viewOutline = async (outlineId: string) => {
    try {
      const res = await fetch(`/api/cases/${caseId}/outlines/${outlineId}`)
      if (res.ok) {
        const outline = await res.json()
        const data = outline.chapters as OutlineData
        setViewingOutline({ id: outlineId, data })
        setOutlineHistory([data])
        setHistoryIndex(0)
      }
    } catch {
      alert('Failed to load outline')
    }
  }

  const handleEdit = async () => {
    if (!editInput.trim() || !viewingOutline) return
    setEditing(true)

    try {
      const res = await fetch(`/api/cases/${caseId}/outlines/${viewingOutline.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ apiKey, editInstructions: editInput }),
      })

      if (!res.ok) {
        const err = await res.json()
        throw new Error(err.error || 'Edit failed')
      }

      const result = await res.json()
      const newData = result.data as OutlineData
      const newHistory = [...outlineHistory.slice(0, historyIndex + 1), newData]
      setOutlineHistory(newHistory)
      setHistoryIndex(newHistory.length - 1)
      setViewingOutline({ ...viewingOutline, data: newData })
      setEditInput('')
    } catch (err) {
      alert(err instanceof Error ? err.message : 'Edit failed')
    } finally {
      setEditing(false)
    }
  }

  const undoOutline = () => {
    if (historyIndex > 0) {
      const newIdx = historyIndex - 1
      setHistoryIndex(newIdx)
      setViewingOutline({ ...viewingOutline!, data: outlineHistory[newIdx] })
    }
  }

  const redoOutline = () => {
    if (historyIndex < outlineHistory.length - 1) {
      const newIdx = historyIndex + 1
      setHistoryIndex(newIdx)
      setViewingOutline({ ...viewingOutline!, data: outlineHistory[newIdx] })
    }
  }

  const exportOutline = () => {
    if (!viewingOutline) return
    window.open(`/api/cases/${caseId}/outlines/${viewingOutline.id}/export`, '_blank')
  }

  // ── Outline Viewer ──
  if (viewingOutline) {
    return (
      <OutlineViewer
        data={viewingOutline.data}
        editMode={editMode}
        editInput={editInput}
        editing={editing}
        historyIndex={historyIndex}
        historyLength={outlineHistory.length}
        onEditInputChange={setEditInput}
        onSendEdit={handleEdit}
        onToggleEdit={() => setEditMode(!editMode)}
        onUndo={undoOutline}
        onRedo={redoOutline}
        onExport={exportOutline}
        onClose={() => setViewingOutline(null)}
      />
    )
  }

  // ── Outline List ──
  return (
    <div>
      {/* Generate Button */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <h3 className="text-lg font-bold">Examination Outlines</h3>
          {!caseData.theory && (
            <p className="text-amber-400 text-sm mt-1">
              Complete the Case Setup tab first for best results.
            </p>
          )}
        </div>
        <button
          onClick={() => setShowGenerate(true)}
          disabled={caseData.witnesses.length === 0}
          className="px-4 py-2 bg-blue-600 hover:bg-blue-500 disabled:opacity-50 rounded-lg flex items-center gap-2 font-medium transition-colors"
        >
          <Plus className="w-4 h-4" /> Generate Outline
        </button>
      </div>

      {/* Generate Form */}
      {showGenerate && (
        <div className="bg-slate-800 border border-slate-700 rounded-xl p-6 mb-6 animate-fade-in">
          <h3 className="font-bold mb-4">Generate New Outline</h3>
          <div className="grid md:grid-cols-2 gap-4 mb-4">
            <div>
              <label className="block text-sm text-slate-400 mb-1">Witness</label>
              <select
                value={selectedWitness}
                onChange={(e) => setSelectedWitness(e.target.value)}
                className="w-full bg-slate-900 border border-slate-600 rounded-lg px-4 py-2.5 text-white focus:outline-none focus:border-blue-500"
              >
                <option value="">Select a witness...</option>
                {caseData.witnesses.map((w) => (
                  <option key={w.id} value={w.id}>
                    {w.name} ({w.type}, {w.side})
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-sm text-slate-400 mb-1">Examination Type</label>
              <select
                value={examType}
                onChange={(e) => setExamType(e.target.value as 'cross' | 'direct')}
                className="w-full bg-slate-900 border border-slate-600 rounded-lg px-4 py-2.5 text-white focus:outline-none focus:border-blue-500"
              >
                <option value="cross">Cross-Examination</option>
                <option value="direct">Direct Examination</option>
              </select>
            </div>
          </div>
          <div className="mb-4">
            <label className="block text-sm text-slate-400 mb-1">
              Primary Goal <span className="text-slate-600">(optional)</span>
            </label>
            <input
              type="text"
              value={primaryGoal}
              onChange={(e) => setPrimaryGoal(e.target.value)}
              placeholder="e.g., Establish that the expert failed to follow standard methodology"
              className="w-full bg-slate-900 border border-slate-600 rounded-lg px-4 py-2.5 text-white placeholder-slate-500 focus:outline-none focus:border-blue-500"
            />
          </div>
          <div className="mb-4">
            <label className="block text-sm text-slate-400 mb-1">
              Additional Instructions <span className="text-slate-600">(optional)</span>
            </label>
            <textarea
              value={additionalInstructions}
              onChange={(e) => setAdditionalInstructions(e.target.value)}
              rows={3}
              placeholder="Any specific areas to focus on, documents to emphasize, or strategies to use..."
              className="w-full bg-slate-900 border border-slate-600 rounded-lg px-4 py-2.5 text-white placeholder-slate-500 focus:outline-none focus:border-blue-500 resize-none"
            />
          </div>

          {generationStatus && (
            <div className="bg-blue-900/20 border border-blue-600 rounded-lg px-4 py-3 mb-4 flex items-center gap-3">
              <Loader2 className="w-4 h-4 text-blue-400 animate-spin" />
              <span className="text-blue-200 text-sm">{generationStatus}</span>
            </div>
          )}

          <div className="flex gap-3">
            <button
              onClick={() => { setShowGenerate(false); setGenerationStatus('') }}
              className="px-4 py-2 bg-slate-700 hover:bg-slate-600 rounded-lg transition-colors"
            >
              Cancel
            </button>
            <button
              onClick={generateOutline}
              disabled={!selectedWitness || !apiKey || generating}
              className="px-4 py-2 bg-blue-600 hover:bg-blue-500 disabled:opacity-50 rounded-lg flex items-center gap-2 font-medium transition-colors"
            >
              {generating ? <Loader2 className="w-4 h-4 animate-spin" /> : <Brain className="w-4 h-4" />}
              Generate
            </button>
          </div>
        </div>
      )}

      {/* Outline List */}
      {caseData.outlines.length === 0 ? (
        <div className="text-center py-12 text-slate-500">
          <ScrollText className="w-12 h-12 mx-auto mb-3 opacity-50" />
          <p>No outlines generated yet.</p>
          {caseData.witnesses.length === 0 && (
            <p className="text-sm mt-2">Add witnesses in Case Setup first.</p>
          )}
        </div>
      ) : (
        <div className="space-y-3">
          {caseData.outlines.map((outline) => (
            <button
              key={outline.id}
              onClick={() => viewOutline(outline.id)}
              className="w-full bg-slate-800 hover:bg-slate-750 border border-slate-700 hover:border-slate-600 rounded-xl p-5 text-left transition-all group"
            >
              <div className="flex items-center justify-between">
                <div>
                  <h4 className="font-bold group-hover:text-blue-400 transition-colors">
                    {outline.title}
                  </h4>
                  <div className="flex items-center gap-3 mt-1 text-sm text-slate-400">
                    <span>{outline.witness.name}</span>
                    <span className="capitalize">{outline.examType}-examination</span>
                    <span className={`px-2 py-0.5 rounded text-xs ${
                      outline.status === 'final' ? 'bg-green-900/30 text-green-400' :
                      outline.status === 'reviewed' ? 'bg-blue-900/30 text-blue-400' :
                      'bg-slate-700 text-slate-400'
                    }`}>
                      {outline.status}
                    </span>
                  </div>
                </div>
                <ChevronRight className="w-5 h-5 text-slate-600 group-hover:text-blue-400 transition-colors" />
              </div>
            </button>
          ))}
        </div>
      )}
    </div>
  )
}

// ─── Outline Viewer Component ────────────────────────────────────

function OutlineViewer({
  data,
  editMode,
  editInput,
  editing,
  historyIndex,
  historyLength,
  onEditInputChange,
  onSendEdit,
  onToggleEdit,
  onUndo,
  onRedo,
  onExport,
  onClose,
}: {
  data: OutlineData
  editMode: boolean
  editInput: string
  editing: boolean
  historyIndex: number
  historyLength: number
  onEditInputChange: (v: string) => void
  onSendEdit: () => void
  onToggleEdit: () => void
  onUndo: () => void
  onRedo: () => void
  onExport: () => void
  onClose: () => void
}) {
  const [currentChapter, setCurrentChapter] = useState(0)
  const [currentQuestion, setCurrentQuestion] = useState(0)

  const chapter = data.chapters?.[currentChapter]
  const question = chapter?.questions?.[currentQuestion]

  // Keyboard navigation
  useEffect(() => {
    const handleKey = (e: KeyboardEvent) => {
      if (editMode && (e.target as HTMLElement).tagName === 'INPUT') return

      if (e.key === 'ArrowRight' || e.key === ' ') {
        e.preventDefault()
        if (chapter && currentQuestion < chapter.questions.length - 1) {
          setCurrentQuestion((q) => q + 1)
        } else if (currentChapter < data.chapters.length - 1) {
          setCurrentChapter((c) => c + 1)
          setCurrentQuestion(0)
        }
      } else if (e.key === 'ArrowLeft') {
        e.preventDefault()
        if (currentQuestion > 0) {
          setCurrentQuestion((q) => q - 1)
        } else if (currentChapter > 0) {
          setCurrentChapter((c) => c - 1)
          setCurrentQuestion(data.chapters[currentChapter - 1]?.questions.length - 1 || 0)
        }
      } else if (e.key === 'Escape') {
        if (editMode) onToggleEdit()
        else onClose()
      }
    }

    window.addEventListener('keydown', handleKey)
    return () => window.removeEventListener('keydown', handleKey)
  }, [currentChapter, currentQuestion, data.chapters, chapter, editMode, onToggleEdit, onClose])

  if (!chapter || !question) {
    return (
      <div className="text-center py-12">
        <p className="text-slate-400">No outline data available.</p>
        <button onClick={onClose} className="mt-4 px-4 py-2 bg-slate-700 rounded-lg">Go Back</button>
      </div>
    )
  }

  const totalQuestions = data.chapters.reduce((sum, ch) => sum + ch.questions.length, 0)
  const currentGlobalQ = data.chapters.slice(0, currentChapter).reduce((sum, ch) => sum + ch.questions.length, 0) + currentQuestion + 1

  const categoryColors: Record<string, string> = {
    credentials: 'badge-credentials',
    methodology: 'badge-methodology',
    favorable_admissions: 'badge-favorable',
    bias: 'badge-bias',
    prior_inconsistencies: 'badge-damaging',
    damaging_facts: 'badge-damaging',
    foundation: 'badge-credentials',
    closing_setup: 'badge-closing',
  }

  return (
    <div className="-mx-4 -mt-6">
      {/* Viewer Header */}
      <div className="bg-slate-800 border-b border-slate-700 px-4 lg:px-6 py-3">
        <div className="flex items-center justify-between">
          <div className="min-w-0">
            <h2 className="text-lg font-bold truncate">{data.title}</h2>
            <p className="text-slate-400 text-sm">{data.witness} &bull; {chapter.title}</p>
          </div>
          <div className="flex items-center gap-2 flex-shrink-0">
            {historyLength > 1 && (
              <>
                <button onClick={onUndo} disabled={historyIndex === 0} className="p-2 bg-slate-700 hover:bg-slate-600 disabled:opacity-40 rounded-lg" title="Undo">
                  <Undo className="w-4 h-4" />
                </button>
                <button onClick={onRedo} disabled={historyIndex === historyLength - 1} className="p-2 bg-slate-700 hover:bg-slate-600 disabled:opacity-40 rounded-lg" title="Redo">
                  <Redo className="w-4 h-4" />
                </button>
              </>
            )}
            <button onClick={onToggleEdit} className={`p-2 rounded-lg ${editMode ? 'bg-blue-600' : 'bg-slate-700 hover:bg-slate-600'}`} title="Edit">
              <Edit3 className="w-4 h-4" />
            </button>
            <button onClick={onExport} className="p-2 bg-slate-700 hover:bg-slate-600 rounded-lg" title="Export HTML">
              <Download className="w-4 h-4" />
            </button>
            <button onClick={onClose} className="px-3 py-2 bg-slate-700 hover:bg-slate-600 rounded-lg flex items-center gap-1">
              <X className="w-4 h-4" /> <span className="hidden sm:inline">Close</span>
            </button>
          </div>
        </div>
      </div>

      {/* Progress bar */}
      <div className="bg-slate-800/50 px-4 lg:px-6 py-2">
        <div className="flex items-center gap-3">
          <span className="text-sm text-slate-400">Q{currentGlobalQ}/{totalQuestions}</span>
          <div className="flex-1 bg-slate-700 rounded-full h-1.5">
            <div
              className="bg-blue-500 h-1.5 rounded-full transition-all"
              style={{ width: `${(currentGlobalQ / totalQuestions) * 100}%` }}
            />
          </div>
        </div>
      </div>

      {/* Main Content */}
      <div className="flex flex-col lg:flex-row" style={{ height: 'calc(100vh - 280px)' }}>
        {/* Question Panel */}
        <div className={`${editMode ? 'lg:w-[35%]' : 'lg:w-1/2'} p-4 lg:p-6 border-b lg:border-b-0 lg:border-r border-slate-700 overflow-y-auto`}>
          <div className={`inline-block px-3 py-1 rounded-full text-xs font-bold mb-3 border ${categoryColors[chapter.category] || 'badge-credentials'}`}>
            {chapter.category.replace('_', ' ').toUpperCase()}
          </div>

          <div className="text-xs text-slate-500 mb-2">CHAPTER GOAL: {chapter.goal}</div>

          <h3 className="text-xl lg:text-2xl font-semibold mb-4 leading-relaxed">
            "{question.text}"
          </h3>

          <div className="space-y-3">
            <div className="bg-slate-800 rounded-lg p-4">
              <h4 className="text-xs font-bold text-slate-400 mb-1 uppercase">Purpose</h4>
              <p className="text-slate-200">{question.purpose}</p>
            </div>

            <div className="bg-slate-800 rounded-lg p-4">
              <h4 className="text-xs font-bold text-slate-400 mb-1 uppercase">Expected Answer</h4>
              <p className="text-green-400 italic">"{question.expectedAnswer}"</p>
            </div>

            {question.ifDenied && (
              <div className="bg-red-900/20 border border-red-600 rounded-lg p-4">
                <h4 className="text-xs font-bold text-red-400 mb-1 uppercase">If Denied — Impeachment</h4>
                <p className="text-red-200">{question.ifDenied}</p>
              </div>
            )}

            {question.followUp?.length > 0 && (
              <div className="bg-blue-900/20 border border-blue-600 rounded-lg p-4">
                <h4 className="text-xs font-bold text-blue-400 mb-1 uppercase">Follow-Up</h4>
                {question.followUp.map((f, i) => (
                  <p key={i} className="text-blue-200 text-sm">{f}</p>
                ))}
              </div>
            )}

            {question.notes && (
              <div className="bg-amber-900/20 border border-amber-600 rounded-lg p-4">
                <h4 className="text-xs font-bold text-amber-400 mb-1 uppercase">Notes</h4>
                <p className="text-amber-200 text-sm">{question.notes}</p>
              </div>
            )}
          </div>
        </div>

        {/* Exhibit Panel */}
        <div className={`${editMode ? 'lg:w-[30%] hidden lg:flex' : 'lg:w-1/2'} flex-col p-4 lg:p-6 bg-slate-800/50 overflow-y-auto ${editMode ? '' : 'border-r border-slate-700'}`}>
          <div className="mb-4">
            <h4 className="text-xs font-bold text-slate-400 mb-2 uppercase">Citation</h4>
            <div className="bg-amber-900/40 border border-amber-600 rounded-lg p-4 flex items-start gap-3">
              <FileText className="w-5 h-5 text-amber-400 flex-shrink-0" />
              <div>
                <span className="text-amber-200 font-medium">{question.citation?.documentTitle || 'Source Document'}</span>
                {question.citation?.pageNumber && (
                  <span className="text-amber-400 text-sm ml-2">Page {question.citation.pageNumber}</span>
                )}
                {question.citation?.exhibitNumber && (
                  <span className="text-amber-400 text-sm ml-2">({question.citation.exhibitNumber})</span>
                )}
              </div>
            </div>
          </div>

          <div className="bg-white rounded-lg p-5 text-slate-900 flex-1">
            <div className="text-xs text-slate-500 mb-3 uppercase font-bold">Document Excerpt</div>
            <div className="space-y-2 text-sm leading-relaxed font-serif">
              <p className="text-slate-400">[...]</p>
              <p className="bg-yellow-200 px-1 -mx-1 rounded">{question.documentExcerpt || question.expectedAnswer}</p>
              <p className="text-slate-400">[...]</p>
            </div>
            <div className="mt-4 pt-3 border-t border-slate-200 text-xs text-slate-500 text-right">
              {question.citation?.documentTitle}{question.citation?.pageNumber ? `, Page ${question.citation.pageNumber}` : ''}
            </div>
          </div>
        </div>

        {/* Edit Panel */}
        {editMode && (
          <div className="lg:w-[35%] flex flex-col bg-slate-900 border-l border-slate-700">
            <div className="p-4 border-b border-slate-700">
              <h3 className="font-bold flex items-center gap-2">
                <Edit3 className="w-5 h-5 text-blue-400" />
                Edit Outline
              </h3>
              <p className="text-sm text-slate-400 mt-1">Describe changes in natural language</p>
            </div>

            <div className="flex-1 overflow-y-auto p-4">
              <div className="text-center text-slate-500 mt-4">
                <p className="text-sm mb-3">Examples:</p>
                <ul className="text-xs space-y-1 text-left max-w-[240px] mx-auto">
                  <li>&bull; "Make Q3 more aggressive"</li>
                  <li>&bull; "Add a question about the contract deadline"</li>
                  <li>&bull; "Remove chapter 2, it's not relevant"</li>
                  <li>&bull; "Add impeachment from depo page 31"</li>
                  <li>&bull; "Reorder — put bias chapter first"</li>
                  <li>&bull; "Fix the citation on Q2 — it's page 45"</li>
                </ul>
              </div>
            </div>

            <div className="p-4 border-t border-slate-700">
              <div className="flex gap-2">
                <input
                  type="text"
                  value={editInput}
                  onChange={(e) => onEditInputChange(e.target.value)}
                  onKeyDown={(e) => e.key === 'Enter' && !editing && onSendEdit()}
                  placeholder="Describe your edit..."
                  disabled={editing}
                  className="flex-1 bg-slate-800 border border-slate-600 rounded-lg px-3 py-2 text-sm placeholder-slate-500 focus:outline-none focus:border-blue-500 disabled:opacity-50"
                />
                <button
                  onClick={onSendEdit}
                  disabled={editing || !editInput.trim()}
                  className="px-3 py-2 bg-blue-600 hover:bg-blue-500 disabled:opacity-40 rounded-lg"
                >
                  {editing ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
                </button>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Navigation */}
      <div className="fixed bottom-0 left-0 right-0 bg-slate-800 border-t border-slate-700 px-4 py-3 z-10">
        <div className="flex items-center justify-between max-w-screen-xl mx-auto">
          <button
            onClick={() => {
              if (currentQuestion > 0) {
                setCurrentQuestion((q) => q - 1)
              } else if (currentChapter > 0) {
                setCurrentChapter((c) => c - 1)
                setCurrentQuestion(data.chapters[currentChapter - 1]?.questions.length - 1 || 0)
              }
            }}
            disabled={currentChapter === 0 && currentQuestion === 0}
            className="px-4 py-2 bg-slate-700 hover:bg-slate-600 disabled:opacity-40 rounded-lg flex items-center gap-1"
          >
            <ArrowLeft className="w-4 h-4" /> Prev
          </button>

          {/* Chapter dots */}
          <div className="flex gap-2 overflow-x-auto">
            {data.chapters.map((ch, ci) => (
              <button
                key={ci}
                onClick={() => { setCurrentChapter(ci); setCurrentQuestion(0) }}
                className={`flex items-center gap-1 px-2 py-1 rounded text-xs whitespace-nowrap ${
                  ci === currentChapter ? 'bg-blue-600 text-white' : 'bg-slate-700 text-slate-400'
                }`}
              >
                Ch{ci + 1}
              </button>
            ))}
          </div>

          <button
            onClick={() => {
              if (chapter && currentQuestion < chapter.questions.length - 1) {
                setCurrentQuestion((q) => q + 1)
              } else if (currentChapter < data.chapters.length - 1) {
                setCurrentChapter((c) => c + 1)
                setCurrentQuestion(0)
              }
            }}
            disabled={
              currentChapter === data.chapters.length - 1 &&
              currentQuestion === (chapter?.questions.length || 1) - 1
            }
            className="px-4 py-2 bg-blue-600 hover:bg-blue-500 disabled:opacity-40 rounded-lg flex items-center gap-1"
          >
            Next <ChevronRight className="w-4 h-4" />
          </button>
        </div>
      </div>
    </div>
  )
}
