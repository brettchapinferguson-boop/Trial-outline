# TrialOutline SaaS - Implementation Plan

## Vision

A full-stack SaaS that allows trial attorneys to upload large volumes of case documents (including ZIP archives of hundreds/thousands of pages), answer a few strategic questions, and receive polished, professional, AI-generated witness examination outlines following the **Chapter Method** — the gold standard used by expert trial attorneys.

The final deliverable is an interactive HTML with landscape-formatted pages: examination questions on the left, the source exhibit on the right, walking the lawyer step-by-step through a flawless witness examination at trial.

**No existing product does this.** CaseFleet, Everchron, and Trial Director handle chronology, case management, or courtroom presentation — but none generate structured chapter-method examination outlines with integrated exhibit references and impeachment sources.

---

## Architecture Overview

```
┌─────────────────────────────────────────────────────────────┐
│                        FRONTEND                              │
│  Next.js 14 App Router + React 18 + Tailwind CSS            │
│                                                              │
│  ┌──────────┐ ┌──────────────┐ ┌───────────────────────┐   │
│  │  Upload   │ │  Case Setup  │ │  Outline Viewer/Editor│   │
│  │  Wizard   │ │  Interview   │ │  (Landscape HTML)     │   │
│  └──────────┘ └──────────────┘ └───────────────────────┘   │
└──────────────────────┬──────────────────────────────────────┘
                       │
┌──────────────────────▼──────────────────────────────────────┐
│                     API LAYER                                │
│  Next.js API Routes + Background Job Queue (BullMQ/Redis)   │
│                                                              │
│  /api/auth     - NextAuth.js (authentication)               │
│  /api/upload   - File upload + ZIP extraction                │
│  /api/process  - Document parsing pipeline (kick off jobs)   │
│  /api/extract  - AI metadata + speaker attribution           │
│  /api/generate - AI outline generation (chapter method)      │
│  /api/export   - HTML/PDF export                             │
│  /api/cases    - CRUD for cases                              │
│  /api/outlines - CRUD for outlines                           │
└──────────────────────┬──────────────────────────────────────┘
                       │
┌──────────────────────▼──────────────────────────────────────┐
│                   PROCESSING LAYER                           │
│                                                              │
│  ┌────────────┐ ┌─────────────┐ ┌────────────────────────┐ │
│  │ PDF Parser  │ │ ZIP Extract │ │ Document Classifier    │ │
│  │ (pdf-parse) │ │ (node-     │ │ (heuristic + Claude)   │ │
│  │             │ │  stream-zip)│ │                        │ │
│  └─────┬──────┘ └──────┬──────┘ └───────────┬────────────┘ │
│        │               │                     │              │
│  ┌─────▼───────────────▼─────────────────────▼────────────┐ │
│  │              Document Processing Pipeline               │ │
│  │  1. Extract text (per-page, with page numbers)          │ │
│  │  2. Classify document type (depo, exhibit, report...)   │ │
│  │  3. Extract metadata (title, date, author, parties)     │ │
│  │  4. Speaker attribution (who said what)                 │ │
│  │  5. Chunk + embed for RAG                               │ │
│  └─────────────────────┬──────────────────────────────────┘ │
│                        │                                     │
│  ┌─────────────────────▼──────────────────────────────────┐ │
│  │              AI Generation Pipeline                     │ │
│  │  1. Map-reduce: extract facts per document chunk        │ │
│  │  2. Build witness profiles (facts, docs, prior stmts)  │ │
│  │  3. Identify impeachment opportunities                  │ │
│  │  4. Generate chapter-method outlines per witness        │ │
│  │  5. Validate citations against source documents         │ │
│  └────────────────────────────────────────────────────────┘ │
└──────────────────────┬──────────────────────────────────────┘
                       │
┌──────────────────────▼──────────────────────────────────────┐
│                    DATA LAYER                                │
│                                                              │
│  PostgreSQL (via Prisma ORM)                                │
│  ├── users, sessions, accounts (NextAuth)                   │
│  ├── cases (case_id, title, theory, theme, parties)         │
│  ├── documents (doc_id, case_id, type, metadata, pages)     │
│  ├── document_pages (page_id, doc_id, page_num, text)       │
│  ├── speakers (speaker_id, case_id, name, role)             │
│  ├── statements (stmt_id, speaker_id, doc_id, page, text)   │
│  ├── facts (fact_id, case_id, description, source_refs)     │
│  ├── witnesses (witness_id, case_id, name, type, profile)   │
│  ├── outlines (outline_id, case_id, witness_id, type, data) │
│  ├── outline_versions (version history for undo/redo)       │
│  └── embeddings (pgvector for RAG retrieval)                │
│                                                              │
│  Redis (BullMQ job queue for background processing)         │
│  S3-compatible storage (uploaded files + generated exports)  │
└─────────────────────────────────────────────────────────────┘
```

---

## Phase 1: Foundation & Document Pipeline (Steps 1-5)

The existing prototype is a single-page proof-of-concept. Phase 1 rebuilds the foundation as a proper multi-page app with authentication, database persistence, and a robust document ingestion pipeline.

### Step 1: Project Restructure & Dependencies

**What:** Restructure the project from a single-file prototype into a proper multi-page Next.js app with the full dependency stack.

**Files to create/modify:**
- `package.json` — Add: `prisma`, `@prisma/client`, `next-auth`, `zod`, `bullmq`, `ioredis`, `node-stream-zip`, `pdf-parse`, `mammoth`, `@anthropic-ai/sdk` (keep), `lucide-react` (keep), `pdfjs-dist` (keep for client-side viewer)
- `prisma/schema.prisma` — Database schema (see Data Layer above)
- `app/layout.tsx` — Add auth session provider, global navigation
- `app/(auth)/login/page.tsx` — Login page
- `app/(auth)/register/page.tsx` — Registration page
- `app/dashboard/page.tsx` — Case list / dashboard
- `app/cases/[caseId]/page.tsx` — Case detail page
- `app/cases/[caseId]/upload/page.tsx` — Document upload wizard
- `app/cases/[caseId]/interview/page.tsx` — Case setup interview
- `app/cases/[caseId]/documents/page.tsx` — Document library
- `app/cases/[caseId]/outlines/page.tsx` — Outline list
- `app/cases/[caseId]/outlines/[outlineId]/page.tsx` — Outline viewer/editor
- `lib/` directory — Shared utilities, types, AI prompts
- `components/` directory — Reusable UI components

**Why restructure:** The current 735-line `page.tsx` mixes upload, chat, generation, viewing, and editing. Breaking into pages with clear responsibilities makes each piece testable and maintainable.

### Step 2: Database & Authentication

**What:** Set up PostgreSQL with Prisma ORM and NextAuth.js for user authentication.

**Database schema (key tables):**

```prisma
model User {
  id        String   @id @default(cuid())
  email     String   @unique
  name      String?
  cases     Case[]
  createdAt DateTime @default(now())
}

model Case {
  id          String     @id @default(cuid())
  userId      String
  user        User       @relation(fields: [userId], references: [id])
  title       String
  caseNumber  String?
  theory      String?    // Attorney's theory of the case
  theme       String?    // One-line case theme
  jurisdiction String?
  caseType    String?    // family, civil, criminal
  parties     Party[]
  documents   Document[]
  witnesses   Witness[]
  outlines    Outline[]
  createdAt   DateTime   @default(now())
  updatedAt   DateTime   @updatedAt
}

model Party {
  id       String @id @default(cuid())
  caseId   String
  case     Case   @relation(fields: [caseId], references: [id])
  name     String
  role     String // plaintiff, defendant, petitioner, respondent, child
  side     String // "our_client" | "opposing" | "neutral"
}

model Document {
  id           String         @id @default(cuid())
  caseId       String
  case         Case           @relation(fields: [caseId], references: [id])
  fileName     String
  fileUrl      String         // S3 path to original file
  docType      String?        // deposition, exhibit, report, correspondence, text_messages, court_filing
  title        String?        // Extracted or assigned title
  date         DateTime?      // Document date
  author       String?        // Who created it
  pageCount    Int?
  pages        DocumentPage[]
  statements   Statement[]
  status       String         @default("pending") // pending, processing, ready, error
  metadata     Json?          // Flexible metadata storage
  createdAt    DateTime       @default(now())
}

model DocumentPage {
  id         String   @id @default(cuid())
  documentId String
  document   Document @relation(fields: [documentId], references: [id])
  pageNumber Int
  text       String   @db.Text
  embedding  Unsupported("vector(1536)")?  // pgvector
}

model Speaker {
  id         String      @id @default(cuid())
  caseId     String
  name       String
  aliases    String[]    // Nicknames, phone numbers, etc.
  role       String?     // witness, attorney, judge, party
  statements Statement[]
}

model Statement {
  id         String   @id @default(cuid())
  speakerId  String
  speaker    Speaker  @relation(fields: [speakerId], references: [id])
  documentId String
  document   Document @relation(fields: [documentId], references: [id])
  pageNumber Int
  lineNumber Int?
  text       String   @db.Text
  context    String?  // What was the question/situation when this was said
}

model Witness {
  id          String    @id @default(cuid())
  caseId      String
  case        Case      @relation(fields: [caseId], references: [id])
  name        String
  type        String    // fact, expert, party, character
  side        String    // friendly, adverse, neutral
  profile     Json?     // AI-generated profile (strengths, weaknesses, key facts)
  outlines    Outline[]
}

model Outline {
  id         String           @id @default(cuid())
  caseId     String
  case       Case             @relation(fields: [caseId], references: [id])
  witnessId  String
  witness    Witness          @relation(fields: [witnessId], references: [id])
  examType   String           // direct, cross, redirect, recross
  title      String
  chapters   Json             // The chapter-method outline data
  versions   OutlineVersion[]
  status     String           @default("draft") // draft, reviewed, final
  createdAt  DateTime         @default(now())
  updatedAt  DateTime         @updatedAt
}

model OutlineVersion {
  id        String  @id @default(cuid())
  outlineId String
  outline   Outline @relation(fields: [outlineId], references: [id])
  chapters  Json
  editNote  String? // What changed
  createdAt DateTime @default(now())
}
```

**Auth:** NextAuth.js with email/password (credentials provider) + optional Google OAuth. Session stored in database.

### Step 3: File Upload & ZIP Extraction

**What:** Build a robust upload system that accepts individual files (PDF, DOCX, TXT) and ZIP archives containing hundreds of files. Files are stored in S3-compatible storage and queued for processing.

**Upload flow:**
1. User drags files (or selects via file picker) — supports `.pdf`, `.docx`, `.txt`, `.zip`
2. Files upload to `/api/upload` which streams them to S3 storage
3. ZIP files are extracted server-side using `node-stream-zip` — each contained file becomes a separate `Document` record
4. Each document gets status `"pending"` and a processing job is enqueued via BullMQ
5. UI shows upload progress and processing status per document

**Key implementation details:**
- Use `node-stream-zip` (streaming, low memory) — NOT `adm-zip` which loads entire archive into memory
- Filter ZIP contents: only process supported file types, skip macOS `__MACOSX` folders and `.DS_Store`
- Generate unique S3 keys per file to prevent collisions
- Set upload size limit to 500MB per request (configurable)

### Step 4: Document Processing Pipeline

**What:** A background job pipeline (BullMQ) that processes each uploaded document through: text extraction → type classification → metadata extraction → speaker attribution → page chunking.

**Pipeline stages:**

**Stage 1: Text Extraction**
- PDF files: `pdf-parse` on server (NOT client-side pdfjs-dist)
- DOCX files: `mammoth` (already a dependency, currently unused)
- TXT files: direct read with encoding detection
- Extract text **per page** with clear page boundaries
- Store each page as a `DocumentPage` record with page number and text

**Stage 2: Document Type Classification**
- **Heuristic first pass** (fast, free):
  - Depositions: detect `Q.` / `A.` patterns, `EXAMINATION`, line numbers
  - Court filings: detect case number patterns (`\d{2}-CV-\d+`), court headers
  - Expert reports: detect "REPORT OF", methodology sections
  - Correspondence/emails: detect `From:`, `To:`, `Subject:`, `Dear`
  - Text messages: detect timestamp + sender patterns
  - Exhibits: detect "EXHIBIT" markers, Bates numbers
- **Claude confirmation** (if heuristics are ambiguous): send first 2 pages for classification

**Stage 3: Metadata Extraction**
- Run regex first for structured fields: dates, case numbers, Bates numbers
- Use Claude to extract: document title, author, parties mentioned, summary
- Store in `Document.metadata` JSON field

**Stage 4: Speaker Attribution** (document-type-specific parsers)
- **Depositions:** Deterministic regex state machine:
  ```
  /^BY\s+(MR\.|MS\.|DR\.)\s+([A-Z]+):/ → attorney change
  /^\s+Q\.\s+/ → question by current attorney
  /^\s+A\.\s+/ → answer by witness
  /^THE (WITNESS|COURT|REPORTER):/ → identified speaker
  ```
- **Text messages:** Regex for common export formats (timestamp + sender patterns), then Claude to resolve ambiguous senders to party names
- **Email threads:** Parse headers (From/To/CC/Date), detect reply quoting patterns, reconstruct thread hierarchy
- **Court filings/reports:** Use Claude with structured output to attribute quoted statements and findings to specific parties
- Store results as `Statement` records linked to `Speaker` and `Document`

**Stage 5: Embedding Generation (for RAG)**
- For each `DocumentPage`, generate embedding using OpenAI `text-embedding-3-small` (1536 dimensions) or Voyage AI `voyage-law-2`
- Store in pgvector column on `DocumentPage`
- This enables semantic search across all case documents when generating outlines

### Step 5: Case Setup Interview

**What:** After documents are processed, guide the attorney through a structured interview to provide the strategic context that AI cannot infer from documents alone.

**Interview questions (presented as a multi-step wizard):**

1. **Case Basics** (auto-populated from extraction, attorney confirms/corrects):
   - Case title and number
   - Jurisdiction and court
   - Case type (family, civil, criminal)
   - Your client's name and role

2. **Parties & Roles** (auto-populated, attorney confirms/corrects):
   - List of all parties detected
   - For each: name, role (plaintiff/defendant/etc.), which side (ours/theirs/neutral)

3. **Case Theory & Theme:**
   - "In one paragraph, what is your theory of the case?" (What happened and why)
   - "In one sentence, what is your case theme?" (The emotional hook for the jury)
   - "What are the 3-5 key issues in this case?"

4. **Witnesses:**
   - Auto-populated list of detected witnesses
   - For each: confirm name, type (fact/expert/party), side (friendly/adverse)
   - "Who do you plan to call as witnesses?"
   - "Which opposing witnesses do you expect to cross-examine?"

5. **Strategic Goals** (per witness the attorney selects for outline generation):
   - "What is your primary goal in examining this witness?"
   - "What key admissions do you want from this witness?"
   - "What documents are most important for this witness's examination?"
   - "Are there any prior inconsistent statements you want to highlight?"

---

## Phase 2: AI Outline Generation Engine (Steps 6-9)

This is the core intelligence of the product — generating professional, chapter-method examination outlines from the processed documents and attorney input.

### Step 6: Fact Extraction & Witness Profile Building

**What:** Before generating outlines, the system builds comprehensive witness profiles by extracting and cross-referencing facts across all case documents.

**Process (map-reduce pattern):**

1. **Map phase** — For each document, send page chunks to Claude with a focused extraction prompt:
   ```
   "Extract all factual statements, admissions, and observations from this document
    that relate to [witness name]. For each fact, note:
    - The exact quote or close paraphrase
    - Document name and page number
    - Who stated/observed this fact
    - Whether it supports or undermines [attorney's theory]"
   ```
   Run in parallel across documents (batch API or concurrent requests).

2. **Reduce phase** — Combine all extracted facts for each witness into a structured profile:
   - Facts favorable to our case (with citations)
   - Facts unfavorable to our case (with citations)
   - Prior statements by this witness (with deposition page/line cites)
   - Documents connected to this witness
   - Potential inconsistencies between statements
   - Areas of expertise/credibility (for experts)
   - Areas of vulnerability/bias

3. **Store** the profile in `Witness.profile` JSON field.

**Context window strategy:**
- For cases under ~150 pages: send all documents directly (fits in 200K context)
- For cases 150-750 pages: use Claude Opus with 1M extended context
- For cases over 750 pages: use the map-reduce approach above + RAG retrieval for specific queries

### Step 7: Chapter-Method Outline Generation

**What:** Generate structured examination outlines following the Chapter Method (Pozner & Dodd), the gold standard for cross-examination, and NITA best practices for direct examination.

**Cross-Examination Outline Structure:**

```typescript
interface CrossExamOutline {
  title: string;           // "Cross-Examination of Dr. Jane Smith"
  witness: string;
  examType: "cross";
  overallGoals: string[];  // 3-5 strategic goals
  chapters: Chapter[];
}

interface Chapter {
  id: string;
  title: string;            // "Chapter 3: Bias Toward Father"
  goal: string;             // "Establish evaluator's pattern of gender bias"
  category: ChapterCategory;
  position: "strong_open" | "middle" | "strong_close";
  questions: Question[];
}

interface Question {
  id: string;
  text: string;             // The actual question to ask
  type: "leading" | "open" | "foundation" | "impeachment";
  expectedAnswer: string;   // What we expect the witness to say
  ifDenied: string;         // Impeachment strategy if witness denies
  citation: Citation;       // Source document reference
  documentExcerpt: string;  // The relevant text from the source
  followUp: string[];       // Contingent follow-ups
  purpose: string;          // Strategic purpose of this question
  notes: string;            // Tactical notes for the attorney
}

interface Citation {
  documentId: string;
  documentTitle: string;
  pageNumber: number;
  lineNumber?: number;
  exhibitNumber?: string;   // "Exhibit 14"
  batesNumber?: string;     // "DEF-001234"
}

type ChapterCategory =
  | "credentials"           // Establish/challenge qualifications
  | "methodology"           // Attack/establish methods used
  | "favorable_admissions"  // Lock in helpful testimony
  | "bias"                  // Expose bias, interest, motive
  | "prior_inconsistencies" // Impeachment with prior statements
  | "damaging_facts"        // Confront with harmful evidence
  | "foundation"            // Lay foundation for exhibits
  | "closing_setup";        // Set up closing argument themes
```

**Direct Examination Outline Structure:**

```typescript
interface DirectExamOutline {
  title: string;
  witness: string;
  examType: "direct";
  storyArc: string;        // The narrative this witness tells
  topics: DirectTopic[];
}

interface DirectTopic {
  id: string;
  title: string;           // "Background and Qualifications"
  transition: string;      // "I'd like to turn now to your professional background"
  questions: DirectQuestion[];
  exhibitsToIntroduce: ExhibitIntro[];
}

interface DirectQuestion {
  id: string;
  text: string;            // Open-ended question prompt
  type: "scene_setting" | "action" | "impact" | "foundation" | "redirect";
  anticipatedAnswer: string;
  citation?: Citation;
  notes: string;
}

interface ExhibitIntro {
  exhibitId: string;
  exhibitNumber: string;
  foundationSequence: Question[]; // The standard 4-question foundation
}
```

**Generation prompt strategy:**

The system prompt will instruct Claude to:
1. Use the Chapter Method: work backwards from goals → facts → questions
2. One fact per question on cross (leading, calling for "yes")
3. Open-ended questions on direct (let the witness tell the story)
4. Order chapters by strength: strongest first and last (primacy/recency)
5. Include impeachment setup (commit-accredit-confront) for anticipated denials
6. Tie every question to a specific document citation
7. Include foundation-laying sequences when introducing exhibits
8. Match the attorney's theory and theme

**Citation validation:**
After generation, run a validation pass that checks each `Citation` against the actual `DocumentPage` text to ensure the referenced content exists and matches the `documentExcerpt`.

### Step 8: Human Review & Editing

**What:** An interactive editor that allows attorneys to refine outlines through natural language commands and direct manipulation.

**Edit capabilities:**
- **Natural language edits** (sent to Claude with current outline + edit instruction):
  - "Make question 3 more aggressive"
  - "Add a chapter about the missed visits on page 45"
  - "Reorder — put the bias chapter first"
  - "Add impeachment for his deposition testimony on page 31"
  - "Remove chapter 4, it's not relevant anymore"
  - "Change this from cross to direct examination format"

- **Direct manipulation:**
  - Drag-and-drop to reorder chapters and questions
  - Click to edit question text inline
  - Add/remove questions within chapters
  - Assign/change citations by searching documents

- **Version history:**
  - Every edit creates an `OutlineVersion` record
  - Full undo/redo with descriptive change notes
  - Ability to compare versions side-by-side

### Step 9: Citation Accuracy System

**What:** A dedicated system to ensure every question in the outline is accurately tied to a real document and page.

**How it works:**
1. **During generation:** Claude is instructed to cite specific page numbers
2. **Post-generation validation:** For each citation, query the `DocumentPage` table to verify:
   - The referenced document exists
   - The page number is valid (within document page count)
   - The `documentExcerpt` appears in (or closely matches) the actual page text
3. **Flagging:** Citations that fail validation are flagged with a warning icon in the UI
4. **RAG-assisted correction:** If a citation is wrong, use pgvector similarity search to find the actual source page for the excerpt, and suggest a correction
5. **Attorney override:** Attorney can manually correct any citation

---

## Phase 3: Export & Presentation (Steps 10-11)

### Step 10: Landscape HTML Export

**What:** Generate a polished, printable HTML document with landscape orientation — questions on the left, source exhibits on the right — that walks the attorney through the examination step by step.

**Layout specification:**

```
┌─────────────────────────────────────────────────────────────────┐
│  CROSS-EXAMINATION OF DR. JANE SMITH          [Page 1 of 24]   │
│  Chapter 1: Credentials & Methodology    [CREDENTIALS badge]    │
├───────────────────────────────┬─────────────────────────────────┤
│                               │                                 │
│  GOAL: Establish evaluator    │  EXHIBIT 14 - Custody Report    │
│  did not follow standard      │  Page 7                         │
│  methodology                  │                                 │
│                               │  ┌─────────────────────────┐   │
│  Q1: Dr. Smith, you hold      │  │                         │   │
│  yourself out as an expert    │  │  [Full page image or     │   │
│  in custody evaluations,      │  │   extracted text of the  │   │
│  correct?                     │  │   cited exhibit page]    │   │
│                               │  │                         │   │
│  Expected: "Yes"              │  │                         │   │
│  Purpose: Lock in claimed     │  │                         │   │
│  expertise for later attack   │  │                         │   │
│                               │  │                         │   │
│  Q2: And the APA Guidelines   │  └─────────────────────────┘   │
│  for Child Custody Eval-      │                                 │
│  uations are the standard     │  Relevant excerpt:              │
│  in your field, correct?      │  "The evaluator conducted       │
│                               │   a single 45-minute session    │
│  Expected: "Yes"              │   with each parent..."          │
│  If denied → Impeach with     │                                 │
│  depo p.31, lines 4-8        │  [Highlight: methodology        │
│                               │   deficiency]                   │
│  [Citation: Exhibit 14, p.7]  │                                 │
├───────────────────────────────┴─────────────────────────────────┤
│  ◄ Prev                                              Next ►    │
└─────────────────────────────────────────────────────────────────┘
```

**Implementation:**
- CSS `@page { size: landscape }` with print-optimized styles
- CSS Grid: `grid-template-columns: 1fr 1fr` for side-by-side
- `break-after: page` for one chapter section per printed page
- Category-colored headers (badges match the 8 chapter categories)
- For the right panel: render the **actual exhibit page** — either as:
  - Embedded PDF page (using PDF.js canvas rendering)
  - Extracted text with formatting preserved
  - Image of the scanned page (if OCR was used)
- Include a cover page with case info, witness list, and table of contents
- Include page numbers in footer
- Force background colors to print with `print-color-adjust: exact`

### Step 11: Interactive Viewer Mode

**What:** An in-browser viewer that mirrors the exported HTML but adds interactivity for trial preparation and actual use at trial.

**Features:**
- **Keyboard navigation:** Arrow keys to move between questions, Chapter shortcuts
- **Split-pane view:** Questions left, exhibit right (resizable divider)
- **Exhibit rendering:** Actual PDF page rendered via PDF.js on the right panel, with the relevant text highlighted
- **Quick notes:** Attorney can add personal annotations per question
- **Presentation mode:** Full-screen, clean UI for use at counsel table during trial
- **Search:** Find questions by keyword, citation, or chapter
- **Progress tracking:** Mark questions as "asked" during trial

---

## Phase 4: Polish & Production (Steps 12-14)

### Step 12: Multi-Witness Outline Management

**What:** A case-level view that manages outlines for all witnesses, with an order-of-proof roadmap.

- Dashboard showing all witnesses and their outline status
- Suggested witness order based on case theory
- Cross-reference view: which documents are used across which outlines
- Master exhibit list with admission tracking
- Ability to generate outlines for multiple witnesses in batch

### Step 13: Error Handling, Validation & Edge Cases

**What:** Harden the system for real-world use.

- Input validation with Zod schemas on all API routes
- Graceful handling of:
  - Corrupted/password-protected PDFs
  - Scanned PDFs with no extractable text (flag for OCR)
  - Documents in unexpected formats
  - Empty or very short documents
  - Extremely long documents (> 500 pages per file)
- Rate limiting on API routes
- Cost estimation before outline generation (show estimated API cost)
- Error boundaries in React components
- Retry logic for failed AI calls with exponential backoff

### Step 14: Testing

**What:** Ensure reliability with a proper test suite.

- Unit tests for document parsers (deposition parser, text message parser, email parser)
- Integration tests for the processing pipeline
- E2E tests for the upload → process → generate → export flow
- Test with real-world document formats:
  - Deposition transcripts (various court reporter formats)
  - Family law custody evaluation reports
  - Text message exports (iPhone, Android)
  - Email chains
  - Expert witness reports
  - Court filings with multiple parties

---

## Implementation Order & Dependencies

```
Phase 1: Foundation (Steps 1-5)
  Step 1: Project Restructure ─────────────┐
  Step 2: Database & Auth ─────────────────┤
  Step 3: Upload & ZIP ───────────────────►├──► Step 5: Interview
  Step 4: Processing Pipeline ─────────────┘

Phase 2: AI Engine (Steps 6-9)
  Step 6: Fact Extraction ──────┐
  Step 7: Outline Generation ───┤──► Step 8: Editing ──► Step 9: Citations
                                │
Phase 3: Export (Steps 10-11)   │
  Step 10: HTML Export ─────────┤
  Step 11: Interactive Viewer ──┘

Phase 4: Polish (Steps 12-14)
  Step 12: Multi-Witness ──► Step 13: Hardening ──► Step 14: Testing
```

**Critical path:** Steps 1 → 2 → 3 → 4 → 6 → 7 → 10 (minimum viable product)

---

## Tech Stack Summary

| Component | Technology | Why |
|-----------|-----------|-----|
| Framework | Next.js 14 (App Router) | Full-stack React, API routes, server components |
| UI | React 18 + Tailwind CSS + Lucide | Already in prototype, excellent for rapid UI |
| Language | TypeScript (strict) | Type safety for complex data structures |
| Database | PostgreSQL + Prisma ORM | Relational data + pgvector for embeddings |
| Auth | NextAuth.js | Standard, supports multiple providers |
| File Storage | S3-compatible (Vercel Blob or AWS S3) | Scalable file storage |
| Job Queue | BullMQ + Redis | Background document processing |
| PDF Parsing | pdf-parse (server) + pdfjs-dist (viewer) | Server extraction + client rendering |
| DOCX Parsing | mammoth | Already a dependency |
| ZIP Extraction | node-stream-zip | Streaming, low memory |
| AI | Anthropic Claude (Opus 4.6 / Sonnet 4) | Best-in-class for legal reasoning |
| Embeddings | OpenAI text-embedding-3-small | Cost-effective, good quality |
| Vector Search | pgvector (PostgreSQL extension) | Keeps everything in one database |
| Validation | Zod | Runtime type validation for API inputs |
| Export | HTML + CSS @page + optional Puppeteer PDF | Landscape, print-optimized |
| Deployment | Vercel + managed PostgreSQL + Redis | Serverless, scalable |

---

## Key Design Decisions

1. **Chapter Method as the core framework** — This is the gold standard used by NITA and expert trial attorneys. The outline structure is built around chapters with goals, not just a flat list of questions.

2. **Server-side document processing** — Moving PDF parsing from client to server enables handling large files, ZIP archives, and background processing without blocking the UI.

3. **Background job queue** — Processing hundreds of documents takes time. BullMQ allows the user to upload and walk away while processing happens asynchronously.

4. **Per-page text storage with embeddings** — Storing text per page (not per document) enables precise citations and RAG retrieval at the page level, which is essential for legal work where page numbers matter.

5. **Speaker attribution as a first-class feature** — Legal documents are fundamentally about who said what. The `Speaker` and `Statement` models make this queryable and cross-referenceable.

6. **Tiered context strategy** — Small cases use direct context, medium cases use extended 1M context, large cases use map-reduce + RAG. This optimizes cost while handling any case size.

7. **Citation validation** — Every AI-generated citation is checked against actual document content. Wrong citations are flagged, not silently passed through.

8. **Version history for outlines** — Attorneys iterate heavily. Every edit is preserved and reversible.
