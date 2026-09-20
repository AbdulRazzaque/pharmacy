import React from 'react';
import axios from 'axios';
import { Edit, Save, Search, RefreshCw, Trash2, X, Package } from 'lucide-react';
import moment from 'moment';
import { getToken } from '../../utils/auth';

const PAGE_SIZES = [10, 25, 50, 100];

const StockAdjustmentHistoryReport = ({
  filters,
  setFilters,
  products,
  loading,
  onFetch,
  onClearFilters,
  data,
  filtered,
  paginated,
  page,
  setPage,
  pageSize,
  setPageSize
}) => {
  const totalPages = (len, size) => Math.max(1, Math.ceil(len / size));
  const [editingId, setEditingId] = React.useState(null);
  const [editForm, setEditForm] = React.useState({});
  const [saving, setSaving] = React.useState(false);
  const accessToken = getToken();

  const [productSearch, setProductSearch] = React.useState('');

  const productsFiltered = React.useMemo(() => {
    const q = (productSearch || '').trim().toLowerCase();
    if (!q) return products;
    return products.filter((p) => {
      const name = p.name || '';
      const comp = p.companyName || '';
      return name.toLowerCase().includes(q) || comp.toLowerCase().includes(q);
    });
  }, [products, productSearch]);

  const toggleProduct = (productId) => {
    setFilters((f) => {
      const ids = f.productId || [];
      const has = ids.includes(productId);
      return { ...f, productId: has ? ids.filter((id) => id !== productId) : [...ids, productId] };
    });
  };

  const handleSelectAllProducts = () => {
    setFilters((f) => ({ ...f, productId: products.map((p) => p._id) }));
  };

  const handleClearAllProducts = () => {
    setFilters((f) => ({ ...f, productId: [] }));
  };

  const getProductDisplayLabel = (p) => {
    const name = p.name || '';
    const comp = p.companyName ? ` (${p.companyName})` : '';
    return `${name}${comp}`;
  };

  const getProductRequiresExpiry = (productId) => {
    const product = products.find((p) => String(p._id) === String(productId));
    return product ? product.requiresExpiry !== false : true;
  };

  const beginEdit = (row) => {
    const requiresExpiry = getProductRequiresExpiry(row.productId);
    setEditingId(row._id);
    setEditForm({
      documentId: row.documentId,
      itemIndex: row.itemIndex,
      quantityDelta: row.adjustedQuantity || 0,
      expiry: row.expiry ? moment(row.expiry).format('YYYY-MM-DD') : '',
      reason: row.reason || row.note || '',
      price: row.price || 0,
      requiresExpiry
    });
  };

  const cancelEdit = () => {
    setEditingId(null);
    setEditForm({});
  };

  const saveEdit = () => {
    if (editForm.requiresExpiry && !editForm.expiry) {
      window.alert('Expiry Date is required');
      return;
    }
    if (!Number(editForm.quantityDelta)) {
      window.alert('Quantity must be a non-zero number');
      return;
    }
    setSaving(true);
    axios.put(
      `${process.env.REACT_APP_DEVELOPMENT}/api/stockAdjustment/updateAdjustmentItem`,
      {
        ...editForm,
        expiry: editForm.requiresExpiry ? editForm.expiry : null
      },
      { headers: { token: accessToken } }
    )
      .then(() => {
        setSaving(false);
        cancelEdit();
        onFetch();
      })
      .catch((err) => {
        setSaving(false);
        window.alert(err.response?.data?.result || err.response?.data?.error || err.message || 'Failed to update adjustment');
      });
  };

  return (
    <>
      <div className="reports-card">
        <div className="reports-card-header">
          <div className="reports-card-title">Stock Adjustment History Filters</div>
        </div>
        <div className="reports-card-content">
          <div className="reports-form-grid">
            <div className="reports-field">
              <label>Search by Date</label>
              <input
                type="date"
                className="reports-input"
                value={filters.date || ''}
                onChange={(e) => setFilters((f) => ({ ...f, date: e.target.value }))}
              />
            </div>
            <div className="reports-field">
              <label>Search by Doc Number</label>
              <input
                type="text"
                className="reports-input"
                placeholder="e.g. 101"
                value={filters.docNo || ''}
                onChange={(e) => setFilters((f) => ({ ...f, docNo: e.target.value }))}
              />
            </div>
          </div>

          {/* Product MultiSelect Checkbox Section (matching Stock IN Product selector) */}
          <div className="reports-product-section" style={{ marginTop: '1.25rem' }}>
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
                <button
                  type="button"
                  className="btn-sm btn-select-all"
                  onClick={handleSelectAllProducts}
                >
                  Select all
                </button>
                <button
                  type="button"
                  className="btn-sm btn-clear"
                  onClick={handleClearAllProducts}
                >
                  Clear selection
                </button>
              </div>
            </div>
            <div className="reports-product-list-box">
              {products.length === 0 ? (
                <div className="reports-product-empty">Loading products…</div>
              ) : productsFiltered.length === 0 ? (
                <div className="reports-product-empty">No products match your search.</div>
              ) : (
                productsFiltered.map((p) => (
                  <label key={p._id} className="reports-product-item">
                    <input
                      type="checkbox"
                      checked={(filters.productId || []).includes(p._id)}
                      onChange={() => toggleProduct(p._id)}
                    />
                    <span>{getProductDisplayLabel(p)}</span>
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
          </div>
        </div>
      </div>

      {data.length > 0 && (
        <div className="reports-card">
          <div className="reports-card-header">
            <div className="reports-card-title">Stock Adjustment Audit Trail</div>
            <div className="reports-table-toolbar">
              <span className="text-sm text-slate-500">{filtered.length} rows</span>
            </div>
          </div>
          <div className="reports-card-content">
            <div className="reports-table-wrap">
              <table className="reports-table">
                <thead>
                  <tr>
                    <th className="col-num">#</th>
                    <th className="col-product">Product Name</th>
                    <th className="col-company">Company Name</th>
                    <th className="col-unit">Unit</th>
                    <th className="col-date">Adjustment Date</th>
                    <th className="col-expiry">Expiry Date</th>
                    <th className="col-qty text-right">Adjusted Quantity</th>
                    <th className="col-price text-right">Price</th>
                    <th className="col-qty text-right">Previous Stock</th>
                    <th className="col-qty text-right">Updated Stock</th>
                    <th className="col-docno">Doc Number / Ref</th>
                    <th className="min-w-[120px]">User Name</th>
                    <th className="min-w-[90px] text-center">Action</th>
                  </tr>
                </thead>
                <tbody>
                  {paginated.map((row, i) => {
                    const idx = (page - 1) * pageSize + i + 1;
                    const isEditing = editingId === row._id;
                    return (
                      <tr key={row._id || idx}>
                        <td className="col-num font-mono text-slate-500">{idx}</td>
                        <td className="col-product font-semibold text-[var(--ph-text)]">{row.productName || '-'}</td>
                        <td className="col-company text-[var(--ph-text-secondary)]">{row.companyName || '-'}</td>
                        <td className="col-unit text-[var(--ph-text-secondary)]">{row.unit || '-'}</td>
                        <td className="col-date">{row.adjustmentDate ? moment(row.adjustmentDate).format('DD/MM/YYYY') : '-'}</td>
                        <td className="col-expiry">
                          {isEditing ? (
                            editForm.requiresExpiry ? (
                              <input
                                type="date"
                                className="reports-input"
                                value={editForm.expiry || ''}
                                onChange={(e) => setEditForm((f) => ({ ...f, expiry: e.target.value }))}
                              />
                            ) : (
                              <span className="text-gray-400 text-xs font-semibold bg-gray-100 dark:bg-gray-800 px-2.5 py-1 rounded">Not Required</span>
                            )
                          ) : (
                            row.expiry ? (
                              <span className="font-mono text-xs text-[var(--ph-text-secondary)]">{moment(row.expiry).format('DD/MM/YYYY')}</span>
                            ) : '-'
                          )}
                        </td>
                        <td className={`col-qty text-right font-mono font-bold ${(isEditing ? Number(editForm.quantityDelta || 0) : row.adjustedQuantity || 0) >= 0 ? 'text-emerald-700 dark:text-emerald-400' : 'text-rose-700 dark:text-rose-400'}`}>
                          {isEditing ? (
                            <input
                              type="number"
                              className="reports-input text-right font-mono"
                              value={editForm.quantityDelta ?? ''}
                              onChange={(e) => setEditForm((f) => ({ ...f, quantityDelta: e.target.value }))}
                            />
                          ) : (
                            (row.adjustedQuantity || 0) >= 0 ? `+${(row.adjustedQuantity || 0).toLocaleString()}` : (row.adjustedQuantity || 0).toLocaleString()
                          )}
                        </td>
                        <td className="col-price text-right font-mono">
                          {isEditing ? (
                            <input
                              type="number"
                              className="reports-input text-right font-mono"
                              value={editForm.price ?? ''}
                              onChange={(e) => setEditForm((f) => ({ ...f, price: e.target.value }))}
                            />
                          ) : (
                            `QR ${(row.price ?? 0).toFixed(2)}`
                          )}
                        </td>
                        <td className="col-qty text-right font-mono text-[var(--ph-text-secondary)]">{(row.previousStock ?? 0).toLocaleString()}</td>
                        <td className="col-qty text-right font-mono font-bold text-[var(--ph-text)]">{(row.updatedStock ?? 0).toLocaleString()}</td>
                        <td className="col-docno font-mono">{row.docNo ?? '-'}</td>
                        <td className="min-w-[120px] text-[var(--ph-text-secondary)]">{row.userName || 'N/A'}</td>
                        <td className="min-w-[90px] text-center">
                          {isEditing ? (
                            <div className="flex gap-2">
                              <input
                                type="text"
                                className="reports-input"
                                placeholder="Remarks"
                                value={editForm.reason || ''}
                                onChange={(e) => setEditForm((f) => ({ ...f, reason: e.target.value }))}
                              />
                              <button type="button" className="reports-btn-primary" onClick={saveEdit} disabled={saving}>
                                <Save className="h-4 w-4" />
                              </button>
                              <button type="button" className="reports-btn-secondary" onClick={cancelEdit} disabled={saving}>
                                <X className="h-4 w-4" />
                              </button>
                            </div>
                          ) : (
                            <button type="button" className="reports-btn-secondary" onClick={() => beginEdit(row)}>
                              <Edit className="h-4 w-4" /> Edit
                            </button>
                          )}
                        </td>
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
      )}
    </>
  );
};

export default StockAdjustmentHistoryReport;
