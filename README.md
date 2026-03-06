# HROne Automation Attendance

Automated attendance marking for HROne platform using Playwright.

## Features
- Automated Login (Employee Code flow)
- Handle "Mood Survey" and other PrimeNG popups
- Handle Confirmation Modals
- Scheduled execution support via Cron

## Setup
1. Clone the repository.
2. Run `npm install`.
3. Create a `.env` file with:
   ```env
   COMPANY_CODE=your_company_code
   EMPLOYEE_CODE=your_employee_code
   PASSWORD=your_password
   ```
4. Run `node index.js` to mark attendance.
5. Use `node index.js --dry-run` to test without clicking.
6. Use `node index.js --headless` to run in background.
