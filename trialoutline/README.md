# TrialOutline

AI-powered witness examination outline generator for trial attorneys.

## Features

- **PDF Parsing**: Extracts text from PDF files (730 reports, depositions, exhibits)
- **Document Upload**: Upload PDF, DOCX, TXT files
- **AI Extraction**: Automatically extracts parties, witnesses, key issues from documents
- **Outline Generation**: Creates strategic examination outlines with:
  - Questions linked to source citations (page numbers)
  - Expected answers from documents
  - Purpose/goal for each question
  - Follow-up questions
  - Color-coded categories (credentials, methodology, bias, favorable, damaging, closing)
- **Interactive Viewer**: Step-by-step landscape view with questions on left, source documents on right
- **Human Review Loop**: Edit panel lets you refine outlines via chat:
  - "Make question 3 more aggressive"
  - "Add a question about the missed visits"
  - "Remove question 5"
  - "Fix citation on Q2 - it's page 31"
- **Undo/Redo**: Navigate through outline versions
- **Export**: Download outlines as HTML or print

## Setup

### Prerequisites
- Node.js 18+ 
- Anthropic API key (get one at console.anthropic.com)

### Installation

```bash
# Clone or unzip the project
cd trialoutline

# Install dependencies
npm install

# Start development server
npm run dev
```

Open http://localhost:3000

### Configuration

1. Click the settings icon (gear) in the app
2. Enter your Anthropic API key
3. The key is stored in your browser's localStorage

## Usage

1. **Upload Files**: Drag and drop or click to upload your case documents
2. **Extract**: Type any message to trigger document analysis
3. **Generate**: Request an outline like:
   - "Cross-examination of Dr. Smith"
   - "Direct exam of my client"
   - "Impeachment outline for the opposing expert"
4. **View**: Click "View Outline" for the interactive step-by-step viewer
5. **Navigate**: Use arrow keys or buttons to move through questions
6. **Export**: Download as HTML or print directly

## Keyboard Shortcuts (Viewer)

- `→` or `Space` - Next question
- `←` - Previous question  
- `Escape` - Exit viewer

## Deployment

Deploy to Vercel:

```bash
npm install -g vercel
vercel
```

Or build for production:

```bash
npm run build
npm start
```

## Project Structure

```
trialoutline/
├── app/
│   ├── api/
│   │   ├── extract/route.ts    # Document extraction endpoint
│   │   └── generate/route.ts   # Outline generation endpoint
│   ├── globals.css             # Global styles
│   ├── layout.tsx              # Root layout
│   └── page.tsx                # Main application
├── package.json
├── tailwind.config.js
├── tsconfig.json
└── README.md
```

## License

Private - Law Office of Brett Ferguson
