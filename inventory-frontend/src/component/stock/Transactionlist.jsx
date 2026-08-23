import React, { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import axios from 'axios';
import { getToken } from '../../utils/auth';
import { Button } from '../../components/ui/button';
import { Input } from '../../components/ui/input';
import { Label } from '../../components/ui/label';
import { Card, CardContent, CardHeader, CardTitle } from '../../components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '../../components/ui/table';
import { Alert, AlertDescription } from '../../components/ui/alert';
import { DatePicker } from '../../components/ui/date-picker';
import { History, ArrowDownCircle, ArrowUpCircle, ArrowLeft, Eye, Download, TrendingUp, TrendingDown, Search } from 'lucide-react';
import moment from 'moment';
import * as XLSX from 'xlsx';
import { saveAs } from '../../utils/fileDownload';

const Transactionlist = () => {
  const { slug } = useParams();
  const navigate = useNavigate();
  const [transactions, setTransactions] = useState({ stockin: [], stockout: [], merged: [] });
  const [loading, setLoading] = useState(true);
  const [alert, setAlert] = useState({ show: false, message: '', type: '' });
  const [filterType, setFilterType] = useState('all'); // 'all', 'in', 'out', 'adjustment'
  const [sortBy, setSortBy] = useState('date'); // 'date', 'quantity', 'value'
  const [sortOrder, setSortOrder] = useState('asc'); // 'asc' = oldest first so Running Balance runs top-to-bottom
  const [searchQuery, setSearchQuery] = useState('');
  const [dateRange, setDateRange] = useState({ start: '', end: '' });
  const [productName, setProductName] = useState('');
  const [productCompany, setProductCompany] = useState('');
  const [productUnit, setProductUnit] = useState('');
  const [currentStockFromApi, setCurrentStockFromApi] = useState(null); // Stock model ka current stock (running balance = previous + in - out)

  const accessToken = getToken();

  useEffect(() => {
    if (slug) {
      fetchTransactionHistory();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [slug]);

  const fetchTransactionHistory = () => {
    setLoading(true);
    axios.post(
      `${process.env.REACT_APP_DEVELOPMENT}/api/stock/getStockDocuments`,
      { slug: slug },
      { headers: { token: accessToken } }
    )
    .then((res) => {
      if (res.data.result) {
        setTransactions({
          stockin: res.data.result.stockin || [],
          stockout: res.data.result.stockout || [],
          merged: res.data.result.transactions || []
        });
        setCurrentStockFromApi(res.data.result.currentStock != null ? Number(res.data.result.currentStock) : null);
        // Product name: API sends productName; else from first transaction
        const nameFromApi = res.data.result.productName;
        if (nameFromApi) {
          setProductName(nameFromApi);
        } else if (res.data.result.stockin?.length > 0) {
          setProductName(res.data.result.stockin[0].name || res.data.result.stockin[0].productId?.name || '');
        } else if (res.data.result.stockout?.length > 0) {
          setProductName(res.data.result.stockout[0].name || res.data.result.stockout[0].productId?.name || '');
        } else {
          setProductName(slug || '');
        }

        const firstStockin = res.data.result.stockin?.[0];
        const firstStockout = res.data.result.stockout?.[0];
        const firstAdj = res.data.result.adjustments?.[0];
        const productInfo = firstStockin?.productId || firstStockout?.productId || firstAdj?.productId;
        if (productInfo) {
          setProductCompany(productInfo.companyName || '');
          setProductUnit(productInfo.unit || '');
        }
      }
      setLoading(false);
    })
    .catch((err) => {
      console.error('Error fetching transaction history:', err);
      showAlert('Failed to fetch transaction history', 'error');
      setLoading(false);
    });
  };

  const showAlert = (message, type) => {
    setAlert({ show: true, message, type });
    setTimeout(() => setAlert({ show: false, message: '', type: '' }), 3000);
  };

  const normalizeTransaction = (item) => ({
    ...item,
    date: item.date || item.createdAt,
    transactionType: item.transactionType || (item.type === 'out' ? 'OUT' : item.type === 'in' ? 'IN' : (Number(item.quantityDelta ?? item.quantity ?? 0) >= 0 ? 'IN' : 'OUT')),
    batchNumber: item.batchNumber || item.expiryBatchId || '',
    userName: item.createdBy?.userName || item.performedBy?.userName || item.performedBy || item.createdByRole || item.performedByRole || '',
    remarks: item.remarks || item.reason || item.note || '',
    totalValue: Math.abs(item.quantity || item.quantityDelta || 0) * ((item.type === 'in' ? item.purchasingPrice : item.sellingPrice) ?? 0),
    supplierName: item.supplier?.name || item.supplierName || '',
    supplierLocation: item.supplier?.location || '',
    locationName: item.location?.name || item.locationName || '',
    doctorName: item.doctorName || item.location?.doctorName || '',
    trainerName: item.trainerName || item.location?.trainerName || '',
    unit: item.unit || item.productId?.unit || '',
    accountName: item.type === 'in'
      ? (item.supplier?.name || item.supplierName || '')
      : item.type === 'out'
        ? (item.location?.name || item.locationName || '')
        : (item.reason || item.note || 'Stock Adjustment')
  });

  const getAllTransactions = () => {
    let allTransactions = transactions.merged && transactions.merged.length > 0
      ? transactions.merged.map(normalizeTransaction)
      : [
      ...transactions.stockin.map(item => ({
        ...item,
        type: 'in',
        date: item.date || item.createdAt,
        totalValue: (item.quantity || 0) * (item.purchasingPrice ?? 0),
        supplierName: item.supplier?.name || item.supplierName || '',
        supplierLocation: item.supplier?.location || '',
        unit: item.unit || item.productId?.unit || ''
      })),
      ...transactions.stockout.map(item => ({
        ...item,
        type: 'out',
        date: item.date || item.createdAt,
        totalValue: (item.quantity || 0) * (item.sellingPrice ?? 0),
        locationName: item.location?.name || '',
        doctorName: item.doctorName || item.location?.doctorName || '',
        trainerName: item.trainerName || item.location?.trainerName || '',
          unit: item.unit || item.productId?.unit || ''
      }))
    ];
    
    // Apply filters
    if (filterType !== 'all') {
      allTransactions = allTransactions.filter(t => t.type === filterType);
    }
    
    // Apply date range filter
    if (dateRange.start) {
      allTransactions = allTransactions.filter(t => 
        moment(t.date).isSameOrAfter(moment(dateRange.start), 'day')
      );
    }
    if (dateRange.end) {
      allTransactions = allTransactions.filter(t => 
        moment(t.date).isSameOrBefore(moment(dateRange.end), 'day')
      );
    }
    
    // Apply search filter
    if (searchQuery) {
      allTransactions = allTransactions.filter(t => {
        const search = searchQuery.toLowerCase();
        return (
          (t.docNo || '').toString().toLowerCase().includes(search) ||
          (t.reason || '').toLowerCase().includes(search) ||
          (t.note || '').toLowerCase().includes(search) ||
          (t.supplierName || '').toLowerCase().includes(search) ||
          (t.locationName || '').toLowerCase().includes(search) ||
          (t.doctorName || '').toLowerCase().includes(search) ||
          (t.trainerName || '').toLowerCase().includes(search)
        );
      });
    }
    
    allTransactions.sort((a, b) => {
      let comparison = 0;
      switch (sortBy) {
        case 'date':
          const dateA = new Date(a.date || a.createdAt || 0).getTime();
          const dateB = new Date(b.date || b.createdAt || 0).getTime();
          if (dateA !== dateB) {
            comparison = dateA - dateB;
          } else {
            const createdA = new Date(a.createdAt || 0).getTime();
            const createdB = new Date(b.createdAt || 0).getTime();
            if (createdA !== createdB) {
              comparison = createdA - createdB;
            } else {
              comparison = String(a._id || '').localeCompare(String(b._id || ''));
            }
          }
          break;
        case 'quantity':
          comparison = (a.quantity || 0) - (b.quantity || 0);
          break;
        case 'value':
          comparison = a.totalValue - b.totalValue;
          break;
        default:
          const fallbackDateA = new Date(a.date || a.createdAt || 0).getTime();
          const fallbackDateB = new Date(b.date || b.createdAt || 0).getTime();
          if (fallbackDateA !== fallbackDateB) {
            comparison = fallbackDateA - fallbackDateB;
          } else {
            const createdA = new Date(a.createdAt || 0).getTime();
            const createdB = new Date(b.createdAt || 0).getTime();
            if (createdA !== createdB) {
              comparison = createdA - createdB;
            } else {
              comparison = String(a._id || '').localeCompare(String(b._id || ''));
            }
          }
      }
      return sortOrder === 'asc' ? comparison : -comparison;
    });
    
    return allTransactions;
  };

  const getStockInTotal = () => {
    return transactions.stockin.reduce((sum, item) => sum + (item.quantity || 0), 0);
  };

  const getStockOutTotal = () => {
    return transactions.stockout.reduce((sum, item) => sum + (item.quantity || 0), 0);
  };

  const getTransactionDelta = (t) => {
    const quantity = Number(t.quantity ?? t.quantityDelta ?? 0);
    switch (t.type) {
      case 'in':
        return Math.abs(quantity);
      case 'out':
        return -Math.abs(quantity);
      case 'adjustment':
        return quantity;
      default:
        return quantity;
    }
  };

  const getCurrentStock = () => currentStockFromApi ?? fullByDateAsc.reduce((sum, item) => sum + getTransactionDelta(item), 0);

  const handleViewDetails = (transaction) => {
    if (transaction.type === 'in') {
      navigate(`/dashboard/StockInDetails/${transaction.docNo}`);
    } else if (transaction.type === 'out') {
      navigate(`/dashboard/StockOutDetails/${transaction.docNo}`);
    }
  };

  const toggleSortOrder = () => {
    setSortOrder(prev => prev === 'asc' ? 'desc' : 'asc');
  };

  const getTotalValue = () => {
    return allTransactions.reduce((sum, t) => sum + t.totalValue, 0);
  };

  const exportToExcel = () => {
    const fullList = getFullListByDate();
    const excelBalanceMap = buildBalanceMap(fullList);
    const exportData = fullList.map((item, index) => ({
      'SI No': index + 1,
      'Doc Type': getDocType(item),
      'Doc Code': item.docNo || '',
      'Date & Time': moment(item.date).format('DD/MM/YYYY hh:mm A'),
      'Account Name': item.accountName || '',
      'Batch Number': item.batchNumber || '',
      'Expiry Date': item.expiry ? moment(item.expiry).format('DD/MM/YYYY') : '',
      'Transaction Type': item.transactionType || (getTransactionDelta(item) >= 0 ? 'IN' : 'OUT'),
      'Receipt': getTransactionDelta(item) > 0 ? Math.abs(getTransactionDelta(item)) : '',
      'Issue': getTransactionDelta(item) < 0 ? Math.abs(getTransactionDelta(item)) : '',
      'Current Stock Balance': excelBalanceMap.get(getTransactionId(item)) ?? '',
      'User': item.userName || '',
      'Reference/Remarks': item.remarks || '',
      'Rate': (item.type === 'in' ? (item.purchasingPrice ?? 0) : (item.sellingPrice ?? 0)).toFixed(2),
    }));

    const ws = XLSX.utils.json_to_sheet(exportData);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Transactions');
    const excelBuffer = XLSX.write(wb, { bookType: 'xlsx', type: 'array' });
    const dataBlob = new Blob([excelBuffer], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
    saveAs(dataBlob, `${productName || slug}-transactions.xlsx`);
    showAlert('Excel file exported successfully!', 'success');
  };

  // Full list (no filter) — running balance ke liye; order backend merged list ya createdAt se
  const getFullListByDate = () => {
    if (transactions.merged && transactions.merged.length > 0) {
      return transactions.merged.map(normalizeTransaction);
    }
    const full = [
      ...transactions.stockin.map(item => ({
        ...item,
        type: 'in',
        date: item.date || item.createdAt,
        totalValue: (item.quantity || 0) * (item.purchasingPrice ?? 0),
        supplierName: item.supplier?.name || item.supplierName || '',
        unit: item.unit || item.productId?.unit || ''
      })),
      ...transactions.stockout.map(item => ({
        ...item,
        type: 'out',
        date: item.date || item.createdAt,
        totalValue: (item.quantity || 0) * (item.sellingPrice ?? 0),
        locationName: item.location?.name || '',
        unit: item.unit || item.productId?.unit || ''
      }))
    ];
    return full.sort((a, b) => {
      const dateA = new Date(a.date || a.createdAt || 0).getTime();
      const dateB = new Date(b.date || b.createdAt || 0).getTime();
      if (dateA !== dateB) return dateA - dateB;

      const createdA = new Date(a.createdAt || 0).getTime();
      const createdB = new Date(b.createdAt || 0).getTime();
      if (createdA !== createdB) return createdA - createdB;

      return String(a._id || '').localeCompare(String(b._id || ''));
    });
  };

  const allTransactions = getAllTransactions();

  const getTransactionId = (t) => t._id != null ? String(t._id) : `${t.type}-${t.docNo}-${moment(t.date).valueOf()}-${t.quantity || t.quantityDelta || 0}-${t.supplierName || ''}-${t.locationName || ''}`;
  const getDocType = (t) => t.type === 'in' ? 'Stock Receipt' : t.type === 'out' ? 'Delivery Note' : 'Stock Adjustment';
  const getStoredRunningBalance = (t) => {
    if (t.runningBalance != null) return Number(t.runningBalance);
    if (t.newQuantity != null) return Number(t.newQuantity);
    if (t.prevQuantity != null) return Number(t.prevQuantity) + getTransactionDelta(t);
    if (t.previousQuantity != null) return Number(t.previousQuantity) + getTransactionDelta(t);
    return null;
  };
  const buildBalanceMap = (list) => {
    let balance = 0;
    const map = new Map();
    list.forEach((t) => {
      balance += getTransactionDelta(t);
      map.set(getTransactionId(t), balance);
    });
    return map;
  };

  // Running balance hamesha FULL list se (date asc) — in/out/adjustment ke baad stock sahi update
  const fullByDateAsc = getFullListByDate();
  const balanceMap = buildBalanceMap(fullByDateAsc);

  // Display list (filtered/sorted) — har row ka running balance full list wale map se
  const transactionsWithBalance = allTransactions.map((t) => ({
    ...t,
    runningBalance: balanceMap.get(getTransactionId(t)) ?? getStoredRunningBalance(t) ?? 0,
  }));

  const formatNum = (n) => (n != null ? Number(n).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) : '-');

  return (
    <div className="container mx-auto p-6 space-y-6">
      <div className="flex items-center justify-between flex-wrap gap-4">
        <div className="flex items-center gap-4">
          <Button variant="outline" onClick={() => navigate(-1)}>
            <ArrowLeft className="mr-2 h-4 w-4" />
            Back
          </Button>
          <div>
            <h1 className="text-2xl font-bold flex items-center gap-2">
              <History className="h-6 w-6" />
              Transaction History
            </h1>
            <p className="text-sm text-muted-foreground mt-1">
              Product: <span className="font-semibold">
                {productName || slug}
                {productCompany || productUnit ? ` | ${productCompany || 'N/A'} | ${productUnit || 'N/A'}` : ''}
              </span>
            </p>
          </div>
        </div>
        <Button onClick={exportToExcel} variant="outline">
          <Download className="mr-2 h-4 w-4" />
          Export to Excel
        </Button>
      </div>

      {alert.show && (
        <Alert variant={alert.type === 'error' ? 'destructive' : 'default'}>
          <AlertDescription>{alert.message}</AlertDescription>
        </Alert>
      )}

      {/* Summary Cards */}
      <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center gap-2">
              <TrendingUp className="h-5 w-5 text-green-600" />
              <div>
                <div className="text-xl font-bold text-green-600">{getStockInTotal()}</div>
                <p className="text-xs text-muted-foreground">Stock In</p>
              </div>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center gap-2">
              <TrendingDown className="h-5 w-5 text-red-600" />
              <div>
                <div className="text-xl font-bold text-red-600">{getStockOutTotal()}</div>
                <p className="text-xs text-muted-foreground">Stock Out</p>
              </div>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6">
            <div className="text-xl font-bold text-blue-600">{getCurrentStock()}</div>
            <p className="text-xs text-muted-foreground">Balance</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6">
            <div className="text-xl font-bold">{allTransactions.length}</div>
            <p className="text-xs text-muted-foreground">Transactions</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6">
            <div className="text-xl font-bold">${getTotalValue().toFixed(2)}</div>
            <p className="text-xs text-muted-foreground">Total Value</p>
          </CardContent>
        </Card>
      </div>

      {/* Filters and Controls */}
      <Card>
        <CardContent className="pt-6">
          <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
            {/* Type Filter */}
            <div>
              <Label>Filter by Type</Label>
              <div className="flex gap-2">
                <Button
                  size="sm"
                  variant={filterType === 'all' ? 'default' : 'outline'}
                  onClick={() => setFilterType('all')}
                  className="flex-1"
                >
                  All
                </Button>
                <Button
                  size="sm"
                  variant={filterType === 'in' ? 'default' : 'outline'}
                  onClick={() => setFilterType('in')}
                  className="flex-1"
                >
                  <ArrowUpCircle className="h-4 w-4 mr-1" />
                  In
                </Button>
                <Button
                  size="sm"
                  variant={filterType === 'out' ? 'default' : 'outline'}
                  onClick={() => setFilterType('out')}
                  className="flex-1"
                >
                  <ArrowDownCircle className="h-4 w-4 mr-1" />
                  Out
                </Button>
                <Button
                  size="sm"
                  variant={filterType === 'adjustment' ? 'default' : 'outline'}
                  onClick={() => setFilterType('adjustment')}
                  className="flex-1"
                >
                  Adj
                </Button>
              </div>
            </div>

            {/* Sort By */}
            <div>
              <Label>Sort By</Label>
              <select
                value={sortBy}
                onChange={(e) => setSortBy(e.target.value)}
                className="flex h-11 w-full rounded-lg border border-input bg-background px-4 py-2 text-sm transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-1 hover:border-ring/50 appearance-none cursor-pointer"
              >
                <option value="date">Date</option>
                <option value="quantity">Quantity</option>
                <option value="value">Total Value</option>
              </select>
            </div>

            {/* Sort Order */}
            <div>
              <Label>Order</Label>
              <Button
                size="sm"
                variant="outline"
                onClick={toggleSortOrder}
                className="w-full h-11"
              >
                {sortOrder === 'desc' ? '↓ Newest First' : '↑ Oldest First'}
              </Button>
            </div>

            {/* Search */}
            <div>
              <Label>Search</Label>
              <Input
                icon={Search}
                placeholder="Doc No, Supplier..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                clearable
                onClear={() => setSearchQuery('')}
              />
            </div>

          </div>

          {/* Date Range Filter */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mt-4">
            <div>
              <Label>From Date</Label>
              <DatePicker
                value={dateRange.start ? new Date(dateRange.start) : undefined}
                onChange={(day) => {
                  if (!day) return;
                  setDateRange((prev) => ({ ...prev, start: moment(day).format('YYYY-MM-DD') }));
                }}
              />
            </div>
            <div>
              <Label>To Date</Label>
              <DatePicker
                value={dateRange.end ? new Date(dateRange.end) : undefined}
                onChange={(day) => {
                  if (!day) return;
                  setDateRange((prev) => ({ ...prev, end: moment(day).format('YYYY-MM-DD') }));
                }}
              />
            </div>
          </div>

          {/* Clear Filters */}
          {(filterType !== 'all' || searchQuery || dateRange.start || dateRange.end) && (
            <div className="mt-4 flex justify-center">
              <Button
                size="sm"
                variant="ghost"
                onClick={() => {
                  setFilterType('all');
                  setSearchQuery('');
                  setDateRange({ start: '', end: '' });
                }}
              >
                Clear All Filters
              </Button>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Unified Transactions Table */}
        <Card>
        <CardHeader>
          <CardTitle className="flex items-center justify-between">
            <span>Transaction Records ({allTransactions.length})</span>
            {allTransactions.length > 0 && (
              <span className="text-sm font-normal text-muted-foreground">
                Showing {allTransactions.length} of {fullByDateAsc.length} total
              </span>
            )}
          </CardTitle>
          <p className="text-sm text-muted-foreground mt-1">
            Receipt = stock in &nbsp;|&nbsp; Issue = stock out &nbsp;|&nbsp; Current Stock Balance = balance after each transaction
          </p>
        </CardHeader>
        <CardContent>
          {loading ? (
            <div className="text-center py-8 text-muted-foreground">Loading transactions...</div>
          ) : allTransactions.length === 0 ? (
            <div className="text-center py-12">
              <History className="h-12 w-12 mx-auto text-muted-foreground mb-4" />
              <p className="text-muted-foreground">
                {searchQuery || filterType !== 'all' || dateRange.start || dateRange.end
                  ? 'No transactions match your filters.'
                  : 'No transactions found for this product.'}
              </p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="w-12">SI No</TableHead>
                    <TableHead>Doc Type</TableHead>
                    <TableHead>Doc Code</TableHead>
                    <TableHead>Date & Time</TableHead>
                    <TableHead>Account Name</TableHead>
                    <TableHead>Batch No</TableHead>
                    <TableHead>Expiry</TableHead>
                    <TableHead>Type</TableHead>
                    <TableHead className="text-right" title="Stock in">Receipt</TableHead>
                    <TableHead className="text-right" title="Stock out">Issue</TableHead>
                    <TableHead className="text-right">Current Stock Balance</TableHead>
                    <TableHead>User</TableHead>
                    <TableHead>Remarks</TableHead>
                    <TableHead className="text-right">Rate</TableHead>
                    <TableHead className="text-center">Action</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {transactionsWithBalance.map((transaction, index) => {
                    const isStockIn = transaction.type === 'in';
                    const delta = getTransactionDelta(transaction);
                    const accountName = transaction.accountName || (isStockIn ? transaction.supplierName : transaction.locationName) || '-';
                    const docType = getDocType(transaction);

                    return (
                      <TableRow
                        key={`${transaction.docNo}-${index}`}
                        className={delta >= 0 ? 'hover:bg-green-50' : 'hover:bg-red-50'}
                      >
                        <TableCell className="font-medium">{index + 1}</TableCell>
                        <TableCell>{docType}</TableCell>
                        <TableCell className="font-medium">{transaction.docNo}</TableCell>
                        <TableCell>{moment(transaction.date).format('DD/MM/YYYY hh:mm A')}</TableCell>
                        <TableCell>
                          <div className="max-w-[180px] truncate" title={accountName}>
                            {accountName}
                          </div>
                        </TableCell>
                        <TableCell>{transaction.batchNumber || '-'}</TableCell>
                        <TableCell>{transaction.expiry ? moment(transaction.expiry).format('DD/MM/YYYY') : '-'}</TableCell>
                        <TableCell>{transaction.transactionType || (delta >= 0 ? 'IN' : 'OUT')}</TableCell>
                        <TableCell className="text-right text-green-600 font-medium">
                          {delta > 0 ? formatNum(delta) : '-'}
                        </TableCell>
                        <TableCell className="text-right text-red-600 font-medium">
                          {delta < 0 ? formatNum(Math.abs(delta)) : '-'}
                        </TableCell>
                        <TableCell className="text-right font-semibold">
                          {formatNum(transaction.runningBalance)}
                        </TableCell>
                        <TableCell>
                          <div className="max-w-[120px] truncate" title={transaction.userName || ''}>
                            {transaction.userName || '-'}
                          </div>
                        </TableCell>
                        <TableCell>
                          <div className="max-w-[160px] truncate" title={transaction.remarks || ''}>
                            {transaction.remarks || '-'}
                          </div>
                        </TableCell>
                        <TableCell className="text-right">
                          {formatNum(transaction.sellingPrice)}
                        </TableCell>
                        <TableCell className="text-center">
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={() => handleViewDetails(transaction)}
                            disabled={transaction.type === 'adjustment'}
                            className="gap-1"
                          >
                            <Eye className="h-3 w-3" />
                            View
                          </Button>
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
  );
};

export default Transactionlist;
