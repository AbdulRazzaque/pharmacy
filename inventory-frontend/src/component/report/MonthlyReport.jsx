import React from 'react';
import {
  Search,
  RefreshCw,
  Trash2,
  Printer,
  FileSpreadsheet,
  Download,
  FileText,
  Package,
  UserCheck,
  Stethoscope,
  MapPin,
  Calendar,
} from 'lucide-react';
import moment from 'moment';

const PAGE_SIZES = [10, 25, 50, 100];

const MONTHS = [
  { value: 1, label: 'January' },
  { value: 2, label: 'February' },
  { value: 3, label: 'March' },
  { value: 4, label: 'April' },
  { value: 5, label: 'May' },
  { value: 6, label: 'June' },
  { value: 7, label: 'July' },
  { value: 8, label: 'August' },
  { value: 9, label: 'September' },
  { value: 10, label: 'October' },
  { value: 11, label: 'November' },
  { value: 12, label: 'December' },
];

const MonthlyReport = ({
  locations = [],
  locationIds = [],
  setLocationIds,
  trainer = '',
  setTrainer,
  trainerOptions = [],
  doctor = '',
  setDoctor,
  month,
  setMonth,
  year,
  setYear,
  yearOptions = [],
  loading,
  onFetch,
  onClearFilters,
  hasFetched,
  data = [],
  kpis = { count: 0, totalQty: 0, totalVal: 0 },
  tableSearch = '',
  setTableSearch,
  filtered = [],
  paginated = [],
  page = 1,
  setPage,
  pageSize = 25,
  setPageSize,
  onExportExcel,
  onExportPdf,
  onPrint,
}) => {
  const [locationSearch, setLocationSearch] = React.useState('');

  const locationsFiltered = React.useMemo(() => {
    const q = (locationSearch || '').trim().toLowerCase();
    if (!q) return locations;
    return locations.filter((loc) =>
      (loc.name || '').toLowerCase().includes(q) ||
      (loc.doctorName || '').toLowerCase().includes(q) ||
      (loc.trainerName || '').toLowerCase().includes(q)
    );
  }, [locations, locationSearch]);

  const toggleLocation = (locId) => {
    const has = locationIds.includes(locId);
    setLocationIds(has ? locationIds.filter((id) => id !== locId) : [...locationIds, locId]);
  };

  const totalPages = (len, size) => Math.max(1, Math.ceil(len / size));
  const emptyMessage = !hasFetched
    ? 'Select month and year, choose optional filters, then click Apply filters'
    : data.length === 0
      ? 'No products issued for the selected period / filters'
      : null;

  const selectedMonthLabel = MONTHS.find((m) => String(m.value) === String(month))?.label || '';
  const selectedTrainerLabel = trainer
    ? (trainerOptions.find((t) => t.name === trainer || t._id === trainer)?.name || trainer)
    : 'All Trainers';
  const selectedLocationNames = locationIds.length > 0 && locationIds.length < locations.length
    ? locations.filter((l) => locationIds.includes(l._id)).map((l) => l.name).join(', ')
    : 'All Locations';

  return (
    <>
      <div className="reports-card">
        <div className="reports-card-header">
          <div className="reports-card-title">Monthly Report Filters</div>
        </div>
        <div className="reports-card-content">
          <div className="reports-form-grid">
            <div className="reports-field">
              <label>Month *</label>
              <select
                className="reports-select"
                value={month}
                onChange={(e) => setMonth(e.target.value)}
              >
                <option value="">Select month</option>
                {MONTHS.map((m) => (
                  <option key={m.value} value={m.value}>
                    {m.label}
                  </option>
                ))}
              </select>
            </div>

            <div className="reports-field">
              <label>Year *</label>
              <select
                className="reports-select"
                value={year}
                onChange={(e) => setYear(e.target.value)}
              >
                <option value="">Select year</option>
                {yearOptions.map((y) => (
                  <option key={y} value={y}>
                    {y}
                  </option>
                ))}
              </select>
            </div>

            <div className="reports-field">
              <label>Trainer Name</label>
              <select
                className="reports-select"
                value={trainer}
                onChange={(e) => setTrainer(e.target.value)}
              >
                <option value="">All Trainers</option>
                {trainerOptions.map((opt) => (
                  <option key={opt.name || opt._id} value={opt.name}>
                    {opt.name}
                  </option>
                ))}
              </select>
            </div>

            <div className="reports-field">
              <label>Doctor Name</label>
              <input
                type="text"
                className="reports-input"
                placeholder="Doctor / Veterinarian"
                value={doctor}
                onChange={(e) => setDoctor(e.target.value)}
              />
            </div>
          </div>

          {/* Location MultiSelect Checkbox Section */}
          <div className="reports-product-section" style={{ marginTop: '1.25rem' }}>
            <div className="reports-product-section-title">
              <Package size={20} />
              Filter by location(s) — select one or more (Optional, defaults to all)
            </div>
            <div className="reports-product-toolbar">
              <div className="reports-product-search-wrap">
                <Search className="search-icon" size={18} />
                <input
                  type="text"
                  placeholder="Search locations, doctors, or trainers..."
                  value={locationSearch}
                  onChange={(e) => setLocationSearch(e.target.value)}
                />
              </div>
              <div className="reports-product-actions">
                <button
                  type="button"
                  className="btn-sm btn-select-all"
                  onClick={() => setLocationIds(locations.map((loc) => loc._id))}
                >
                  Select all
                </button>
                <button
                  type="button"
                  className="btn-sm btn-clear"
                  onClick={() => setLocationIds([])}
                >
                  Clear selection
                </button>
              </div>
            </div>
            <div className="reports-product-list-box">
              {locations.length === 0 ? (
                <div className="reports-product-empty">Loading locations…</div>
              ) : locationsFiltered.length === 0 ? (
                <div className="reports-product-empty">No locations match your search.</div>
              ) : (
                locationsFiltered.map((loc) => (
                  <label key={loc._id} className="reports-product-item">
                    <input
                      type="checkbox"
                      checked={(locationIds || []).includes(loc._id)}
                      onChange={() => toggleLocation(loc._id)}
                    />
                    <span>
                      <strong className="text-slate-800">{loc.name}</strong>
                      {loc.doctorName && (
                        <span className="text-slate-500 text-xs ml-2">
                          (Dr: {loc.doctorName})
                        </span>
                      )}
                      {loc.trainerName && (
                        <span className="text-blue-600 text-xs ml-2 font-medium">
                          (Trainer: {loc.trainerName})
                        </span>
                      )}
                    </span>
                  </label>
                ))
              )}
            </div>
          </div>

          <div className="reports-actions" style={{ marginTop: '1.25rem' }}>
            <button type="button" className="reports-btn-primary" onClick={onFetch} disabled={loading}>
              {loading ? <RefreshCw className="h-4 w-4 reports-icon-spin" /> : <Search className="h-4 w-4" />}
              {loading ? 'Loading...' : 'Apply filters'}
            </button>
            <button type="button" className="reports-btn-secondary" onClick={onClearFilters}>
              <Trash2 className="h-4 w-4" /> Clear filters
            </button>
            {data.length > 0 && (
              <>
                <button type="button" className="reports-btn-secondary" onClick={onExportExcel}>
                  <FileSpreadsheet className="h-4 w-4" /> Excel
                </button>
                <button type="button" className="reports-btn-secondary" onClick={onExportPdf}>
                  <Download className="h-4 w-4" /> PDF
                </button>
                <button type="button" className="reports-btn-secondary" onClick={onPrint}>
                  <Printer className="h-4 w-4" /> Print
                </button>
              </>
            )}
          </div>
        </div>
      </div>

      {loading && (
        <div className="reports-loading-overlay">
          <RefreshCw className="reports-spinner" />
          <span>Loading monthly report...</span>
        </div>
      )}

      {emptyMessage && !loading && (
        <div className="reports-card">
          <div className="reports-empty">
            <FileText />
            <p>{emptyMessage}</p>
          </div>
        </div>
      )}

      {data.length > 0 && !loading && (
        <>
          {/* Active Filter Summary Badges */}
          <div
            className="reports-card"
            style={{
              padding: '0.85rem 1.25rem',
              marginBottom: '1rem',
              background: '#f8fafc',
              border: '1px solid #e2e8f0',
              borderRadius: '12px',
            }}
          >
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: '1rem', alignItems: 'center', fontSize: '0.85rem' }}>
              <span style={{ fontWeight: 600, color: '#334155' }}>Active Summary:</span>
              <span style={{ display: 'inline-flex', alignItems: 'center', gap: '0.35rem', color: '#1e40af', background: '#eff6ff', padding: '0.25rem 0.6rem', borderRadius: '6px' }}>
                <Calendar size={14} /> {selectedMonthLabel} {year}
              </span>
              <span style={{ display: 'inline-flex', alignItems: 'center', gap: '0.35rem', color: '#0f766e', background: '#f0fdfa', padding: '0.25rem 0.6rem', borderRadius: '6px' }}>
                <MapPin size={14} /> Location: {selectedLocationNames}
              </span>
              <span style={{ display: 'inline-flex', alignItems: 'center', gap: '0.35rem', color: '#7c2d12', background: '#fff7ed', padding: '0.25rem 0.6rem', borderRadius: '6px' }}>
                <UserCheck size={14} /> Trainer: <strong>{selectedTrainerLabel}</strong>
              </span>
              {doctor && (
                <span style={{ display: 'inline-flex', alignItems: 'center', gap: '0.35rem', color: '#4338ca', background: '#eef2ff', padding: '0.25rem 0.6rem', borderRadius: '6px' }}>
                  <Stethoscope size={14} /> Doctor: {doctor}
                </span>
              )}
            </div>
          </div>

          <div className="reports-kpi-grid">
            <div className="reports-kpi-card">
              <div className="reports-kpi-label">Line items</div>
              <div className="reports-kpi-value">{kpis.count}</div>
            </div>
            <div className="reports-kpi-card green">
              <div className="reports-kpi-label">Total quantity</div>
              <div className="reports-kpi-value">{kpis.totalQty.toLocaleString()}</div>
            </div>
            <div className="reports-kpi-card blue">
              <div className="reports-kpi-label">Grand total</div>
              <div className="reports-kpi-value">{kpis.totalVal.toFixed(2)}</div>
            </div>
          </div>

          <div className="reports-card">
            <div className="reports-card-header">
              <div className="reports-card-title">Issued Products</div>
              <div className="reports-table-toolbar">
                <div className="reports-search-wrap">
                  <Search />
                  <input
                    type="text"
                    placeholder="Search by product, location, doctor, trainer, doc no..."
                    value={tableSearch}
                    onChange={(e) => {
                      setTableSearch(e.target.value);
                      setPage(1);
                    }}
                  />
                </div>
                <span className="text-sm text-slate-500">{filtered.length} rows</span>
              </div>
            </div>
            <div className="reports-card-content">
              <div className="reports-table-wrap">
                <table className="reports-table">
                  <thead>
                    <tr>
                      <th>Date</th>
                      <th>Doc No</th>
                      <th>Location</th>
                      <th>Doctor Name</th>
                      <th>Trainer Name</th>
                      <th>Product Name</th>
                      <th>Company</th>
                      <th>Unit / Size</th>
                      <th className="text-right">Qty</th>
                      <th className="text-right">Rate</th>
                      <th className="text-right">Total</th>
                    </tr>
                  </thead>
                  <tbody>
                    {paginated.map((row, idx) => (
                      <tr key={row._id || idx}>
                        <td>{row.date ? moment(row.date).format('DD/MM/YYYY') : '-'}</td>
                        <td>{row.docNo ? `#${row.docNo}` : '-'}</td>
                        <td className="font-medium">{row.locationName || row.location?.name || '-'}</td>
                        <td>{row.doctorName || row.location?.doctorName || '-'}</td>
                        <td>
                          <span
                            style={{
                              display: 'inline-block',
                              padding: '0.2rem 0.55rem',
                              borderRadius: '6px',
                              background: row.trainerName ? '#f0fdf4' : '#f8fafc',
                              color: row.trainerName ? '#166534' : '#64748b',
                              fontWeight: row.trainerName ? 600 : 400,
                              border: row.trainerName ? '1px solid #bbf7d0' : '1px solid #e2e8f0',
                              fontSize: '0.8125rem',
                            }}
                          >
                            {row.trainerName || row.location?.trainerName || '-'}
                          </span>
                        </td>
                        <td className="font-medium text-slate-900">{row.productName || '-'}</td>
                        <td>{row.companyName || '-'}</td>
                        <td>{row.size || row.unit || '-'}</td>
                        <td className="text-right font-medium">{row.quantity ?? 0}</td>
                        <td className="text-right">{(row.rate ?? 0).toFixed(2)}</td>
                        <td className="text-right font-bold text-slate-900">
                          {(row.totalAmount ?? 0).toFixed(2)}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              {filtered.length > pageSize && (
                <div className="reports-pagination">
                  <div>
                    <span className="text-sm text-slate-500 mr-2">Rows per page:</span>
                    <select
                      value={pageSize}
                      onChange={(e) => {
                        setPageSize(Number(e.target.value));
                        setPage(1);
                      }}
                    >
                      {PAGE_SIZES.map((n) => (
                        <option key={n} value={n}>
                          {n}
                        </option>
                      ))}
                    </select>
                  </div>
                  <div className="reports-pagination-btns">
                    <button type="button" disabled={page <= 1} onClick={() => setPage((p) => p - 1)}>
                      Prev
                    </button>
                    <span className="flex items-center px-2 text-sm">
                      Page {page} of {totalPages(filtered.length, pageSize)}
                    </span>
                    <button
                      type="button"
                      disabled={page >= totalPages(filtered.length, pageSize)}
                      onClick={() => setPage((p) => p + 1)}
                    >
                      Next
                    </button>
                  </div>
                </div>
              )}
            </div>
          </div>
        </>
      )}
    </>
  );
};

export default MonthlyReport;
