# Personal Expense Tracker & Smart Budget Manager

# Complete Functional Specification

## 1. Overview

Build a production-ready expense tracker using: - Frontend:
HTML/CSS/Bootstrap/Vanilla JS - Backend: Google Apps Script - Database:
Google Sheets - Hosting: GitHub Pages

**Rule:** Google Sheets is the single source of truth. No business
values may be hardcoded.

## 2. Pages

### Login / Landing

Buttons: - Get Started → Opens Dashboard. - Settings → Opens Settings
page. - About → Opens About dialog.

### Dashboard

Cards: - Today's Budget - Carry Forward - Adjusted Budget - Today's
Spending - Remaining Budget - Tomorrow Budget - Weekly Spending -
Monthly Spending

Buttons: - Add Expense: Opens modal with expense form. - Reports: Opens
Reports page. - Categories: Opens Categories page. - Settings: Opens
Settings page. - Export: Export CSV/Excel/PDF. - Refresh: Reload
dashboard from API. - Search: Search expenses. - Filter: Filter by
date/category.

Progress Bar: - Green: \>50% budget left. - Orange: \<= warning
threshold. - Red: Budget exceeded.

### Add/Edit Expense

Fields: - Expense Name (required) - Amount (required, positive) -
Category (loaded from DB) - Date (default today) - Time (default
current) - Notes (optional)

Buttons: - Save: Calls POST/PUT API. - Reset: Clears form. - Cancel:
Close modal.

On Save: - Refresh dashboard. - Refresh expense table. - Recalculate
carry forward. - Toast success.

### Expense Table

Columns: - Date - Time - Name - Category - Amount - Notes - Actions

Actions: - Edit - Delete - Duplicate

Bulk Actions: - Delete Selected - Export Selected

### Reports

Tabs: - Today - Yesterday - Weekly - Monthly - Yearly - Custom -
Category

Each report contains: - Summary cards - Transaction table - Charts -
Export buttons - Print button

### Category Management

List all categories from DB.

Buttons: - Add Category - Edit Category - Disable Category - Enable
Category - Reorder Category

No hardcoded categories.

### Settings

All values loaded from Settings sheet.

Editable: - Weekday Budget - Weekend Budget - Holiday Budget -
Currency - Warning Threshold - Theme - Date Format - Time Format - Carry
Forward Enabled - Feature Flags

Buttons: - Save Settings - Reset Defaults - Reload Settings

Saving updates Google Sheets.

## 3. Budget Engine

-   Read settings from DB.
-   Compute today's adjusted budget.
-   Add remaining or subtract overspending.
-   Editing any historical expense triggers recalculation from that date
    onward.
-   Store recalculated values in BudgetHistory.

## 4. APIs

Describe each endpoint with JSON request/response, validation, and
errors. Every endpoint returns: - success - message - data - timestamp

## 5. GitHub Actions

ci.yml: - Runs on push/pull_request. - Lint JS. - Validate HTML. - Check
CSS. - Verify folder structure.

deploy.yml: - Trigger on push to main. - Deploy GitHub Pages
automatically.

## 6. CORS

Use deployed Apps Script Web App URL from config only. Centralized
api.js, retry logic, friendly errors.

## 7. Future Features

Income, recurring expenses, multiple users, admin panel, notifications,
AI insights.

## 8. Acceptance Criteria

Application must work after only configuring: - Sheet ID - Apps Script
URL No code changes required.
