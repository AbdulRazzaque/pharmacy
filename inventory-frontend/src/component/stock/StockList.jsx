import React, { useState, useEffect, useMemo } from 'react';
import axios from 'axios';
import { useNavigate } from 'react-router-dom';
import { Button } from '../../components/ui/button';
import { Input } from '../../components/ui/input';
import { Card, CardContent, CardHeader, CardTitle } from '../../components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '../../components/ui/table';
import { Alert, AlertDescription } from '../../components/ui/alert';
import { Search, Download, Package, AlertCircle, History, Eye, EyeOff } from 'lucide-react';
import * as XLSX from 'xlsx';
import { saveAs } from '../../utils/fileDownload';
import moment from 'moment';
import { getToken, getUserInfo } from '../../utils/auth';

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
    <div className="container mx-auto p-6 space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <h1 className="text-3xl font-bold">
          <Package className="inline mr-2" />
          Stock List
        </h1>
        <div className="flex items-center gap-2">
          {/* Toggle: Hide Zero Stock & Expired */}
          <button
            id="toggle-hide-zero-expired"
            onClick={() => setHideZeroExpired(prev => !prev)}
            className={`
              flex items-center gap-2 px-4 py-2 rounded-lg border text-sm font-medium
              transition-all duration-200 cursor-pointer
              ${hideZeroExpired
                ? 'bg-blue-600 text-white border-blue-700 shadow-md'
                : 'bg-white text-gray-700 border-gray-300 hover:bg-gray-50'
              }
            `}
            title={hideZeroExpired ? 'Click to show all products' : 'Click to hide zero-stock & expired products'}
          >
            {hideZeroExpired
              ? <><EyeOff className="h-4 w-4" /> Hiding Zero &amp; Expired</>
              : <><Eye className="h-4 w-4" /> Hide Zero &amp; Expired</>
            }
          </button>

          <Button variant="outline" onClick={exportToExcel} id="export-stock-excel">
            <Download className="mr-2 h-4 w-4" />
            Export to Excel
          </Button>
        </div>
      </div>

      {alert.show && (
        <Alert variant={alert.type === 'error' ? 'destructive' : 'default'}>
          <AlertDescription>{alert.message}</AlertDescription>
        </Alert>
      )}

      {/* Summary Cards */}
      <div className={`grid grid-cols-1 ${isAdmin ? 'md:grid-cols-4' : 'md:grid-cols-3'} gap-4`}>
        <Card>
          <CardContent className="pt-6">
            <div className="text-2xl font-bold">{filteredData.length}</div>
            <p className="text-xs text-muted-foreground">
              {hideZeroExpired ? 'Active Stock Items' : 'Total Stock Items'}
            </p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6">
            <div className="text-2xl font-bold">
              {filteredData.reduce((sum, item) => sum + (item.quantity || 0), 0)}
            </div>
            <p className="text-xs text-muted-foreground">Total Quantity</p>
          </CardContent>
        </Card>
        {isAdmin && (
          <Card>
            <CardContent className="pt-6">
              <div className="text-2xl font-bold">${getTotalValue()}</div>
              <p className="text-xs text-muted-foreground">Total Value</p>
            </CardContent>
          </Card>
        )}
        <Card>
          <CardContent className="pt-6">
            <div className="text-2xl font-bold text-red-600">{getLowStockItems()}</div>
            <p className="text-xs text-muted-foreground">Low Stock Items</p>
          </CardContent>
        </Card>
      </div>

      {/* Search */}
      <Card>
        <CardContent className="pt-6">
          <Input
            icon={Search}
            placeholder="Search by product name, type, or location..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            clearable
            onClear={() => setSearchQuery('')}
          />
        </CardContent>
      </Card>

      {/* Stock Table */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center justify-between">
            <span>
              Stock List ({filteredData.length})
              {hideZeroExpired && (
                <span className="ml-2 text-xs font-normal text-blue-600 bg-blue-50 px-2 py-0.5 rounded-full border border-blue-200">
                  Active only
                </span>
              )}
            </span>
          </CardTitle>
        </CardHeader>
        <CardContent>
          {loading ? (
            <div className="text-center py-8 text-muted-foreground">Loading...</div>
          ) : (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Product Name</TableHead>
                    <TableHead>Company</TableHead>
                    <TableHead>Unit</TableHead>
                    <TableHead className="text-right">Quantity</TableHead>
                    <TableHead>Expiry Date</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead className="text-center">Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filteredData.length === 0 ? (
                    <TableRow>
                      <TableCell colSpan={7} className="text-center py-8 text-muted-foreground">
                        {searchQuery
                          ? 'No stock items found matching your search.'
                          : hideZeroExpired
                            ? 'No active stock items. Toggle off the filter to see all products.'
                            : 'No stock items available.'}
                      </TableCell>
                    </TableRow>
                  ) : (
                    filteredData.map((product, index) => {
                      const expiryStatus = getExpiryStatus(product.expiry);
                      const isZeroStock = (product.quantity || 0) === 0;
                      const isLowStock = (product.quantity || 0) > 0 && (product.quantity || 0) < 10;
                      const productName = product.name || product.productName || '-';
                      const productUnit = product.unit || '-';

                      const statusStyles = {
                        expired: 'bg-red-100 text-red-800 border border-red-200',
                        warning: 'bg-yellow-100 text-yellow-800 border border-yellow-200',
                        valid: 'bg-green-100 text-green-800 border border-green-200',
                        unknown: 'bg-gray-100 text-gray-600 border border-gray-200'
                      };
                      const statusLabels = {
                        expired: 'Expired',
                        warning: 'Expiring Soon',
                        valid: 'Valid',
                        unknown: 'No Date'
                      };

                      return (
                        <TableRow
                          key={product._id || index}
                          className={`
                            ${isZeroStock ? 'opacity-60 bg-gray-50' : ''}
                            ${expiryStatus === 'expired' ? 'bg-red-50' : ''}
                          `}
                        >
                          <TableCell className="font-medium">
                            {productName}
                            {isLowStock && (
                              <AlertCircle className="inline ml-2 h-4 w-4 text-yellow-500" title="Low stock" />
                            )}
                            {isZeroStock && (
                              <span className="ml-2 text-xs text-gray-400 font-normal">(Out of stock)</span>
                            )}
                          </TableCell>
                          <TableCell>{product.companyName || '-'}</TableCell>
                          <TableCell>{productUnit}</TableCell>
                          <TableCell className="text-right">
                            <span className={
                              isZeroStock
                                ? 'text-gray-400 font-semibold'
                                : isLowStock
                                  ? 'text-yellow-600 font-semibold'
                                  : 'text-green-700 font-semibold'
                            }>
                              {product.quantity || 0}
                            </span>
                          </TableCell>
                          <TableCell>
                            {product.expiry ? moment(product.expiry).format('DD/MM/YYYY') : '-'}
                          </TableCell>
                          <TableCell>
                            <span className={`px-2 py-1 rounded text-xs font-medium ${statusStyles[expiryStatus]}`}>
                              {statusLabels[expiryStatus]}
                            </span>
                          </TableCell>
                          <TableCell className="text-center">
                            <div className="flex items-center justify-center gap-2">
                              <Button
                                size="sm"
                                variant="outline"
                                onClick={() => handleViewHistory(product)}
                                className="gap-1"
                                title="View History"
                                id={`view-history-${product._id || index}`}
                              >
                                <History className="h-4 w-4" />
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
