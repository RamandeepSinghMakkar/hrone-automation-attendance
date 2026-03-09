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
            console.log('Checking for popups (waiting 5s for animations)...');
            await page.waitForTimeout(5000);

            // 1. Try hitting Escape key multiple times
            for (let i = 0; i < 3; i++) {
                await page.keyboard.press('Escape');
                await page.waitForTimeout(1000);
            }

            // 2. Handle various close buttons (X) and overlay elements
            const closeSelectors = [
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
                '.pi-times',
                '.p-dialog-header-icons .p-link',
                '.p-dialog-header-close'
            ];

            let attempts = 0;
            while (attempts < 10) {
                let foundAny = false;
                for (const selector of closeSelectors) {
                    try {
                        const btn = page.locator(selector).filter({ visible: true }).first();
                        if (await btn.isVisible()) {
                            console.log(`Closing popup with selector: ${selector}`);
                            await btn.click({ force: true });
                            await page.waitForTimeout(2000);
                            foundAny = true;
                        }
                    } catch (e) { }
                }

                // Specific text-based search for 'X' or 'Close'
                const textClose = page.locator('button:has-text("X"), [aria-label*="close" i]').filter({ visible: true }).first();
                if (await textClose.isVisible()) {
                    console.log('Closing popup via text/aria-label...');
                    await textClose.click({ force: true });
                    await page.waitForTimeout(2000);
                    foundAny = true;
                }

                if (!foundAny) break;
                attempts++;
            }

            // 3. Handle Cookie Consent
            const cookieAccept = page.locator('button:has-text("Accept"), #hs-eu-confirmation-button').filter({ visible: true }).first();
            if (await cookieAccept.isVisible()) {
                console.log('Accepting cookies...');
                await cookieAccept.click({ force: true });
            }

            console.log('Finished checking for popups.');
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
                // Removed force: true to ensure we aren't clicking through modals
                await markBtn.click();

                // 7. Handle Confirmation Modal (if it appears)
                console.log('Checking for confirmation modal...');
                const confirmBtn = page.locator('.p-dialog-footer button:has-text("Mark attendance"), .modal-footer button:has-text("Mark attendance"), .p-dialog-content button:has-text("Mark attendance")').first();

                try {
                    await confirmBtn.waitFor({ state: 'visible', timeout: 5000 });
                    if (await confirmBtn.isVisible()) {
                        console.log('Clicking confirmation "Mark attendance" button...');
                        await confirmBtn.click();
                        await page.waitForTimeout(3000);
                    }
                } catch (e) {
                    console.log('No confirmation modal appeared or it was handled.');
                }

                // 8. Final Verification: Check for "Last punch" time
                console.log('Verifying attendance status via timestamp...');
                await page.waitForTimeout(5000); // Wait for API sync

                const lastPunchLocator = page.locator('text=/Last punch/i');
                const lastPunchText = await lastPunchLocator.innerText().catch(() => '');
                console.log(`Current Status: ${lastPunchText}`);

                const today = new Date();
                const todayStr = today.toLocaleString('default', { month: 'short' }) + ' ' + today.getDate(); // e.g., "Mar 9"

                if (lastPunchText.includes(todayStr)) {
                    console.log(`Success: Attendance for ${todayStr} is confirmed via "Last punch" timestamp.`);
                    await page.screenshot({ path: 'attendance_marked.png' });
                } else {
                    console.error(`Verification Failed: "Last punch" does not show today's date (${todayStr}).`);
                    await page.screenshot({ path: 'verification_failed.png' });
                    throw new Error('Attendance marking verification failed - timestamp not updated');
                }
            }
        }
        else {
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
