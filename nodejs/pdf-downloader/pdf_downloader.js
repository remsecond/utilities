/**
 * PDF Downloader
 * 
 * A Node.js script that processes URLs from a CSV file and:
 * - Downloads PDFs of web pages
 * - Handles cookie consent prompts automatically
 * - Creates a separate list of URLs requiring sign-in
 * - Provides detailed progress logging
 * 
 * Usage:
 * 1. Place your CSV file with URLs in a known location
 * 2. Update the CSV_PATH constant below to point to your file
 * 3. Run: node pdf_downloader.js
 * 
 * The script will create:
 * - A 'downloaded_pdfs' directory for the PDFs
 * - A '00_requires_signin.txt' file listing URLs that need manual handling
 */

const puppeteer = require('puppeteer');
const fs = require('fs');
const path = require('path');
const csv = require('csv-parser');

// Configuration
const CSV_PATH = 'C:\\Users\\robmo\\Downloads\\Detailed_Transfer_Pricing_References.csv';

// Helper function to wait
const wait = (page, ms) => page.evaluate(ms => new Promise(resolve => setTimeout(resolve, ms)), ms);

(async () => {
    try {
        // Create folders
        const downloadFolder = path.join(__dirname, 'downloaded_pdfs');
        if (!fs.existsSync(downloadFolder)) {
            fs.mkdirSync(downloadFolder);
            console.log(`Created download directory: ${downloadFolder}`);
        }

        // Create a file to track URLs requiring sign-in
        const signInListPath = path.join(downloadFolder, '00_requires_signin.txt');
        let signInUrls = [];

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
            fs.createReadStream(CSV_PATH)
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
                    signInUrls.push(url);
                    continue;
                }

                // Generate a PDF from the page
                const fileName = `${i + 1}_${url.replace(/[^a-zA-Z0-9]/g, '_').substring(0, 100)}.pdf`;
                const filePath = path.join(downloadFolder, fileName);
                
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
                // Continue with next URL despite error
            }

            // Write the sign-in URLs file periodically
            if (signInUrls.length > 0) {
                fs.writeFileSync(signInListPath, signInUrls.join('\n') + '\n');
            }
        }

        // Final save of the sign-in URLs list
        if (signInUrls.length > 0) {
            fs.writeFileSync(signInListPath, signInUrls.join('\n') + '\n');
            console.log(`\nSaved ${signInUrls.length} URLs requiring sign-in to: ${signInListPath}`);
        }

        // Cleanup
        await browser.close();
        console.log('\nProcess completed successfully!');
        console.log(`PDFs are saved in: ${downloadFolder}`);

    } catch (error) {
        console.error('\nFatal error occurred:');
        console.error(error);
        process.exit(1);
    }
})();
