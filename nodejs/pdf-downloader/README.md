# PDF Downloader

A Node.js script that automatically downloads PDFs from URLs listed in a CSV file. It handles cookie consent prompts and identifies pages requiring sign-in.

## Features

- Automatically downloads PDFs from web pages
- Handles cookie consent prompts
- Identifies and lists pages requiring sign-in
- Shows detailed progress with logging
- Rate limiting protection
- Error handling and recovery

## Prerequisites

- Node.js (v14 or higher)
- npm

## Installation

1. Clone the repository
2. Navigate to the pdf-downloader directory:
```bash
cd nodejs/pdf-downloader
```
3. Install dependencies:
```bash
npm install
```

## Usage

1. Update the `CSV_PATH` constant in `pdf_downloader.js` to point to your CSV file
2. Run the script:
```bash
npm start
```

The script will:
- Create a 'downloaded_pdfs' directory for the PDFs
- Save PDFs of accessible pages
- Create '00_requires_signin.txt' listing URLs that need manual handling
- Show progress for each URL being processed

## CSV Format

The CSV file should have a column named "URL" containing the web page URLs to process.

Example:
```csv
URL
https://example.com/page1
https://example.com/page2
```

## Output

- PDFs are saved in the `downloaded_pdfs` directory
- URLs requiring sign-in are saved to `downloaded_pdfs/00_requires_signin.txt`
- Progress and errors are logged to the console
