'use client'

import { useEffect } from 'react'
import { useSession } from 'next-auth/react'
import { useRouter } from 'next/navigation'
import { Scale, ArrowRight, FileText, Brain, Presentation, Loader2 } from 'lucide-react'

export default function Home() {
  const { data: session, status } = useSession()
  const router = useRouter()

  useEffect(() => {
    if (status === 'authenticated') {
      router.push('/dashboard')
    }
  }, [status, router])

  if (status === 'loading') {
    return (
      <div className="min-h-screen bg-navy-950 flex items-center justify-center">
        <Loader2 className="w-8 h-8 text-blue-400 animate-spin" />
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-navy-950">
      {/* Hero */}
      <div className="max-w-5xl mx-auto px-4 pt-20 pb-16 text-center">
        <div className="inline-flex items-center justify-center w-20 h-20 bg-blue-600 rounded-2xl mb-6">
          <Scale className="w-10 h-10 text-white" />
        </div>
        <h1 className="text-5xl font-display font-bold text-white mb-4">TrialOutline</h1>
        <p className="text-xl text-slate-300 max-w-2xl mx-auto mb-8">
          AI-powered witness examination outlines for trial attorneys.
          Upload your case documents. Get polished, professional, chapter-method
          cross and direct examination outlines — ready for trial.
        </p>
        <button
          onClick={() => router.push('/login')}
          className="px-8 py-4 bg-blue-600 hover:bg-blue-500 rounded-xl text-white font-semibold text-lg flex items-center gap-2 mx-auto transition-colors"
        >
          Get Started <ArrowRight className="w-5 h-5" />
        </button>
      </div>

      {/* Features */}
      <div className="max-w-5xl mx-auto px-4 pb-20">
        <div className="grid md:grid-cols-3 gap-8">
          <div className="bg-slate-800/50 border border-slate-700 rounded-xl p-6">
            <FileText className="w-10 h-10 text-blue-400 mb-4" />
            <h3 className="text-lg font-bold text-white mb-2">Upload Everything</h3>
            <p className="text-slate-400">
              ZIP files with hundreds of documents. PDFs, DOCX, text files.
              Depositions, expert reports, exhibits, text messages, emails.
              We process them all.
            </p>
          </div>

          <div className="bg-slate-800/50 border border-slate-700 rounded-xl p-6">
            <Brain className="w-10 h-10 text-blue-400 mb-4" />
            <h3 className="text-lg font-bold text-white mb-2">AI Analysis</h3>
            <p className="text-slate-400">
              Automatically identifies parties, witnesses, key issues, and
              speaker attribution. Builds witness profiles with favorable facts,
              prior inconsistencies, and impeachment opportunities.
            </p>
          </div>

          <div className="bg-slate-800/50 border border-slate-700 rounded-xl p-6">
            <Presentation className="w-10 h-10 text-blue-400 mb-4" />
            <h3 className="text-lg font-bold text-white mb-2">Trial-Ready Outlines</h3>
            <p className="text-slate-400">
              Chapter-method examination outlines with questions on the left,
              exhibits on the right. Export as landscape HTML for flawless
              witness examinations at trial.
            </p>
          </div>
        </div>
      </div>
    </div>
  )
}
