# Utilities Collection

A collection of utility scripts and tools for various automation tasks.

## Structure

```
utilities/
├── nodejs/
│   └── pdf-downloader/    # Puppeteer script to download PDFs from URLs in CSV
├── python/               # Python utilities (future)
├── powershell/          # PowerShell utilities (future)
└── bash/                # Bash utilities (future)
```

## Available Utilities

### PDF Downloader (Node.js)

A script that processes URLs from a CSV file and:
- Downloads PDFs of web pages
- Handles cookie consent prompts automatically
- Creates a separate list of URLs requiring sign-in
- Provides detailed progress logging

#### Usage

1. Install dependencies:
```bash
cd nodejs/pdf-downloader
npm install
```

2. Run the script:
```bash
node pdf_downloader.js
```

The script will:
- Create a 'downloaded_pdfs' directory for the PDFs
- Save PDFs of accessible pages
- Create '00_requires_signin.txt' listing URLs that need manual handling
- Show progress for each URL being processed

#### Features

- Automatic cookie consent handling
- Sign-in detection
- Error handling and logging
- Progress tracking
- Rate limiting protection
