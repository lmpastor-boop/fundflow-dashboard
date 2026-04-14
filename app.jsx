const { useState, useEffect, useMemo, useRef } = React;

const formatCurrency = (val) => (val === null || val === undefined) ? 'N/A' : new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 }).format(val);
const formatPercent = (val) => (val === null || val === undefined) ? 'N/A' : new Intl.NumberFormat('en-US', { style: 'percent', maximumFractionDigits: 1 }).format(val);

function StatCard({ label, value, trend, isPositive, prefix = '', suffix = '' }) {
  return (
    <div className="glass-panel kpi-card">
      <div className="kpi-label">{label}</div>
      <div className="kpi-value">{prefix}{value}{suffix}</div>
      {trend && (
        <div className={`kpi-trend ${isPositive ? 'trend-up' : 'trend-down'}`}>
          {isPositive ? '↗' : '↘'} {trend}
        </div>
      )}
    </div>
  );
}

function GlobalDashboard({ db, onSelectOrg }) {
  const [searchTerm, setSearchTerm] = useState('');
  
  const orgs = useMemo(() => Object.values(db), [db]);

  // Compute hidden gems: orgs that are 'Resilient' but small/medium size
  const hiddenGems = useMemo(() => {
    return orgs
      .filter(o => o.is_hidden_gem === 'True')
      .sort((a, b) => (b.hidden_gem_score || 0) - (a.hidden_gem_score || 0))
      .slice(0, 10);
  }, [orgs]);

  // High Risk Orgs
  const highRisk = useMemo(() => {
    return orgs
      .filter(o => o.resilience_label === 'Critical')
      .sort((a, b) => (a.months_of_cash || 0) - (b.months_of_cash || 0))
      .slice(0, 5);
  }, [orgs]);

  // Search Results
  const searchResults = useMemo(() => {
    if (!searchTerm) return [];
    const term = searchTerm.toLowerCase();
    return orgs.filter(o => 
      o.name.toLowerCase().includes(term) || 
      (o.ein && o.ein.includes(term))
    ).slice(0, 15);
  }, [searchTerm, orgs]);

  return (
    <div className="animate-fade-in">
      <h1 className="page-title">Welcome to FundFlow NextGen</h1>
      <p className="page-subtitle">Powered by ML Resilience Models & IRS 990 Data</p>
      
      <div className="glass-panel" style={{ padding: '24px', marginBottom: '32px' }}>
        <div className="search-container" style={{ width: '100%' }}>
          <span className="search-icon">🔍</span>
          <input 
            type="text"
            className="search-input"
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            placeholder="Search thousands of organizations by name or EIN..." 
          />
        </div>
        
        {searchTerm && searchResults.length > 0 && (
          <div style={{ marginTop: '16px' }}>
            <table className="data-table">
              <thead><tr><th>Organization</th><th>State</th><th>Resilience</th><th>Latest YR</th></tr></thead>
              <tbody>
                {searchResults.map(org => (
                  <tr key={org.ein} onClick={() => onSelectOrg(org)}>
                    <td style={{ fontWeight: 600 }}>{org.name} <br/><span style={{ fontSize:'0.8rem', color:'var(--text-muted)'}}>EIN: {org.ein}</span></td>
                    <td>{org.state}</td>
                    <td>
                      <span className={`badge badge-${(org.resilience_label || 'Unknown').toLowerCase().replace(' ', '-')}`}>
                        {org.resilience_label || 'Unknown'}
                      </span>
                    </td>
                    <td>{org.latest_year}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      <div className="grid-2">
        <div className="glass-panel" style={{ padding: '24px' }}>
          <h2 style={{ marginBottom: '16px', display: 'flex', alignItems: 'center', gap: '8px' }}>
            <span style={{ color: 'var(--accent-teal)' }}>💎</span> Top Hidden Gems
          </h2>
          <p style={{ color: 'var(--text-secondary)', marginBottom: '16px', fontSize: '0.9rem' }}>
            Highly resilient organizations with strong program revenue autonomy.
          </p>
          <table className="data-table">
            <thead>
              <tr>
                <th>Organization</th>
                <th>Revenue</th>
                <th>Prog. Ratio</th>
              </tr>
            </thead>
            <tbody>
              {hiddenGems.map(org => (
                <tr key={org.ein} onClick={() => onSelectOrg(org)}>
                  <td style={{ fontWeight: 500 }}>{org.name}</td>
                  <td>{formatCurrency(org.latest_revenue)}</td>
                  <td style={{ color: 'var(--accent-teal)' }}>{formatPercent(org.program_revenue_ratio)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <div className="glass-panel" style={{ padding: '24px' }}>
          <h2 style={{ marginBottom: '16px', display: 'flex', alignItems: 'center', gap: '8px' }}>
            <span style={{ color: 'var(--accent-red)' }}>⚠️</span> Critical Funding Risk
          </h2>
          <p style={{ color: 'var(--text-secondary)', marginBottom: '16px', fontSize: '0.9rem' }}>
            Organizations highly dependent on grants with concentrated revenue streams.
          </p>
          <table className="data-table">
            <thead>
              <tr>
                <th>Organization</th>
                <th>Months Cash</th>
                <th>Shock Class</th>
              </tr>
            </thead>
            <tbody>
              {highRisk.map(org => (
                <tr key={org.ein} onClick={() => onSelectOrg(org)}>
                  <td style={{ fontWeight: 500 }}>{org.name}</td>
                  <td style={{ color: 'var(--accent-red)' }}>{org.months_of_cash != null ? org.months_of_cash.toFixed(1) + ' mo' : 'N/A'}</td>
                  <td style={{ fontSize: '0.8rem' }}>{org.shock_recovery_class}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

function OrgChart({ filings }) {
  const chartRef = useRef(null);
  const canvasRef = useRef(null);

  useEffect(() => {
    if (!canvasRef.current || !filings || filings.length === 0) return;
    
    // Reverse filings to go from oldest to newest for chart left-to-right
    const sorted = [...filings].sort((a,b) => (a.tax_prd_yr || 0) - (b.tax_prd_yr || 0));
    
    const labels = sorted.map(f => f.tax_prd_yr);
    const revenues = sorted.map(f => f.totrevenue != null ? f.totrevenue : null);
    const expenses = sorted.map(f => f.totfuncexpns != null ? f.totfuncexpns : null);

    if (chartRef.current) chartRef.current.destroy();

    const ctx = canvasRef.current.getContext('2d');
    
    // Gradients
    const revGrad = ctx.createLinearGradient(0,0,0,300);
    revGrad.addColorStop(0, 'rgba(0, 240, 255, 0.4)');
    revGrad.addColorStop(1, 'rgba(0, 240, 255, 0)');

    chartRef.current = new Chart(ctx, {
      type: 'line',
      data: {
        labels,
        datasets: [
          {
            label: 'Total Revenue',
            data: revenues,
            borderColor: '#00F0FF',
            backgroundColor: revGrad,
            borderWidth: 2,
            tension: 0.4,
            fill: true,
            pointBackgroundColor: '#00F0FF'
          },
          {
            label: 'Total Expenses',
            data: expenses,
            borderColor: '#FF3366',
            backgroundColor: 'transparent',
            borderWidth: 2,
            borderDash: [5, 5],
            tension: 0.4,
            pointBackgroundColor: '#FF3366'
          }
        ]
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        plugins: {
          legend: { labels: { color: '#9BA1A6' } },
        },
        scales: {
          y: { 
            grid: { color: 'rgba(255, 255, 255, 0.05)' }, 
            ticks: { color: '#9BA1A6', callback: (val) => '$' + (val/1e6).toFixed(1) + 'M' }
          },
          x: { 
            grid: { display: false }, 
            ticks: { color: '#9BA1A6' } 
          }
        }
      }
    });

    return () => { if (chartRef.current) chartRef.current.destroy(); };
  }, [filings]);

  return (
    <div className="chart-container">
      <canvas ref={canvasRef}></canvas>
    </div>
  );
}

function ShockSimulator({ org }) {
  const [shockType, setShockType] = useState('Revenue Loss');
  const [magnitude, setMagnitude] = useState(40);
  const [duration, setDuration] = useState(2);
  const chartRef = useRef(null);
  const canvasRef = useRef(null);

  // Baseline extraction from latest filing
  const baselineRev = org.latest_revenue || 0;
  const baselineExpenses = baselineRev * (1 - (org.operating_margin || 0));
  
  // Starting Net Assets derived from months_of_cash
  const monthlyExpenses = baselineExpenses / 12;
  const startingNetAssets = (org.months_of_cash || 0) * monthlyExpenses;

  // Run 5 year Simulation
  const labels = ['Current', 'Year 1', 'Year 2', 'Year 3', 'Year 4', 'Year 5'];
  const revData = [baselineRev];
  const expData = [baselineExpenses];
  const netAssetData = [startingNetAssets];

  let currentAssets = startingNetAssets;
  let exhaustedYear = null;

  for (let i = 1; i <= 5; i++) {
     let yearRev = baselineRev;
     let yearExp = baselineExpenses;

     if (i <= duration) {
        // Apply Shock
        if (shockType === 'Revenue Loss') yearRev = baselineRev * (1 - magnitude/100);
        else if (shockType === 'Grant Elimination') {
            const grantDep = org.grant_dependency || 0;
            yearRev = baselineRev - (baselineRev * grantDep * (magnitude/100));
        }
        else if (shockType === 'Expense Surge') yearExp = baselineExpenses * (1 + magnitude/100);
     } else {
        // Recovery Period (2 years)
        const totalRecoveryYears = 2;
        const yearsAfterShock = i - duration;
        
        let targetRev = baselineRev;
        let targetExp = baselineExpenses;
        
        if (yearsAfterShock <= totalRecoveryYears) {
           // Interpolate 
           const ratio = yearsAfterShock / totalRecoveryYears;
           if (shockType === 'Revenue Loss') {
              const shockRev = baselineRev * (1 - magnitude/100);
              yearRev = shockRev + ((baselineRev - shockRev) * ratio);
           } else if (shockType === 'Grant Elimination') {
              const grantDep = org.grant_dependency || 0;
              const shockRev = baselineRev - (baselineRev * grantDep * (magnitude/100));
              yearRev = shockRev + ((baselineRev - shockRev) * ratio);
           } else if (shockType === 'Expense Surge') {
              const shockExp = baselineExpenses * (1 + magnitude/100);
              yearExp = shockExp - ((shockExp - baselineExpenses) * ratio);
           }
        }
     }
     
     revData.push(yearRev);
     expData.push(yearExp);
     
     const netFlow = yearRev - yearExp;
     currentAssets += netFlow;
     
     if (currentAssets < 0 && exhaustedYear === null) {
        exhaustedYear = i;
        currentAssets = 0; // cannot go below 0 realistically, implies bankruptcy
     }
     netAssetData.push(currentAssets);
  }

  useEffect(() => {
    if (!canvasRef.current) return;
    const ctx = canvasRef.current.getContext('2d');
    if (chartRef.current) chartRef.current.destroy();

    // Determine max values for scaling
    // Math.max on array requires destructuring, which is fine for small arrays
    
    chartRef.current = new Chart(ctx, {
      type: 'line',
      data: {
        labels,
        datasets: [
          {
            label: 'Projected Net Assets',
            data: netAssetData,
            borderColor: '#00F0FF',
            backgroundColor: 'rgba(0, 240, 255, 0.1)',
            borderWidth: 3,
            fill: true,
            tension: 0.3
          },
          {
            label: 'Projected Revenue',
            data: revData,
            borderColor: '#4CAF50',
            borderWidth: 2,
            borderDash: [5,5],
            tension: 0.3
          },
          {
             label: 'Projected Expenses',
             data: expData,
             borderColor: '#FF3366',
             borderWidth: 2,
             borderDash: [5,5],
             tension: 0.3
          }
        ]
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        plugins: { legend: { labels: { color: '#9BA1A6' } } },
        scales: {
          y: { grid: { color: 'rgba(255, 255, 255, 0.05)' }, ticks: { color: '#9BA1A6', callback: (val) => '$' + (val/1e6).toFixed(1) + 'M' } },
          x: { grid: { display: false }, ticks: { color: '#9BA1A6' } }
        }
      }
    });
    return () => { if (chartRef.current) chartRef.current.destroy(); };
  }, [shockType, magnitude, duration, org]);

  const postShockCashMonths = (netAssetData[duration] / monthlyExpenses) || 0;
  
  return (
    <div className="grid-2">
       <div className="glass-panel" style={{ padding: '24px' }}>
          <h3>Shock Parameters</h3>
          <div style={{ marginTop: '20px', display: 'flex', flexDirection: 'column', gap: '20px' }}>
             <div>
                <label style={{ display: 'block', marginBottom: '8px', color: 'var(--text-secondary)' }}>Shock Type</label>
                <select 
                   value={shockType} 
                   onChange={(e) => setShockType(e.target.value)}
                   style={{ width: '100%', padding: '12px', background: 'rgba(255,255,255,0.05)', color: 'white', border: '1px solid rgba(255,255,255,0.1)', borderRadius: '8px', fontSize: '1rem' }}
                >
                   <option>Revenue Loss</option>
                   <option>Grant Elimination</option>
                   <option>Expense Surge</option>
                </select>
             </div>
             
             <div>
                <label style={{ display: 'block', marginBottom: '8px', color: 'var(--text-secondary)' }}>Magnitude ({magnitude}%)</label>
                <input 
                   type="range" min="10" max="80" step="5" value={magnitude}
                   onChange={e => setMagnitude(parseInt(e.target.value))}
                   style={{ width: '100%', accentColor: 'var(--accent-red)' }}
                />
             </div>

             <div>
                <label style={{ display: 'block', marginBottom: '8px', color: 'var(--text-secondary)' }}>Duration ({duration} Years)</label>
                <input 
                   type="range" min="1" max="3" step="1" value={duration}
                   onChange={e => setDuration(parseInt(e.target.value))}
                   style={{ width: '100%', accentColor: 'var(--accent-red)' }}
                />
             </div>
             
             <div style={{ background: 'rgba(255,255,255,0.03)', padding: '16px', borderRadius: '8px', marginTop: '16px' }}>
                <div style={{ fontSize: '0.8rem', color: 'var(--text-muted)', textTransform: 'uppercase' }}>Simulation Output</div>
                <div style={{ fontSize: '1.4rem', fontWeight: 600, color: exhaustedYear ? 'var(--accent-red)' : 'var(--accent-teal)', marginTop: '8px' }}>
                   {exhaustedYear ? `Runway Exhausted in Year ${exhaustedYear}` : 'Survives 5-Year Scenario'}
                </div>
                <div style={{ fontSize: '0.9rem', color: 'var(--text-secondary)', marginTop: '4px' }}>
                   Post-Shock Cash Reserve: {postShockCashMonths.toFixed(1)} months
                </div>
             </div>
          </div>
       </div>
       
       <div className="glass-panel" style={{ padding: '24px' }}>
          <h3>5-Year Recovery Curve</h3>
          <div style={{ height: '350px', marginTop: '20px' }}>
             <canvas ref={canvasRef}></canvas>
          </div>
       </div>
    </div>
  );
}

function OrganizationView({ org, onBack }) {
  const [activeTab, setActiveTab] = useState('overview');
  const [liveFilings, setLiveFilings] = useState(org ? (org.filings || []) : []);
  const [isFetching, setIsFetching] = useState(false);

  useEffect(() => {
    if (!org) return;
    
    // If the dataset only contains the single current year, pull down the history live
    if ((org.filings || []).length <= 1) {
      setIsFetching(true);
      const targetUrl = `https://projects.propublica.org/nonprofits/api/v2/organizations/${org.ein}.json`;
      fetch(`https://corsproxy.io/?${encodeURIComponent(targetUrl)}`)
        .then(res => res.json())
        .then(data => {
            if (data && data.filings_with_data) {
                const fetchedFilings = data.filings_with_data.map(f => ({
                    tax_prd_yr: f.tax_prd_yr,
                    totrevenue: f.totrevenue,
                    totfuncexpns: f.totfuncexpns
                }));
                
                const existingYears = new Set((org.filings || []).map(f => f.tax_prd_yr));
                const combined = [...(org.filings || [])];
                
                for (let f of fetchedFilings) {
                   if (!existingYears.has(f.tax_prd_yr)) {
                       combined.push(f);
                       existingYears.add(f.tax_prd_yr);
                   }
                }
                combined.sort((a,b) => a.tax_prd_yr - b.tax_prd_yr);
                setLiveFilings(combined);
            }
        })
        .catch(err => console.error("ProPublica fetch failed", err))
        .finally(() => setIsFetching(false));
    } else {
        setLiveFilings(org.filings);
    }
  }, [org]);

  if (!org) return null;

  return (
    <div className="animate-fade-in">
      <button className="back-btn" onClick={onBack}>← Back to Dashboard</button>
      
      <div className="org-header" style={{ marginBottom: '16px' }}>
        <div>
          <h1 className="page-title">{org.name}</h1>
          <div className="tag-list">
            <span className="tag">EIN: {org.ein}</span>
            <span className="tag">{org.city}, {org.state}</span>
            <span className="tag">NTEE: {org.ntee_code || 'Unknown'}</span>
            <span className="tag">Bucket: {org.size_bucket || 'Unknown'}</span>
          </div>
        </div>
        <div style={{ textAlign: 'right' }}>
          <span className={`badge badge-${(org.resilience_label || 'Unknown').toLowerCase().replace(' ', '-')}`} style={{ fontSize: '1rem', padding: '8px 16px' }}>
            ML Status: {org.resilience_label || 'Unknown'}
          </span>
        </div>
      </div>

      <div style={{ display: 'flex', gap: '16px', marginBottom: '24px', borderBottom: '1px solid rgba(255,255,255,0.1)', paddingBottom: '16px' }}>
         <button 
           onClick={() => setActiveTab('overview')}
           style={{ background: activeTab === 'overview' ? 'var(--accent-teal)' : 'transparent', color: activeTab === 'overview' ? 'black' : 'var(--text-secondary)', border: `1px solid ${activeTab === 'overview' ? 'var(--accent-teal)' : 'transparent'}`, padding: '8px 16px', borderRadius: '4px', cursor: 'pointer', fontWeight: 600, transition: 'all 0.2s' }}
         >
           Financial Overview
         </button>
         <button 
           onClick={() => setActiveTab('simulator')}
           style={{ background: activeTab === 'simulator' ? 'var(--accent-red)' : 'transparent', color: activeTab === 'simulator' ? 'white' : 'var(--text-secondary)', border: `1px solid ${activeTab === 'simulator' ? 'var(--accent-red)' : 'transparent'}`, padding: '8px 16px', borderRadius: '4px', cursor: 'pointer', fontWeight: 600, transition: 'all 0.2s' }}
         >
           Shock Simulator
         </button>
      </div>

      <div className="grid-4" style={{ marginBottom: '24px' }}>
        <StatCard 
          label="Total Revenue" 
          value={formatCurrency(org.latest_revenue)}
        />
        <StatCard 
          label="Operating Margin" 
          value={formatPercent(org.operating_margin)}
          trend="vs Industry Average"
          isPositive={org.operating_margin != null ? org.operating_margin >= 0 : false}
        />
        <StatCard 
          label="Cash Runway" 
          value={org.months_of_cash != null ? org.months_of_cash.toFixed(1) : 'N/A'}
          suffix={org.months_of_cash != null ? ' mo' : ''}
          isPositive={org.months_of_cash != null ? org.months_of_cash > 6 : false}
        />
        <StatCard 
          label="Resilience Score" 
          value={org.resilience_score != null ? org.resilience_score.toFixed(1) : 'N/A'}
          trend="ML Predicted Prob."
          isPositive={org.resilience_score != null ? org.resilience_score > 50 : false}
        />
      </div>

      {activeTab === 'overview' ? (
        <div className="grid-2">
          <div className="glass-panel" style={{ padding: '24px' }}>
            <h3 style={{ marginBottom: '16px', display: 'flex', alignItems: 'center' }}>
               7-Year Financial Trend
               {isFetching && <span style={{ fontSize: '0.8rem', color: 'var(--accent-teal)', marginLeft: '12px', fontWeight: 'normal', animation: 'pulse 2s infinite' }}>Fetching API history...</span>}
            </h3>
            <OrgChart filings={liveFilings} />
          </div>

          <div className="glass-panel" style={{ padding: '24px' }}>
            <h3 style={{ marginBottom: '16px' }}>Benchmarking & Risk</h3>
            
            <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
              <div style={{ background: 'rgba(255,255,255,0.03)', padding: '16px', borderRadius: '8px' }}>
                <div style={{ fontSize: '0.8rem', color: 'var(--text-muted)', textTransform: 'uppercase' }}>Peer Benchmark Tier</div>
                <div style={{ fontSize: '1.4rem', fontWeight: 600, color: 'var(--accent-gold)' }}>{org.benchmark_tier || 'N/A'}</div>
                <div style={{ fontSize: '0.9rem', color: 'var(--text-secondary)', marginTop: '4px' }}>Among peers in {org.peer_group}</div>
              </div>

              <div style={{ background: 'rgba(255,255,255,0.03)', padding: '16px', borderRadius: '8px' }}>
                <div style={{ fontSize: '0.8rem', color: 'var(--text-muted)', textTransform: 'uppercase' }}>Income Diversity (HHI)</div>
                <div style={{ fontSize: '1.4rem', fontWeight: 600, color: 'var(--accent-purple)' }}>{org.income_diversity || 'Unknown'}</div>
                <div style={{ fontSize: '0.9rem', color: 'var(--text-secondary)', marginTop: '4px' }}>Dominant Stream: {org.dominant_stream || 'Unknown'}<br/>Grant Dependency: {formatPercent(org.grant_dependency)}</div>
              </div>
              
              <div style={{ background: 'rgba(255,255,255,0.03)', padding: '16px', borderRadius: '8px' }}>
                <div style={{ fontSize: '0.8rem', color: 'var(--text-muted)', textTransform: 'uppercase' }}>Shock Recovery Class</div>
                <div style={{ fontSize: '1.2rem', fontWeight: 600, color: 'var(--accent-red)', lineHeight: '1.2' }}>{org.shock_recovery_class || 'Unknown'}</div>
                <div style={{ fontSize: '0.9rem', color: 'var(--text-secondary)', marginTop: '4px' }}>Simulated ML Funding Shock</div>
              </div>
            </div>
          </div>
        </div>
      ) : (
        <ShockSimulator org={org} />
      )}
    </div>
  );
}

function App() {
  const [db, setDb] = useState(null);
  const [selectedOrg, setSelectedOrg] = useState(null);

  useEffect(() => {
    fetch('dataset.json')
      .then(res => res.json())
      .then(data => {
        setDb(data);
      })
      .catch(err => console.error("Could not load database", err));
  }, []);

  if (!db) {
    return (
      <div style={{ display: 'flex', height: '100vh', alignItems: 'center', justifyContent: 'center' }}>
        <h2 className="animate-fade-in" style={{ color: 'var(--accent-teal)' }}>Loading Datasets...</h2>
      </div>
    );
  }

  return (
    <div>
      <nav className="navbar">
        <div className="nav-brand" onClick={() => setSelectedOrg(null)}>
          <div className="logo-icon">FF</div>
          <div className="nav-title">FundFlow</div>
        </div>
      </nav>
      
      <main className="app-container">
        {selectedOrg ? (
          <OrganizationView org={selectedOrg} onBack={() => setSelectedOrg(null)} />
        ) : (
          <GlobalDashboard db={db} onSelectOrg={setSelectedOrg} />
        )}
      </main>
    </div>
  );
}

const root = ReactDOM.createRoot(document.getElementById('root'));
root.render(<App />);
