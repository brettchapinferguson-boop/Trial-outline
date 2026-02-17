'use client'

import { useState, useEffect } from 'react'
import { useSession, signOut } from 'next-auth/react'
import { useRouter } from 'next/navigation'
import {
  Scale, Plus, FolderOpen, FileText, Users, ScrollText,
  Settings, LogOut, Loader2, Search, ChevronRight,
} from 'lucide-react'

interface CaseItem {
  id: string
  title: string
  caseNumber: string | null
  caseType: string
  status: string
  createdAt: string
  updatedAt: string
  _count: {
    documents: number
    witnesses: number
    outlines: number
  }
}

export default function DashboardPage() {
  const { data: session, status } = useSession()
  const router = useRouter()
  const [cases, setCases] = useState<CaseItem[]>([])
  const [loading, setLoading] = useState(true)
  const [showNewCase, setShowNewCase] = useState(false)
  const [newCaseTitle, setNewCaseTitle] = useState('')
  const [newCaseType, setNewCaseType] = useState('civil')
  const [creating, setCreating] = useState(false)
  const [search, setSearch] = useState('')
  const [apiKey, setApiKey] = useState('')
  const [showSettings, setShowSettings] = useState(false)

  useEffect(() => {
    if (status === 'unauthenticated') {
      router.push('/login')
    }
  }, [status, router])

  useEffect(() => {
    const saved = localStorage.getItem('anthropic_api_key')
    if (saved) setApiKey(saved)
  }, [])

  useEffect(() => {
    if (status === 'authenticated') {
      fetchCases()
    }
  }, [status])

  const fetchCases = async () => {
    try {
      const res = await fetch('/api/cases')
      if (res.ok) {
        const data = await res.json()
        setCases(data)
      }
    } catch (err) {
      console.error('Failed to fetch cases:', err)
    } finally {
      setLoading(false)
    }
  }

  const createCase = async () => {
    if (!newCaseTitle.trim()) return
    setCreating(true)
    try {
      const res = await fetch('/api/cases', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ title: newCaseTitle, caseType: newCaseType }),
      })
      if (res.ok) {
        const newCase = await res.json()
        router.push(`/cases/${newCase.id}`)
      }
    } catch (err) {
      console.error('Failed to create case:', err)
    } finally {
      setCreating(false)
    }
  }

  const saveApiKey = (key: string) => {
    setApiKey(key)
    localStorage.setItem('anthropic_api_key', key)
    setShowSettings(false)
  }

  const filteredCases = cases.filter(
    (c) =>
      c.title.toLowerCase().includes(search.toLowerCase()) ||
      c.caseNumber?.toLowerCase().includes(search.toLowerCase())
  )

  if (status === 'loading' || loading) {
    return (
      <div className="min-h-screen bg-navy-950 flex items-center justify-center">
        <Loader2 className="w-8 h-8 text-blue-400 animate-spin" />
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-navy-950">
      {/* Settings Modal */}
      {showSettings && (
        <div className="fixed inset-0 bg-black/70 flex items-center justify-center z-50">
          <div className="bg-slate-800 rounded-xl p-6 w-full max-w-md mx-4 border border-slate-700">
            <h2 className="text-xl font-bold mb-4">Settings</h2>
            <div className="mb-4">
              <label className="block text-sm text-slate-400 mb-2">Anthropic API Key</label>
              <input
                type="password"
                value={apiKey}
                onChange={(e) => setApiKey(e.target.value)}
                placeholder="sk-ant-..."
                className="w-full bg-slate-900 border border-slate-600 rounded-lg px-4 py-3 text-white placeholder-slate-500 focus:outline-none focus:border-blue-500"
              />
              <p className="text-xs text-slate-500 mt-2">Required for AI features. Get your key at console.anthropic.com</p>
            </div>
            <div className="flex gap-3">
              <button onClick={() => setShowSettings(false)} className="flex-1 py-2 bg-slate-700 hover:bg-slate-600 rounded-lg transition-colors">Cancel</button>
              <button onClick={() => saveApiKey(apiKey)} className="flex-1 py-2 bg-blue-600 hover:bg-blue-500 rounded-lg transition-colors">Save</button>
            </div>
          </div>
        </div>
      )}

      {/* Header */}
      <header className="bg-slate-800/50 border-b border-slate-700">
        <div className="max-w-6xl mx-auto px-4 py-4 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 bg-blue-600 rounded-xl flex items-center justify-center">
              <Scale className="w-5 h-5 text-white" />
            </div>
            <div>
              <h1 className="font-bold text-lg">TrialOutline</h1>
              <p className="text-slate-400 text-xs">{session?.user?.email}</p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={() => setShowSettings(true)}
              className={`p-2 rounded-lg transition-colors ${
                apiKey ? 'bg-slate-700 hover:bg-slate-600' : 'bg-amber-600 hover:bg-amber-500'
              }`}
              title={apiKey ? 'Settings' : 'Set API key first'}
            >
              <Settings className="w-5 h-5" />
            </button>
            <button
              onClick={() => signOut({ callbackUrl: '/login' })}
              className="p-2 bg-slate-700 hover:bg-slate-600 rounded-lg transition-colors"
              title="Sign out"
            >
              <LogOut className="w-5 h-5" />
            </button>
          </div>
        </div>
      </header>

      {/* API Key Warning */}
      {!apiKey && (
        <div className="max-w-6xl mx-auto px-4 mt-4">
          <div className="bg-amber-900/30 border border-amber-600 text-amber-200 rounded-lg px-4 py-3 flex items-center gap-3">
            <Settings className="w-5 h-5 flex-shrink-0" />
            <span className="text-sm">
              Set your Anthropic API key in{' '}
              <button onClick={() => setShowSettings(true)} className="underline font-semibold">
                Settings
              </button>{' '}
              to enable AI features.
            </span>
          </div>
        </div>
      )}

      {/* Content */}
      <main className="max-w-6xl mx-auto px-4 py-8">
        {/* Actions Row */}
        <div className="flex items-center justify-between mb-6">
          <h2 className="text-2xl font-display font-bold">Your Cases</h2>
          <button
            onClick={() => setShowNewCase(true)}
            className="px-4 py-2 bg-blue-600 hover:bg-blue-500 rounded-lg flex items-center gap-2 font-medium transition-colors"
          >
            <Plus className="w-4 h-4" /> New Case
          </button>
        </div>

        {/* New Case Form */}
        {showNewCase && (
          <div className="bg-slate-800 border border-slate-700 rounded-xl p-6 mb-6 animate-fade-in">
            <h3 className="font-bold mb-4">Create New Case</h3>
            <div className="grid md:grid-cols-3 gap-4">
              <div className="md:col-span-2">
                <label className="block text-sm text-slate-400 mb-1">Case Title</label>
                <input
                  type="text"
                  value={newCaseTitle}
                  onChange={(e) => setNewCaseTitle(e.target.value)}
                  placeholder="Smith v. Jones"
                  autoFocus
                  onKeyDown={(e) => e.key === 'Enter' && createCase()}
                  className="w-full bg-slate-900 border border-slate-600 rounded-lg px-4 py-3 text-white placeholder-slate-500 focus:outline-none focus:border-blue-500"
                />
              </div>
              <div>
                <label className="block text-sm text-slate-400 mb-1">Case Type</label>
                <select
                  value={newCaseType}
                  onChange={(e) => setNewCaseType(e.target.value)}
                  className="w-full bg-slate-900 border border-slate-600 rounded-lg px-4 py-3 text-white focus:outline-none focus:border-blue-500"
                >
                  <option value="civil">Civil Litigation</option>
                  <option value="family">Family Law</option>
                  <option value="criminal">Criminal</option>
                </select>
              </div>
            </div>
            <div className="flex gap-3 mt-4">
              <button
                onClick={() => { setShowNewCase(false); setNewCaseTitle('') }}
                className="px-4 py-2 bg-slate-700 hover:bg-slate-600 rounded-lg transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={createCase}
                disabled={!newCaseTitle.trim() || creating}
                className="px-4 py-2 bg-blue-600 hover:bg-blue-500 disabled:opacity-50 rounded-lg flex items-center gap-2 transition-colors"
              >
                {creating ? <Loader2 className="w-4 h-4 animate-spin" /> : <Plus className="w-4 h-4" />}
                Create Case
              </button>
            </div>
          </div>
        )}

        {/* Search */}
        {cases.length > 0 && (
          <div className="relative mb-6">
            <Search className="w-4 h-4 text-slate-500 absolute left-3 top-1/2 -translate-y-1/2" />
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search cases..."
              className="w-full bg-slate-800 border border-slate-700 rounded-lg pl-10 pr-4 py-2.5 text-sm placeholder-slate-500 focus:outline-none focus:border-blue-500"
            />
          </div>
        )}

        {/* Case List */}
        {filteredCases.length === 0 && !loading ? (
          <div className="text-center py-20">
            <FolderOpen className="w-16 h-16 mx-auto mb-4 text-slate-600" />
            <h3 className="text-xl font-bold text-slate-400 mb-2">
              {cases.length === 0 ? 'No cases yet' : 'No matching cases'}
            </h3>
            <p className="text-slate-500 mb-4">
              {cases.length === 0
                ? 'Create your first case to get started.'
                : 'Try a different search term.'}
            </p>
            {cases.length === 0 && (
              <button
                onClick={() => setShowNewCase(true)}
                className="px-4 py-2 bg-blue-600 hover:bg-blue-500 rounded-lg inline-flex items-center gap-2 transition-colors"
              >
                <Plus className="w-4 h-4" /> New Case
              </button>
            )}
          </div>
        ) : (
          <div className="space-y-3">
            {filteredCases.map((c) => (
              <button
                key={c.id}
                onClick={() => router.push(`/cases/${c.id}`)}
                className="w-full bg-slate-800 hover:bg-slate-750 border border-slate-700 hover:border-slate-600 rounded-xl p-5 text-left transition-all group"
              >
                <div className="flex items-center justify-between">
                  <div className="min-w-0">
                    <h3 className="font-bold text-lg truncate group-hover:text-blue-400 transition-colors">
                      {c.title}
                    </h3>
                    <div className="flex items-center gap-4 mt-1 text-sm text-slate-400">
                      {c.caseNumber && <span>{c.caseNumber}</span>}
                      <span className="capitalize">{c.caseType}</span>
                      <span className={`px-2 py-0.5 rounded text-xs ${
                        c.status === 'ready' ? 'bg-green-900/30 text-green-400' :
                        c.status === 'processing' ? 'bg-blue-900/30 text-blue-400' :
                        'bg-slate-700 text-slate-400'
                      }`}>
                        {c.status}
                      </span>
                    </div>
                  </div>

                  <div className="flex items-center gap-6 flex-shrink-0">
                    <div className="hidden md:flex items-center gap-4 text-sm text-slate-500">
                      <span className="flex items-center gap-1">
                        <FileText className="w-4 h-4" /> {c._count.documents}
                      </span>
                      <span className="flex items-center gap-1">
                        <Users className="w-4 h-4" /> {c._count.witnesses}
                      </span>
                      <span className="flex items-center gap-1">
                        <ScrollText className="w-4 h-4" /> {c._count.outlines}
                      </span>
                    </div>
                    <ChevronRight className="w-5 h-5 text-slate-600 group-hover:text-blue-400 transition-colors" />
                  </div>
                </div>
              </button>
            ))}
          </div>
        )}
      </main>
    </div>
  )
}
