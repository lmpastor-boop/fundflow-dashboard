/**
 * app.js — FundFlow Simulator main application
 * View routing, state management, UI wiring
 */

import { searchOrganizations, getOrganization, getTrendFilings, getRevenueBreakdown } from './api.js';
import { computeMetrics, resilienceScore, scoreLabel, metricStatus, formatMetricValue } from './metrics.js';
import { runShockSimulation, runGrantSimulation, SHOCK_TYPES, GRANT_TYPES, formatDollars } from './simulator.js';
import { buildTrendChart, buildRevenueDonut, buildShockChart, buildGrantComparisonChart } from './charts.js';

// ── State ────────────────────────────────────────────────────────────────────
const state = {
  searchResults: [],
  selectedOrg: null,
  filings: [],
  trendSource: 'propublica_filings',
  latestFiling: null,
  metrics: null,
  score: 0,
  charts: {},
  shockResult: null,
  grantResult: null,
};

// ── View Navigation ───────────────────────────────────────────────────────────
function showView(id) {
  document.querySelectorAll('.view').forEach(v => {
    v.classList.remove('active');
    v.style.display = '';
  });
  const el = document.getElementById(id);
  if (el) {
    el.classList.add('active');
    // The loading view needs flex display, others default to block
    if (id === 'view-loading') {
      el.style.display = 'flex';
    }
  }
  window.scrollTo({ top: 0, behavior: 'smooth' });
}

// ── Search ────────────────────────────────────────────────────────────────────
async function handleSearch(query) {
  if (!query.trim()) return;

  const resultsEl = document.getElementById('search-results');
  const searchBtn = document.getElementById('search-btn');
  
  resultsEl.innerHTML = `
    <div class="loading-state">
      <div class="spinner"></div>
      <p>Searching ProPublica Nonprofit Explorer…</p>
    </div>`;
  searchBtn.disabled = true;
  searchBtn.textContent = 'Searching…';

  try {
    const data = await searchOrganizations(query);
    state.searchResults = data.organizations || [];
    renderSearchResults(state.searchResults);
  } catch (err) {
    resultsEl.innerHTML = `<div class="error-state"><span class="error-icon">⚠️</span> ${err.message}</div>`;
  } finally {
    searchBtn.disabled = false;
    searchBtn.textContent = 'Search';
  }
}

function renderSearchResults(orgs) {
  const el = document.getElementById('search-results');
  if (!orgs.length) {
    el.innerHTML = `<div class="empty-state">No organizations found. Try a different name or EIN.</div>`;
    return;
  }

  el.innerHTML = `
    <div class="results-header">
      <span>${orgs.length} organizations found</span>
    </div>
    <div class="results-grid">
      ${orgs.slice(0, 20).map(org => `
        <div class="org-card" data-ein="${org.ein}" role="button" tabindex="0">
          <div class="org-card-header">
            <div class="org-icon">${getNTEEIcon(org.ntee_code)}</div>
            <div class="org-card-meta">
              <span class="org-name">${org.name || 'Unknown'}</span>
              <span class="org-ein">EIN: ${org.strein || org.ein}</span>
            </div>
          </div>
          <div class="org-card-details">
            <span class="org-location">${[org.city, org.state].filter(Boolean).join(', ') || 'Location unknown'}</span>
            ${org.ntee_code ? `<span class="org-category">${org.ntee_code}</span>` : ''}
          </div>
          ${org.income_amount ? `<div class="org-revenue">Revenue: ${formatDollars(org.income_amount)}</div>` : ''}
        </div>
      `).join('')}
    </div>`;

  // Attach click handlers
  el.querySelectorAll('.org-card').forEach(card => {
    const handler = () => loadOrganization(card.dataset.ein);
    card.addEventListener('click', handler);
    card.addEventListener('keydown', e => { if (e.key === 'Enter' || e.key === ' ') handler(); });
  });
}

// ── Organization Dashboard ────────────────────────────────────────────────────
async function loadOrganization(ein) {
  showView('view-loading');
  document.getElementById('loading-org-name').textContent = 'Loading organization data…';

  try {
    const data = await getOrganization(ein);
    state.selectedOrg = data.organization;
    const trendData = await getTrendFilings(data?.organization?.ein || ein, data.filings_with_data || []);
    state.filings = trendData.filings || [];
    state.trendSource = trendData.source || 'propublica_filings';

    if (!state.filings.length) {
      throw new Error('No financial data available for this organization.');
    }

    state.latestFiling = state.filings[state.filings.length - 1];
    state.metrics = computeMetrics(state.latestFiling);
    state.score = resilienceScore(state.metrics);

    renderDashboard();
    showView('view-dashboard');
  } catch (err) {
    showView('view-search');
    showToast(`Error: ${err.message}`, 'error');
  }
}

function renderDashboard() {
  const org = state.selectedOrg;
  const filing = state.latestFiling;
  const metrics = state.metrics;
  const score = state.score;
  const sl = scoreLabel(score);

  // Header
  document.getElementById('dash-org-name').textContent = org.name || 'Unknown Organization';
  document.getElementById('dash-org-ein').textContent = `EIN ${org.strein || org.ein}`;
  document.getElementById('dash-org-location').textContent = [org.city, org.state, org.zipcode].filter(Boolean).join(', ');
  document.getElementById('dash-org-ntee').textContent = org.ntee_code ? `NTEE: ${org.ntee_code}` : '';
  document.getElementById('dash-data-year').textContent = `Most recent data: ${filing.year}`;
  document.getElementById('dash-total-filings').textContent = `${state.filings.length} years of filings`;
  const trendSourceEl = document.getElementById('dash-trend-source');
  if (trendSourceEl) {
    const isLocal = state.trendSource === 'local_irs_panel';
    trendSourceEl.textContent = isLocal ? 'Trend source: Local IRS panel' : 'Trend source: ProPublica fallback';
    trendSourceEl.className = `trend-source-pill ${isLocal ? 'source-local' : 'source-fallback'}`;
  }

  // Key financials
  document.getElementById('stat-revenue').textContent = formatDollars(filing.totalRevenue);
  document.getElementById('stat-expenses').textContent = formatDollars(filing.totalExpenses);
  document.getElementById('stat-net-assets').textContent = formatDollars(filing.netAssets);
  const surplus = filing.totalRevenue - filing.totalExpenses;
  const surplusEl = document.getElementById('stat-surplus');
  surplusEl.textContent = formatDollars(surplus);
  surplusEl.className = surplus >= 0 ? 'stat-value positive' : 'stat-value negative';

  // Resilience score
  animateScore(score, sl);

  // Metric cards
  renderMetricCards(metrics);

  // Charts
  renderDashboardCharts();

  // Funder brief
  renderFunderBrief();
}

function renderFunderBrief() {
  const org = state.selectedOrg;
  const filing = state.latestFiling;
  const metrics = state.metrics;
  const score = state.score;
  const scoreInfo = scoreLabel(score);
  if (!org || !filing || !metrics) return;

  const years = state.filings.map(f => f.year).filter(Boolean).sort((a, b) => a - b);
  const oldest = state.filings[0];
  const newest = state.filings[state.filings.length - 1];
  const yearsCovered = years.length;
  const yoyRevenue = oldest && oldest.totalRevenue > 0
    ? ((newest.totalRevenue - oldest.totalRevenue) / oldest.totalRevenue) * 100
    : null;
  const operatingMarginPct = Number.isFinite(metrics.operatingMargin) ? metrics.operatingMargin * 100 : null;
  const monthsCash = Number.isFinite(metrics.monthsOfCash) ? metrics.monthsOfCash : null;
  const concentrationPct = Number.isFinite(metrics.revenueConcentration) ? metrics.revenueConcentration * 100 : null;
  const runwayNarrative = monthsCash === null
    ? 'reserve runway is unavailable'
    : `${monthsCash.toFixed(1)} months of operating runway`;

  document.getElementById('brief-org-name').textContent = org.name || 'Unknown Organization';
  document.getElementById('brief-org-meta').textContent =
    `EIN ${org.strein || org.ein || '—'} · ${[org.city, org.state].filter(Boolean).join(', ') || 'Location unavailable'}`;
  document.getElementById('brief-score').textContent = `${score} / 100 (${scoreInfo.label})`;
  document.getElementById('brief-revenue').textContent = formatDollars(filing.totalRevenue);
  document.getElementById('brief-expenses').textContent = formatDollars(filing.totalExpenses);
  document.getElementById('brief-net-assets').textContent = formatDollars(filing.netAssets);

  document.getElementById('brief-exec-summary').textContent =
    `${org.name || 'This organization'} currently scores ${score}/100 on our resilience framework (${scoreInfo.label.toLowerCase()} profile), based on ${yearsCovered} years of filing history. ` +
    `The latest financial posture indicates ${runwayNarrative} and ${operatingMarginPct === null ? 'an unavailable operating margin metric' : `an operating margin of ${formatPct(operatingMarginPct)}`}.`;

  const trendPoints = [
    `Coverage window: ${yearsCovered} years (${years[0] || '—'}-${years[years.length - 1] || '—'})`,
    `Revenue change (earliest to latest year): ${yoyRevenue === null ? 'unavailable' : `${formatPct(yoyRevenue)}`}`,
    `Latest annual surplus/deficit: ${formatDollars((filing.totalRevenue || 0) - (filing.totalExpenses || 0))}`,
  ];
  const riskPoints = [
    `Funding concentration exposure: ${concentrationPct === null ? 'unavailable' : formatPct(concentrationPct)}`,
    `Operating margin signal: ${operatingMarginPct === null ? 'unavailable' : formatPct(operatingMarginPct)}`,
    monthsCash === null
      ? 'Liquidity runway signal: unavailable'
      : `Liquidity runway signal: ${monthsCash.toFixed(1)} months`,
  ];

  const trendList = document.getElementById('brief-trend-points');
  trendList.innerHTML = trendPoints.map(item => `<li>${item}</li>`).join('');
  const riskList = document.getElementById('brief-risk-points');
  riskList.innerHTML = riskPoints.map(item => `<li>${item}</li>`).join('');

  document.getElementById('brief-recommendation').textContent = getFunderRecommendation({
    score,
    concentrationPct,
    monthsCash,
    operatingMarginPct,
  });

  const sourceLabel = state.trendSource === 'local_irs_panel'
    ? 'Trend source: Local merged panel (IRS + ProPublica)'
    : 'Trend source: ProPublica API fallback';
  document.getElementById('brief-source').textContent = sourceLabel;
  document.getElementById('brief-generated-at').textContent =
    `Generated: ${new Date().toLocaleString()}`;
}

function formatPct(value) {
  const sign = value > 0 ? '+' : '';
  return `${sign}${value.toFixed(1)}%`;
}

function getFunderRecommendation({ score, concentrationPct, monthsCash, operatingMarginPct }) {
  if (score >= 75) {
    return 'Recommendation: maintain strategic support and prioritize growth or innovation-focused capital. Continue monitoring revenue diversification and margin durability.';
  }
  if (score >= 50) {
    return 'Recommendation: provide flexible operating support with clear 6-12 month milestones focused on extending runway and reducing concentration risk.';
  }
  if (score >= 30) {
    return 'Recommendation: deploy near-term stabilization funding alongside technical assistance to restore margin discipline, diversify revenue, and protect liquidity.';
  }
  return 'Recommendation: treat as a high-priority intervention case. Consider immediate unrestricted support paired with a tightly monitored 6-12 month recovery plan.';
}

function exportBriefAsPdf() {
  const briefEl = document.getElementById('brief-print-area');
  if (!briefEl) return;
  const orgName = (state?.selectedOrg?.name || 'Organization')
    .replace(/[^a-z0-9]+/gi, '_')
    .replace(/^_+|_+$/g, '')
    .slice(0, 60) || 'Organization';
  const dateStr = new Date().toISOString().slice(0, 10);
  const suggestedFileName = `FundFlow_Brief_${orgName}_${dateStr}`;

  const win = window.open('', '_blank', 'width=900,height=1100');
  if (!win) {
    showToast('Popup blocked. Allow popups to export PDF.', 'error');
    return;
  }

  const html = `<!doctype html>
<html>
<head>
  <meta charset="utf-8" />
  <title>${suggestedFileName}</title>
  <style>
    body { font-family: Arial, Helvetica, sans-serif; margin: 28px; color: #101828; }
    h2 { margin: 0 0 6px; font-size: 24px; }
    h3 { margin: 0 0 8px; font-size: 15px; text-transform: uppercase; letter-spacing: .04em; color: #475467; }
    p { margin: 0; line-height: 1.5; }
    .brief-header { display: flex; justify-content: space-between; align-items: flex-start; margin-bottom: 16px; }
    .brief-chip { font-size: 12px; padding: 5px 10px; border: 1px solid #d0d5dd; border-radius: 999px; }
    .brief-meta { color: #667085; font-size: 13px; }
    .brief-section { border: 1px solid #eaecf0; border-radius: 12px; padding: 12px; margin-bottom: 12px; }
    .brief-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 12px; margin-bottom: 12px; }
    .brief-kpis { grid-template-columns: repeat(4, 1fr); }
    .brief-card { border: 1px solid #eaecf0; border-radius: 12px; padding: 12px; }
    .brief-label { font-size: 11px; text-transform: uppercase; color: #667085; margin-bottom: 5px; }
    .brief-value { font-size: 16px; font-weight: 700; }
    .brief-list { margin: 0; padding-left: 18px; color: #344054; }
    .brief-list li { margin: 0 0 6px; }
    .brief-footer { margin-top: 16px; border-top: 1px solid #eaecf0; padding-top: 8px; font-size: 12px; color: #667085; display: flex; justify-content: space-between; }
  </style>
</head>
<body>${briefEl.outerHTML}
<script>
  window.onload = () => {
    window.print();
    setTimeout(() => window.close(), 250);
  };
</script>
</body>
</html>`;

  win.document.open();
  win.document.write(html);
  win.document.close();
  showToast(`PDF name suggestion: ${suggestedFileName}.pdf`, 'info');
}

function animateScore(targetScore, sl) {
  const scoreEl = document.getElementById('resilience-score-value');
  const labelEl = document.getElementById('resilience-score-label');
  const ringEl = document.getElementById('score-ring');
  const descEl = document.getElementById('resilience-score-desc');

  labelEl.textContent = sl.label;
  labelEl.style.color = sl.color;
  descEl.textContent = getScoreDescription(targetScore);

  // Set ring color
  ringEl.style.setProperty('--score-color', sl.color);
  ringEl.style.setProperty('--score-pct', `${targetScore}%`);

  // Animate counter
  let current = 0;
  const step = targetScore / 40;
  const interval = setInterval(() => {
    current = Math.min(current + step, targetScore);
    scoreEl.textContent = Math.round(current);
    if (current >= targetScore) clearInterval(interval);
  }, 25);
}

function getScoreDescription(score) {
  if (score >= 75) return 'This organization demonstrates strong financial resilience with healthy reserves and diversified revenue.';
  if (score >= 50) return 'Moderate resilience. Some risks present — review concentration and cash runway carefully.';
  if (score >= 30) return 'Financial vulnerabilities detected. Grant impact could be significant here.';
  return 'Critical financial stress. Targeted support may be essential for organizational survival.';
}

function renderMetricCards(metrics) {
  const metricsMeta = [
    {
      key: 'monthsOfCash',
      label: 'Months of Cash',
      icon: '💧',
      description: 'Operating reserve runway',
      benchmark: '≥ 6 months healthy',
    },
    {
      key: 'operatingMargin',
      label: 'Operating Margin',
      icon: '📊',
      description: 'Revenue surplus after expenses',
      benchmark: '≥ 5% healthy',
    },
    {
      key: 'revenueConcentration',
      label: 'Revenue Concentration',
      icon: '🎯',
      description: 'Gov grant dependency ratio',
      benchmark: '≤ 30% diversified',
      invertColor: true,
    },
    {
      key: 'currentRatio',
      label: 'Current Ratio',
      icon: '⚖️',
      description: 'Assets vs. liabilities coverage',
      benchmark: '≥ 2.0x healthy',
    },
    {
      key: 'programExpenseRatio',
      label: 'Program Efficiency',
      icon: '🎖️',
      description: 'Expenses toward mission programs',
      benchmark: '≥ 70% efficient',
    },
  ];

  const container = document.getElementById('metric-cards');
  container.innerHTML = metricsMeta.map(m => {
    const value = metrics[m.key];
    const status = metricStatus(m.key, value);
    const displayVal = formatMetricValue(m.key, value);
    const statusClass = `status-${status}`;

    return `
      <div class="metric-card ${statusClass}">
        <div class="metric-icon">${m.icon}</div>
        <div class="metric-body">
          <div class="metric-label">${m.label}</div>
          <div class="metric-value">${displayVal}</div>
          <div class="metric-description">${m.description}</div>
          <div class="metric-benchmark">${m.benchmark}</div>
        </div>
        <div class="metric-status-dot"></div>
      </div>`;
  }).join('');
}

function renderDashboardCharts() {
  // Destroy existing charts
  Object.values(state.charts).forEach(c => { if (c && c.destroy) c.destroy(); });
  state.charts = {};

  // Trend chart
  const trendCtx = document.getElementById('chart-trend');
  if (trendCtx && state.filings.length > 0) {
    state.charts.trend = buildTrendChart(trendCtx, state.filings);
  }

  // Revenue donut
  const donutCtx = document.getElementById('chart-donut');
  if (donutCtx && state.latestFiling) {
    const breakdown = getRevenueBreakdown(state.latestFiling);
    const hasData = Object.values(breakdown).some(v => v > 0 && !isNaN(v));
    if (hasData) {
      state.charts.donut = buildRevenueDonut(donutCtx, breakdown);
    } else {
      document.getElementById('chart-donut').parentElement.innerHTML =
        '<div class="no-data-msg">Revenue breakdown data not available for this filing type.</div>';
    }
  }
}

// ── Shock Simulator ───────────────────────────────────────────────────────────
function initShockSimulator() {
  const shockTypeEl = document.getElementById('shock-type');
  const magnitudeEl = document.getElementById('shock-magnitude');
  const magnitudeValEl = document.getElementById('shock-magnitude-val');
  const durationEl = document.getElementById('shock-duration');
  const durationValEl = document.getElementById('shock-duration-val');

  // Populate shock type options
  shockTypeEl.innerHTML = Object.entries(SHOCK_TYPES).map(([key, v]) =>
    `<option value="${key}">${v.icon} ${v.label}</option>`).join('');

  // Live labels
  magnitudeEl.addEventListener('input', () => {
    magnitudeValEl.textContent = `${magnitudeEl.value}%`;
    runShock();
  });
  durationEl.addEventListener('input', () => {
    durationValEl.textContent = `${durationEl.value} year${durationEl.value > 1 ? 's' : ''}`;
    runShock();
  });
  shockTypeEl.addEventListener('change', () => {
    updateShockDescription();
    runShock();
  });

  updateShockDescription();
  runShock();
}

function updateShockDescription() {
  const type = document.getElementById('shock-type').value;
  const shock = SHOCK_TYPES[type];
  if (shock) {
    document.getElementById('shock-type-desc').textContent = shock.description;
  }
}

function runShock() {
  if (!state.latestFiling) return;

  const shockType = document.getElementById('shock-type').value;
  const magnitude = parseInt(document.getElementById('shock-magnitude').value) / 100;
  const duration = parseInt(document.getElementById('shock-duration').value);

  const result = runShockSimulation(state.latestFiling, shockType, magnitude, duration);
  state.shockResult = result;
  renderShockResults(result);
}

function renderShockResults(result) {
  // Score delta
  const deltaEl = document.getElementById('shock-score-delta');
  const delta = result.scoreDelta;
  deltaEl.textContent = delta >= 0 ? `+${delta}` : String(delta);
  deltaEl.className = delta >= 0 ? 'delta-positive' : 'delta-negative';

  document.getElementById('shock-score-before').textContent = result.baseScore;
  document.getElementById('shock-score-after').textContent = result.shockedScore;

  // Runway
  const runwayEl = document.getElementById('shock-runway');
  if (result.runwayMonths !== null) {
    runwayEl.textContent = result.runwayMonths < 0.5
      ? 'Immediate insolvency risk'
      : `${result.runwayMonths.toFixed(1)} months`;
    runwayEl.className = result.runwayMonths < 3 ? 'runway-critical' : result.runwayMonths < 12 ? 'runway-warning' : 'runway-ok';
  } else {
    runwayEl.textContent = 'Sustainable';
    runwayEl.className = 'runway-ok';
  }

  // Annual deficit/surplus
  const deficitEl = document.getElementById('shock-deficit');
  deficitEl.textContent = formatDollars(result.annualDeficit);
  deficitEl.className = result.annualDeficit >= 0 ? 'delta-positive' : 'delta-negative';

  // Recovery chart
  if (state.charts.shock) state.charts.shock.destroy();
  const shockCtx = document.getElementById('chart-shock');
  if (shockCtx) {
    state.charts.shock = buildShockChart(shockCtx, result);
  }
}

// ── Grant Impact Modeler ──────────────────────────────────────────────────────
function initGrantModeler() {
  const grantTypeEl = document.getElementById('grant-type');
  const grantAmountEl = document.getElementById('grant-amount');

  grantTypeEl.innerHTML = Object.entries(GRANT_TYPES).map(([key, v]) =>
    `<option value="${key}">${v.icon} ${v.label}</option>`).join('');

  grantTypeEl.addEventListener('change', runGrant);
  grantAmountEl.addEventListener('input', runGrant);

  // Format amount on blur
  grantAmountEl.addEventListener('blur', () => {
    const val = parseGrantAmount(grantAmountEl.value);
    if (val > 0) grantAmountEl.value = val.toLocaleString();
  });

  runGrant();
}

function parseGrantAmount(str) {
  return parseInt(String(str).replace(/[^0-9]/g, '')) || 0;
}

function runGrant() {
  if (!state.latestFiling) return;

  const grantType = document.getElementById('grant-type').value;
  const grantAmount = parseGrantAmount(document.getElementById('grant-amount').value);

  if (grantAmount <= 0) return;

  const result = runGrantSimulation(state.latestFiling, grantAmount, grantType);
  state.grantResult = result;
  renderGrantResults(result);
}

function renderGrantResults(result) {
  // Score delta
  const deltaEl = document.getElementById('grant-score-delta');
  const delta = result.scoreDelta;
  deltaEl.textContent = delta >= 0 ? `+${delta}` : String(delta);
  deltaEl.className = delta >= 0 ? 'delta-positive' : 'delta-negative';

  document.getElementById('grant-score-before').textContent = result.baseScore;
  document.getElementById('grant-score-after').textContent = result.boostedScore;

  // Runway added
  const runwayEl = document.getElementById('grant-runway-added');
  runwayEl.textContent = result.runwayAdded > 0
    ? `+${result.runwayAdded.toFixed(1)} months`
    : `${result.runwayAdded.toFixed(1)} months`;
  runwayEl.className = result.runwayAdded >= 0 ? 'delta-positive' : 'delta-negative';

  // 3-year net assets
  document.getElementById('grant-3yr-assets').textContent = formatDollars(result.netAssets3yr);

  // Concentration change
  const concEl = document.getElementById('grant-concentration');
  const concDelta = result.concentrationChange * 100;
  concEl.textContent = `${concDelta >= 0 ? '+' : ''}${concDelta.toFixed(1)}%`;
  concEl.className = concDelta <= 0 ? 'delta-positive' : 'delta-negative';

  // Annual cash flow impact
  document.getElementById('grant-annual-impact').textContent = formatDollars(result.annualSurplus);

  // Comparison chart
  if (state.charts.grant) state.charts.grant.destroy();
  const grantCtx = document.getElementById('chart-grant');
  if (grantCtx) {
    state.charts.grant = buildGrantComparisonChart(grantCtx, result.baseMetrics, result.boostedMetrics);
  }
}

// ── Utility ───────────────────────────────────────────────────────────────────
function getNTEEIcon(code) {
  if (!code) return '🏢';
  const major = code[0];
  const icons = {
    A: '🎭', B: '📚', C: '🌿', D: '🐾', E: '🏥', F: '🧠', G: '🔬',
    H: '🔬', I: '⚖️', J: '💼', K: '🍽️', L: '🏠', M: '🛡️', N: '⚽',
    O: '👥', P: '❤️', Q: '🌍', R: '✊', S: '🤝', T: '💰', U: '🔭',
    V: '🧩', W: '🏛️', X: '✝️', Y: '🏊', Z: '🔷',
  };
  return icons[major.toUpperCase()] || '🏢';
}

function showToast(message, type = 'info') {
  const toast = document.getElementById('toast');
  toast.textContent = message;
  toast.className = `toast toast-${type} toast-show`;
  setTimeout(() => { toast.className = 'toast'; }, 4000);
}

// ── Initialize ────────────────────────────────────────────────────────────────
function init() {
  // Search form
  const searchInput = document.getElementById('search-input');
  const searchBtn = document.getElementById('search-btn');

  const doSearch = () => handleSearch(searchInput.value);

  searchBtn.addEventListener('click', doSearch);
  searchInput.addEventListener('keydown', e => { if (e.key === 'Enter') doSearch(); });

  // Example searches
  document.querySelectorAll('.example-search').forEach(btn => {
    btn.addEventListener('click', () => {
      searchInput.value = btn.dataset.query;
      handleSearch(btn.dataset.query);
    });
  });

  // Back button
  document.getElementById('btn-back-to-search').addEventListener('click', () => {
    showView('view-search');
  });

  const exportBriefBtn = document.getElementById('btn-export-brief');
  if (exportBriefBtn) {
    exportBriefBtn.addEventListener('click', exportBriefAsPdf);
  }

  // Tab navigation in dashboard
  document.querySelectorAll('.tab-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      document.querySelectorAll('.tab-btn').forEach(b => {
        b.classList.remove('active');
        b.setAttribute('aria-selected', 'false');
      });
      document.querySelectorAll('.tab-panel').forEach(p => p.classList.remove('active'));
      btn.classList.add('active');
      btn.setAttribute('aria-selected', 'true');
      const panel = document.getElementById(`tab-${btn.dataset.tab}`);
      if (panel) panel.classList.add('active');
      // Initialize simulators when tabs are opened for the first time
      if (btn.dataset.tab === 'shock' && !state.shockInitialized) {
        initShockSimulator();
        state.shockInitialized = true;
      }
      if (btn.dataset.tab === 'grant' && !state.grantInitialized) {
        initGrantModeler();
        state.grantInitialized = true;
      }
    });
  });

  showView('view-search');
}

document.addEventListener('DOMContentLoaded', init);
