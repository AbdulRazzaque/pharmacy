import React, { useEffect, useMemo, useState } from 'react';
import axios from 'axios';
import moment from 'moment';
import { Button } from '../../components/ui/button';
import { Label } from '../../components/ui/label';
import { Card, CardContent, CardHeader, CardTitle } from '../../components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '../../components/ui/table';
import { Alert, AlertDescription } from '../../components/ui/alert';
import { DatePicker } from '../../components/ui/date-picker';
import { Search, History, Package } from 'lucide-react';
import { getToken } from '../../utils/auth';

const StockDetails = () => {
  const accessToken = getToken();

  const [loading, setLoading] = useState(false);
  const [alert, setAlert] = useState({ show: false, message: '', type: '' });

  const [fromDate, setFromDate] = useState('');
  const [toDate, setToDate] = useState('');
  const [hasSearched, setHasSearched] = useState(false);
  // Product search / selection (like Stock-In Report).
  const [products, setProducts] = useState([]);
  const [productSearch, setProductSearch] = useState('');
  const [selectedProductIds, setSelectedProductIds] = useState([]);

  const [movements, setMovements] = useState([]);

  const showAlert = (message, type) => {
    setAlert({ show: true, message, type });
    setTimeout(() => setAlert({ show: false, message: '', type: '' }), 3000);
  };

  const toggleProduct = (productId) => {
    setSelectedProductIds((prev) => {
      const has = prev.includes(productId);
      return has ? prev.filter((id) => id !== productId) : [...prev, productId];
    });
  };

  const toggleSelectAll = () => {
    if (selectedProductIds.length === products.length) {
      setSelectedProductIds([]);
    } else {
      setSelectedProductIds(products.map((p) => p._id));
    }
  };

  const fetchMovements = () => {
    setHasSearched(true);
    if (!fromDate || !toDate) {
      showAlert('Please select From Date and To Date', 'error');
      return;
    }
    if (moment(toDate).isBefore(moment(fromDate), 'day')) {
      showAlert('To Date cannot be before From Date', 'error');
      return;
    }

    setLoading(true);
    const qs = new URLSearchParams({
      // Fetch up to selected end date so ledger can compute opening stock from prior history.
      endDate: moment(toDate).endOf('day').toISOString(),
    });

    axios
      .get(`${process.env.REACT_APP_DEVELOPMENT}/api/stockHistory/movements?${qs.toString()}`, {
        headers: { token: accessToken },
      })
      .then((res) => {
        setMovements(res.data.result || []);
        setLoading(false);
      })
      .catch((err) => {
        console.error('Error fetching stock movements:', err);
        showAlert('Failed to fetch stock details', 'error');
        setLoading(false);
      });
  };

  // Default date range: last 7 days.
  useEffect(() => {
    const end = moment().format('YYYY-MM-DD');
    const start = moment().subtract(7, 'days').format('YYYY-MM-DD');
    setFromDate(start);
    setToDate(end);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    axios
      .get(`${process.env.REACT_APP_DEVELOPMENT}/api/product/getAllProducts`, {
        headers: { token: accessToken },
      })
      .then((res) => {
        setProducts(res.data.result || []);
      })
      .catch((err) => {
        console.error('Error fetching products:', err);
      });
  }, [accessToken]);

  const productsFiltered = useMemo(() => {
    const q = (productSearch || '').trim().toLowerCase();
    if (!q) return products;
    return products.filter((p) => (p.name || '').toLowerCase().includes(q));
  }, [products, productSearch]);

  const dailyRows = useMemo(() => {
    if (!fromDate || !toDate) return [];

    const rangeStart = moment(fromDate).startOf('day');
    const rangeEnd = moment(toDate).endOf('day');
    if (rangeEnd.isBefore(rangeStart)) return [];

    const normalized = (movements || [])
      .map((m) => {
        const dateObj = m.date ? new Date(m.date) : null;
        return {
          ...m,
          _productId: m.productId ? String(m.productId) : '',
          _productName: m.productName || '',
          _ts: dateObj ? dateObj.getTime() : 0,
          _dateKey: dateObj ? moment(dateObj).format('YYYY-MM-DD') : '',
        };
      })
      .filter((m) => m._productId && m._productName && m._dateKey && m._ts > 0)
      .sort((a, b) => a._ts - b._ts);

    const selectedProducts =
      selectedProductIds.length > 0
        ? products.filter((p) => selectedProductIds.includes(p._id))
        : products;

    let targetProducts = selectedProducts.map((p) => ({
      productId: String(p._id),
      productName: p.name || '',
      companyName: p.companyName || '',
      unit: p.unit || '',
    }));

    // Fallback to movement products when product master list is not available yet.
    if (targetProducts.length === 0) {
      const seen = new Map();
      normalized.forEach((m) => {
        if (!seen.has(m._productId)) {
          seen.set(m._productId, m._productName);
        }
      });
      targetProducts = Array.from(seen.entries()).map(([productId, productName]) => {
        const prod = products.find(p => String(p._id) === String(productId));
        return {
          productId,
          productName,
          companyName: prod?.companyName || '',
          unit: prod?.unit || '',
        };
      });
    }

    const movementsByProduct = new Map();
    normalized.forEach((m) => {
      if (!movementsByProduct.has(m._productId)) {
        movementsByProduct.set(m._productId, []);
      }
      movementsByProduct.get(m._productId).push(m);
    });

    const rows = [];

    targetProducts.forEach((product) => {
      const productMovements = movementsByProduct.get(product.productId) || [];

      const preRangeMovements = productMovements.filter((m) =>
        moment(m._dateKey).isBefore(rangeStart, 'day')
      );
      const firstInRange = productMovements.find((m) =>
        moment(m._dateKey).isSameOrAfter(rangeStart, 'day') &&
        moment(m._dateKey).isSameOrBefore(rangeEnd, 'day')
      );

      let runningClosing = 0;
      if (preRangeMovements.length > 0) {
        const lastPre = preRangeMovements[preRangeMovements.length - 1];
        runningClosing = Number(lastPre.newTotal || 0);
      } else if (firstInRange && firstInRange.previousTotal != null) {
        runningClosing = Number(firstInRange.previousTotal || 0);
      }

      for (let day = rangeStart.clone(); day.isSameOrBefore(rangeEnd, 'day'); day.add(1, 'day')) {
        const dayKey = day.format('YYYY-MM-DD');
        const dayMovements = productMovements.filter((m) => m._dateKey === dayKey);

        let stockIn = 0;
        let stockOut = 0;
        let stockAdjustment = 0;
        let updatedBy = '-';

        if (dayMovements.length > 0) {
          dayMovements.forEach((m) => {
            const qty = Number(m.quantity || 0);
            if (m.action === 'stockIn') stockIn += Math.abs(qty);
            if (m.action === 'stockOut') stockOut += Math.abs(qty);
            if (m.action === 'adjustment') stockAdjustment += qty;
          });

          const latestMovement = dayMovements[dayMovements.length - 1];
          if (latestMovement.newTotal != null) {
            runningClosing = Number(latestMovement.newTotal);
          } else {
            runningClosing = runningClosing + stockIn - stockOut + stockAdjustment;
          }
          updatedBy = latestMovement.performedBy || '-';
        }

        rows.push({
          dateKey: dayKey,
          productName: product.productName,
          companyName: product.companyName,
          unit: product.unit,
          closingQty: runningClosing,
          stockIn,
          stockOut,
          stockAdjustment,
          updatedBy,
        });
      }
    });

    return rows.sort((a, b) => {
      if (a.dateKey !== b.dateKey) return a.dateKey.localeCompare(b.dateKey);
      return a.productName.localeCompare(b.productName);
    });
  }, [fromDate, toDate, movements, products, selectedProductIds]);

  return (
    <div className="container mx-auto p-6 space-y-6">
      <div className="flex items-center justify-between flex-wrap gap-4">
        <h1 className="text-3xl font-bold flex items-center gap-2">
          <History className="h-7 w-7" />
          Stock Details
        </h1>
      </div>

      {alert.show && (
        <Alert variant={alert.type === 'error' ? 'destructive' : 'default'}>
          <AlertDescription>{alert.message}</AlertDescription>
        </Alert>
      )}

      <Card>
        <CardHeader>
          <CardTitle>Filters</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-3 items-end bg-gray-100 p-4 rounded-lg gap-4">
             <div className="reports-field">
              <Label>From Date</Label>
              <DatePicker
                value={fromDate ? new Date(fromDate) : undefined}
                onChange={(day) => setFromDate(day ? moment(day).format('YYYY-MM-DD') : '')}
              />
            </div>
            <div className="reports-field">
              <Label>To Date</Label>
              <DatePicker
                value={toDate ? new Date(toDate) : undefined}
                onChange={(day) => setToDate(day ? moment(day).format('YYYY-MM-DD') : '')}
              />
            </div>
           
          </div>
          <div className="reports-product-section">
  <div className="reports-product-section-title">
    <Package size={20} />
    Filter by product name(s) — select one or more
  </div>

  <div className="reports-product-toolbar">
    {/* Search */}
    <div className="reports-product-search-wrap">
      <Search className="search-icon" size={18} />

      <input
        type="text"
        placeholder="Search products..."
        value={productSearch}
        onChange={(e) => setProductSearch(e.target.value)}
      />
    </div>

    {/* Actions */}
    <div className="reports-product-actions">
      <div className="text-sm text-muted-foreground mr-3">
        Selected:{' '}
        <span className="font-medium">
          {selectedProductIds.length || 'All'}
        </span>
      </div>

      <button
        type="button"
        className="btn-sm btn-select-all"
        onClick={toggleSelectAll}
        disabled={products.length === 0}
      >
        {selectedProductIds.length === products.length
          ? 'Clear all products'
          : 'Select all products'}
      </button>

      {selectedProductIds.length > 0 && (
        <button
          type="button"
          className="btn-sm btn-clear"
          onClick={() => setSelectedProductIds([])}
        >
          Show all products
        </button>
      )}
    </div>
  </div>

<div className="reports-product-list-box">
  {products.length === 0 ? (
    <div className="reports-product-empty">
      Loading products… Add products in Dashboard if the list is empty.
    </div>
  ) : productsFiltered.length === 0 ? (
    <div className="reports-product-empty">
      No products match your search. Try a different term.
    </div>
  ) : (
    <div className="flex flex-col gap-2">
      {productsFiltered.map((p) => {
        const checked = selectedProductIds.includes(p._id);

        return (
          <label
            key={p._id}
            className="reports-product-item flex items-center gap-2 cursor-pointer"
          >
            <input
              type="checkbox"
              checked={checked}
              onChange={() => toggleProduct(p._id)}
            />

            <span
              className="truncate"
              title={`${p.name} | ${p.companyName || 'N/A'} | ${p.unit || 'N/A'}`}
            >
              {`${p.name} | ${p.companyName || 'N/A'} | ${p.unit || 'N/A'}`}
            </span>
          </label>
        );
      })}
    </div>
  )}
</div>
</div>

          <div className="flex flex-wrap gap-2">
            <Button onClick={fetchMovements} disabled={loading}>
              {loading ? 'Loading...' : 'Apply'}
            </Button>
            <Button
              variant="outline"
              onClick={() => {
                setSelectedProductIds([]);
                setProductSearch('');
                const end = moment().format('YYYY-MM-DD');
                const start = moment().subtract(7, 'days').format('YYYY-MM-DD');
                setFromDate(start);
                setToDate(end);
                setMovements([]);
              }}
            >
              Reset
            </Button>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Daily Stock Details</CardTitle>
          <p className="text-sm text-muted-foreground">
            Closing Qty shows the last recorded quantity for that product/day. IN/OUT are summed. Adjustment is signed.
          </p>
        </CardHeader>
        <CardContent>
          {!hasSearched  ? (
            <div className="text-center py-10 text-muted-foreground">   Please apply filters to view data.</div>
          ) 
          : loading ? (
            <div className="text-center py-10 text-muted-foreground">Loading...</div>
          ) : dailyRows.length === 0 ? (
            <div className="text-center py-10 text-muted-foreground">
              No records. Select date range and click Apply.
            </div>
          ) : (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Date</TableHead>
                    <TableHead>Product Name</TableHead>
                    <TableHead>Company</TableHead>
                    <TableHead>Unit</TableHead>
                    <TableHead className="text-right">Closing Qty</TableHead>
                    <TableHead className="text-right">Stock IN</TableHead>
                    <TableHead className="text-right">Stock OUT</TableHead>
                    <TableHead className="text-right">Stock Adjustment</TableHead>
                    <TableHead>Updated By</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {dailyRows.map((r) => (
                    <TableRow key={`${r.dateKey}-${r.productName}`}>
                      <TableCell>{moment(r.dateKey).format('DD-MM-YYYY')}</TableCell>
                      <TableCell className="font-medium">{r.productName}</TableCell>
                      <TableCell>{r.companyName || '-'}</TableCell>
                      <TableCell>{r.unit || '-'}</TableCell>
                      <TableCell className="text-right">{r.closingQty ?? '-'}</TableCell>
                      <TableCell className="text-right text-green-700">
                        {r.stockIn ? `+${r.stockIn}` : '0'}
                      </TableCell>
                      <TableCell className="text-right text-red-700">
                        {r.stockOut ? `-${r.stockOut}` : '0'}
                      </TableCell>
                      <TableCell className="text-right">
                        {r.stockAdjustment ? (r.stockAdjustment > 0 ? `+${r.stockAdjustment}` : `${r.stockAdjustment}`) : '0'}
                      </TableCell>
                      <TableCell>{r.updatedBy || '-'}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
};

export default StockDetails;

