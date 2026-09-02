import React, { useState, useEffect, useMemo } from 'react';
import axios from 'axios';
import { Button } from '../../components/ui/button';
import { Input } from '../../components/ui/input';
import { Card, CardContent, CardHeader, CardTitle } from '../../components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '../../components/ui/table';
import { Alert, AlertDescription } from '../../components/ui/alert';
import {
  Search, Tag, History, AlertCircle, RefreshCw, Layers, Save,
  Download, RotateCcw, Calendar, Filter, User, Building2,
  TrendingUp, TrendingDown, Clock, Sparkles, X
} from 'lucide-react';
import moment from 'moment';
import * as XLSX from 'xlsx';
import { getToken } from '../../utils/auth';

const API_BASE = process.env.REACT_APP_DEVELOPMENT;

const SellingPriceUpdate = () => {
  // Main Tab Control: 'update' (Bulk Update Table) or 'history' (Price History Log)
  const [activeTab, setActiveTab] = useState('update');

  // Bulk Edit Table State
  const [data, setData] = useState([]);
  const [searchQuery, setSearchQuery] = useState('');
  const [editedPrices, setEditedPrices] = useState({});
  const [savingBulk, setSavingBulk] = useState(false);
  const [loadingProducts, setLoadingProducts] = useState(true);

  // Alert Banner State
  const [alert, setAlert] = useState({ show: false, message: '', type: '' });

  // History State & Filters
  const [allHistory, setAllHistory] = useState([]);
  const [loadingHistory, setLoadingHistory] = useState(false);
  const [fromDate, setFromDate] = useState('');
  const [toDate, setToDate] = useState('');
  const [historySearchProduct, setHistorySearchProduct] = useState('');
  const [historySearchCompany, setHistorySearchCompany] = useState('');
  const [historySearchUser, setHistorySearchUser] = useState('');
  const [activeQuickFilter, setActiveQuickFilter] = useState('all');

  // Single Product History Modal State
  const [historyModalProduct, setHistoryModalProduct] = useState(null);
  const [singleProductHistory, setSingleProductHistory] = useState([]);
  const [loadingSingleHistory, setLoadingSingleHistory] = useState(false);

  const accessToken = getToken();

  useEffect(() => {
    fetchProductsAndPrices();
    fetchAllPriceHistory();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const showAlert = (message, type = 'info') => {
    setAlert({ show: true, message, type });
    setTimeout(() => setAlert({ show: false, message: '', type: '' }), 5000);
  };

  // ─────────────────────────────────────────────────────────────────────────────
  // FETCH DATA
  // ─────────────────────────────────────────────────────────────────────────────
  const fetchProductsAndPrices = () => {
    setLoadingProducts(true);
    axios.get(`${API_BASE}/api/stock/getAllStocks`, {
      headers: { token: accessToken }
    })
      .then((res) => {
        const stocks = res.data.result || [];
        const processed = stocks.map(stock => {
          const product = stock.product || {};
          const name = stock.name || product.name || '-';
          const companyName = product.companyName || stock.companyName || '-';
          const unit = product.unit || stock.unit || '-';
          const totalQty = stock.totalQuantity !== undefined ? stock.totalQuantity : (stock.quantity || 0);

          let earliestExpiry = null;
          if (stock.expiryArray && stock.expiryArray.length > 0) {
            const expiries = stock.expiryArray
              .filter(e => e.expiry)
              .map(e => new Date(e.expiry))
              .sort((a, b) => a - b);
            if (expiries.length > 0) {
              earliestExpiry = expiries[0];
            }
          }

          let sellingPrice = product.sellingPrice || stock.sellingPrice || 0;
          if (!sellingPrice && stock.expiryArray && stock.expiryArray.length > 0) {
            const foundSp = stock.expiryArray.find(e => e.sellingPrice > 0);
            if (foundSp) sellingPrice = foundSp.sellingPrice;
          }

          const prodId = product._id || stock.productId || stock._id;

          return {
            _id: prodId,
            productId: prodId,
            name,
            companyName,
            unit,
            totalQuantity: totalQty,
            expiry: earliestExpiry,
            sellingPrice: Number(sellingPrice) || 0
          };
        });

        setData(processed);
        setLoadingProducts(false);
      })
      .catch((err) => {
        console.error('Error fetching products for price update:', err);
        showAlert('Failed to load products list', 'error');
        setLoadingProducts(false);
      });
  };

  const fetchAllPriceHistory = () => {
    setLoadingHistory(true);
    axios.get(`${API_BASE}/api/product/getAllSellingPriceHistory`, {
      headers: { token: accessToken }
    })
      .then((res) => {
        setAllHistory(res.data.result || []);
        setLoadingHistory(false);
      })
      .catch((err) => {
        console.error('Error fetching all price history:', err);
        setLoadingHistory(false);
      });
  };

  // ─────────────────────────────────────────────────────────────────────────────
  // BULK EDIT COMPUTATIONS & HANDLERS
  // ─────────────────────────────────────────────────────────────────────────────
  const filteredProducts = useMemo(() => {
    if (!searchQuery.trim()) return data;
    const q = searchQuery.toLowerCase();
    return data.filter(item =>
      (item.name || '').toLowerCase().includes(q) ||
      (item.companyName || '').toLowerCase().includes(q) ||
      (item.unit || '').toLowerCase().includes(q)
    );
  }, [data, searchQuery]);

  // Compute modified rows map & count
  const modifiedItemsMap = useMemo(() => {
    const map = {};
    data.forEach(p => {
      const inputVal = editedPrices[p.productId];
      if (inputVal !== undefined && inputVal !== '' && inputVal !== null) {
        const numVal = parseFloat(inputVal);
        if (!isNaN(numVal) && numVal >= 0) {
          const currentRounded = Math.round((p.sellingPrice || 0) * 100) / 100;
          const newRounded = Math.round(numVal * 100) / 100;
          if (currentRounded !== newRounded) {
            map[p.productId] = {
              product: p,
              oldPrice: currentRounded,
              newPrice: newRounded,
              difference: Math.round((newRounded - currentRounded) * 100) / 100
            };
          }
        }
      }
    });
    return map;
  }, [data, editedPrices]);

  const modifiedCount = Object.keys(modifiedItemsMap).length;

  const handlePriceChange = (productId, value) => {
    setEditedPrices(prev => ({
      ...prev,
      [productId]: value
    }));
  };

  const handleResetSingleEdit = (productId) => {
    setEditedPrices(prev => {
      const next = { ...prev };
      delete next[productId];
      return next;
    });
  };

  const handleResetAllEdits = () => {
    setEditedPrices({});
    showAlert('All pending price edits have been cleared.', 'info');
  };

  const handleSaveAllChanges = () => {
    const modifiedKeys = Object.keys(modifiedItemsMap);
    if (modifiedKeys.length === 0) {
      showAlert('No price changes detected to save.', 'info');
      return;
    }

    const payloadUpdates = modifiedKeys.map(prodId => ({
      productId: prodId,
      newSellingPrice: modifiedItemsMap[prodId].newPrice
    }));

    setSavingBulk(true);

    axios.post(
      `${API_BASE}/api/product/bulkUpdateSellingPrices`,
      { updates: payloadUpdates },
      { headers: { token: accessToken } }
    )
      .then((res) => {
        const { updatedCount, message } = res.data;
        showAlert(`🎉 ${message || `Successfully updated ${updatedCount} selling prices!`}`, 'success');
        setEditedPrices({});
        fetchProductsAndPrices();
        fetchAllPriceHistory();
        setSavingBulk(false);
      })
      .catch((err) => {
        console.error('Error saving bulk selling prices:', err);
        showAlert(err.response?.data?.error || err.response?.data?.msg || 'Failed to save selling prices', 'error');
        setSavingBulk(false);
      });
  };

  // ─────────────────────────────────────────────────────────────────────────────
  // PRICE HISTORY FILTERS & EXPORT LOGIC
  // ─────────────────────────────────────────────────────────────────────────────
  const applyQuickFilter = (preset) => {
    setActiveQuickFilter(preset);
    const today = moment().format('YYYY-MM-DD');

    if (preset === 'today') {
      setFromDate(today);
      setToDate(today);
    } else if (preset === 'yesterday') {
      const yest = moment().subtract(1, 'day').format('YYYY-MM-DD');
      setFromDate(yest);
      setToDate(yest);
    } else if (preset === 'week') {
      const startOfWeek = moment().startOf('week').format('YYYY-MM-DD');
      setFromDate(startOfWeek);
      setToDate(today);
    } else if (preset === 'month') {
      const startOfMonth = moment().startOf('month').format('YYYY-MM-DD');
      setFromDate(startOfMonth);
      setToDate(today);
    } else { // 'all'
      setFromDate('');
      setToDate('');
    }
  };

  const handleClearFilters = () => {
    setFromDate('');
    setToDate('');
    setHistorySearchProduct('');
    setHistorySearchCompany('');
    setHistorySearchUser('');
    setActiveQuickFilter('all');
  };

  const filteredHistory = useMemo(() => {
    return allHistory.filter(item => {
      const itemDate = moment(item.createdAt);

      if (fromDate) {
        const start = moment(fromDate, 'YYYY-MM-DD').startOf('day');
        if (itemDate.isBefore(start)) return false;
      }

      if (toDate) {
        const end = moment(toDate, 'YYYY-MM-DD').endOf('day');
        if (itemDate.isAfter(end)) return false;
      }

      if (historySearchProduct.trim()) {
        const q = historySearchProduct.toLowerCase();
        const pName = (item.productName || item.productId?.name || '').toLowerCase();
        if (!pName.includes(q)) return false;
      }

      if (historySearchCompany.trim()) {
        const q = historySearchCompany.toLowerCase();
        const cName = (item.companyName || item.productId?.companyName || '').toLowerCase();
        if (!cName.includes(q)) return false;
      }

      if (historySearchUser.trim()) {
        const q = historySearchUser.toLowerCase();
        const uName = (item.updatedByName || item.updatedBy?.userName || '').toLowerCase();
        if (!uName.includes(q)) return false;
      }

      return true;
    });
  }, [allHistory, fromDate, toDate, historySearchProduct, historySearchCompany, historySearchUser]);

  // EXCEL EXPORT (EXCLUSIVELY FOR HISTORY LOG DATA)
  const handleExportExcel = () => {
    if (filteredHistory.length === 0) {
      showAlert('No history records match the current filters to export.', 'info');
      return;
    }

    const exportRows = filteredHistory.map(item => {
      const created = moment(item.createdAt);
      const oldVal = Number(item.oldSellingPrice || 0);
      const newVal = Number(item.newSellingPrice || 0);
      const diffVal = newVal - oldVal;
      const diffFormatted = diffVal > 0 ? `+${diffVal.toFixed(2)}` : diffVal.toFixed(2);

      return {
        'Date': created.format('DD-MM-YYYY'),
        'Time': created.format('hh:mm A'),
        'Product Name': item.productName || item.productId?.name || '-',
        'Company Name': item.companyName || item.productId?.companyName || '-',
        'Old Selling Price': oldVal.toFixed(2),
        'New Selling Price': newVal.toFixed(2),
        'Difference': diffFormatted,
        'Updated By': item.updatedByName || item.updatedBy?.userName || 'Admin'
      };
    });

    const worksheet = XLSX.utils.json_to_sheet(exportRows);

    // Custom column widths
    worksheet['!cols'] = [
      { wch: 14 }, // Date
      { wch: 12 }, // Time
      { wch: 32 }, // Product Name
      { wch: 25 }, // Company Name
      { wch: 18 }, // Old Selling Price
      { wch: 18 }, // New Selling Price
      { wch: 15 }, // Difference
      { wch: 18 }  // Updated By
    ];

    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, worksheet, 'Price History');

    let filename = 'Selling_Price_History';
    if (fromDate && toDate) {
      filename += `_${fromDate}_to_${toDate}`;
    } else if (fromDate) {
      filename += `_from_${fromDate}`;
    } else {
      filename += `_${moment().format('YYYY-MM-DD')}`;
    }
    filename += '.xlsx';

    XLSX.writeFile(workbook, filename);
    showAlert(`Successfully exported ${exportRows.length} history records to ${filename}! 📊`, 'success');
  };

  // Single Product History Modal Loader
  const handleOpenSingleHistory = (product) => {
    setHistoryModalProduct(product);
    setLoadingSingleHistory(true);
    setSingleProductHistory([]);

    axios.get(`${API_BASE}/api/product/sellingPriceHistory/${product.productId}`, {
      headers: { token: accessToken }
    })
      .then((res) => {
        setSingleProductHistory(res.data.result || []);
        setLoadingSingleHistory(false);
      })
      .catch((err) => {
        console.error('Error fetching product price history:', err);
        showAlert('Failed to fetch history for this product', 'error');
        setLoadingSingleHistory(false);
      });
  };

  return (
    <div className="container mx-auto p-6 space-y-6 max-w-[1600px]">
      {/* Top Header */}
      <div className="flex items-center justify-between flex-wrap gap-4 bg-gradient-to-r from-slate-900 via-blue-950 to-slate-900 text-white p-6 rounded-2xl shadow-xl">
        <div className="space-y-1">
          <div className="flex items-center gap-3">
            <div className="p-2.5 bg-blue-500/20 border border-blue-400/30 rounded-xl backdrop-blur-md">
              <Tag className="h-7 w-7 text-blue-400" />
            </div>
            <div>
              <h1 className="text-2xl font-bold tracking-tight text-white flex items-center gap-2">
                Selling Price Update &amp; History
              </h1>
              <p className="text-xs text-blue-200/80">
                Bulk price editor with complete date-filtered audit trail history
              </p>
            </div>
          </div>
        </div>

        {/* Tab Selection Navigation */}
        <div className="flex items-center gap-2 bg-white/10 p-1.5 rounded-xl backdrop-blur-md border border-white/10">
          <button
            onClick={() => setActiveTab('update')}
            className={`flex items-center gap-2 px-4 py-2.5 rounded-lg font-semibold text-sm transition-all ${
              activeTab === 'update'
                ? 'bg-blue-600 text-white shadow-lg shadow-blue-500/30'
                : 'text-blue-100 hover:bg-white/10 hover:text-white'
            }`}
          >
            <Sparkles className="h-4 w-4" />
            Bulk Price Editor
            {modifiedCount > 0 && (
              <span className="ml-1 px-2 py-0.5 text-xs bg-amber-400 text-slate-900 font-extrabold rounded-full">
                {modifiedCount}
              </span>
            )}
          </button>

          <button
            onClick={() => setActiveTab('history')}
            className={`flex items-center gap-2 px-4 py-2.5 rounded-lg font-semibold text-sm transition-all ${
              activeTab === 'history'
                ? 'bg-purple-600 text-white shadow-lg shadow-purple-500/30'
                : 'text-purple-100 hover:bg-white/10 hover:text-white'
            }`}
          >
            <History className="h-4 w-4" />
            Price History Log
            <span className="ml-1 px-2 py-0.5 text-xs bg-purple-400/30 text-purple-200 font-bold rounded-full border border-purple-300/30">
              {allHistory.length}
            </span>
          </button>
        </div>
      </div>

      {/* Global Alert */}
      {alert.show && (
        <Alert
          variant={alert.type === 'error' ? 'destructive' : 'default'}
          className={`animate-in fade-in slide-in-from-top duration-200 border-2 ${
            alert.type === 'success'
              ? 'bg-emerald-50 border-emerald-300 text-emerald-900'
              : alert.type === 'error'
              ? 'bg-red-50 border-red-300 text-red-900'
              : 'bg-blue-50 border-blue-300 text-blue-900'
          }`}
        >
          <AlertCircle className="h-5 w-5" />
          <AlertDescription className="font-semibold text-sm ml-2">
            {alert.message}
          </AlertDescription>
        </Alert>
      )}

      {/* ─────────────────────────────────────────────────────────────────────────────
          TAB 1: BULK PRICE EDITING TABLE
      ───────────────────────────────────────────────────────────────────────────── */}
      {activeTab === 'update' && (
        <div className="space-y-6 animate-in fade-in duration-200">
          {/* Summary Metric Cards */}
          <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
            <Card className="border-l-4 border-l-blue-600 shadow-sm bg-white hover:shadow-md transition-shadow">
              <CardContent className="pt-5 pb-5">
                <div className="flex items-center justify-between">
                  <div>
                    <div className="text-2xl font-black text-slate-800">{data.length}</div>
                    <p className="text-xs font-semibold text-slate-500 mt-1">Total Products</p>
                  </div>
                  <div className="p-3 bg-blue-50 text-blue-600 rounded-xl">
                    <Layers className="h-6 w-6" />
                  </div>
                </div>
              </CardContent>
            </Card>

            <Card className="border-l-4 border-l-amber-500 shadow-sm bg-white hover:shadow-md transition-shadow">
              <CardContent className="pt-5 pb-5">
                <div className="flex items-center justify-between">
                  <div>
                    <div className="text-2xl font-black text-amber-600">{modifiedCount}</div>
                    <p className="text-xs font-semibold text-slate-500 mt-1">Pending Price Edits</p>
                  </div>
                  <div className="p-3 bg-amber-50 text-amber-600 rounded-xl">
                    <Sparkles className="h-6 w-6" />
                  </div>
                </div>
              </CardContent>
            </Card>

            <Card className="border-l-4 border-l-emerald-600 shadow-sm bg-white hover:shadow-md transition-shadow">
              <CardContent className="pt-5 pb-5">
                <div className="flex items-center justify-between">
                  <div>
                    <div className="text-2xl font-black text-emerald-600">
                      {data.filter(p => (p.sellingPrice || 0) > 0).length}
                    </div>
                    <p className="text-xs font-semibold text-slate-500 mt-1">Products with Price Set</p>
                  </div>
                  <div className="p-3 bg-emerald-50 text-emerald-600 rounded-xl">
                    <Tag className="h-6 w-6" />
                  </div>
                </div>
              </CardContent>
            </Card>

            <Card className="border-l-4 border-l-purple-600 shadow-sm bg-white hover:shadow-md transition-shadow">
              <CardContent className="pt-5 pb-5">
                <div className="flex items-center justify-between">
                  <div>
                    <div className="text-2xl font-black text-purple-700">{allHistory.length}</div>
                    <p className="text-xs font-semibold text-slate-500 mt-1">Total Price Changes Logged</p>
                  </div>
                  <div className="p-3 bg-purple-50 text-purple-600 rounded-xl">
                    <History className="h-6 w-6" />
                  </div>
                </div>
              </CardContent>
            </Card>
          </div>

          {/* Action Header & Search Bar */}
          <Card className="border shadow-sm">
            <CardContent className="pt-6 pb-6">
              <div className="flex flex-col md:flex-row items-center justify-between gap-4">
                <div className="relative flex-1 w-full">
                  <Input
                    icon={Search}
                    placeholder="Search product by name, company, or unit..."
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    clearable
                    onClear={() => setSearchQuery('')}
                    className="h-11 text-base shadow-sm"
                  />
                </div>

                <div className="flex items-center gap-3 w-full md:w-auto justify-end flex-wrap">
                  <Button
                    variant="outline"
                    onClick={fetchProductsAndPrices}
                    disabled={loadingProducts}
                    className="h-11 gap-2 font-semibold text-slate-700 border-slate-300 hover:bg-slate-50"
                  >
                    <RefreshCw className={`h-4 w-4 ${loadingProducts ? 'animate-spin' : ''}`} />
                    Refresh
                  </Button>

                  {modifiedCount > 0 && (
                    <Button
                      variant="outline"
                      onClick={handleResetAllEdits}
                      disabled={savingBulk}
                      className="h-11 gap-2 text-rose-700 border-rose-200 bg-rose-50/50 hover:bg-rose-100 font-semibold"
                    >
                      <RotateCcw className="h-4 w-4" />
                      Reset All Edits ({modifiedCount})
                    </Button>
                  )}

                  <Button
                    onClick={handleSaveAllChanges}
                    disabled={savingBulk || modifiedCount === 0}
                    className={`h-11 px-6 font-bold gap-2 text-white shadow-lg transition-all ${
                      modifiedCount > 0
                        ? 'bg-emerald-600 hover:bg-emerald-700 shadow-emerald-600/30 animate-pulse'
                        : 'bg-slate-400 cursor-not-allowed'
                    }`}
                  >
                    <Save className="h-5 w-5" />
                    {savingBulk
                      ? 'Saving Prices...'
                      : modifiedCount > 0
                      ? `Save All Changes (${modifiedCount})`
                      : 'Save All Changes'}
                  </Button>
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Excel-Style Bulk Editing Table */}
          <Card className="border shadow-md overflow-hidden">
            <CardHeader className="bg-slate-50/80 border-b py-4">
              <div className="flex items-center justify-between">
                <CardTitle className="text-base font-bold text-slate-800 flex items-center gap-2">
                  <Layers className="h-5 w-5 text-blue-600" />
                  Product Selling Price Table ({filteredProducts.length})
                </CardTitle>
                <div className="text-xs text-slate-500 font-medium flex items-center gap-2">
                  <span className="inline-block w-3 h-3 rounded-full bg-amber-400"></span>
                  <span>Highlighted rows indicate unsaved price edits</span>
                </div>
              </div>
            </CardHeader>
            <CardContent className="p-0">
              {loadingProducts ? (
                <div className="text-center py-20 text-slate-400 space-y-2">
                  <RefreshCw className="h-8 w-8 animate-spin mx-auto text-blue-600" />
                  <p className="font-semibold text-sm text-slate-600">Loading products &amp; prices...</p>
                </div>
              ) : (
                <div className="overflow-x-auto">
                  <Table>
                    <TableHeader className="bg-slate-100/90 border-b border-slate-200">
                      <TableRow>
                        <TableHead className="font-bold text-slate-800 py-3.5 pl-6 min-w-[220px]">Product Name</TableHead>
                        <TableHead className="font-bold text-slate-800 py-3.5 min-w-[160px]">Company Name</TableHead>
                        <TableHead className="font-bold text-slate-800 py-3.5 min-w-[100px]">Unit</TableHead>
                        <TableHead className="font-bold text-slate-800 py-3.5 text-right min-w-[100px]">Quantity</TableHead>
                        <TableHead className="font-bold text-slate-800 py-3.5 min-w-[120px]">Expiry</TableHead>
                        <TableHead className="font-bold text-slate-800 py-3.5 text-right min-w-[160px]">Current Selling Price</TableHead>
                        <TableHead className="font-bold text-slate-800 py-3.5 text-center min-w-[180px] bg-blue-50/80 border-x border-blue-200/60">
                          New Selling Price (QR)
                        </TableHead>
                        <TableHead className="font-bold text-slate-800 py-3.5 text-center min-w-[140px]">Action</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {filteredProducts.length === 0 ? (
                        <TableRow>
                          <TableCell colSpan={8} className="text-center py-16 text-slate-400 font-medium">
                            {searchQuery ? `No products matching "${searchQuery}".` : 'No products found.'}
                          </TableCell>
                        </TableRow>
                      ) : (
                        filteredProducts.map((product) => {
                          const modifiedData = modifiedItemsMap[product.productId];
                          const isModified = !!modifiedData;
                          const inputValue = editedPrices[product.productId] !== undefined
                            ? editedPrices[product.productId]
                            : product.sellingPrice !== undefined && product.sellingPrice !== null
                            ? String(product.sellingPrice)
                            : '0';

                          return (
                            <TableRow
                              key={product.productId}
                              className={`transition-colors border-b border-slate-100 ${
                                isModified
                                  ? 'bg-amber-50/80 hover:bg-amber-100/70 border-l-4 border-l-amber-500'
                                  : 'hover:bg-slate-50/80'
                              }`}
                            >
                              {/* Product Name */}
                              <TableCell className="font-bold text-slate-900 pl-6">
                                <div className="flex items-center gap-2">
                                  <span>{product.name}</span>
                                  {isModified && (
                                    <span className="px-2 py-0.5 text-[10px] font-extrabold uppercase tracking-wider bg-amber-500 text-white rounded-full shadow-sm">
                                      Modified
                                    </span>
                                  )}
                                </div>
                              </TableCell>

                              {/* Company Name */}
                              <TableCell className="text-slate-700 font-medium">
                                {product.companyName}
                              </TableCell>

                              {/* Unit */}
                              <TableCell className="text-slate-600 text-sm">
                                {product.unit}
                              </TableCell>

                              {/* Total Quantity */}
                              <TableCell className="text-right font-bold text-blue-700">
                                {product.totalQuantity || 0}
                              </TableCell>

                              {/* Expiry */}
                              <TableCell className="text-slate-600 text-sm font-medium">
                                {product.expiry ? moment(product.expiry).format('DD/MM/YYYY') : '-'}
                              </TableCell>

                              {/* Current Selling Price */}
                              <TableCell className="text-right font-bold text-slate-700">
                                <span className="text-xs text-slate-400 font-normal mr-1">QR</span>
                                <span className="text-base text-slate-900 font-extrabold">
                                  {product.sellingPrice ? Number(product.sellingPrice).toFixed(2) : '0.00'}
                                </span>
                              </TableCell>

                              {/* New Selling Price Input Cell */}
                              <TableCell className={`py-2 px-3 text-center border-x ${
                                isModified ? 'bg-amber-100/60 border-amber-300' : 'bg-blue-50/30 border-blue-100'
                              }`}>
                                <div className="flex flex-col items-center gap-1">
                                  <div className="relative w-36">
                                    <span className="absolute left-2.5 top-1/2 -translate-y-1/2 text-xs font-bold text-slate-400">
                                      QR
                                    </span>
                                    <input
                                      type="number"
                                      min="0"
                                      step="0.01"
                                      value={inputValue}
                                      onChange={(e) => handlePriceChange(product.productId, e.target.value)}
                                      placeholder="0.00"
                                      className={`w-full pl-9 pr-3 py-1.5 text-right font-extrabold text-sm border-2 rounded-lg transition-all focus:outline-none ${
                                        isModified
                                          ? 'border-amber-500 bg-white text-slate-900 shadow-md ring-2 ring-amber-400/40'
                                          : 'border-slate-300 bg-white focus:border-blue-600 focus:ring-2 focus:ring-blue-500/20 text-slate-800'
                                      }`}
                                    />
                                  </div>

                                  {/* Difference badge if modified */}
                                  {isModified && (
                                    <div className="flex items-center gap-1 text-[11px] font-bold">
                                      {modifiedData.difference > 0 ? (
                                        <span className="text-emerald-700 flex items-center">
                                          <TrendingUp className="h-3 w-3 mr-0.5" /> +QR {modifiedData.difference.toFixed(2)}
                                        </span>
                                      ) : (
                                        <span className="text-rose-700 flex items-center">
                                          <TrendingDown className="h-3 w-3 mr-0.5" /> -QR {Math.abs(modifiedData.difference).toFixed(2)}
                                        </span>
                                      )}
                                    </div>
                                  )}
                                </div>
                              </TableCell>

                              {/* Actions */}
                              <TableCell className="text-center">
                                <div className="flex items-center justify-center gap-2">
                                  {isModified ? (
                                    <button
                                      onClick={() => handleResetSingleEdit(product.productId)}
                                      className="p-1.5 text-slate-500 hover:text-rose-600 hover:bg-rose-50 rounded-lg transition-colors"
                                      title="Reset this edit"
                                    >
                                      <RotateCcw className="h-4 w-4" />
                                    </button>
                                  ) : (
                                    <span className="text-xs text-slate-300 italic">Unchanged</span>
                                  )}

                                  <Button
                                    size="sm"
                                    variant="ghost"
                                    onClick={() => handleOpenSingleHistory(product)}
                                    className="h-8 px-2 text-purple-600 hover:bg-purple-50 hover:text-purple-800 text-xs font-semibold gap-1"
                                    title="View price history log for this product"
                                  >
                                    <History className="h-3.5 w-3.5" />
                                    History
                                  </Button>
                                </div>
                              </TableCell>
                            </TableRow>
                          );
                        })
                      )}
                    </TableBody>
                  </Table>
                </div>
              )}
            </CardContent>
          </Card>
        </div>
      )}

      {/* ─────────────────────────────────────────────────────────────────────────────
          TAB 2: PRICE CHANGE HISTORY & AUDIT LOG (WITH DATE FILTERS & EXCEL EXPORT)
      ───────────────────────────────────────────────────────────────────────────── */}
      {activeTab === 'history' && (
        <div className="space-y-6 animate-in fade-in duration-200">
          {/* History Controls & Date-wise Filters */}
          <Card className="border shadow-md bg-white">
            <CardHeader className="border-b bg-purple-50/50 pb-4">
              <div className="flex items-center justify-between flex-wrap gap-3">
                <CardTitle className="text-base font-bold text-slate-900 flex items-center gap-2">
                  <Filter className="h-5 w-5 text-purple-600" />
                  Date-wise History Filters &amp; Search
                </CardTitle>
                <div className="flex items-center gap-2">
                  <Button
                    onClick={handleExportExcel}
                    className="bg-emerald-600 hover:bg-emerald-700 text-white font-bold gap-2 shadow-md shadow-emerald-600/20"
                    title="Export currently filtered history data to Excel file"
                  >
                    <Download className="h-4 w-4" />
                    Export Excel ({filteredHistory.length})
                  </Button>
                </div>
              </div>
            </CardHeader>

            <CardContent className="pt-6 space-y-6">
              {/* Quick Filters */}
              <div className="flex items-center gap-2 flex-wrap pb-3 border-b border-slate-100">
                <span className="text-xs font-bold text-slate-500 uppercase tracking-wider mr-2 flex items-center gap-1">
                  <Clock className="h-3.5 w-3.5 text-slate-400" /> Quick Presets:
                </span>
                {[
                  { id: 'all', label: 'All Time' },
                  { id: 'today', label: 'Today' },
                  { id: 'yesterday', label: 'Yesterday' },
                  { id: 'week', label: 'This Week' },
                  { id: 'month', label: 'This Month' }
                ].map(preset => (
                  <button
                    key={preset.id}
                    onClick={() => applyQuickFilter(preset.id)}
                    className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all border ${
                      activeQuickFilter === preset.id
                        ? 'bg-purple-600 text-white border-purple-600 shadow-sm'
                        : 'bg-slate-50 text-slate-600 border-slate-200 hover:bg-purple-50 hover:border-purple-200'
                    }`}
                  >
                    {preset.label}
                  </button>
                ))}
              </div>

              {/* Date Range Inputs */}
              <div className="grid grid-cols-1 md:grid-cols-4 gap-4 items-end">
                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1.5 flex items-center gap-1">
                    <Calendar className="h-3.5 w-3.5 text-purple-600" /> From Date
                  </label>
                  <input
                    type="date"
                    value={fromDate}
                    onChange={(e) => {
                      setFromDate(e.target.value);
                      setActiveQuickFilter('custom');
                    }}
                    className="w-full h-10 px-3 py-2 text-sm border-2 border-slate-200 rounded-lg focus:outline-none focus:border-purple-600 font-medium"
                  />
                </div>

                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1.5 flex items-center gap-1">
                    <Calendar className="h-3.5 w-3.5 text-purple-600" /> To Date
                  </label>
                  <input
                    type="date"
                    value={toDate}
                    onChange={(e) => {
                      setToDate(e.target.value);
                      setActiveQuickFilter('custom');
                    }}
                    className="w-full h-10 px-3 py-2 text-sm border-2 border-slate-200 rounded-lg focus:outline-none focus:border-purple-600 font-medium"
                  />
                </div>

                <div className="flex items-center gap-2 col-span-1 md:col-span-2 justify-end">
                  <Button
                    variant="outline"
                    onClick={handleClearFilters}
                    className="h-10 text-slate-600 border-slate-300 hover:bg-slate-100 font-semibold gap-1"
                  >
                    <RotateCcw className="h-4 w-4" /> Clear Filters
                  </Button>
                </div>
              </div>

              {/* Text Search Filters */}
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4 pt-2">
                <div>
                  <label className="block text-xs font-bold text-slate-600 mb-1 flex items-center gap-1">
                    <Search className="h-3.5 w-3.5 text-slate-400" /> Product Name Search
                  </label>
                  <Input
                    placeholder="Search product..."
                    value={historySearchProduct}
                    onChange={(e) => setHistorySearchProduct(e.target.value)}
                    clearable
                    onClear={() => setHistorySearchProduct('')}
                    className="h-10 text-sm"
                  />
                </div>

                <div>
                  <label className="block text-xs font-bold text-slate-600 mb-1 flex items-center gap-1">
                    <Building2 className="h-3.5 w-3.5 text-slate-400" /> Company Name Search
                  </label>
                  <Input
                    placeholder="Search company..."
                    value={historySearchCompany}
                    onChange={(e) => setHistorySearchCompany(e.target.value)}
                    clearable
                    onClear={() => setHistorySearchCompany('')}
                    className="h-10 text-sm"
                  />
                </div>

                <div>
                  <label className="block text-xs font-bold text-slate-600 mb-1 flex items-center gap-1">
                    <User className="h-3.5 w-3.5 text-slate-400" /> Updated By Search
                  </label>
                  <Input
                    placeholder="Search user..."
                    value={historySearchUser}
                    onChange={(e) => setHistorySearchUser(e.target.value)}
                    clearable
                    onClear={() => setHistorySearchUser('')}
                    className="h-10 text-sm"
                  />
                </div>
              </div>
            </CardContent>
          </Card>

          {/* History Data Table */}
          <Card className="border shadow-md overflow-hidden">
            <CardHeader className="bg-slate-50 border-b py-4">
              <div className="flex items-center justify-between">
                <CardTitle className="text-base font-bold text-slate-800 flex items-center gap-2">
                  <History className="h-5 w-5 text-purple-600" />
                  Price Update History Log ({filteredHistory.length} records)
                </CardTitle>
                <span className="text-xs text-purple-700 font-bold bg-purple-100 px-3 py-1 rounded-full">
                  Showing {filteredHistory.length} of {allHistory.length} total entries
                </span>
              </div>
            </CardHeader>
            <CardContent className="p-0">
              {loadingHistory ? (
                <div className="text-center py-20 text-slate-400 space-y-2">
                  <RefreshCw className="h-8 w-8 animate-spin mx-auto text-purple-600" />
                  <p className="font-semibold text-sm text-slate-600">Loading audit trail history...</p>
                </div>
              ) : filteredHistory.length === 0 ? (
                <div className="text-center py-20 text-slate-400 space-y-2">
                  <History className="h-12 w-12 text-slate-300 mx-auto" />
                  <p className="font-bold text-base text-slate-700">No price history records found</p>
                  <p className="text-xs text-slate-500">Try adjusting your date range or search filters.</p>
                </div>
              ) : (
                <div className="overflow-x-auto">
                  <Table>
                    <TableHeader className="bg-slate-100/90 border-b border-slate-200">
                      <TableRow>
                        <TableHead className="font-bold text-slate-800 py-3.5 pl-6 min-w-[120px]">Date</TableHead>
                        <TableHead className="font-bold text-slate-800 py-3.5 min-w-[100px]">Time</TableHead>
                        <TableHead className="font-bold text-slate-800 py-3.5 min-w-[220px]">Product Name</TableHead>
                        <TableHead className="font-bold text-slate-800 py-3.5 min-w-[180px]">Company Name</TableHead>
                        <TableHead className="font-bold text-slate-800 py-3.5 text-right min-w-[140px]">Old Price</TableHead>
                        <TableHead className="font-bold text-slate-800 py-3.5 text-right min-w-[140px]">New Price</TableHead>
                        <TableHead className="font-bold text-slate-800 py-3.5 text-center min-w-[130px]">Difference</TableHead>
                        <TableHead className="font-bold text-slate-800 py-3.5 min-w-[150px] pr-6">Updated By</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {filteredHistory.map((item, idx) => {
                        const created = moment(item.createdAt);
                        const dateFormatted = created.format('DD-MM-YYYY');
                        const timeFormatted = created.format('hh:mm A');

                        const oldVal = Number(item.oldSellingPrice || 0);
                        const newVal = Number(item.newSellingPrice || 0);
                        const diffVal = Math.round((newVal - oldVal) * 100) / 100;

                        const userName = item.updatedByName || item.updatedBy?.userName || 'Admin';

                        return (
                          <TableRow key={item._id || idx} className="hover:bg-purple-50/40 transition-colors border-b border-slate-100">
                            {/* Date */}
                            <TableCell className="font-bold text-slate-900 pl-6 text-sm">
                              {dateFormatted}
                            </TableCell>

                            {/* Time */}
                            <TableCell className="text-slate-600 font-medium text-xs">
                              {timeFormatted}
                            </TableCell>

                            {/* Product Name */}
                            <TableCell className="font-bold text-slate-900">
                              {item.productName || item.productId?.name || '-'}
                            </TableCell>

                            {/* Company Name */}
                            <TableCell className="text-slate-700 text-sm">
                              {item.companyName || item.productId?.companyName || '-'}
                            </TableCell>

                            {/* Old Price */}
                            <TableCell className="text-right font-medium text-slate-500">
                              QR {oldVal.toFixed(2)}
                            </TableCell>

                            {/* New Price */}
                            <TableCell className="text-right font-extrabold text-emerald-700 text-base">
                              QR {newVal.toFixed(2)}
                            </TableCell>

                            {/* Price Difference */}
                            <TableCell className="text-center">
                              {diffVal > 0 ? (
                                <span className="inline-flex items-center px-2.5 py-1 rounded-full text-xs font-black bg-emerald-100 text-emerald-800 border border-emerald-200">
                                  <TrendingUp className="h-3.5 w-3.5 mr-1" /> +QR {diffVal.toFixed(2)}
                                </span>
                              ) : diffVal < 0 ? (
                                <span className="inline-flex items-center px-2.5 py-1 rounded-full text-xs font-black bg-rose-100 text-rose-800 border border-rose-200">
                                  <TrendingDown className="h-3.5 w-3.5 mr-1" /> -QR {Math.abs(diffVal).toFixed(2)}
                                </span>
                              ) : (
                                <span className="inline-flex items-center px-2.5 py-1 rounded-full text-xs font-semibold bg-slate-100 text-slate-600">
                                  QR 0.00
                                </span>
                              )}
                            </TableCell>

                            {/* Updated By */}
                            <TableCell className="pr-6">
                              <div className="flex items-center gap-2">
                                <div className="w-7 h-7 rounded-full bg-purple-100 text-purple-700 flex items-center justify-center font-bold text-xs">
                                  {userName.charAt(0).toUpperCase()}
                                </div>
                                <span className="font-semibold text-slate-800 text-xs">
                                  {userName}
                                </span>
                              </div>
                            </TableCell>
                          </TableRow>
                        );
                      })}
                    </TableBody>
                  </Table>
                </div>
              )}
            </CardContent>
          </Card>
        </div>
      )}

      {/* ─────────────────────────────────────────────────────────────────────────────
          SINGLE PRODUCT HISTORY POPUP MODAL
      ───────────────────────────────────────────────────────────────────────────── */}
      {historyModalProduct && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4 animate-in fade-in duration-150">
          <div className="bg-white rounded-2xl shadow-2xl max-w-3xl w-full p-6 space-y-4 max-h-[90vh] flex flex-col border border-purple-100">
            <div className="flex items-center justify-between border-b pb-4">
              <div>
                <h3 className="text-xl font-black text-slate-900 flex items-center gap-2">
                  <History className="h-6 w-6 text-purple-600" />
                  Price History: {historyModalProduct.name}
                </h3>
                <p className="text-xs text-slate-500 mt-1">
                  Complete audit log of all selling price changes for this product
                </p>
              </div>
              <button
                onClick={() => setHistoryModalProduct(null)}
                className="p-2 text-slate-400 hover:text-slate-700 hover:bg-slate-100 rounded-xl transition-colors"
              >
                <X className="h-6 w-6" />
              </button>
            </div>

            <div className="bg-purple-50/80 border border-purple-200/60 rounded-xl p-3 text-xs flex items-center justify-between flex-wrap gap-2">
              <div>
                <span className="font-bold text-purple-900">Product:</span> {historyModalProduct.name}
              </div>
              <div>
                <span className="font-bold text-purple-900">Company:</span> {historyModalProduct.companyName}
              </div>
              <div>
                <span className="font-bold text-purple-900">Current Selling Price:</span>{' '}
                <span className="font-extrabold text-emerald-700 text-sm">
                  QR {(historyModalProduct.sellingPrice || 0).toFixed(2)}
                </span>
              </div>
            </div>

            <div className="overflow-y-auto flex-1 border rounded-xl">
              {loadingSingleHistory ? (
                <div className="text-center py-12 text-slate-400">Loading history...</div>
              ) : singleProductHistory.length === 0 ? (
                <div className="text-center py-12 text-slate-400 font-semibold">
                  No price updates recorded for this product yet.
                </div>
              ) : (
                <Table>
                  <TableHeader className="bg-slate-50 sticky top-0 border-b">
                    <TableRow>
                      <TableHead className="font-bold text-slate-700">Date &amp; Time</TableHead>
                      <TableHead className="font-bold text-slate-700 text-right">Old Price</TableHead>
                      <TableHead className="font-bold text-slate-700 text-right">New Price</TableHead>
                      <TableHead className="font-bold text-slate-700 text-center">Difference</TableHead>
                      <TableHead className="font-bold text-slate-700 text-right pr-4">Updated By</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {singleProductHistory.map((item, idx) => {
                      const created = moment(item.createdAt);
                      const oldVal = Number(item.oldSellingPrice || 0);
                      const newVal = Number(item.newSellingPrice || 0);
                      const diffVal = Math.round((newVal - oldVal) * 100) / 100;
                      const userName = item.updatedByName || item.updatedBy?.userName || 'Admin';

                      return (
                        <TableRow key={item._id || idx} className="hover:bg-purple-50/30">
                          <TableCell className="text-xs">
                            <div className="font-bold text-slate-900">{created.format('DD-MM-YYYY')}</div>
                            <div className="text-slate-500">{created.format('hh:mm A')}</div>
                          </TableCell>

                          <TableCell className="text-right font-medium text-slate-500 text-sm">
                            QR {oldVal.toFixed(2)}
                          </TableCell>

                          <TableCell className="text-right font-extrabold text-emerald-700 text-sm">
                            QR {newVal.toFixed(2)}
                          </TableCell>

                          <TableCell className="text-center">
                            {diffVal > 0 ? (
                              <span className="text-xs font-bold text-emerald-700 bg-emerald-50 px-2 py-0.5 rounded-md border border-emerald-200">
                                +QR {diffVal.toFixed(2)}
                              </span>
                            ) : diffVal < 0 ? (
                              <span className="text-xs font-bold text-rose-700 bg-rose-50 px-2 py-0.5 rounded-md border border-rose-200">
                                -QR {Math.abs(diffVal).toFixed(2)}
                              </span>
                            ) : (
                              <span className="text-xs text-slate-500">QR 0.00</span>
                            )}
                          </TableCell>

                          <TableCell className="text-right pr-4 text-xs font-bold text-purple-900">
                            {userName}
                          </TableCell>
                        </TableRow>
                      );
                    })}
                  </TableBody>
                </Table>
              )}
            </div>

            <div className="flex items-center justify-between border-t pt-3">
              <Button
                onClick={() => {
                  setHistoryModalProduct(null);
                  setActiveTab('history');
                  setHistorySearchProduct(historyModalProduct.name);
                }}
                className="bg-purple-600 hover:bg-purple-700 text-white font-semibold text-xs gap-1.5"
              >
                <Filter className="h-3.5 w-3.5" /> View In Date Filters History Tab
              </Button>

              <Button variant="outline" onClick={() => setHistoryModalProduct(null)} className="font-semibold">
                Close
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default SellingPriceUpdate;
