import React, { useState, useEffect, useMemo } from 'react';
import axios from 'axios';
import { useParams, useNavigate } from 'react-router-dom';
import { Card, CardContent } from '../../components/ui/card';
import { Button } from '../../components/ui/button';
import { Input } from '../../components/ui/input';
import { Alert, AlertDescription } from '../../components/ui/alert';
import { ArrowLeft, Save, Trash2, ShieldAlert, Sparkles, RefreshCw, FileText, Search, Printer, Plus } from 'lucide-react';
import StockOutProductDropdownCell from '../../components/ui/StockOutProductDropdownCell';
import moment from 'moment';
import { getToken, getUserInfo } from '../../utils/auth';

const StockOutDocExcelEdit = () => {
  const { docNo } = useParams();
  const navigate = useNavigate();
  const [items, setItems] = useState([]);
  const [originalItems, setOriginalItems] = useState([]);
  const [locations, setLocations] = useState([]);
  // stocks: live inventory data from getAllStocks, grouped per product+expiry batch
  // (same data source as the Stock Out entry page)
  const [stocks, setStocks] = useState([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [alert, setAlert] = useState({ show: false, message: '', type: '' });
  
  // Document-level meta for PDF print
  const [docDate, setDocDate] = useState(new Date());
  const [docLocationId, setDocLocationId] = useState('');
  const [docLocationName, setDocLocationName] = useState('');
  const [trainerName, setTrainerName] = useState('');
  const [storeIncharge, setStoreIncharge] = useState('');
  const [takenBy, setTakenBy] = useState('');
  const [veterinarian, setVeterinarian] = useState('');
  const [comments, setComments] = useState('');

  // Autocomplete state is managed inside StockOutProductDropdownCell

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
    const cols = ['productId', 'quantity'];
    if (isAdmin) {
      cols.push('sellingPrice');
    }
    cols.push('locationId');
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
    const stockMap = new Map();
    try {
      setLoading(true);
      // Fetch document details
      const docRes = await axios.post(
        `${process.env.REACT_APP_DEVELOPMENT}/api/stockOut/getStockOutByDocNo`,
        { docNo },
        { headers: { token } }
      );
      
      // Fetch locations list
      const locationRes = await axios.get(
        `${process.env.REACT_APP_DEVELOPMENT}/api/location/getAllLocations`,
        { headers: { token } }
      );

      if (locationRes.data?.msg === 'success') {
        setLocations(locationRes.data.result || []);
      }

      // Fetch live inventory stocks (same as Stock Out page)
      try {
        const stockRes = await axios.get(
          `${process.env.REACT_APP_DEVELOPMENT}/api/stock/getAllStocks`,
          { headers: { token } }
        );
        (stockRes.data.result || []).forEach(stock => {
          if (stock.expiryArray && stock.expiryArray.length > 0) {
            stock.expiryArray.forEach(expiryItem => {
              const productName = stock.name || stock.product?.name || 'Unknown';
              const expiryDate = expiryItem.expiry ? moment(expiryItem.expiry).format('YYYY-MM-DD') : 'no-expiry';
              const mapKey = `${productName}_${expiryDate}`;
              if (stockMap.has(mapKey)) {
                const existing = stockMap.get(mapKey);
                existing.quantity += expiryItem.quantity || 0;
              } else {
                stockMap.set(mapKey, {
                  _id: `${stock._id}_${expiryDate}`,
                  originalStockId: stock._id,
                  productName,
                  companyName: stock.product?.companyName || '',
                  type: stock.product?.type || '',
                  unit: stock.product?.unit || '',
                  quantity: expiryItem.quantity || 0,
                  purchasingPrice: expiryItem.purchasingPrice ?? 0,
                  sellingPrice: expiryItem.sellingPrice ?? 0,
                  productId: stock.product?._id || stock.product,
                  expiry: expiryItem.expiry || null,
                });
              }
            });
          }
        });
        setStocks(Array.from(stockMap.values()));
      } catch (err) {
        console.error('Error fetching stocks:', err);
      }

      // Fetch latest PDF record metadata
      try {
        const pdfRes = await axios.get(
          `${process.env.REACT_APP_DEVELOPMENT}/api/stockOutPdf/byDocNo/${docNo}`,
          { headers: { token } }
        );
        if (pdfRes.data?.success && pdfRes.data.data) {
          const p = pdfRes.data.data;
          setDocDate(p.date);
          setDocLocationId(p.locationId);
          setDocLocationName(p.locationName);
          setTrainerName(p.trainerName || '');
          setStoreIncharge(p.storeIncharge || '');
          setTakenBy(p.takenBy || '');
          setVeterinarian(p.veterinarian || '');
          setComments(p.comments || '');
        }
      } catch (err) {
        console.error("Error fetching PDF metadata:", err);
      }

      if (docRes.data?.msg === 'success' && docRes.data.result?.[0]) {
        const rawItems = docRes.data.result[0].doc || [];
        // Map to format editable state and look up current available quantity
        const mapped = rawItems.map(item => {
          const matchingStock = (stockMap ? Array.from(stockMap.values()) : []).find(s => 
            String(s.productId) === String(item.productId) &&
            ((!s.expiry && !item.expiry) ||
             (s.expiry && item.expiry && moment(s.expiry).format('YYYY-MM-DD') === moment(item.expiry).format('YYYY-MM-DD')))
          );
          // Include current item quantity since it is already deducted in stock count
          const availableQty = (matchingStock ? matchingStock.quantity : 0) + Math.abs(item.quantity || 0);
          return {
            _id: item._id,
            name: item.name || '',
            companyName: item.companyName || '-',
            unit: item.unit || '-',
            productId: item.productId,
            expiry: item.expiry ? moment(item.expiry).format('YYYY-MM-DD') : '',
            quantity: Math.abs(item.quantity || 0),
            sellingPrice: item.sellingPrice || 0,
            locationId: item.locationId || '',
            availableQty: availableQty,
            createdAt: item.createdAt,
            isDeleted: false
          };
        });
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
    } else if (colKey === 'sellingPrice') {
      const price = parseFloat(value);
      if (Number.isNaN(price) || price < 0) {
        errorMsg = 'Price cannot be negative';
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

  // Product selection from Stock Out inventory dropdown
  // Mirrors handleSelectStock in Stockout.jsx — fills ALL inventory-derived fields
  const handleProductChange = (rowIndex, stockEntry) => {
    const updated = [...items];
    const targetIdx = items.indexOf(activeItems[rowIndex]);
    if (targetIdx === -1) return;
    const rowId = updated[targetIdx]._id;

    updated[targetIdx].productId = stockEntry.productId;
    updated[targetIdx].stockId = stockEntry.stockId;   // needed by bulkUpdate to deduct correct batch
    updated[targetIdx].name = stockEntry.name;
    updated[targetIdx].companyName = stockEntry.companyName || '-';
    updated[targetIdx].unit = stockEntry.unit || '-';
    updated[targetIdx].expiry = stockEntry.expiry
      ? moment(stockEntry.expiry).format('YYYY-MM-DD')
      : '';
    updated[targetIdx].sellingPrice = stockEntry.sellingPrice ?? 0;
    updated[targetIdx].availableQty = stockEntry.availableQty ?? 0;
    setItems(updated);

    setDirtyRows(prev => ({ ...prev, [rowId]: true }));
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
        showAlert(`Quantity must be greater than 0 for "${item.name || 'Unnamed'}".`, 'error');
        return;
      }
      if (Number(item.quantity) > Number(item.availableQty || 0)) {
        showAlert(`Quantity for "${item.name || 'Unnamed'}" exceeds available inventory stock of ${item.availableQty || 0}.`, 'error');
        return;
      }
      if (isAdmin && Number(item.sellingPrice) <= 0) {
        showAlert(`Selling price must be positive for "${item.name || 'Unnamed'}".`, 'error');
        return;
      }
    }

    try {
      setSaving(true);
      const res = await axios.post(
        `${process.env.REACT_APP_DEVELOPMENT}/api/stockOut/stockOutBulkUpdate`,
        { docNo: parseInt(docNo, 10), updates: modifiedList },
        { headers: { token } }
      );

      if (res.data?.msg === 'success') {
        showAlert(`✔ ${res.data.count || modifiedList.length} rows updated successfully.`, 'success');
        setDirtyRows({});
        setOriginalItems(JSON.parse(JSON.stringify(items)));
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
      sellingPrice: 0,
      locationId: docLocationId || (locations[0]?._id) || '',
      availableQty: 0,
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

  const handlePrintPDF = async () => {
    if (hasUnsavedChanges) {
      showAlert('Please save all changes before printing the PDF.', 'error');
      return;
    }

    try {
      setSaving(true);
      const pdfItems = activeItems.map(item => ({
        productId: item.productId,
        productName: item.companyName && item.companyName !== '-' ? `${item.name} (${item.companyName})` : item.name,
        unit: item.unit || '',
        quantity: item.quantity,
        sellingPrice: item.sellingPrice
      }));

      const payload = {
        docNo: parseInt(docNo, 10),
        date: docDate,
        locationId: docLocationId || activeItems[0]?.locationId,
        locationName: docLocationName || locations.find(l => l._id === (docLocationId || activeItems[0]?.locationId))?.name || 'Unknown',
        trainerName,
        storeIncharge,
        takenBy,
        veterinarian,
        comments,
        items: pdfItems
      };

      const res = await axios.post(
        `${process.env.REACT_APP_DEVELOPMENT}/api/stockOutPdf`,
        payload,
        { headers: { token } }
      );

      if (res.data?.success && res.data.data?._id) {
        navigate(`/stockoutpdf/${res.data.data._id}?autoPrint=true`);
      } else {
        showAlert('Failed to generate print document.', 'error');
      }
    } catch (err) {
      console.error(err);
      showAlert('Error preparing PDF print document.', 'error');
    } finally {
      setSaving(false);
    }
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
  const totalValue = activeItems.reduce((sum, item) => sum + (Number(item.quantity || 0) * Number(item.sellingPrice || 0)), 0);

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
              <Sparkles className="h-8 w-8 text-blue-500" />
              Document Excel Editor (Out): Doc #{docNo}
            </h1>
            <p className="text-sm text-gray-500 mt-1">Spreadsheet style bulk-editing, fast keystrokes, inline validation.</p>
          </div>
        </div>

        <div className="flex items-center gap-4">
          {isAdmin && (
            <div className="text-right">
              <div className="text-xs text-gray-500 uppercase tracking-wider font-semibold">Document Value</div>
              <div className="text-xl font-black text-red-600">QR {totalValue.toFixed(2)}</div>
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
              onClick={handlePrintPDF}
              disabled={loading || saving}
              variant="outline"
              className="border-blue-600 text-blue-600 hover:bg-blue-50 font-bold px-6 gap-2"
            >
              <Printer className="h-4 w-4" />
              Print PDF
            </Button>
            <Button
              onClick={handleSaveAll}
              disabled={saving || !hasUnsavedChanges}
              className="bg-blue-600 hover:bg-blue-700 text-white font-bold px-6 gap-2"
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
              className="bg-blue-600 hover:bg-blue-700 text-white font-bold gap-1.5 px-4 shadow"
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
                    <th className="w-40 p-3">Expiry Date</th>
                    <th className="w-28 p-3 text-right">Quantity *</th>
                    {isAdmin && <th className="w-32 p-3 text-right">Unit Price *</th>}
                    {isAdmin && <th className="w-32 p-3 text-right">Total Price</th>}
                    <th className="w-48 p-3">Location *</th>
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
                    const rowTotalPrice = (Number(item.quantity) * Number(item.sellingPrice)).toFixed(2);
                    
                    return (
                      <tr
                        key={item._id}
                        className={`divide-x divide-gray-200 transition-colors ${
                          isRowDirty
                            ? 'bg-blue-50 hover:bg-blue-100/60'
                            : isRowInvalid
                            ? 'bg-red-50/50 hover:bg-red-50'
                            : 'hover:bg-slate-50/70'
                        }`}
                      >
                        <td className="text-center text-xs font-semibold text-gray-400 p-2">
                          {globalIdx + 1}
                        </td>
                        
                        {/* Product Selector — mirrors Stock Out page: shows inventory qty, expiry, price */}
                        <td className="p-1">
                          <StockOutProductDropdownCell
                            item={item}
                            stocks={stocks}
                            onSelect={(stockEntry) => handleProductChange(globalIdx, stockEntry)}
                            cellId={`cell-${globalIdx}-productId`}
                          />
                        </td>

                        <td className="p-2 text-gray-600 truncate">{item.companyName}</td>
                        <td className="p-2 text-center text-gray-600">{item.unit}</td>
                        {/* Expiry Date — editable in case product was changed or needs correction */}
                        <td className="p-1">
                          <input
                            id={`cell-${globalIdx}-expiry`}
                            type="date"
                            value={item.expiry || ''}
                            onKeyDown={(e) => handleKeyDown(e, globalIdx, 'expiry')}
                            onChange={(e) => handleCellChange(globalIdx, 'expiry', e.target.value)}
                            className="w-full h-8 px-2 border bg-transparent focus:bg-white focus:ring-2 focus:ring-blue-500 rounded focus:outline-none transition-all text-xs"
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
                        {isAdmin && (
                          <td className="p-2 text-right text-gray-600 font-semibold bg-gray-50/50">
                            QR {rowTotalPrice}
                          </td>
                        )}
                        <td className="p-1">
                          <select
                            id={`cell-${globalIdx}-locationId`}
                            value={item.locationId}
                            onKeyDown={(e) => handleKeyDown(e, globalIdx, 'locationId')}
                            onChange={(e) => handleCellChange(globalIdx, 'locationId', e.target.value)}
                            className="w-full h-8 px-2 border-0 bg-transparent focus:bg-white focus:ring-2 focus:ring-blue-500 rounded focus:outline-none transition-all cursor-pointer"
                          >
                            <option value="">Select Location</option>
                            {locations.map(loc => (
                              <option key={loc._id} value={loc._id}>{loc.name}</option>
                            ))}
                          </select>
                        </td>
                        <td className="p-2 text-center">
                          {isRowDirty ? (
                            <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-semibold bg-blue-100 text-blue-800 border border-blue-200">
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
                className="w-full sm:w-auto bg-blue-600 hover:bg-blue-700 text-white font-bold"
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

export default StockOutDocExcelEdit;
