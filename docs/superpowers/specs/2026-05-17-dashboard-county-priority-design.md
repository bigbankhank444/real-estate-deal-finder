# Dashboard: County Priority + Metadata Display

**Date:** 2026-05-17  
**File:** `dashboard.js` (single-file change, no new files)  
**Scope:** Data ordering, address fallback, new column, search expansion, county visual accent, filter controls, metadata line, JS sort tiebreak

---

## Problem

1. Rows with `address = null` (probate, some tax delinquent) show blank — no fallback.
2. County records (`tax_delinquent`, `pre_foreclosure`, `probate`) are buried under Craigslist results.
3. `estimated_value` column missing.
4. Search only matches address and signal_type.
5. No visual distinction between county records and market listings.

---

## Raw Field Inventory

| Signal | Raw fields |
|---|---|
| `tax_delinquent` | `parcel_number`, `delinquent_amount`, `years_delinquent` |
| `pre_foreclosure` | `case_number`, `filing_date`, `plaintiff` |
| `probate` | `case_number`, `filing_date`, `fiduciary_name` |
| `fsbo_craigslist` | `post_title` |
| `fsbo_zillow` | _(none currently)_ |

`address_resolution_status` is not written by any scraper; the "if present" guard will silently cover it when/if added later.

---

## Changes

### SQL Query
```sql
ORDER BY
  CASE WHEN signal_type IN ('tax_delinquent','pre_foreclosure','probate') THEN 0 ELSE 1 END ASC,
  score DESC NULLS LAST,
  updated_at DESC
LIMIT 500
```

### Address Column
- If `address` is non-null → show address (with source_url link if present)
- Else if `owner_name` is non-null → show owner_name (with source_url link if present)
- Else → show `"No address"` in muted gray (`color:#6b7280; font-style:italic`)

### New Column: Est. Value
- Positioned between ARV and Rationale
- Renders `estimated_value` as `$X,XXX` or `—`

### Search Filter Expansion
Haystack includes: `address`, `signal_type`, `owner_name`, `contact_info`, `raw.post_title`

### County Visual Accent
- County rows (`tax_delinquent`, `pre_foreclosure`, `probate`): amber left border `3px solid #d97706` + subtle bg `rgba(217,119,6,0.06)`
- Signal badges: `.badge.county` (amber `#d97706` bg) vs `.badge.market` (slate `#475569` bg)

### Filter Controls
- Add **"County only"** checkbox — when checked, hides market rows
- Signal `<select>` uses `<optgroup>`: **County Records** (`tax_delinquent`, `pre_foreclosure`, `probate`) / **Market** (remaining signals)

### Stats Bar
- Add **County** count tile (count of rows where signal_type is county)

### Metadata Secondary Line
Shown under the address/name, small muted tags — only fields that are present:

| Field | Label |
|---|---|
| `raw.delinquent_amount` | Delinquent |
| `raw.years_delinquent` | Yrs delinquent |
| `raw.parcel_number` | Parcel |
| `raw.case_number` | Case |
| `raw.filing_date` | Filed |
| `raw.plaintiff` | Plaintiff |
| `raw.fiduciary_name` | Fiduciary |
| `contact_info` (top-level) | Contact |

### JS Sort Tiebreak
When `sortKey === 'score'` and scores are equal, county signals sort before market.

---

## Constraints
- Server logic, port config, SSL handling: unchanged
- No new dependencies
- No new files
