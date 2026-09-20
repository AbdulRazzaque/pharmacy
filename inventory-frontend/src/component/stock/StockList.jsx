import React, { useState, useEffect, useMemo } from 'react';
import axios from 'axios';
import { useNavigate } from 'react-router-dom';
import { Button } from '../../components/ui/button';
import { Input } from '../../components/ui/input';
import { Card, CardContent, CardHeader, CardTitle } from '../../components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '../../components/ui/table';
import { Alert, AlertDescription } from '../../components/ui/alert';
import { Search, Download, Package, AlertCircle, History, Eye, EyeOff, Layers, AlertTriangle, ShieldCheck } from 'lucide-react';
import * as XLSX from 'xlsx';
import { saveAs } from '../../utils/fileDownload';
import moment from 'moment';
import { getToken, getUserInfo } from '../../utils/auth';
import { PageHeader } from '../../components/ui/page-header';
import { StatCard } from '../../components/ui/stat-card';
import { Badge } from '../../components/ui/badge';
import { EmptyState } from '../../components/ui/empty-state';

const StockList = () => {
  const navigate = useNavigate();
  const [data, setData] = useState([]);
  const [searchQuery, setSearchQuery] = useState('');
  const [hideZeroExpired, setHideZeroExpired] = useState(false);
  const [alert, setAlert] = useState({ show: false, message: '', type: '' });
  const [loading, setLoading] = useState(true);

  const isAdmin = useMemo(
    () => (getUserInfo()?.role || '').toLowerCase() === 'admin',
    []
  );

  const accessToken = getToken();

  useEffect(() => {
    fetchProductsList();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const fetchProductsList = () => {
    setLoading(true);
    axios.get(`${process.env.REACT_APP_DEVELOPMENT}/api/stock/getAllStocks`, {
      headers: { token: accessToken }
    })
      .then((res) => {
        const expiryMap = new Map();

        (res.data.result || []).forEach(stock => {
          const product = stock.product || {};
          const baseName = stock.name || product.name || '';
          const baseType = product.type || stock.type || '';
          const baseUnit = product.unit || stock.unit || '';
          const baseCompanyName = product.companyName || stock.companyName || '';
          const batchPurchasing = (item) => item?.purchasingPrice ?? 0;
          const batchSelling = (item) => item?.sellingPrice ?? 0;
          const baseSlug = product.slug;
          const baseProductId = product._id || stock.productId || stock.product || null;

          if (stock.expiryArray && stock.expiryArray.length > 0) {
            stock.expiryArray.forEach((expiryItem) => {
              const expiryDate = expiryItem.expiry ? moment(expiryItem.expiry).format('YYYY-MM-DD') : 'no-expiry';
              const mapKey = `${baseName}_${expiryDate}`;

              if (expiryMap.has(mapKey)) {
                const existing = expiryMap.get(mapKey);
                existing.quantity += expiryItem.quantity || 0;
                existing.stockIds.push(stock._id);
              } else {
                expiryMap.set(mapKey, {
                  _id: mapKey,
                  originalStockId: stock._id,
                  stockIds: [stock._id],
                  name: baseName,
                  productName: baseName,
                  slug: baseSlug,
                  productId: baseProductId,
                  type: baseType,
                  unit: baseUnit,
                  companyName: baseCompanyName,
                  quantity: expiryItem.quantity || 0,
                  purchasingPrice: batchPurchasing(expiryItem),
                  sellingPrice: batchSelling(expiryItem),
                  expiry: expiryItem.expiry || '',
                  expiryArray: stock.expiryArray,
                  location: stock.location || '',
                  supplier: stock.supplier || '',
                  supplierName: stock.supplierName || ''
                });
              }
            });
          } else {
            const mapKey = `${baseName}_no-expiry`;
            if (expiryMap.has(mapKey)) {
              const existing = expiryMap.get(mapKey);
              existing.quantity += stock.totalQuantity || stock.quantity || 0;
              existing.stockIds.push(stock._id);
            } else {
              expiryMap.set(mapKey, {
                _id: mapKey,
                originalStockId: stock._id,
                stockIds: [stock._id],
                name: baseName,
                productName: baseName,
                slug: baseSlug,
                productId: baseProductId,
                type: baseType,
                unit: baseUnit,
                companyName: baseCompanyName,
                quantity: stock.totalQuantity || stock.quantity || 0,
                purchasingPrice: 0,
                sellingPrice: 0,
                expiry: stock.expiry || '',
                expiryArray: stock.expiryArray || [],
                location: stock.location || '',
                supplier: stock.supplier || '',
                supplierName: stock.supplierName || ''
              });
            }
          }
        });

        const processedData = Array.from(expiryMap.values());
        setData(processedData);
        setLoading(false);
      })
      .catch((err) => {
        console.error('Error fetching stock:', err);
        showAlert('Failed to fetch stock list', 'error');
        setLoading(false);
      });
  };

  // Derived filtered data — computed from data, searchQuery and hideZeroExpired toggle
  const filteredData = useMemo(() => {
    const today = moment().startOf('day');
    let result = data;

    // Apply hide-zero-expired toggle
    if (hideZeroExpired) {
      result = result.filter(item => {
        const hasStock = (item.quantity || 0) > 0;
        const notExpired = !item.expiry || moment(item.expiry).isSameOrAfter(today);
        return hasStock && notExpired;
      });
    }

    // Apply search filter
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase();
      result = result.filter(item => {
        const productName = item.name || item.productName || '';
        const type = item.type || '';
        const location = item.location || '';
        const companyName = item.companyName || '';
        return (
          productName.toLowerCase().includes(q) ||
          type.toLowerCase().includes(q) ||
          location.toLowerCase().includes(q) ||
          companyName.toLowerCase().includes(q)
        );
      });
    }

    return result;
  }, [data, searchQuery, hideZeroExpired]);

  const showAlert = (message, type) => {
    setAlert({ show: true, message, type });
    setTimeout(() => setAlert({ show: false, message: '', type: '' }), 3000);
  };

  const exportToExcel = () => {
    const exportData = filteredData.map(item => {
      const row = {
        'Product Name': item.name || item.productName || '',
        'Company': item.companyName || '',
        'Type': item.type || '',
        'Unit': item.unit || '',
        'Quantity': item.quantity || 0,
      };
      if (isAdmin) {
        row['Selling Price'] = item.sellingPrice || 0;
        row['Total Value'] = ((item.quantity || 0) * (item.sellingPrice || 0)).toFixed(2);
      }
      row['Expiry Date'] = item.expiry ? moment(item.expiry).format('DD/MM/YYYY') : '';
      row['Location'] = item.location || '';
      row['Supplier'] = item.supplierName || item.supplier || '';
      return row;
    });

    const ws = XLSX.utils.json_to_sheet(exportData);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Stock List');
    const excelBuffer = XLSX.write(wb, { bookType: 'xlsx', type: 'array' });
    const dataBlob = new Blob([excelBuffer], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
    saveAs(dataBlob, 'stock-list.xlsx');
    showAlert('Excel file exported successfully!', 'success');
  };

  const getExpiryStatus = (expiryDate) => {
    if (!expiryDate) return 'unknown';
    const today = moment();
    const expiry = moment(expiryDate);
    const daysUntilExpiry = expiry.diff(today, 'days');
    if (daysUntilExpiry < 0) return 'expired';
    if (daysUntilExpiry <= 30) return 'warning';
    return 'valid';
  };

  const getTotalValue = () => {
    return filteredData.reduce((sum, item) => sum + ((item.quantity || 0) * (item.sellingPrice || 0)), 0).toFixed(2);
  };

  const getLowStockItems = () => {
    return filteredData.filter(item => (item.quantity || 0) > 0 && (item.quantity || 0) < 10).length;
  };

  const handleViewHistory = (product) => {
    if (!product?.slug) {
      showAlert('Product slug not found', 'error');
      return;
    }
    navigate(`/dashboard/transactionlist/${product.slug}`);
  };

  return (
    <div className="ph-page space-y-6">
      {/* Header */}
      <PageHeader
        title="Inventory Stock Registry"
        subtitle="Live batch ledger, real-time balances, lot expiry tracking, and transaction history"
        badge={
          <Badge variant="teal" className="ml-2 font-mono">
            {filteredData.length} Batches
          </Badge>
        }
      >
        <div className="flex items-center gap-2">
          {/* Toggle: Hide Zero Stock & Expired */}
          <button
            id="toggle-hide-zero-expired"
            onClick={() => setHideZeroExpired(prev => !prev)}
            className={`
              flex items-center gap-2 px-3 py-1.5 rounded-lg border text-xs font-semibold
              transition-all duration-200 cursor-pointer
              ${hideZeroExpired
                ? 'bg-[var(--ph-navy)] text-white border-[var(--ph-navy)] shadow-sm'
                : 'bg-[var(--ph-surface)] text-[var(--ph-text)] border-[var(--ph-border)] hover:bg-[var(--ph-surface-2)]'
              }
            `}
            title={hideZeroExpired ? 'Click to show all products' : 'Click to hide zero-stock & expired products'}
          >
            {hideZeroExpired
              ? <><EyeOff className="h-3.5 w-3.5" /> Hiding Zero &amp; Expired</>
              : <><Eye className="h-3.5 w-3.5" /> Hide Zero &amp; Expired</>
            }
          </button>

          <Button
            variant="outline"
            size="sm"
            onClick={exportToExcel}
            id="export-stock-excel"
            className="border-[var(--ph-border)] hover:bg-[var(--ph-surface-2)] text-xs font-semibold gap-1.5"
          >
            <Download className="h-3.5 w-3.5 text-[var(--ph-teal)]" />
            Export Excel
          </Button>
        </div>
      </PageHeader>

      {alert.show && (
        <Alert variant={alert.type === 'error' ? 'destructive' : 'default'} className="border border-[var(--ph-border)]">
          <AlertDescription className="font-semibold text-xs">{alert.message}</AlertDescription>
        </Alert>
      )}

      {/* Summary KPI Cards */}
      <div className={`grid grid-cols-1 ${isAdmin ? 'sm:grid-cols-4' : 'sm:grid-cols-3'} gap-4`}>
        <StatCard
          icon={Layers}
          label={hideZeroExpired ? 'Active Stock Batches' : 'Total Stock Batches'}
          value={filteredData.length}
          subtitle="Unique batch lots in ledger"
          color="primary"
        />
        <StatCard
          icon={Package}
          label="Total Units in Stock"
          value={filteredData.reduce((sum, item) => sum + (item.quantity || 0), 0).toLocaleString()}
          subtitle="Cumulative units available"
          color="secondary"
        />
        {isAdmin && (
          <StatCard
            icon={ShieldCheck}
            label="Total Inventory Value"
            value={`QR ${Number(getTotalValue()).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`}
            subtitle="Based on current selling price"
            color="success"
          />
        )}
        <StatCard
          icon={AlertTriangle}
          label="Low Stock Batches"
          value={getLowStockItems()}
          subtitle="Less than 10 units remaining"
          color={getLowStockItems() > 0 ? 'warning' : 'primary'}
        />
      </div>

      {/* Filter / Search Bar */}
      <Card className="ph-card shadow-sm border border-[var(--ph-border)]">
        <CardContent className="p-3">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-[var(--ph-muted)] pointer-events-none" />
            <Input
              placeholder="Search by product name, dosage type, or location..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="pl-9 h-9 text-xs bg-[var(--ph-surface)] border-[var(--ph-border)]"
              clearable
              onClear={() => setSearchQuery('')}
            />
          </div>
        </CardContent>
      </Card>

      {/* Stock Table */}
      <Card className="ph-card shadow-sm border border-[var(--ph-border)] overflow-hidden">
        <CardHeader className="border-b border-[var(--ph-border)] py-3 px-4">
          <CardTitle className="text-sm font-semibold text-[var(--ph-text)] flex items-center justify-between">
            <div className="flex items-center gap-2">
              <span>Inventory Balances</span>
              <Badge variant="outline" className="text-xs font-mono font-normal">
                {filteredData.length} records
              </Badge>
              {hideZeroExpired && (
                <Badge variant="teal" className="text-xs font-normal">
                  Active Only
                </Badge>
              )}
            </div>
          </CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          {loading ? (
            <div className="py-12 flex flex-col items-center justify-center gap-2 text-[var(--ph-muted)] text-sm">
              <div className="w-6 h-6 border-2 border-[var(--ph-teal)] border-t-transparent rounded-full animate-spin" />
              <span>Loading inventory ledger...</span>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <Table className="ph-table text-xs">
                <TableHeader>
                  <TableRow className="bg-[var(--ph-surface-2)] border-b border-[var(--ph-border)]">
                    <TableHead className="font-semibold text-[var(--ph-text)] min-w-[260px] pl-4">Product Name</TableHead>
                    <TableHead className="font-semibold text-[var(--ph-text)] min-w-[150px]">Company</TableHead>
                    <TableHead className="font-semibold text-[var(--ph-text)] min-w-[80px]">Unit</TableHead>
                    <TableHead className="font-semibold text-[var(--ph-text)] text-center min-w-[130px] w-[140px] px-4">Available Qty</TableHead>
                    <TableHead className="font-semibold text-[var(--ph-text)] min-w-[140px] w-[150px] px-4">Expiry Date</TableHead>
                    <TableHead className="font-semibold text-[var(--ph-text)] min-w-[125px]">Batch Health</TableHead>
                    <TableHead className="text-center font-semibold text-[var(--ph-text)] min-w-[95px] pr-4">History</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filteredData.length === 0 ? (
                    <TableRow>
                      <TableCell colSpan={7} className="p-0">
                        <EmptyState
                          icon={Package}
                          title="No Stock Items Found"
                          description={
                            searchQuery
                              ? 'No inventory lots matched your filter.'
                              : hideZeroExpired
                                ? 'No active stock items. Toggle off the filter to view all products.'
                                : 'No stock lots available.'
                          }
                        />
                      </TableCell>
                    </TableRow>
                  ) : (
                    filteredData.map((product, index) => {
                      const expiryStatus = getExpiryStatus(product.expiry);
                      const isZeroStock = (product.quantity || 0) === 0;
                      const isLowStock = (product.quantity || 0) > 0 && (product.quantity || 0) < 10;
                      const productName = product.name || product.productName || '-';
                      const productUnit = product.unit || '-';

                      return (
                        <TableRow
                          key={product._id || index}
                          className={`hover:bg-[var(--ph-surface-2)]/60 transition-colors ${isZeroStock ? 'opacity-60 bg-gray-50/50 dark:bg-gray-900/20' : ''
                            } ${expiryStatus === 'expired' ? 'bg-rose-50/40 dark:bg-rose-950/20' : ''}`}
                        >
                          <TableCell className="font-medium text-[var(--ph-text)] min-w-[260px] pl-4">
                            <div className="flex items-center gap-1.5">
                              <span className="font-semibold">{productName}</span>
                              {isLowStock && (
                                <AlertCircle className="h-3.5 w-3.5 text-amber-500 shrink-0" title="Low stock (<10 units)" />
                              )}
                              {isZeroStock && (
                                <span className="text-[10px] text-rose-500 font-semibold uppercase tracking-wider">(Out of Stock)</span>
                              )}
                            </div>
                          </TableCell>
                          <TableCell className="text-[var(--ph-text-secondary)] min-w-[150px]">{product.companyName || '-'}</TableCell>
                          <TableCell className="text-[var(--ph-text-secondary)] min-w-[80px]">{productUnit}</TableCell>
                          <TableCell className="text-center font-mono min-w-[130px] w-[140px] px-4">
                            <span className={`text-sm sm:text-base font-bold ${
                              isZeroStock
                                ? 'text-gray-400 font-semibold'
                                : isLowStock
                                  ? 'text-amber-600 dark:text-amber-400'
                                  : 'text-emerald-700 dark:text-emerald-400'
                            }`}>
                              {(product.quantity || 0).toLocaleString()}
                            </span>
                          </TableCell>
                          <TableCell className="font-mono text-sm font-medium text-[var(--ph-text)] min-w-[140px] w-[150px] px-4">
                            {product.expiry ? moment(product.expiry).format('DD/MM/YYYY') : '-'}
                          </TableCell>
                          <TableCell className="min-w-[125px]">
                            {expiryStatus === 'expired' && (
                              <Badge variant="destructive" className="text-[10px]">Expired</Badge>
                            )}
                            {expiryStatus === 'warning' && (
                              <Badge variant="warning" className="text-[10px]">Expiring Soon</Badge>
                            )}
                            {expiryStatus === 'valid' && (
                              <Badge variant="success" className="text-[10px]">Valid Lot</Badge>
                            )}
                            {expiryStatus === 'unknown' && (
                              <Badge variant="outline" className="text-[10px]">No Expiry</Badge>
                            )}
                          </TableCell>
                          <TableCell className="text-center min-w-[95px] pr-4">
                            <div className="flex items-center justify-center">
                              <Button
                                size="sm"
                                variant="outline"
                                onClick={() => handleViewHistory(product)}
                                className="h-7 px-2 text-xs border-[var(--ph-border)] hover:bg-[var(--ph-navy)] hover:text-white transition-colors"
                                title="Audit Ledger History"
                                id={`view-history-${product._id || index}`}
                              >
                                <History className="h-3.5 w-3.5 mr-1" />
                                Audit
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
  );
};

export default StockList;
