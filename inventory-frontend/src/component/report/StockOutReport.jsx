import React from 'react';
import {
  Search,
  RefreshCw,
  Trash2,
  Printer,
  Package,
  FileSpreadsheet,
  Download,
} from 'lucide-react';
import moment from 'moment';


const PAGE_SIZES = [10, 25, 50, 100];
const StockOutReport = ({
  datePresets,
  applyDatePreset,
  filters,
  setFilters,
  productSearch,
  setProductSearch,
  productsFiltered,
  products,
  getProductName,
  toggleProduct,
  locations = [],
  loading,
  onFetch,
  onClearFilters,
  data,
  kpis,
  tableSearch,
  setTableSearch,
  filtered,
  paginated,
  page,
  setPage,
  pageSize,
  setPageSize,
  onExportExcel,
  onExportPdf,
  onPrint,
  isAdmin,
}) => {
  const totalPages = (len, size) => Math.max(1, Math.ceil(len / size));

 

  return (
    <>
      <div className="reports-card">
        <div className="reports-card-header">
          <div className="reports-card-title">Filters</div>
        </div>
        <div className="reports-card-content">
          <div className="reports-presets">
            {datePresets.map((p) => (
              <button key={p.label} type="button" className="reports-preset-btn" onClick={() => applyDatePreset(p)}>
                {p.label}
              </button>
            ))}
          </div>
          <div className="reports-form-grid">
            <div className="reports-field">
              <label>From date</label>
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
              <label>To date</label>
              <input
                type="date"
                className="reports-input"
                value={filters.endDate || ''}
                onChange={(e) =>
                  setFilters((f) => ({ ...f, endDate: e.target.value }))
                }
              />
            </div>
            <div className="reports-field">
              <label>Location</label>
              <select className="reports-select" value={filters.locationId} onChange={(e) => setFilters((f) => ({ ...f, locationId: e.target.value }))}>
                <option value="">All locations</option>
                {locations.map((loc) => <option key={loc._id} value={loc._id}>{loc.name} {loc.doctorName ? `- ${loc.doctorName}` : ''}</option>)}
              </select>
            </div>
            <div className="reports-field">
              <label>Doctor</label>
              <input type="text" className="reports-input" placeholder="Doctor name" value={filters.doctorName} onChange={(e) => setFilters((f) => ({ ...f, doctorName: e.target.value }))} />
            </div>
            <div className="reports-field">
              <label>Document No</label>
              <input type="text" className="reports-input" placeholder="Doc No" value={filters.docNo || ''} onChange={(e) => setFilters((f) => ({ ...f, docNo: e.target.value }))} />
            </div>
          </div>

          <div className="reports-product-section">
            <div className="reports-product-section-title">
              <Package size={20} />
              Filter by product name(s) — select one or more
            </div>
            <div className="reports-product-toolbar">
              <div className="reports-product-search-wrap">
                <Search className="search-icon" size={18} />
                <input
                  type="text"
                  placeholder="Search products..."
                  value={productSearch}
                  onChange={(e) => setProductSearch(e.target.value)}
                />
              </div>
              <div className="reports-product-actions">
                <button type="button" className="btn-sm btn-select-all" onClick={() => setFilters((f) => ({ ...f, productIds: products.map((p) => p._id) }))}>
                  Select all
                </button>
                <button type="button" className="btn-sm btn-clear" onClick={() => setFilters((f) => ({ ...f, productIds: [] }))}>
                  Clear selection
                </button>
              </div>
            </div>
            <div className="reports-product-list-box">
              {products.length === 0 ? (
                <div className="reports-product-empty">Loading products… Add products in Dashboard if the list is empty.</div>
              ) : productsFiltered.length === 0 ? (
                <div className="reports-product-empty">No products match your search. Try a different term.</div>
              ) : (
                productsFiltered.map((p) => (
                  <label key={p._id} className="reports-product-item">
                    <input
                      type="checkbox"
                      checked={(filters.productIds || []).includes(p._id)}
                      onChange={() => toggleProduct(p._id)}
                    />
                    <span>{getProductName(p)}</span>
                  </label>
                ))
              )}
            </div>
          </div>
          <div className="reports-actions">
            <button type="button" className="reports-btn-primary" onClick={onFetch} disabled={loading}>
              {loading ? <RefreshCw className="h-4 w-4 reports-icon-spin" /> : <Search className="h-4 w-4" />}
              {loading ? 'Loading...' : 'Apply filters'}
            </button>
            <button type="button" className="reports-btn-secondary" onClick={onClearFilters}><Trash2 className="h-4 w-4" /> Clear filters</button>
            {data.length > 0 && (
              <>
                <button type="button" className="reports-btn-secondary" onClick={onExportExcel}><FileSpreadsheet className="h-4 w-4" /> Excel</button>
                <button type="button" className="reports-btn-secondary" onClick={onExportPdf}><Download className="h-4 w-4" /> PDF</button>
                <button type="button" className="reports-btn-secondary" onClick={onPrint}><Printer className="h-4 w-4" /> Print</button>
              </>
            )}
          </div>
        </div>
      </div>

      {data.length > 0 && (
        <>
          <div className="reports-kpi-grid">
            <div className="reports-kpi-card">
              <div className="reports-kpi-label">Total records</div>
              <div className="reports-kpi-value">{kpis.count}</div>
            </div>
            <div className="reports-kpi-card red">
              <div className="reports-kpi-label">Total quantity</div>
              <div className="reports-kpi-value">{kpis.totalQty.toLocaleString()}</div>
            </div>
            {isAdmin && (
              <div className="reports-kpi-card blue">
                <div className="reports-kpi-label">Total value</div>
                <div className="reports-kpi-value">${kpis.totalVal.toFixed(2)}</div>
              </div>
            )}
          </div>


          <div className="reports-card">
            <div className="reports-card-header">
              <div className="reports-card-title">Data table</div>
              <div className="reports-table-toolbar">
                <div className="reports-search-wrap">
                  <Search />
                  <input type="text" placeholder="Search table..." value={tableSearch} onChange={(e) => { setTableSearch(e.target.value); setPage(1); }} />
                </div>
                <span className="text-sm text-slate-500">{filtered.length} rows</span>
              </div>
            </div>
            <div className="reports-card-content">
              <div className="reports-table-wrap">
                <table className="reports-table">
                  <thead>
                    <tr>
                      <th>No</th><th>Date</th><th>Doc No</th><th>Product Name</th><th>Company</th><th>Unit</th><th>Location</th><th>Doctor</th><th className="text-right">Qty</th>{isAdmin && <th className="text-right">Price</th>}{isAdmin && <th className="text-right">Total</th>}
                    </tr>
                  </thead>
                  <tbody>
                    {paginated.map((row, i) => {
                      const total = (row.quantity ?? 0) * (row.sellingPrice ?? 0);
                      const idx = (page - 1) * pageSize + i + 1;
                      return (
                        <tr key={row._id || i}>
                          <td>{idx}</td>
                          <td>{row.date ? moment(row.date).format('DD/MM/YYYY') : (row.createdAt ? moment(row.createdAt).format('DD/MM/YYYY') : '-')}</td>
                          <td>{row.docNo ?? '-'}</td>
                          <td>{row.productId?.name || '-'}</td>
                          <td>{row.productId?.companyName || '-'}</td>
                          <td>{row.productId?.unit || '-'}</td>
                          <td>{row.location?.name || '-'}</td>
                          <td>{row.location?.doctorName || '-'}</td>
                          <td className="text-right">{row.quantity ?? 0}</td>
                          {isAdmin && <td className="text-right">{(row.sellingPrice ?? 0).toFixed(2)}</td>}
                          {isAdmin && <td className="text-right">{total.toFixed(2)}</td>}
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
              {filtered.length > pageSize && (
                <div className="reports-pagination">
                  <div>
                    <span className="text-sm text-slate-500 mr-2">Rows per page:</span>
                    <select value={pageSize} onChange={(e) => { setPageSize(Number(e.target.value)); setPage(1); }}>
                      {PAGE_SIZES.map((n) => <option key={n} value={n}>{n}</option>)}
                    </select>
                  </div>
                  <div className="reports-pagination-btns">
                    <button type="button" disabled={page <= 1} onClick={() => setPage((p) => p - 1)}>Prev</button>
                    <span className="flex items-center px-2 text-sm">Page {page} of {totalPages(filtered.length, pageSize)}</span>
                    <button type="button" disabled={page >= totalPages(filtered.length, pageSize)} onClick={() => setPage((p) => p + 1)}>Next</button>
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

export default StockOutReport;
