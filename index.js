const { chromium } = require('playwright');
require('dotenv').config();

const COMPANY_CODE = process.env.COMPANY_CODE;
const EMPLOYEE_CODE = process.env.EMPLOYEE_CODE;
const PASSWORD = process.env.PASSWORD;

(async () => {
    // Determine if we should run in headless mode
    const isHeadless = process.argv.includes('--headless');
    const isDryRun = process.argv.includes('--dry-run');

    console.log(`Starting HROne Attendance Automation... ${isDryRun ? '[DRY RUN]' : ''}`);

    const browser = await chromium.launch({ headless: isHeadless });
    const context = await browser.newContext();
    const page = await context.newPage();

    try {
        // 1. Navigate to Login Page
        console.log('Navigating to login page...');
        await page.goto('https://app.hrone.cloud/login', { waitUntil: 'networkidle' });

        // 2. Click "Login by Employee code"
        console.log('Selecting "Login by Employee code"...');
        const loginByEmpCode = page.getByText('Login by Employee code');
        await loginByEmpCode.waitFor({ state: 'visible' });
        await loginByEmpCode.click();

        // 3. Enter Company Code and Employee Code
        console.log('Entering company and employee codes...');
        await page.locator('#hrone-userdomain').fill(COMPANY_CODE);
        await page.locator('#hrone-username').fill(EMPLOYEE_CODE);
        await page.getByRole('button', { name: 'NEXT' }).click();

        // 4. Enter Password
        console.log('Entering password...');
        await page.locator('#hrone-password').waitFor({ state: 'visible' });
        await page.locator('#hrone-password').fill(PASSWORD);
        await page.getByRole('button', { name: 'LOG IN' }).click();

        // 5. Post-Login: Wait for dashboard and handle modals
        console.log('Waiting for dashboard...');
        await page.waitForURL(/.*app.*/, { timeout: 30000 });

        // Brief wait for modals to appear
        await page.waitForTimeout(3000);

        // Function to close modals
        const handleModals = async () => {
            console.log('Checking for popups...');

            // 1. Try hitting Escape key (often works for HROne modals)
            await page.keyboard.press('Escape');
            await page.waitForTimeout(1000);

            // 2. Handle various close buttons (X) and overlay elements
            const closeButtons = [
                '.p-dialog-header-close',
                '.p-dialog-header-close-icon',
                '.p-toast-close-icon',
                'button.close',
                '.modal-header .close',
                '[aria-label="Close"]',
                '.mood-survey-modal .close',
                'i.fa-times',
                '.close-btn',
                '.modal-content .close',
                '.p-sidebar-close',
                '.pi-times' // Common PrimeNG icon class
            ];

            let foundAny = true;
            let attempts = 0;
            while (foundAny && attempts < 5) {
                foundAny = false;
                for (const selector of closeButtons) {
                    try {
                        const btn = page.locator(selector).first();
                        if (await btn.isVisible()) {
                            console.log(`Closing potential popup/notification with selector: ${selector}`);
                            await btn.click({ force: true });
                            await page.waitForTimeout(1000);
                            foundAny = true;
                        }
                    } catch (e) {
                        // Ignore
                    }
                }
                attempts++;
            }

            // 3. Handle Cookie Consent
            const cookieAccept = page.locator('button:has-text("Accept"), #hs-eu-confirmation-button').first();
            if (await cookieAccept.isVisible()) {
                console.log('Accepting cookies...');
                await cookieAccept.click({ force: true });
            }
        };

        await handleModals();

        // 6. Find and Click "Mark attendance"
        console.log('Looking for "Mark attendance" button...');
        const markBtn = page.locator('button:has-text("Mark attendance")').first();

        await markBtn.waitFor({ state: 'visible', timeout: 10000 });

        if (await markBtn.isVisible()) {
            if (isDryRun) {
                console.log('DRY RUN: Found "Mark attendance" button. Skipping click.');
            } else {
                console.log('Clicking primary "Mark attendance" button...');
                await markBtn.click({ force: true });

                // 7. Handle Confirmation Modal (if it appears)
                console.log('Checking for confirmation modal...');
                const confirmBtn = page.locator('.p-dialog-footer button:has-text("Mark attendance"), .modal-footer button:has-text("Mark attendance"), .p-dialog-content button:has-text("Mark attendance")').first();

                try {
                    await confirmBtn.waitFor({ state: 'visible', timeout: 5000 });
                    if (await confirmBtn.isVisible()) {
                        console.log('Clicking confirmation "Mark attendance" button...');
                        await confirmBtn.click({ force: true });
                        await page.waitForTimeout(2000);
                    }
                } catch (e) {
                    console.log('No confirmation modal appeared or it was handled.');
                }

                console.log('Attendance marked successfully! Capturing screenshot...');
                await page.screenshot({ path: 'attendance_marked.png' });
            }
        } else {
            console.warn('Could not find "Mark attendance" button. Already marked?');
            await page.screenshot({ path: 'attendance_not_found.png' });
        }

    } catch (error) {
        console.error('An error occurred:', error.message);
        await page.screenshot({ path: 'error_screenshot.png' });
    } finally {
        if (!isHeadless) {
            console.log('Keeping browser open for a few seconds...');
            await page.waitForTimeout(5000);
        }
        await browser.close();
        console.log('Automation finished.');
    }
})();
