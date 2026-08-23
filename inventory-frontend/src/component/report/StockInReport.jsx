import React, { useState } from 'react';
import {
  Search,
  RefreshCw,
  Trash2,
  Printer,
  Package,
  FileSpreadsheet,
  Download,
  Edit,
  X,
  Save,
} from 'lucide-react';
import moment from 'moment';
import axios from 'axios';
import { getToken } from '../../utils/auth';
import { Button } from '../../components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '../../components/ui/card';

const PAGE_SIZES = [10, 25, 50, 100];



const StockInReport = ({
  suppliers = [],
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

  const [editingItem, setEditingItem] = useState(null);
  const [editForm, setEditForm] = useState({
    quantity: '',
    purchasingPrice: '',
    sellingPrice: '',
    supplier: '',
    expiry: ''
  });
  const [editErrors, setEditErrors] = useState({});
  const [editLoading, setEditLoading] = useState(false);

  const handleEditClick = (item) => {
    setEditingItem(item);
    setEditForm({
      quantity: item.quantity ?? 0,
      purchasingPrice: item.purchasingPrice ?? 0,
      sellingPrice: item.sellingPrice ?? 0,
      supplier: item.supplier?._id || item.supplier || '',
      expiry: item.expiry ? moment(item.expiry).format('YYYY-MM-DD') : ''
    });
    setEditErrors({});
  };

  const handleSaveEdit = async () => {
    const errors = {};
    if (!editForm.quantity || editForm.quantity <= 0) {
      errors.quantity = 'Please enter a valid quantity';
    }
    if (!editForm.purchasingPrice || editForm.purchasingPrice < 0) {
      errors.purchasingPrice = 'Please enter a valid purchasing price';
    }
    if (editForm.sellingPrice !== '' && editForm.sellingPrice < 0) {
      errors.sellingPrice = 'Please enter a valid selling price';
    }
    if (!editForm.supplier) {
      errors.supplier = 'Please select a supplier';
    }
    if (!editForm.expiry) {
      errors.expiry = 'Please select an expiry date';
    }

    if (Object.keys(errors).length > 0) {
      setEditErrors(errors);
      return;
    }

    setEditLoading(true);
    try {
      await axios.post(
        `${process.env.REACT_APP_DEVELOPMENT}/api/stockIn/stockInUpdateQuantity/${editingItem._id}`,
        {
          quantity: parseInt(editForm.quantity, 10),
          purchasingPrice: parseFloat(editForm.purchasingPrice),
          sellingPrice: editForm.sellingPrice !== '' ? parseFloat(editForm.sellingPrice) : undefined,
          supplier: editForm.supplier,
          expiry: new Date(editForm.expiry)
        },
        { headers: { token: getToken() } }
      );
      setEditingItem(null);
      onFetch();
    } catch (err) {
      console.error(err);
      alert(err.response?.data?.msg || err.response?.data?.result || 'Failed to update record');
    } finally {
      setEditLoading(false);
    }
  };

  
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
              <label>Supplier</label>
              <select
                className="reports-select"
                value={filters.supplierId}
                onChange={(e) => setFilters((f) => ({ ...f, supplierId: e.target.value }))}
              >
                <option value="">All suppliers</option>
                {suppliers?.map((s) => <option key={s._id} value={s._id}>{s.name}</option>)}
              </select>
            </div>
            <div className="reports-field">
              <label>Document No</label>
              <input
                type="text"
                className="reports-input"
                placeholder="Doc No"
                value={filters.docNo}
                onChange={(e) => setFilters((f) => ({ ...f, docNo: e.target.value }))}
              />
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
            <button type="button" className="reports-btn-secondary" onClick={onClearFilters}>
              <Trash2 className="h-4 w-4" /> Clear filters
            </button>
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
            <div className="reports-kpi-card green">
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
              <div className="reports-card-title">Stock-In table</div>
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
                      <th>No</th><th>Date</th><th>Doc No</th><th>Product Name</th><th>Company</th><th>Supplier</th><th className="text-right">Qty</th><th>Unit</th>{isAdmin && <th className="text-right">Price</th>}{isAdmin && <th className="text-right">Total</th>}{isAdmin && <th className="text-center">Actions</th>}
                    </tr>
                  </thead>
                  <tbody>
                    {paginated.map((row, i) => {
                      const total = (row.quantity ?? 0) * (row.purchasingPrice ?? 0);
                      const idx = (page - 1) * pageSize + i + 1;
                      return (
                        <tr key={row._id || i}>
                          <td>{idx}</td>
                          <td>{row.createdAt ? moment(row.createdAt).format('DD/MM/YYYY') : '-'}</td>
                          <td>{row.docNo ?? '-'}</td>
                          <td>{row.name || row.productId?.name || '-'}</td>
                          <td>{row.productId?.companyName || '-'}</td>
                          <td>{row.supplier?.name || '-'}</td>
                          <td className="text-right">{row.quantity ?? 0}</td>
                          <td>{row.unit || row.productId?.unit || '-'}</td>
                          {isAdmin && <td className="text-right">{(row.purchasingPrice ?? 0).toFixed(2)}</td>}
                          {isAdmin && <td className="text-right">{total.toFixed(2)}</td>}
                          {isAdmin && (
                            <td className="text-center">
                              <button
                                type="button"
                                onClick={() => handleEditClick(row)}
                                className="p-1.5 text-blue-600 hover:bg-blue-50 rounded transition-colors"
                                title="Edit record"
                              >
                                <Edit className="w-4 h-4" />
                              </button>
                            </td>
                          )}
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
      {editingItem && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black bg-opacity-50">
          <Card className="w-full max-w-md bg-white shadow-xl">
            <CardHeader className="flex flex-row items-center justify-between border-b pb-3">
              <CardTitle className="text-lg font-bold">Edit Stock In Record</CardTitle>
              <button onClick={() => setEditingItem(null)} className="p-1 hover:bg-gray-100 rounded">
                <X className="w-5 h-5 text-gray-500" />
              </button>
            </CardHeader>
            <CardContent className="pt-4 space-y-4">
              <div>
                <label className="block text-xs font-semibold text-gray-700 mb-1">Quantity</label>
                <input
                  type="number"
                  className="w-full border rounded-md p-2 text-sm"
                  value={editForm.quantity}
                  onChange={(e) => setEditForm(prev => ({ ...prev, quantity: e.target.value }))}
                />
                {editErrors.quantity && <span className="text-xs text-red-500">{editErrors.quantity}</span>}
              </div>
              <div>
                <label className="block text-xs font-semibold text-gray-700 mb-1">Purchasing Price</label>
                <input
                  type="number"
                  step="0.01"
                  className="w-full border rounded-md p-2 text-sm"
                  value={editForm.purchasingPrice}
                  onChange={(e) => setEditForm(prev => ({ ...prev, purchasingPrice: e.target.value }))}
                />
                {editErrors.purchasingPrice && <span className="text-xs text-red-500">{editErrors.purchasingPrice}</span>}
              </div>
              <div>
                <label className="block text-xs font-semibold text-gray-700 mb-1">Selling Price</label>
                <input
                  type="number"
                  step="0.01"
                  className="w-full border rounded-md p-2 text-sm"
                  value={editForm.sellingPrice}
                  onChange={(e) => setEditForm(prev => ({ ...prev, sellingPrice: e.target.value }))}
                />
                {editErrors.sellingPrice && <span className="text-xs text-red-500">{editErrors.sellingPrice}</span>}
              </div>
              <div>
                <label className="block text-xs font-semibold text-gray-700 mb-1">Supplier</label>
                <select
                  className="w-full border rounded-md p-2 text-sm"
                  value={editForm.supplier}
                  onChange={(e) => setEditForm(prev => ({ ...prev, supplier: e.target.value }))}
                >
                  <option value="">Select Supplier</option>
                  {suppliers.map(s => <option key={s._id} value={s._id}>{s.name}</option>)}
                </select>
                {editErrors.supplier && <span className="text-xs text-red-500">{editErrors.supplier}</span>}
              </div>
              <div>
                <label className="block text-xs font-semibold text-gray-700 mb-1">Expiry Date</label>
                <input
                  type="date"
                  className="w-full border rounded-md p-2 text-sm"
                  value={editForm.expiry}
                  onChange={(e) => setEditForm(prev => ({ ...prev, expiry: e.target.value }))}
                />
                {editErrors.expiry && <span className="text-xs text-red-500">{editErrors.expiry}</span>}
              </div>
              <div className="flex justify-end gap-2 border-t pt-3">
                <Button variant="outline" onClick={() => setEditingItem(null)} disabled={editLoading}>
                  Cancel
                </Button>
                <Button onClick={handleSaveEdit} disabled={editLoading} className="flex items-center gap-1">
                  {editLoading ? 'Saving...' : <><Save className="w-4 h-4" /> Save Changes</>}
                </Button>
              </div>
            </CardContent>
          </Card>
        </div>
      )}
    </>
  );
};

export default StockInReport;
