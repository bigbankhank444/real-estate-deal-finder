# Dashboard County Priority Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Update dashboard.js so county records sort first, address falls back to owner_name, Est. Value column appears, county rows get visual accent, metadata tags show under each address, and all filter/sort logic is updated consistently in both server-side and client-side rendering paths.

**Architecture:** dashboard.js has two rendering paths that must stay in sync — server-side (initial page load via `html()`) and client-side (re-render on sort/filter via `render()` in embedded `<script>`). Changes touch both. No new files, no new dependencies.

**Tech Stack:** Node.js built-in `http`, `pg` (existing), embedded vanilla JS + CSS

---

### Task 1: Add COUNTY_SIGNALS constant

**Files:**
- Modify: `dashboard.js` (after `pool` declaration, ~line 12)

- [ ] **Add the constant after the pool block:**

```js
const COUNTY_SIGNALS = new Set(['tax_delinquent', 'pre_foreclosure', 'probate']);
```

- [ ] **Verify file saves without syntax error** — run `node -c dashboard.js`; expect `OK`

---

### Task 2: Add server-side helper functions

**Files:**
- Modify: `dashboard.js` (between `scoreColor()` and `html()`)

- [ ] **Insert three helper functions after `scoreColor()`:**

```js
function isCounty(signal_type) {
  return COUNTY_SIGNALS.has(signal_type);
}

function displayAddr(d) {
  const text = d.address || d.owner_name;
  if (!text) return '<span style="color:#6b7280;font-style:italic">No address</span>';
  const escaped = text.replace(/</g, '&lt;').replace(/>/g, '&gt;');
  return d.source_url
    ? `<a href="${d.source_url}" target="_blank" rel="noopener">${escaped}</a>`
    : escaped;
}

function metaLine(d) {
  const r = d.raw || {};
  const esc = s => String(s).replace(/</g, '&lt;').replace(/>/g, '&gt;');
  const parts = [];
  if (r.delinquent_amount != null) parts.push(`<span class="meta-tag">Delinquent: $${Number(r.delinquent_amount).toLocaleString()}</span>`);
  if (r.years_delinquent != null) parts.push(`<span class="meta-tag">Yrs: ${esc(r.years_delinquent)}</span>`);
  if (r.parcel_number) parts.push(`<span class="meta-tag">Parcel: ${esc(r.parcel_number)}</span>`);
  if (r.case_number) parts.push(`<span class="meta-tag">Case: ${esc(r.case_number)}</span>`);
  if (r.filing_date) parts.push(`<span class="meta-tag">Filed: ${esc(r.filing_date)}</span>`);
  if (r.plaintiff) parts.push(`<span class="meta-tag">Plaintiff: ${esc(r.plaintiff)}</span>`);
  if (r.fiduciary_name) parts.push(`<span class="meta-tag">Fiduciary: ${esc(r.fiduciary_name)}</span>`);
  if (r.address_resolution_status && r.address_resolution_status !== 'resolved') {
    parts.push(`<span class="meta-tag">Addr: ${esc(r.address_resolution_status)}</span>`);
  }
  if (d.contact_info) parts.push(`<span class="meta-tag">Contact: ${esc(d.contact_info)}</span>`);
  return parts.length ? `<div class="meta-line">${parts.join('')}</div>` : '';
}
```

- [ ] **Verify:** `node -c dashboard.js` → `OK`

---

### Task 3: Update stats calculations in html()

**Files:**
- Modify: `dashboard.js` inside `html(deals)`, the stats block at top of function

- [ ] **Replace the existing stats block (the three `const` lines for total/scored/highScore) with:**

```js
const total = deals.length;
const scored = deals.filter(d => d.score !== null).length;
const highScore = deals.filter(d => d.score >= 60).length;
const countyCount = deals.filter(d => COUNTY_SIGNALS.has(d.signal_type)).length;

const countySignalsList = ['tax_delinquent', 'pre_foreclosure', 'probate'];
const marketSignalsList = [...new Set(deals.map(d => d.signal_type).filter(Boolean))].sort().filter(s => !COUNTY_SIGNALS.has(s));
const countyPresent = countySignalsList.filter(s => deals.some(d => d.signal_type === s));
```

- [ ] **In the stats bar HTML, replace the three stat tiles with four:**

```html
<div class="stat"><div class="stat-num">${total}</div><div class="stat-label">Total</div></div>
<div class="stat"><div class="stat-num">${countyCount}</div><div class="stat-label">County</div></div>
<div class="stat"><div class="stat-num">${scored}</div><div class="stat-label">Scored</div></div>
<div class="stat"><div class="stat-num">${highScore}</div><div class="stat-label">Score 60+</div></div>
```

- [ ] **Verify:** `node -c dashboard.js` → `OK`

---

### Task 4: Add CSS for county rows, badge variants, meta tags

**Files:**
- Modify: `dashboard.js` — the `<style>` block inside `html()`

- [ ] **Replace the existing `.badge` rule and add new rules. Find this block:**

```css
  .badge{display:inline-block;color:#fff;font-weight:700;font-size:0.85rem;border-radius:6px;padding:2px 8px;min-width:36px;text-align:center}
  .addr a{color:#38bdf8;text-decoration:none;word-break:break-all}
  .addr a:hover{text-decoration:underline}
  .rationale{color:#94a3b8;font-size:0.78rem;max-width:300px}
```

**Replace with:**

```css
  .county-row td{background:rgba(217,119,6,0.06)}
  .county-row td:first-child{border-left:3px solid #d97706}
  tr.county-row:hover td{background:rgba(217,119,6,0.12)}
  .badge{display:inline-block;color:#fff;font-weight:700;font-size:0.85rem;border-radius:6px;padding:2px 8px;min-width:36px;text-align:center}
  .badge.county{background:#d97706}
  .badge.market{background:#475569}
  .addr a{color:#38bdf8;text-decoration:none;word-break:break-all}
  .addr a:hover{text-decoration:underline}
  .meta-line{margin-top:4px;display:flex;flex-wrap:wrap;gap:4px}
  .meta-tag{font-size:0.7rem;color:#94a3b8;background:#1e293b;border:1px solid #334155;border-radius:4px;padding:1px 6px}
  .rationale{color:#94a3b8;font-size:0.78rem;max-width:300px}
```

- [ ] **Also update the input/label CSS — find:**

```css
  input,select{background:#0f172a;border:1px solid #475569;color:#e2e8f0;border-radius:6px;padding:7px 12px;font-size:0.85rem;outline:none}
  input:focus,select:focus{border-color:#38bdf8}
  input{flex:1;min-width:180px}
```

**Replace with:**

```css
  input[type=search],select{background:#0f172a;border:1px solid #475569;color:#e2e8f0;border-radius:6px;padding:7px 12px;font-size:0.85rem;outline:none}
  input[type=search]:focus,select:focus{border-color:#38bdf8}
  input[type=search]{flex:1;min-width:180px}
  .county-label{display:flex;align-items:center;gap:6px;color:#94a3b8;font-size:0.85rem;cursor:pointer;white-space:nowrap}
  .county-label input[type=checkbox]{width:14px;height:14px;cursor:pointer;accent-color:#d97706}
```

- [ ] **Verify:** `node -c dashboard.js` → `OK`

---

### Task 5: Update controls — optgroup dropdown + county-only checkbox

**Files:**
- Modify: `dashboard.js` — controls `<div>` inside `html()`

- [ ] **Replace the entire controls div with:**

```html
<div class="controls">
  <input type="search" id="filter" placeholder="Filter by address, owner, contact..." oninput="applyFilter()">
  <select id="minScore" onchange="applyFilter()">
    <option value="0">All scores</option>
    <option value="40">Score 40+</option>
    <option value="50">Score 50+</option>
    <option value="60">Score 60+</option>
  </select>
  <select id="signalFilter" onchange="applyFilter()">
    <option value="">All signals</option>
    <optgroup label="County Records">
      ${countyPresent.map(s => `<option value="${s}">${s.replace(/_/g, ' ')}</option>`).join('')}
    </optgroup>
    <optgroup label="Market">
      ${marketSignalsList.map(s => `<option value="${s}">${s.replace(/_/g, ' ')}</option>`).join('')}
    </optgroup>
  </select>
  <label class="county-label">
    <input type="checkbox" id="countyOnly" onchange="applyFilter()"> County only
  </label>
</div>
```

- [ ] **Verify:** `node -c dashboard.js` → `OK`

---

### Task 6: Update table headers, server-side rows, and empty colspan

**Files:**
- Modify: `dashboard.js` — `<thead>`, the `rows` map, and the empty-state fallback

- [ ] **Replace `<thead>` block with (adds Est. Value, 8 columns total):**

```html
<thead>
  <tr>
    <th onclick="sortBy('score')" class="sorted">Score ▼</th>
    <th onclick="sortBy('address')">Address</th>
    <th onclick="sortBy('signal_type')">Signal</th>
    <th onclick="sortBy('asking_price')">Ask Price</th>
    <th onclick="sortBy('estimated_value')">Est. Value</th>
    <th onclick="sortBy('arv')">ARV</th>
    <th>Rationale</th>
    <th onclick="sortBy('updated_at')">Updated</th>
  </tr>
</thead>
```

- [ ] **Replace the `rows` map at the top of `html()` with:**

```js
const rows = deals.map(d => {
  const sc = d.score ?? '—';
  const color = scoreColor(d.score);
  const badgeClass = isCounty(d.signal_type) ? 'county' : 'market';
  const rowClass = isCounty(d.signal_type) ? ' class="county-row"' : '';
  const price = d.asking_price ? `$${Number(d.asking_price).toLocaleString()}` : '—';
  const estVal = d.estimated_value ? `$${Number(d.estimated_value).toLocaleString()}` : '—';
  const arv = d.arv ? `$${Number(d.arv).toLocaleString()}` : '—';
  const signal = (d.signal_type || '').replace(/_/g, ' ');
  const rationale = (d.raw && d.raw.rationale) ? d.raw.rationale.replace(/</g, '&lt;').replace(/>/g, '&gt;') : '';
  const updated = d.updated_at ? new Date(d.updated_at).toLocaleDateString() : '—';
  return `
    <tr${rowClass}>
      <td><span class="badge ${badgeClass}" style="background:${color}">${sc}</span></td>
      <td class="addr">${displayAddr(d)}${metaLine(d)}</td>
      <td>${signal}</td>
      <td>${price}</td>
      <td>${estVal}</td>
      <td>${arv}</td>
      <td class="rationale">${rationale}</td>
      <td>${updated}</td>
    </tr>`;
}).join('');
```

- [ ] **Update both empty-state fallbacks from `colspan="7"` to `colspan="8"`:**

Find: `colspan="7"` (appears twice — one in the initial `${rows || ...}` and one in client-side JS)
Replace both with: `colspan="8"`

- [ ] **Verify:** `node -c dashboard.js` → `OK`

---

### Task 7: Rewrite the client-side `<script>` block

**Files:**
- Modify: `dashboard.js` — the entire `<script>...</script>` section inside the template literal

- [ ] **Replace the entire `<script>` block with:**

```js
<script>
const raw = ${JSON.stringify(deals)};
const COUNTY_SIGNALS = new Set(['tax_delinquent','pre_foreclosure','probate']);
let sortKey = 'score', sortDir = -1;

function isCounty(s) { return COUNTY_SIGNALS.has(s); }

function val(d, k) {
  if (k === 'score') return d.score ?? -1;
  if (k === 'asking_price' || k === 'arv' || k === 'estimated_value') return d[k] ?? -1;
  return (d[k] || '').toString().toLowerCase();
}

function sortBy(k) {
  if (sortKey === k) sortDir *= -1;
  else { sortKey = k; sortDir = -1; }
  document.querySelectorAll('th').forEach(t => t.classList.remove('sorted'));
  event.target.classList.add('sorted');
  render();
}

function applyFilter() { render(); }

function esc(s) { return String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;'); }

function renderMeta(d) {
  const r = d.raw || {};
  const parts = [];
  if (r.delinquent_amount != null) parts.push(\`<span class="meta-tag">Delinquent: $\${Number(r.delinquent_amount).toLocaleString()}</span>\`);
  if (r.years_delinquent != null) parts.push(\`<span class="meta-tag">Yrs: \${esc(r.years_delinquent)}</span>\`);
  if (r.parcel_number) parts.push(\`<span class="meta-tag">Parcel: \${esc(r.parcel_number)}</span>\`);
  if (r.case_number) parts.push(\`<span class="meta-tag">Case: \${esc(r.case_number)}</span>\`);
  if (r.filing_date) parts.push(\`<span class="meta-tag">Filed: \${esc(r.filing_date)}</span>\`);
  if (r.plaintiff) parts.push(\`<span class="meta-tag">Plaintiff: \${esc(r.plaintiff)}</span>\`);
  if (r.fiduciary_name) parts.push(\`<span class="meta-tag">Fiduciary: \${esc(r.fiduciary_name)}</span>\`);
  if (r.address_resolution_status && r.address_resolution_status !== 'resolved') {
    parts.push(\`<span class="meta-tag">Addr: \${esc(r.address_resolution_status)}</span>\`);
  }
  if (d.contact_info) parts.push(\`<span class="meta-tag">Contact: \${esc(d.contact_info)}</span>\`);
  return parts.length ? \`<div class="meta-line">\${parts.join('')}</div>\` : '';
}

function renderAddr(d) {
  const text = d.address || d.owner_name;
  if (!text) return '<span style="color:#6b7280;font-style:italic">No address</span>';
  const escaped = esc(text);
  return d.source_url
    ? \`<a href="\${d.source_url}" target="_blank" rel="noopener">\${escaped}</a>\`
    : escaped;
}

function render() {
  const q = document.getElementById('filter').value.toLowerCase();
  const min = parseInt(document.getElementById('minScore').value);
  const sig = document.getElementById('signalFilter').value;
  const countyOnly = document.getElementById('countyOnly').checked;

  let data = raw.filter(d => {
    if (countyOnly && !isCounty(d.signal_type)) return false;
    if (min > 0 && (d.score ?? -1) < min) return false;
    if (sig && d.signal_type !== sig) return false;
    if (q) {
      const haystack = [
        d.address || '',
        d.signal_type || '',
        d.owner_name || '',
        d.contact_info || '',
        (d.raw && d.raw.post_title) || ''
      ].join(' ').toLowerCase();
      if (!haystack.includes(q)) return false;
    }
    return true;
  });

  data.sort((a, b) => {
    const av = val(a, sortKey), bv = val(b, sortKey);
    if (av === bv) {
      const ac = isCounty(a.signal_type) ? 0 : 1;
      const bc = isCounty(b.signal_type) ? 0 : 1;
      return ac - bc;
    }
    return av < bv ? sortDir : -sortDir;
  });

  const tbody = document.getElementById('tbody');
  if (!data.length) { tbody.innerHTML = '<tr><td colspan="8" class="empty">No matching deals</td></tr>'; return; }

  tbody.innerHTML = data.map(d => {
    const sc = d.score ?? '—';
    const color = d.score === null ? '#6b7280' : d.score >= 60 ? '#16a34a' : d.score >= 40 ? '#d97706' : '#dc2626';
    const badgeClass = isCounty(d.signal_type) ? 'county' : 'market';
    const rowClass = isCounty(d.signal_type) ? ' class="county-row"' : '';
    const price = d.asking_price ? '$' + Number(d.asking_price).toLocaleString() : '—';
    const estVal = d.estimated_value ? '$' + Number(d.estimated_value).toLocaleString() : '—';
    const arv = d.arv ? '$' + Number(d.arv).toLocaleString() : '—';
    const rationale = (d.raw && d.raw.rationale) ? esc(d.raw.rationale) : '';
    const signal = (d.signal_type || '').replace(/_/g, ' ');
    const updated = d.updated_at ? new Date(d.updated_at).toLocaleDateString() : '—';
    return \`<tr\${rowClass}>
      <td><span class="badge \${badgeClass}" style="background:\${color}">\${sc}</span></td>
      <td class="addr">\${renderAddr(d)}\${renderMeta(d)}</td>
      <td>\${signal}</td>
      <td>\${price}</td>
      <td>\${estVal}</td>
      <td>\${arv}</td>
      <td class="rationale">\${rationale}</td>
      <td>\${updated}</td>
    </tr>\`;
  }).join('');
}
</script>
```

- [ ] **Verify:** `node -c dashboard.js` → `OK`

---

### Task 8: Update SQL query in handler()

**Files:**
- Modify: `dashboard.js` — `pool.query()` call inside `handler()`

- [ ] **Replace the existing query string:**

```js
'SELECT * FROM deals ORDER BY score DESC NULLS LAST, updated_at DESC LIMIT 500'
```

**With:**

```js
`SELECT * FROM deals
 ORDER BY
   CASE WHEN signal_type IN ('tax_delinquent','pre_foreclosure','probate') THEN 0 ELSE 1 END ASC,
   score DESC NULLS LAST,
   updated_at DESC
 LIMIT 500`
```

- [ ] **Final syntax check:** `node -c dashboard.js` → `OK`

---

### Task 9: Smoke test + commit

- [ ] **Kill any running dashboard and restart:**

```
# Kill port 3000
npx kill-port 3000 2>nul || true
node dashboard.js
```

- [ ] **Open http://localhost:3000 and verify:**
  - County rows (tax_delinquent / pre_foreclosure / probate) appear at the top
  - County rows have amber left border + tinted background
  - Score badge is amber for county, slate for market
  - Stats bar shows Total / County / Scored / Score 60+ tiles
  - Signal dropdown has two optgroups: County Records / Market
  - "County only" checkbox hides all non-county rows when checked
  - Address-null county rows show owner_name or "No address" in gray italic
  - Metadata tags (Delinquent, Yrs, Case, Filed, etc.) appear under county addresses
  - Est. Value column present with values or —
  - Sorting by score still puts county rows first when scores tie

- [ ] **Commit:**

```bash
git add dashboard.js docs/superpowers/specs/2026-05-17-dashboard-county-priority-design.md docs/superpowers/plans/2026-05-17-dashboard-county-priority.md
git commit -m "feat: county-priority dashboard — accent rows, metadata tags, est value col, optgroup filter"
```
