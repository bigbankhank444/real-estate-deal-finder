#!/usr/bin/env node
'use strict';

require('dotenv').config();
const http = require('http');
const { Pool } = require('pg');

const PORT = process.env.DASHBOARD_PORT || 3000;
const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false },
});

function scoreColor(score) {
  if (score === null || score === undefined) return '#6b7280';
  if (score >= 60) return '#16a34a';
  if (score >= 40) return '#d97706';
  return '#dc2626';
}

function html(deals) {
  const rows = deals.map((d) => {
    const sc = d.score ?? '—';
    const color = scoreColor(d.score);
    const price = d.asking_price ? `$${Number(d.asking_price).toLocaleString()}` : '—';
    const arv = d.arv ? `$${Number(d.arv).toLocaleString()}` : '—';
    const rationale = (d.raw && d.raw.rationale) ? d.raw.rationale.replace(/</g, '&lt;').replace(/>/g, '&gt;') : '';
    const addr = (d.address || '').replace(/</g, '&lt;').replace(/>/g, '&gt;');
    const link = d.source_url
      ? `<a href="${d.source_url}" target="_blank" rel="noopener">${addr}</a>`
      : addr;
    const signal = (d.signal_type || '').replace(/_/g, ' ');
    const updated = d.updated_at ? new Date(d.updated_at).toLocaleDateString() : '—';
    return `
      <tr>
        <td><span class="badge" style="background:${color}">${sc}</span></td>
        <td class="addr">${link}</td>
        <td>${signal}</td>
        <td>${price}</td>
        <td>${arv}</td>
        <td class="rationale">${rationale}</td>
        <td>${updated}</td>
      </tr>`;
  }).join('');

  const total = deals.length;
  const scored = deals.filter((d) => d.score !== null).length;
  const highScore = deals.filter((d) => d.score >= 60).length;

  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Deal Finder Dashboard</title>
<style>
  *{box-sizing:border-box;margin:0;padding:0}
  body{font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;background:#0f172a;color:#e2e8f0;min-height:100vh}
  header{background:#1e293b;padding:16px 24px;border-bottom:1px solid #334155;display:flex;align-items:center;justify-content:space-between;flex-wrap:wrap;gap:12px}
  header h1{font-size:1.2rem;font-weight:700;color:#f1f5f9}
  .stats{display:flex;gap:16px;flex-wrap:wrap}
  .stat{background:#0f172a;border:1px solid #334155;border-radius:8px;padding:8px 14px;text-align:center}
  .stat-num{font-size:1.4rem;font-weight:700;color:#38bdf8}
  .stat-label{font-size:0.7rem;color:#94a3b8;text-transform:uppercase;letter-spacing:.05em}
  .controls{padding:16px 24px;display:flex;gap:12px;flex-wrap:wrap;align-items:center;background:#1e293b;border-bottom:1px solid #334155}
  input,select{background:#0f172a;border:1px solid #475569;color:#e2e8f0;border-radius:6px;padding:7px 12px;font-size:0.85rem;outline:none}
  input:focus,select:focus{border-color:#38bdf8}
  input{flex:1;min-width:180px}
  .table-wrap{overflow-x:auto;padding:0 0 80px}
  table{width:100%;border-collapse:collapse;font-size:0.82rem}
  th{background:#1e293b;padding:10px 12px;text-align:left;color:#94a3b8;font-weight:600;text-transform:uppercase;font-size:0.72rem;letter-spacing:.05em;position:sticky;top:0;cursor:pointer;user-select:none;white-space:nowrap}
  th:hover{color:#e2e8f0}
  th.sorted{color:#38bdf8}
  td{padding:9px 12px;border-bottom:1px solid #1e293b;vertical-align:top}
  tr:hover td{background:#1e293b}
  .badge{display:inline-block;color:#fff;font-weight:700;font-size:0.85rem;border-radius:6px;padding:2px 8px;min-width:36px;text-align:center}
  .addr a{color:#38bdf8;text-decoration:none;word-break:break-all}
  .addr a:hover{text-decoration:underline}
  .rationale{color:#94a3b8;font-size:0.78rem;max-width:300px}
  .empty{text-align:center;padding:60px;color:#475569}
  @media(max-width:600px){
    .rationale{display:none}
    th:last-child,td:last-child{display:none}
  }
</style>
</head>
<body>
<header>
  <h1>Deal Finder Dashboard</h1>
  <div class="stats">
    <div class="stat"><div class="stat-num">${total}</div><div class="stat-label">Total</div></div>
    <div class="stat"><div class="stat-num">${scored}</div><div class="stat-label">Scored</div></div>
    <div class="stat"><div class="stat-num">${highScore}</div><div class="stat-label">Score 60+</div></div>
  </div>
</header>
<div class="controls">
  <input type="search" id="filter" placeholder="Filter by address or signal..." oninput="applyFilter()">
  <select id="minScore" onchange="applyFilter()">
    <option value="0">All scores</option>
    <option value="40">Score 40+</option>
    <option value="50">Score 50+</option>
    <option value="60">Score 60+</option>
  </select>
  <select id="signalFilter" onchange="applyFilter()">
    <option value="">All signals</option>
    ${[...new Set(deals.map(d => d.signal_type).filter(Boolean))].sort().map(s =>
      `<option value="${s}">${s.replace(/_/g,' ')}</option>`).join('')}
  </select>
</div>
<div class="table-wrap">
<table id="deals-table">
<thead>
  <tr>
    <th onclick="sortBy('score')" class="sorted">Score ▼</th>
    <th onclick="sortBy('address')">Address</th>
    <th onclick="sortBy('signal_type')">Signal</th>
    <th onclick="sortBy('asking_price')">Ask Price</th>
    <th onclick="sortBy('arv')">ARV</th>
    <th>Rationale</th>
    <th onclick="sortBy('updated_at')">Updated</th>
  </tr>
</thead>
<tbody id="tbody">
${rows || '<tr><td colspan="7" class="empty">No deals found</td></tr>'}
</tbody>
</table>
</div>
<script>
const raw = ${JSON.stringify(deals)};
let sortKey = 'score', sortDir = -1;

function val(d, k) {
  if (k === 'score') return d.score ?? -1;
  if (k === 'asking_price' || k === 'arv') return d[k] ?? -1;
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

function render() {
  const q = document.getElementById('filter').value.toLowerCase();
  const min = parseInt(document.getElementById('minScore').value);
  const sig = document.getElementById('signalFilter').value;

  let data = raw.filter(d => {
    if (min > 0 && (d.score ?? -1) < min) return false;
    if (sig && d.signal_type !== sig) return false;
    if (q) {
      const haystack = ((d.address || '') + ' ' + (d.signal_type || '')).toLowerCase();
      if (!haystack.includes(q)) return false;
    }
    return true;
  });

  data.sort((a, b) => {
    const av = val(a, sortKey), bv = val(b, sortKey);
    return av < bv ? sortDir : av > bv ? -sortDir : 0;
  });

  const tbody = document.getElementById('tbody');
  if (!data.length) { tbody.innerHTML = '<tr><td colspan="7" class="empty">No matching deals</td></tr>'; return; }

  tbody.innerHTML = data.map(d => {
    const sc = d.score ?? '—';
    const colors = {'null':'#6b7280'};
    const color = d.score === null ? '#6b7280' : d.score >= 60 ? '#16a34a' : d.score >= 40 ? '#d97706' : '#dc2626';
    const price = d.asking_price ? '$' + Number(d.asking_price).toLocaleString() : '—';
    const arv = d.arv ? '$' + Number(d.arv).toLocaleString() : '—';
    const rationale = (d.raw && d.raw.rationale) ? d.raw.rationale.replace(/</g,'&lt;').replace(/>/g,'&gt;') : '';
    const addr = (d.address || '').replace(/</g,'&lt;').replace(/>/g,'&gt;');
    const link = d.source_url ? \`<a href="\${d.source_url}" target="_blank" rel="noopener">\${addr}</a>\` : addr;
    const signal = (d.signal_type || '').replace(/_/g,' ');
    const updated = d.updated_at ? new Date(d.updated_at).toLocaleDateString() : '—';
    return \`<tr>
      <td><span class="badge" style="background:\${color}">\${sc}</span></td>
      <td class="addr">\${link}</td>
      <td>\${signal}</td>
      <td>\${price}</td>
      <td>\${arv}</td>
      <td class="rationale">\${rationale}</td>
      <td>\${updated}</td>
    </tr>\`;
  }).join('');
}
</script>
</body>
</html>`;
}

async function handler(req, res) {
  if (req.url !== '/' && req.url !== '/index.html') {
    res.writeHead(404);
    res.end('Not found');
    return;
  }
  try {
    const { rows } = await pool.query(
      'SELECT * FROM deals ORDER BY score DESC NULLS LAST, updated_at DESC LIMIT 500'
    );
    res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
    res.end(html(rows));
  } catch (err) {
    console.error('DB error:', err);
    res.writeHead(500, { 'Content-Type': 'text/plain' });
    res.end(`DB error: ${err.message}\n\nDATABASE_URL set: ${!!process.env.DATABASE_URL}\n\n${err.stack}`);
  }
}

const server = http.createServer(handler);
server.listen(PORT, () => {
  console.log(`Dashboard: http://localhost:${PORT}`);
  console.log('On your phone (same WiFi): check your laptop IP with `ipconfig`');
});
