import React, { useState, useEffect, useMemo } from 'react';
import axios from 'axios';
import { useParams, useNavigate } from 'react-router-dom';
import { Card, CardContent } from '../../components/ui/card';
import { Button } from '../../components/ui/button';
import { Input } from '../../components/ui/input';
import { Alert, AlertDescription } from '../../components/ui/alert';
import { ArrowLeft, Save, Trash2, ShieldAlert, Sparkles, RefreshCw, FileText, Search, Plus } from 'lucide-react';
import ProductDropdownCell from '../../components/ui/ProductDropdownCell';
import moment from 'moment';
import { getToken, getUserInfo } from '../../utils/auth';

const StockInDocExcelEdit = () => {
  const { docNo } = useParams();
  const navigate = useNavigate();
  const [items, setItems] = useState([]);
  const [originalItems, setOriginalItems] = useState([]);
  const [suppliers, setSuppliers] = useState([]);
  const [allProducts, setAllProducts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [alert, setAlert] = useState({ show: false, message: '', type: '' });
  
  // (product dropdown state is now managed inside ProductDropdownCell component)

  // Row Delete Modal state
  const [showDeleteModal, setShowDeleteModal] = useState(false);
  const [rowIdxToDelete, setRowIdxToDelete] = useState(null);

  // Grid/Sheet states
  const [dirtyRows, setDirtyRows] = useState({});
  const [validationErrors, setValidationErrors] = useState({});
  
  // Navigation guard state
  const [nextPath, setNextPath] = useState(null);
  const [showBlockerModal, setShowBlockerModal] = useState(false);

  // Search/Filters states
  const [searchQuery, setSearchQuery] = useState('');
  
  // Pagination
  const [page, setPage] = useState(1);
  const pageSize = 50;

  const isAdmin = useMemo(() => (getUserInfo()?.role || '').toLowerCase() === 'admin', []);
  const token = getToken();

  // Columns definition based on permissions
  const columns = useMemo(() => {
    const cols = ['productId', 'expiry', 'quantity'];
    if (isAdmin) {
      cols.push('purchasingPrice', 'sellingPrice');
    }
    cols.push('supplier');
    return cols;
  }, [isAdmin]);

  const hasUnsavedChanges = useMemo(() => Object.keys(dirtyRows).length > 0, [dirtyRows]);

  // Intercept browser reload / tab close
  useEffect(() => {
    const handleBeforeUnload = (e) => {
      if (hasUnsavedChanges) {
        e.preventDefault();
        e.returnValue = 'You have unsaved changes. Do you want to save before leaving?';
        return e.returnValue;
      }
    };
    window.addEventListener('beforeunload', handleBeforeUnload);
    return () => window.removeEventListener('beforeunload', handleBeforeUnload);
  }, [hasUnsavedChanges]);

  // Intercept internal routing transitions
  useEffect(() => {
    const handleAnchorClick = (e) => {
      if (!hasUnsavedChanges) return;

      const target = e.target.closest('a');
      if (target) {
        const href = target.getAttribute('href');
        if (href && !href.startsWith('#')) {
          e.preventDefault();
          e.stopPropagation();
          setNextPath(href);
          setShowBlockerModal(true);
        }
      }
    };

    document.addEventListener('click', handleAnchorClick, true);
    return () => document.removeEventListener('click', handleAnchorClick, true);
  }, [hasUnsavedChanges]);

  useEffect(() => {
    fetchData();
  }, [docNo]);

  const fetchData = async () => {
    try {
      setLoading(true);
      // Fetch document details
      const docRes = await axios.post(
        `${process.env.REACT_APP_DEVELOPMENT}/api/stockIn/getStockInByDocNo`,
        { docNo },
        { headers: { token } }
      );
      
      // Fetch suppliers list
      const supplierRes = await axios.get(
        `${process.env.REACT_APP_DEVELOPMENT}/api/supplier/getAllSuppliers`,
        { headers: { token } }
      );

      // Fetch all products
      const productRes = await axios.get(
        `${process.env.REACT_APP_DEVELOPMENT}/api/product/getAllProducts`,
        { headers: { token } }
      );

      if (supplierRes.data?.msg === 'success') {
        setSuppliers(supplierRes.data.result || []);
      }
      if (productRes.data?.msg === 'success') {
        setAllProducts(productRes.data.result || []);
      }

      if (docRes.data?.msg === 'success' && docRes.data.result?.[0]) {
        const rawItems = docRes.data.result[0].doc || [];
        // Map to format editable state
        const mapped = rawItems.map(item => ({
          _id: item._id,
          name: item.name || item.productId?.name || '',
          companyName: (item.companyName && item.companyName !== '-') ? item.companyName : (item.product?.companyName || item.productId?.companyName || '-'),
          unit: item.unit || item.product?.unit || item.productId?.unit || '-',
          productId: item.product?._id || item.productId?._id || item.productId,
          expiry: item.expiry ? moment(item.expiry).format('YYYY-MM-DD') : '',
          quantity: item.quantity || 0,
          purchasingPrice: item.purchasingPrice || 0,
          sellingPrice: item.sellingPrice || 0,
          supplier: item.supplier?._id || item.supplier || '',
          createdAt: item.createdAt,
          isDeleted: false
        }));
        setItems(mapped);
        setOriginalItems(JSON.parse(JSON.stringify(mapped)));
      } else {
        showAlert('Failed to retrieve document details.', 'error');
      }
    } catch (err) {
      console.error(err);
      showAlert('Error fetching data from API.', 'error');
    } finally {
      setLoading(false);
    }
  };

  const showAlert = (message, type) => {
    setAlert({ show: true, message, type });
    if (type !== 'error') {
      setTimeout(() => setAlert({ show: false, message: '', type: '' }), 4000);
    }
  };

  // Cell keydown spreadsheet navigation
  const handleKeyDown = (e, rowIndex, colKey) => {
    const colIndex = columns.indexOf(colKey);

    if (e.key === 'ArrowUp') {
      e.preventDefault();
      if (rowIndex > 0) {
        document.getElementById(`cell-${rowIndex - 1}-${colKey}`)?.focus();
      }
    } else if (e.key === 'ArrowDown') {
      e.preventDefault();
      if (rowIndex < activeItems.length - 1) {
        document.getElementById(`cell-${rowIndex + 1}-${colKey}`)?.focus();
      }
    } else if (e.key === 'ArrowLeft') {
      const isStart = e.target.selectionStart === 0 || e.target.selectionStart === undefined;
      if (isStart || e.target.type === 'date' || e.target.tagName === 'SELECT') {
        e.preventDefault();
        if (colIndex > 0) {
          const prevCol = columns[colIndex - 1];
          document.getElementById(`cell-${rowIndex}-${prevCol}`)?.focus();
        }
      }
    } else if (e.key === 'ArrowRight') {
      const isEnd = e.target.selectionStart === e.target.value?.length || e.target.selectionStart === undefined;
      if (isEnd || e.target.type === 'date' || e.target.tagName === 'SELECT') {
        e.preventDefault();
        if (colIndex < columns.length - 1) {
          const nextCol = columns[colIndex + 1];
          document.getElementById(`cell-${rowIndex}-${nextCol}`)?.focus();
        }
      }
    } else if (e.key === 'Enter') {
      e.preventDefault();
      if (rowIndex < activeItems.length - 1) {
        document.getElementById(`cell-${rowIndex + 1}-${colKey}`)?.focus();
      }
    }
  };

  // Handle cell values edits
  const handleCellChange = (rowIndex, colKey, value) => {
    const updated = [...items];
    const targetIdx = items.indexOf(activeItems[rowIndex]);
    const rowId = updated[targetIdx]._id;
    updated[targetIdx][colKey] = value;
    setItems(updated);

    // Validate cell value
    let errorMsg = '';
    if (colKey === 'quantity') {
      const qty = parseInt(value, 10);
      if (Number.isNaN(qty) || qty < 0) {
        errorMsg = 'Quantity cannot be negative';
      }
    } else if (colKey === 'purchasingPrice' || colKey === 'sellingPrice') {
      const price = parseFloat(value);
      if (Number.isNaN(price) || price < 0) {
        errorMsg = 'Price cannot be negative';
      }
    } else if (colKey === 'expiry') {
      if (!value) {
        errorMsg = 'Expiry date is required';
      }
    }

    setValidationErrors(prev => {
      const rowErrors = { ...prev[rowId], [colKey]: errorMsg };
      if (!errorMsg) delete rowErrors[colKey];
      
      const newErrors = { ...prev, [rowId]: rowErrors };
      if (Object.keys(rowErrors).length === 0) delete newErrors[rowId];
      return newErrors;
    });

    // Check if row changed from original
    const original = originalItems[targetIdx];
    let rowChanged = false;
    if (!original) {
      rowChanged = true;
    } else {
      for (const col of columns) {
        if (String(updated[targetIdx][col]) !== String(original[col])) {
          rowChanged = true;
          break;
        }
      }
    }

    setDirtyRows(prev => {
      const next = { ...prev };
      if (rowChanged || updated[targetIdx].isDeleted) {
        next[rowId] = true;
      } else {
        delete next[rowId];
      }
      return next;
    });
  };

  // Product selection from dropdown
  const handleProductChange = (rowIndex, product) => {
    const updated = [...items];
    const targetIdx = items.indexOf(activeItems[rowIndex]);
    if (targetIdx === -1) return;
    const rowId = updated[targetIdx]._id;

    updated[targetIdx].productId = product._id;
    updated[targetIdx].name = product.name;
    updated[targetIdx].companyName = product.companyName || '-';
    updated[targetIdx].unit = product.unit || '-';
    setItems(updated);

    setDirtyRows(prev => ({
      ...prev,
      [rowId]: true
    }));
  };

  // Delete Confirm Triggers
  const triggerDelete = (rowIndex) => {
    setRowIdxToDelete(rowIndex);
    setShowDeleteModal(true);
  };

  const confirmDelete = () => {
    if (rowIdxToDelete !== null) {
      const updated = [...items];
      const targetIdx = items.indexOf(activeItems[rowIdxToDelete]);
      const rowId = updated[targetIdx]._id;

      updated[targetIdx].isDeleted = true;
      setItems(updated);

      setDirtyRows(prev => ({
        ...prev,
        [rowId]: true
      }));
    }
    setShowDeleteModal(false);
    setRowIdxToDelete(null);
  };

  const handleSaveAll = async () => {
    if (Object.keys(validationErrors).length > 0) {
      showAlert('Please fix all validation errors before saving.', 'error');
      return;
    }

    const modifiedList = items.filter(item => dirtyRows[item._id]);
    if (modifiedList.length === 0) {
      showAlert('No modifications detected.', 'default');
      return;
    }

    // Validate entries before saving
    for (const item of modifiedList) {
      if (item.isDeleted) continue;
      if (!item.productId) {
        showAlert('Product selection is required for all rows.', 'error');
        return;
      }
      if (Number(item.quantity) <= 0) {
        showAlert(`Quantity must be greater than 0 for product "${item.name || 'Unnamed'}".`, 'error');
        return;
      }
      if (isAdmin) {
        if (Number(item.purchasingPrice) <= 0) {
          showAlert(`Purchase price must be positive for "${item.name || 'Unnamed'}".`, 'error');
          return;
        }
        if (Number(item.sellingPrice) <= 0) {
          showAlert(`Selling price must be positive for "${item.name || 'Unnamed'}".`, 'error');
          return;
        }
      }
      if (!item.expiry) {
        showAlert(`Expiry date is required for "${item.name || 'Unnamed'}".`, 'error');
        return;
      }
    }

    try {
      setSaving(true);
      const res = await axios.post(
        `${process.env.REACT_APP_DEVELOPMENT}/api/stockIn/stockInBulkUpdate`,
        { docNo: parseInt(docNo, 10), updates: modifiedList },
        { headers: { token } }
      );

      if (res.data?.msg === 'success') {
        showAlert(`✔ ${res.data.count || modifiedList.length} rows updated successfully.`, 'success');
        setDirtyRows({});
        await fetchData();
      } else {
        showAlert(res.data?.result || 'Failed to update records.', 'error');
      }
    } catch (err) {
      console.error(err);
      showAlert(err.response?.data?.result || 'Internal server error during save.', 'error');
    } finally {
      setSaving(false);
    }
  };

  const handleAddProduct = () => {
    // Clear search filter to ensure the new row is visible
    setSearchQuery('');
    
    const newItem = {
      _id: `new_${Date.now()}_${Math.floor(Math.random() * 1000)}`,
      name: '',
      companyName: '-',
      unit: '-',
      productId: '',
      expiry: '',
      quantity: 0,
      purchasingPrice: 0,
      sellingPrice: 0,
      supplier: suppliers[0]?._id || '',
      isDeleted: false,
      isNew: true
    };

    setItems(prev => {
      const next = [...prev, newItem];
      const activeCount = next.filter(item => !item.isDeleted).length;
      const lastPage = Math.max(1, Math.ceil(activeCount / pageSize));
      setPage(lastPage);
      return next;
    });

    setDirtyRows(prev => ({
      ...prev,
      [newItem._id]: true
    }));
  };

  const handleBack = () => {
    if (hasUnsavedChanges) {
      setNextPath(-1);
      setShowBlockerModal(true);
    } else {
      navigate(-1);
    }
  };

  const handleBlockerChoice = async (action) => {
    setShowBlockerModal(false);
    if (nextPath === null) return;

    if (action === 'save') {
      await handleSaveAll();
      if (nextPath === -1) {
        navigate(-1);
      } else {
        navigate(nextPath);
      }
    } else if (action === 'discard') {
      setDirtyRows({});
      if (nextPath === -1) {
        navigate(-1);
      } else {
        navigate(nextPath);
      }
    }
    setNextPath(null);
  };

  // Only display active (not soft-deleted) rows
  const activeItems = useMemo(() => items.filter(item => !item.isDeleted), [items]);

  // Instant local filtering
  const filteredItems = useMemo(() => {
    if (!searchQuery) return activeItems;
    const q = searchQuery.toLowerCase();
    return activeItems.filter(item => 
      item.name.toLowerCase().includes(q) || 
      item.companyName.toLowerCase().includes(q)
    );
  }, [searchQuery, activeItems]);

  // Paginated items
  const paginatedItems = useMemo(() => {
    const startIndex = (page - 1) * pageSize;
    return filteredItems.slice(startIndex, startIndex + pageSize);
  }, [filteredItems, page]);

  const totalPages = Math.ceil(filteredItems.length / pageSize);

  // Dynamic aggregates
  const totalQuantity = activeItems.reduce((sum, item) => sum + Number(item.quantity || 0), 0);
  const totalValue = activeItems.reduce((sum, item) => sum + (Number(item.quantity || 0) * Number(item.purchasingPrice || 0)), 0);

  return (
    <div className="container mx-auto p-6 space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-4">
          <Button variant="outline" onClick={handleBack} className="gap-1">
            <ArrowLeft className="h-4 w-4" />
            Back
          </Button>
          <div>
            <h1 className="text-3xl font-bold flex items-center gap-2 text-gray-800 dark:text-gray-100">
              <Sparkles className="h-8 w-8 text-emerald-500" />
              Document Excel Editor: Doc #{docNo}
            </h1>
            <p className="text-sm text-gray-500 mt-1">Spreadsheet style bulk-editing, fast keystrokes, inline validation.</p>
          </div>
        </div>

        <div className="flex items-center gap-4">
          {isAdmin && (
            <div className="text-right">
              <div className="text-xs text-gray-500 uppercase tracking-wider font-semibold">Document Value</div>
              <div className="text-xl font-black text-emerald-600">QR {totalValue.toFixed(2)}</div>
            </div>
          )}
          <div className="text-right border-l pl-4">
            <div className="text-xs text-gray-500 uppercase tracking-wider font-semibold">Total Quantity</div>
            <div className="text-xl font-black text-gray-800">{totalQuantity}</div>
          </div>
          <div className="flex items-center gap-2 border-l pl-4">
            {hasUnsavedChanges && (
              <span className="text-sm font-semibold text-orange-600 bg-orange-50 px-3 py-1.5 rounded-full border border-orange-200 animate-pulse">
                Unsaved Changes ({Object.keys(dirtyRows).length} rows)
              </span>
            )}
            <Button
              onClick={handleSaveAll}
              disabled={saving || !hasUnsavedChanges}
              className="bg-emerald-600 hover:bg-emerald-700 text-white font-bold px-6 gap-2"
            >
              <Save className="h-4 w-4" />
              {saving ? 'Saving...' : 'Save All Changes'}
            </Button>
          </div>
        </div>
      </div>

      {alert.show && (
        <Alert variant={alert.type === 'error' ? 'destructive' : 'default'} className="border border-blue-200">
          <AlertDescription className="font-semibold">{alert.message}</AlertDescription>
        </Alert>
      )}

      {/* Local Filter Bar */}
      <Card className="bg-white dark:bg-gray-800 shadow-sm border border-gray-200">
        <CardContent className="pt-6">
          <div className="flex items-center gap-4">
            <div className="flex-1">
              <Input
                icon={Search}
                placeholder="Instant filter by Product Name or Company..."
                value={searchQuery}
                onChange={(e) => {
                  setSearchQuery(e.target.value);
                  setPage(1);
                }}
                clearable
                onClear={() => setSearchQuery('')}
              />
            </div>
            <Button variant="outline" onClick={fetchData} className="gap-1.5">
              <RefreshCw className="h-4 w-4" />
              Reload Grid
            </Button>
            <Button
              onClick={handleAddProduct}
              className="bg-emerald-600 hover:bg-emerald-700 text-white font-bold gap-1.5 px-4 shadow"
            >
              <Plus className="h-4 w-4" />
              Add Product
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* Spreadsheet Grid */}
      <Card className="bg-white dark:bg-gray-800 shadow-lg border border-gray-200 rounded-lg overflow-hidden">
        <CardContent className="p-0">
          {loading ? (
            <div className="text-center py-16 text-gray-500 flex flex-col items-center gap-2">
              <div className="h-8 w-8 border-4 border-blue-600 border-t-transparent rounded-full animate-spin"></div>
              <span>Loading grid spreadsheet...</span>
            </div>
          ) : activeItems.length === 0 ? (
            <div className="text-center py-16 text-gray-500">
              <FileText className="h-12 w-12 mx-auto text-gray-300 mb-2" />
              No items found in this document.
            </div>
          ) : (
            <div className="overflow-x-auto select-none">
              <table className="w-full text-left border-collapse table-fixed">
                <thead className="bg-gray-100 dark:bg-gray-900 border-b border-gray-200">
                  <tr className="divide-x divide-gray-200 text-xs font-bold text-gray-700 uppercase tracking-wider">
                    <th className="w-12 text-center p-3">Row</th>
                    <th className="w-80 p-3">Product Name *</th>
                    <th className="w-40 p-3">Company</th>
                    <th className="w-24 p-3 text-center">Unit</th>
                    <th className="w-44 p-3">Expiry Date *</th>
                    <th className="w-28 p-3 text-right">Quantity *</th>
                    {isAdmin && <th className="w-32 p-3 text-right">Purch. Price *</th>}
                    {isAdmin && <th className="w-32 p-3 text-right">Selling Price *</th>}
                    <th className="w-48 p-3">Supplier</th>
                    <th className="w-28 text-center p-3">Status</th>
                    <th className="w-24 text-center p-3">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-200 text-sm">
                  {paginatedItems.map((item, idx) => {
                    const globalIdx = (page - 1) * pageSize + idx;
                    const originalIdx = items.indexOf(item);
                    const isRowDirty = dirtyRows[item._id];
                    const isRowInvalid = validationErrors[item._id] && Object.keys(validationErrors[item._id]).length > 0;
                    
                    return (
                      <tr
                        key={item._id}
                        className={`divide-x divide-gray-200 transition-colors ${
                          isRowDirty
                            ? 'bg-amber-50 hover:bg-amber-100/70'
                            : isRowInvalid
                            ? 'bg-red-50/50 hover:bg-red-50'
                            : 'hover:bg-slate-50/70'
                        }`}
                      >
                        <td className="text-center text-xs font-semibold text-gray-400 p-2">
                          {globalIdx + 1}
                        </td>
                        
                        {/* Product Selector Dropdown (portal-based, master-list-only) */}
                        <td className="p-1">
                          <ProductDropdownCell
                            item={item}
                            allProducts={allProducts}
                            onSelect={(product) => handleProductChange(globalIdx, product)}
                            cellId={`cell-${globalIdx}-productId`}
                            accentColor="emerald"
                          />
                        </td>

                        <td className="p-2 text-gray-600 truncate">
                          {item.companyName}
                        </td>
                        <td className="p-2 text-center text-gray-600">
                          {item.unit}
                        </td>
                        <td className="p-1">
                          <input
                            id={`cell-${globalIdx}-expiry`}
                            type="date"
                            value={item.expiry}
                            onKeyDown={(e) => handleKeyDown(e, globalIdx, 'expiry')}
                            onChange={(e) => handleCellChange(globalIdx, 'expiry', e.target.value)}
                            className={`w-full h-8 px-2 border bg-transparent focus:bg-white focus:ring-2 focus:ring-blue-500 rounded focus:outline-none transition-all ${
                              validationErrors[item._id]?.expiry ? 'border-red-500 bg-red-50' : 'border-transparent'
                            }`}
                          />
                        </td>
                        <td className="p-1">
                          <input
                            id={`cell-${globalIdx}-quantity`}
                            type="number"
                            value={item.quantity}
                            onKeyDown={(e) => handleKeyDown(e, globalIdx, 'quantity')}
                            onChange={(e) => handleCellChange(globalIdx, 'quantity', e.target.value)}
                            className={`w-full h-8 px-2 text-right border bg-transparent focus:bg-white focus:ring-2 focus:ring-blue-500 rounded focus:outline-none transition-all font-semibold ${
                              validationErrors[item._id]?.quantity ? 'border-red-500 bg-red-50 text-red-700' : 'border-transparent text-gray-800'
                            }`}
                          />
                        </td>
                        {isAdmin && (
                          <td className="p-1">
                            <input
                              id={`cell-${globalIdx}-purchasingPrice`}
                              type="number"
                              step="0.01"
                              value={item.purchasingPrice}
                              onKeyDown={(e) => handleKeyDown(e, globalIdx, 'purchasingPrice')}
                              onChange={(e) => handleCellChange(globalIdx, 'purchasingPrice', e.target.value)}
                              className={`w-full h-8 px-2 text-right border bg-transparent focus:bg-white focus:ring-2 focus:ring-blue-500 rounded focus:outline-none transition-all ${
                                validationErrors[item._id]?.purchasingPrice ? 'border-red-500 bg-red-50 text-red-700' : 'border-transparent text-gray-800'
                              }`}
                            />
                          </td>
                        )}
                        {isAdmin && (
                          <td className="p-1">
                            <input
                              id={`cell-${globalIdx}-sellingPrice`}
                              type="number"
                              step="0.01"
                              value={item.sellingPrice}
                              onKeyDown={(e) => handleKeyDown(e, globalIdx, 'sellingPrice')}
                              onChange={(e) => handleCellChange(globalIdx, 'sellingPrice', e.target.value)}
                              className={`w-full h-8 px-2 text-right border bg-transparent focus:bg-white focus:ring-2 focus:ring-blue-500 rounded focus:outline-none transition-all ${
                                validationErrors[item._id]?.sellingPrice ? 'border-red-500 bg-red-50 text-red-700' : 'border-transparent text-gray-800'
                              }`}
                            />
                          </td>
                        )}
                        <td className="p-1">
                          <select
                            id={`cell-${globalIdx}-supplier`}
                            value={item.supplier}
                            onKeyDown={(e) => handleKeyDown(e, globalIdx, 'supplier')}
                            onChange={(e) => handleCellChange(globalIdx, 'supplier', e.target.value)}
                            className="w-full h-8 px-2 border-0 bg-transparent focus:bg-white focus:ring-2 focus:ring-blue-500 rounded focus:outline-none transition-all cursor-pointer"
                          >
                            <option value="">Select Supplier</option>
                            {suppliers.map(s => (
                              <option key={s._id} value={s._id}>{s.name}</option>
                            ))}
                          </select>
                        </td>
                        <td className="p-2 text-center">
                          {isRowDirty ? (
                            <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-semibold bg-amber-100 text-amber-800 border border-amber-200">
                              Modified
                            </span>
                          ) : isRowInvalid ? (
                            <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-semibold bg-red-100 text-red-800 border border-red-200">
                              Invalid
                            </span>
                          ) : (
                            <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-semibold bg-gray-100 text-gray-600 border border-gray-200">
                              Saved
                            </span>
                          )}
                        </td>
                        <td className="p-2 text-center">
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => triggerDelete(globalIdx)}
                            className="h-7 w-7 p-0 text-red-500 hover:text-red-700 hover:bg-red-50"
                            title="Delete row"
                          >
                            <Trash2 className="h-4 w-4" />
                          </Button>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Pagination Footer */}
      {!loading && totalPages > 1 && (
        <div className="flex items-center justify-between bg-white p-4 border border-gray-200 rounded-lg">
          <div className="text-sm text-gray-500">
            Showing items { (page - 1) * pageSize + 1 } to { Math.min(page * pageSize, filteredItems.length) } of { filteredItems.length }
          </div>
          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              size="sm"
              disabled={page <= 1}
              onClick={() => setPage(p => p - 1)}
            >
              Previous
            </Button>
            <span className="text-sm font-semibold">
              Page {page} of {totalPages}
            </span>
            <Button
              variant="outline"
              size="sm"
              disabled={page >= totalPages}
              onClick={() => setPage(p => p + 1)}
            >
              Next
            </Button>
          </div>
        </div>
      )}

      {/* Delete Confirmation Modal */}
      {showDeleteModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black bg-opacity-65 backdrop-blur-sm transition-all duration-300">
          <div className="bg-white dark:bg-gray-800 rounded-xl shadow-2xl border border-gray-200 p-6 max-w-md w-full mx-4">
            <div className="flex items-center gap-3 text-red-600 mb-4">
              <Trash2 className="h-7 w-7" />
              <h3 className="text-xl font-bold">Delete Product</h3>
            </div>
            <p className="text-gray-600 dark:text-gray-300 mb-6 text-sm">
              Are you sure you want to delete this row?
            </p>
            <div className="flex items-center justify-end gap-2 border-t pt-4">
              <Button
                variant="outline"
                onClick={() => setShowDeleteModal(false)}
              >
                Cancel
              </Button>
              <Button
                variant="destructive"
                onClick={confirmDelete}
                className="text-white bg-red-600 hover:bg-red-700 font-bold"
              >
                Delete
              </Button>
            </div>
          </div>
        </div>
      )}

      {/* Unsaved Changes Blocked Confirmation Overlay Modal */}
      {showBlockerModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black bg-opacity-65 backdrop-blur-sm transition-all duration-300">
          <div className="bg-white dark:bg-gray-800 rounded-xl shadow-2xl border border-gray-200 p-6 max-w-md w-full mx-4">
            <div className="flex items-center gap-3 text-red-600 mb-4">
              <ShieldAlert className="h-7 w-7" />
              <h3 className="text-xl font-bold">Unsaved Changes!</h3>
            </div>
            <p className="text-gray-600 dark:text-gray-300 mb-6 text-sm">
              You have unsaved changes in this spreadsheet document. Do you want to save before leaving this page?
            </p>
            <div className="flex flex-col sm:flex-row items-stretch sm:justify-end gap-2 border-t pt-4">
              <Button
                variant="outline"
                onClick={() => {
                  setShowBlockerModal(false);
                  setNextPath(null);
                }}
                className="w-full sm:w-auto"
              >
                Cancel (Stay)
              </Button>
              <Button
                variant="destructive"
                onClick={() => handleBlockerChoice('discard')}
                className="w-full sm:w-auto text-white bg-red-600 hover:bg-red-700"
              >
                Discard Edits
              </Button>
              <Button
                onClick={() => handleBlockerChoice('save')}
                className="w-full sm:w-auto bg-emerald-600 hover:bg-emerald-700 text-white font-bold"
              >
                Save & Leave
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default StockInDocExcelEdit;
