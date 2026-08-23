import React, { useState, useMemo } from 'react';
import {
  Search,
  RefreshCw,
  Trash2,
  Printer,
  FileSpreadsheet,
  Download,
  FileText,
  Package
} from 'lucide-react';

const SummaryReport = ({
  locations = [],
  filters,
  setFilters,
  loading,
  onFetch,
  onClearFilters,
  hasFetched,
  data,
  grandTotalSum,
  onExportExcel,
  onExportPdf,
  onPrint,
}) => {
  const [locationSearch, setLocationSearch] = useState('');

  const locationsFiltered = useMemo(() => {
    const q = (locationSearch || '').trim().toLowerCase();
    if (!q) return locations;
    return locations.filter((loc) =>
      (loc.name || '').toLowerCase().includes(q) ||
      (loc.doctorName || '').toLowerCase().includes(q)
    );
  }, [locations, locationSearch]);

  const toggleLocation = (locId) => {
    setFilters((f) => {
      const ids = f.locationId || [];
      const has = ids.includes(locId);
      return { ...f, locationId: has ? ids.filter((id) => id !== locId) : [...ids, locId] };
    });
  };

  const totalQuantitySum = useMemo(
    () => data.reduce((s, r) => s + (r.totalQuantity ?? 0), 0),
    [data]
  );

  const emptyMessage = !hasFetched
    ? 'Select from date, to date, and location(s), then click Apply'
    : data.length === 0
      ? 'No stock-out data found for the selected period'
      : null;

  return (
    <>
      <div className="reports-card">
        <div className="reports-card-header">
          <div className="reports-card-title">Summary Report</div>
        </div>
        <div className="reports-card-content">
          <div className="reports-form-grid">
            <div className="reports-field">
              <label>From date *</label>
              <input
                type="date"
                className="reports-input"
                value={filters.startDate || ''}
                onChange={(e) =>
                  setFilters((f) => ({ ...f, startDate: e.target.value }))
                }
              />
            </div>
            <div className="reports-field">
              <label>To date *</label>
              <input
                type="date"
                className="reports-input"
                value={filters.endDate || ''}
                onChange={(e) =>
                  setFilters((f) => ({ ...f, endDate: e.target.value }))
                }
              />
            </div>
          </div>

          {/* Location MultiSelect Checkbox Section */}
          <div className="reports-product-section" style={{ marginTop: '1.25rem' }}>
            <div className="reports-product-section-title">
              <Package size={20} />
              Filter by location(s) — select one or more
            </div>
            <div className="reports-product-toolbar">
              <div className="reports-product-search-wrap">
                <Search className="search-icon" size={18} />
                <input
                  type="text"
                  placeholder="Search locations..."
                  value={locationSearch}
                  onChange={(e) => setLocationSearch(e.target.value)}
                />
              </div>
              <div className="reports-product-actions">
                <button
                  type="button"
                  className="btn-sm btn-select-all"
                  onClick={() => setFilters((f) => ({ ...f, locationId: locations.map((loc) => loc._id) }))}
                >
                  Select all
                </button>
                <button
                  type="button"
                  className="btn-sm btn-clear"
                  onClick={() => setFilters((f) => ({ ...f, locationId: [] }))}
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
                      checked={(filters.locationId || []).includes(loc._id)}
                      onChange={() => toggleLocation(loc._id)}
                    />
                    <span>{loc.name} {loc.doctorName ? `- ${loc.doctorName}` : ''}</span>
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
          <span>Loading summary report...</span>
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
          <div className="reports-kpi-grid">
            <div className="reports-kpi-card blue">
              <div className="reports-kpi-label">Combined grand total</div>
              <div className="reports-kpi-value">${grandTotalSum.toFixed(2)}</div>
            </div>
            <div className="reports-kpi-card green">
              <div className="reports-kpi-label">Total Quantity Issued</div>
              <div className="reports-kpi-value">{totalQuantitySum}</div>
            </div>
          </div>

          <div className="reports-card">
            <div className="reports-card-header">
              <div className="reports-card-title">Location totals</div>
            </div>
            <div className="reports-card-content">
              <div className="reports-table-wrap">
                <table className="reports-table">
                  <thead>
                    <tr>
                      <th>Location</th>
                      <th className="text-right">Total Quantity</th>
                      <th className="text-right">Grand Total</th>
                    </tr>
                  </thead>
                  <tbody>
                    {data.map((row) => (
                      <tr key={row.locationId || row.locationName}>
                        <td className="font-medium">
                          {row.locationName || '-'}
                          {row.doctorName && <span className="text-xs text-muted-foreground ml-2">({row.doctorName})</span>}
                        </td>
                        <td className="text-right font-medium">{row.totalQuantity ?? 0}</td>
                        <td className="text-right font-medium">${(row.grandTotal ?? 0).toFixed(2)}</td>
                      </tr>
                    ))}
                  </tbody>
                  <tfoot>
                    <tr style={{ backgroundColor: 'rgba(0,0,0,0.04)', fontWeight: 'bold' }}>
                      <td>Total</td>
                      <td className="text-right">{totalQuantitySum}</td>
                      <td className="text-right">${grandTotalSum.toFixed(2)}</td>
                    </tr>
                  </tfoot>
                </table>
              </div>
            </div>
          </div>
        </>
      )}
    </>
  );
};

export default SummaryReport;
