// ─── Chapter Method Outline Types ────────────────────────────────

export type ChapterCategory =
  | 'credentials'
  | 'methodology'
  | 'favorable_admissions'
  | 'bias'
  | 'prior_inconsistencies'
  | 'damaging_facts'
  | 'foundation'
  | 'closing_setup'

export type ExamType = 'cross' | 'direct' | 'redirect' | 'recross'

export interface Citation {
  documentId: string
  documentTitle: string
  pageNumber: number
  lineNumber?: number
  exhibitNumber?: string
  batesNumber?: string
}

export interface Question {
  id: string
  text: string
  type: 'leading' | 'open' | 'foundation' | 'impeachment'
  expectedAnswer: string
  ifDenied?: string
  citation: Citation
  documentExcerpt: string
  followUp: string[]
  purpose: string
  notes?: string
}

export interface Chapter {
  id: string
  title: string
  goal: string
  category: ChapterCategory
  position: 'strong_open' | 'middle' | 'strong_close'
  questions: Question[]
}

export interface OutlineData {
  title: string
  witness: string
  examType: ExamType
  overallGoals: string[]
  chapters: Chapter[]
}

// ─── Document Processing Types ───────────────────────────────────

export type DocType =
  | 'deposition'
  | 'exhibit'
  | 'expert_report'
  | 'correspondence'
  | 'text_messages'
  | 'court_filing'
  | 'contract'
  | 'financial'
  | 'medical'
  | 'other'

export interface PageContent {
  pageNumber: number
  text: string
}

export interface DocumentMetadata {
  title?: string
  date?: string
  author?: string
  docType?: DocType
  parties?: string[]
  summary?: string
  batesRange?: string
}

export interface SpeakerAttribution {
  speakerName: string
  pageNumber: number
  lineNumber?: number
  text: string
  context?: string
}

// ─── Case Setup Interview Types ──────────────────────────────────

export interface InterviewAnswers {
  caseTitle: string
  caseNumber?: string
  court?: string
  jurisdiction?: string
  caseType: 'civil' | 'family' | 'criminal'
  clientName: string
  clientRole: string
  theory: string
  theme: string
  keyIssues: string[]
  parties: Array<{
    name: string
    role: string
    side: 'our_client' | 'opposing' | 'neutral'
    attorney?: string
  }>
  witnesses: Array<{
    name: string
    type: 'fact' | 'expert' | 'party' | 'character'
    side: 'friendly' | 'adverse' | 'neutral'
  }>
}

// ─── Witness Profile Types ───────────────────────────────────────

export interface WitnessProfile {
  name: string
  type: string
  side: string
  favorableFacts: Array<{
    fact: string
    citation: Citation
  }>
  unfavorableFacts: Array<{
    fact: string
    citation: Citation
  }>
  priorStatements: Array<{
    statement: string
    citation: Citation
    context?: string
  }>
  connectedDocuments: string[]
  potentialInconsistencies: Array<{
    statement1: string
    citation1: Citation
    statement2: string
    citation2: Citation
    description: string
  }>
  strengths: string[]
  vulnerabilities: string[]
}

// ─── Outline Generation Request ──────────────────────────────────

export interface OutlineGenerationRequest {
  caseId: string
  witnessId: string
  examType: ExamType
  primaryGoal: string
  keyAdmissions?: string[]
  importantDocuments?: string[]
  priorInconsistencies?: string[]
  additionalInstructions?: string
}

// ─── Export Types ────────────────────────────────────────────────

export interface ExportOptions {
  format: 'html' | 'pdf'
  includeExhibitPages: boolean
  includeNotes: boolean
  includeImpeachmentSetup: boolean
  colorCode: boolean
}

// ─── API Response Types ──────────────────────────────────────────

export interface ApiResponse<T = unknown> {
  success: boolean
  data?: T
  error?: string
}

// ─── Processing Job Status ───────────────────────────────────────

export interface JobStatus {
  id: string
  jobType: string
  status: 'pending' | 'running' | 'completed' | 'failed'
  progress: number
  error?: string
}

// ─── Category Colors & Labels ────────────────────────────────────

export const CATEGORY_CONFIG: Record<ChapterCategory, { label: string; color: string; bgClass: string }> = {
  credentials: { label: 'Credentials', color: '#3b82f6', bgClass: 'badge-credentials' },
  methodology: { label: 'Methodology', color: '#eab308', bgClass: 'badge-methodology' },
  favorable_admissions: { label: 'Favorable', color: '#22c55e', bgClass: 'badge-favorable' },
  bias: { label: 'Bias', color: '#f97316', bgClass: 'badge-bias' },
  prior_inconsistencies: { label: 'Impeachment', color: '#ef4444', bgClass: 'badge-damaging' },
  damaging_facts: { label: 'Damaging', color: '#ef4444', bgClass: 'badge-damaging' },
  foundation: { label: 'Foundation', color: '#06b6d4', bgClass: 'badge-foundation' },
  closing_setup: { label: 'Closing', color: '#a855f7', bgClass: 'badge-closing' },
}
