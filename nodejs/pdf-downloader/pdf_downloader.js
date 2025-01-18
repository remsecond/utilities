/**
 * PDF Downloader
 * 
 * A Node.js script that processes URLs from a CSV file and:
 * - Downloads PDFs of web pages
 * - Handles cookie consent prompts automatically
 * - Creates an Excel file listing URLs requiring sign-in
 * - Provides detailed progress logging
 */

const puppeteer = require('puppeteer');
const fs = require('fs');
const path = require('path');
const csv = require('csv-parser');
const XLSX = require('xlsx');
const readline = require('readline');

// Helper function to wait
const wait = (page, ms) => page.evaluate(ms => new Promise(resolve => setTimeout(resolve, ms)), ms);

// Helper function to prompt for input
const prompt = async (question) => {
    const rl = readline.createInterface({
        input: process.stdin,
        output: process.stdout
    });

    return new Promise((resolve) => {
        rl.question(question, (answer) => {
            rl.close();
            resolve(answer);
        });
    });
};

(async () => {
    try {
        // Get CSV file location
        const csvPath = await prompt('Enter the path to your CSV file (or drag and drop the file here): ');
        const cleanCsvPath = csvPath.trim().replace(/["']/g, '');

        if (!fs.existsSync(cleanCsvPath)) {
            throw new Error(`CSV file not found at: ${cleanCsvPath}`);
        }

        // Get output directory
        const defaultOutputDir = path.join(process.cwd(), 'downloaded_pdfs');
        const outputPrompt = await prompt(`Enter the output directory path (press Enter for default: ${defaultOutputDir}): `);
        const outputDir = outputPrompt.trim() || defaultOutputDir;

        // Create output directory if it doesn't exist
        if (!fs.existsSync(outputDir)) {
            fs.mkdirSync(outputDir, { recursive: true });
            console.log(`Created output directory: ${outputDir}`);
        }

        // Create Excel workbook for sign-in URLs
        const signInWorkbook = XLSX.utils.book_new();
        const signInData = [];

        // Common cookie accept button selectors
        const cookieSelectors = [
            // Text-based selectors
            'button, a, span, div',  // Generic elements that might contain these texts
            // ID-based selectors
            '#onetrust-accept-btn-handler',
            '#accept-cookies',
            '#cookie-accept',
            '#cookie-consent-accept',
            '#accept-all-cookies',
            '#CybotCookiebotDialogBodyLevelButtonLevelOptinAllowAll',
            '#gdpr-cookie-accept',
            // Class-based selectors
            '.accept-cookies',
            '.cookie-accept',
            '.cookie-consent-accept',
            '.accept-all-cookies',
            '.cookie-button--accept',
            // Attribute-based selectors
            '[aria-label="Accept cookies"]',
            '[aria-label="accept cookies"]',
            '[data-testid="cookie-accept"]',
            // Common button texts
            'button:has-text("Accept")',
            'button:has-text("Accept All")',
            'button:has-text("Accept Cookies")',
            'button:has-text("Allow All")',
            'button:has-text("Allow Cookies")',
            'button:has-text("Got it")',
            'button:has-text("I Accept")',
            'button:has-text("OK")',
            'button:has-text("Close")'
        ];

        // Launch Puppeteer
        console.log('Launching browser...');
        const browser = await puppeteer.launch({
            headless: 'new',
            args: ['--no-sandbox']
        });
        const page = await browser.newPage();

        // Set a larger viewport and timeout
        await page.setViewport({ width: 1920, height: 1080 });
        page.setDefaultNavigationTimeout(45000);

        // Handle common modal dialogs automatically
        page.on('dialog', async dialog => {
            await dialog.accept();
        });

        // Read and process the CSV file
        console.log('Reading CSV file...');
        const urls = [];
        await new Promise((resolve, reject) => {
            fs.createReadStream(cleanCsvPath)
                .on('error', (error) => {
                    reject(new Error(`Error reading CSV file: ${error.message}`));
                })
                .pipe(csv())
                .on('data', (row) => {
                    if (row.URL) {
                        urls.push(row.URL);
                    }
                })
                .on('end', () => {
                    console.log(`Found ${urls.length} URLs in CSV file`);
                    resolve();
                });
        });

        // Process each URL
        console.log('\nStarting PDF generation...');
        for (let i = 0; i < urls.length; i++) {
            const url = urls[i];
            try {
                console.log(`\n[${i + 1}/${urls.length}] Processing: ${url}`);

                // Navigate to the URL with a timeout
                await page.goto(url, { 
                    waitUntil: 'networkidle2',
                    timeout: 45000
                });

                // Wait for a moment to let any modals/overlays appear
                await wait(page, 2000);

                // Try to handle cookie consent
                for (const selector of cookieSelectors) {
                    try {
                        // First try exact selector match
                        let button = await page.$(selector);
                        
                        // If not found and it's a generic selector, try finding by text content
                        if (!button && ['button, a, span, div'].includes(selector)) {
                            button = await page.evaluateHandle(texts => {
                                const elements = document.querySelectorAll('button, a, span, div');
                                return Array.from(elements).find(el => {
                                    const text = el.textContent.toLowerCase();
                                    return ['accept', 'accept all', 'accept cookies', 'allow all', 'allow cookies', 'got it', 'i accept', 'ok', 'close']
                                        .some(t => text.includes(t));
                                });
                            });
                        }

                        if (button) {
                            await button.click();
                            console.log('  Accepted cookies');
                            await wait(page, 1000);
                            break;
                        }
                    } catch (e) {
                        // Selector not found or click failed, try next one
                    }
                }

                // Check for common sign-in indicators
                const signInIndicators = [
                    'sign in',
                    'login',
                    'log in',
                    'subscribe',
                    'subscription',
                    'register',
                    'account required',
                    'please log in',
                    'member access',
                    'sign up',
                    'create account',
                    'premium content'
                ];

                const pageContent = await page.content();
                const pageText = await page.evaluate(() => document.body.innerText.toLowerCase());
                
                const requiresSignIn = signInIndicators.some(indicator => 
                    pageText.includes(indicator.toLowerCase()) &&
                    pageContent.includes('form')  // Basic check for login form
                );

                if (requiresSignIn) {
                    console.log('  ⚠ Page requires sign-in');
                    signInData.push({
                        URL: url,
                        Status: 'Requires Sign-in',
                        Notes: ''  // Empty column for user notes
                    });
                    continue;
                }

                // Generate a PDF from the page
                const fileName = `${i + 1}_${url.replace(/[^a-zA-Z0-9]/g, '_').substring(0, 100)}.pdf`;
                const filePath = path.join(outputDir, fileName);
                
                await page.pdf({
                    path: filePath,
                    format: 'A4',
                    printBackground: true,
                    margin: {
                        top: '20px',
                        right: '20px',
                        bottom: '20px',
                        left: '20px'
                    }
                });

                console.log(`  ✓ PDF saved: ${fileName}`);
                
                // Add a small delay between requests to avoid rate limiting
                await wait(page, 1000);

            } catch (error) {
                console.error(`  ✗ Failed to process URL: ${url}`);
                console.error(`    Error: ${error.message}`);
                signInData.push({
                    URL: url,
                    Status: 'Error',
                    Notes: error.message  // Add error message in notes
                });
            }
        }

        // Save the sign-in URLs to Excel file
        if (signInData.length > 0) {
            const worksheet = XLSX.utils.json_to_sheet(signInData);
            
            // Set column widths
            const colWidths = [
                { wch: 100 },  // URL column
                { wch: 20 },   // Status column
                { wch: 50 }    // Notes column
            ];
            worksheet['!cols'] = colWidths;

            // Add hyperlinks to URLs
            signInData.forEach((row, idx) => {
                worksheet[XLSX.utils.encode_cell({ r: idx + 1, c: 0 })] = {
                    t: 's',
                    v: row.URL,
                    l: { Target: row.URL }
                };
            });

            XLSX.utils.book_append_sheet(signInWorkbook, worksheet, 'URLs Requiring Sign-in');
            
            const excelPath = path.join(outputDir, '00_requires_signin.xlsx');
            XLSX.writeFile(signInWorkbook, excelPath);
            console.log(`\nSaved ${signInData.length} URLs requiring sign-in to: ${excelPath}`);
        }

        // Cleanup
        await browser.close();
        console.log('\nProcess completed successfully!');
        console.log(`PDFs are saved in: ${outputDir}`);

    } catch (error) {
        console.error('\nFatal error occurred:');
        console.error(error);
        process.exit(1);
    }
})();
