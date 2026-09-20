import React, { useState, useMemo, useEffect, useRef, useCallback } from 'react';
import {
  Search,
  RefreshCw,
  Printer,
  FileSpreadsheet,
  Download,
  Package,
  Calculator,
  History,
  X,
  Info
} from 'lucide-react';
import moment from 'moment';

const BATCH_SIZE = 30;

const AveragePriceReport = ({
  data = [],
  loading = false,
  onFetch,
  onExportExcel,
  onExportPdf,
  onPrint,
}) => {
  const [searchTerm, setSearchTerm] = useState('');
  const [visibleCount, setVisibleCount] = useState(BATCH_SIZE);
  const [selectedProduct, setSelectedProduct] = useState(null);
  const observerTarget = useRef(null);

  const filteredData = useMemo(() => {
    const q = searchTerm.trim().toLowerCase();
    if (!q) return data;
    return data.filter(
      (item) =>
        (item.productName || '').toLowerCase().includes(q) ||
        (item.companyName || '').toLowerCase().includes(q)
    );
  }, [data, searchTerm]);

  // Reset visibleCount whenever search or data changes
  useEffect(() => {
    setVisibleCount(BATCH_SIZE);
  }, [searchTerm, data]);

  // Load more handler for Infinite Scroll
  const loadMore = useCallback(() => {
    setVisibleCount((prev) => Math.min(prev + BATCH_SIZE, filteredData.length));
  }, [filteredData.length]);

  // IntersectionObserver for Infinite Scroll
  useEffect(() => {
    const target = observerTarget.current;
    if (!target) return;

    const observer = new IntersectionObserver(
      (entries) => {
        if (entries[0].isIntersecting) {
          loadMore();
        }
      },
      { threshold: 0.1, rootMargin: '200px' }
    );

    observer.observe(target);

    return () => {
      if (target) observer.unobserve(target);
    };
  }, [loadMore]);

  const totalProducts = data.length;
  const totalQuantitySum = useMemo(
    () => data.reduce((s, r) => s + (r.totalQuantity || 0), 0),
    [data]
  );
  const overallAvgPrice = useMemo(() => {
    let totalVal = 0;
    let totalQty = 0;
    data.forEach((r) => {
      const q = r.totalQuantity || 0;
      const avgP = r.exactAveragePrice ?? r.averagePurchasePrice ?? 0;
      totalQty += q;
      totalVal += q * avgP;
    });
    return totalQty > 0 ? totalVal / totalQty : 0;
  }, [data]);

  const visibleData = useMemo(
    () => filteredData.slice(0, visibleCount),
    [filteredData, visibleCount]
  );

  const hasMore = visibleCount < filteredData.length;

  const formatCurrency = (num) => {
    const val = Number(num || 0);
    return `$${val.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
  };

  return (
    <>
      {/* Top Action Bar / Controls */}
      <div className="reports-card">
        <div className="reports-card-header">
          <div className="reports-card-title flex items-center gap-2">
            <Calculator className="h-5 w-5 text-primary" />
            Average Purchase Price Report
          </div>
        </div>
        <div className="reports-card-content">
          <div className="reports-actions flex items-center justify-between flex-wrap gap-4">
            <div className="reports-search-box flex-1 min-w-[240px]">
              <div className="relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <input
                  type="text"
                  className="reports-input pl-9 w-full"
                  placeholder="Search by Product Name or Company..."
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                />
              </div>
            </div>

            <div className="flex items-center gap-2 flex-wrap">
              <button
                type="button"
                className="reports-btn-secondary"
                onClick={onFetch}
                disabled={loading}
              >
                {loading ? (
                  <RefreshCw className="h-4 w-4 reports-icon-spin" />
                ) : (
                  <RefreshCw className="h-4 w-4" />
                )}
                Refresh
              </button>
              <button
                type="button"
                className="reports-btn-secondary"
                onClick={() => onExportExcel(filteredData)}
                disabled={loading || filteredData.length === 0}
              >
                <FileSpreadsheet className="h-4 w-4" /> Excel
              </button>
              <button
                type="button"
                className="reports-btn-secondary"
                onClick={() => onExportPdf(filteredData)}
                disabled={loading || filteredData.length === 0}
              >
                <Download className="h-4 w-4" /> PDF
              </button>
              <button
                type="button"
                className="reports-btn-secondary"
                onClick={onPrint}
                disabled={loading || filteredData.length === 0}
              >
                <Printer className="h-4 w-4" /> Print
              </button>
            </div>
          </div>
        </div>
      </div>

      {loading && (
        <div className="reports-loading-overlay">
          <RefreshCw className="reports-spinner" />
          <span>Calculating weighted average prices...</span>
        </div>
      )}

      {!loading && (
        <>
          {/* Summary KPIs */}
          <div className="reports-kpi-grid">
            <div className="reports-kpi-card blue">
              <div className="reports-kpi-label">Total Products</div>
              <div className="reports-kpi-value">{totalProducts}</div>
            </div>
            <div className="reports-kpi-card green">
              <div className="reports-kpi-label">Total Stock In Quantity</div>
              <div className="reports-kpi-value">{totalQuantitySum.toLocaleString()}</div>
            </div>
            <div className="reports-kpi-card purple">
              <div className="reports-kpi-label">Overall Weighted Avg Price</div>
              <div className="reports-kpi-value">{formatCurrency(overallAvgPrice)}</div>
            </div>
          </div>

          {/* Main Table Card */}
          <div className="reports-card">
            <div className="reports-card-content">
              {filteredData.length === 0 ? (
                <div className="reports-empty">
                  <Package className="h-10 w-10 text-muted-foreground mx-auto mb-2" />
                  <p>
                    {searchTerm
                      ? 'No products match your search query.'
                      : 'No products found in the database.'}
                  </p>
                </div>
              ) : (
                <>
                  <div className="reports-table-wrap max-h-[70vh] overflow-y-auto">
                    <table className="reports-table">
                      <thead className="sticky top-0 bg-[var(--ph-surface-2)] z-10 shadow-sm">
                        <tr>
                          <th className="col-num">#</th>
                          <th className="col-product">Product Name</th>
                          <th className="col-qty text-right min-w-[160px]">
                            Total Quantity
                          </th>
                          <th className="col-total text-right min-w-[200px]">
                            Average Purchase Price
                          </th>
                          <th className="text-center min-w-[100px]">
                            History
                          </th>
                        </tr>
                      </thead>
                      <tbody>
                        {visibleData.map((item, index) => {
                          const rowNum = index + 1;
                          const avgPrice = item.averagePurchasePrice ?? item.exactAveragePrice ?? 0;

                          return (
                            <tr key={item._id || index}>
                              <td className="col-num font-mono text-slate-500">{rowNum}</td>
                              <td className="col-product font-semibold text-[var(--ph-text)]">
                                <div>{item.productName || 'N/A'}</div>
                                {(item.companyName || item.unit) && (
                                  <div className="text-xs text-[var(--ph-text-secondary)] font-normal mt-0.5">
                                    {item.companyName && <span>{item.companyName}</span>}
                                    {item.companyName && item.unit && <span> | </span>}
                                    {item.unit && <span>{item.unit}</span>}
                                  </div>
                                )}
                              </td>
                              <td className="col-qty text-right font-mono font-bold min-w-[160px]">
                                {(item.totalQuantity || 0).toLocaleString()}
                              </td>
                              <td className="col-total text-right font-mono font-bold text-emerald-700 dark:text-emerald-400 min-w-[200px]">
                                {formatCurrency(avgPrice)}
                              </td>
                              <td className="text-center min-w-[100px]">
                                <button
                                  type="button"
                                  className="reports-btn-secondary py-1 px-2.5 inline-flex items-center gap-1.5 text-xs text-primary hover:bg-primary/10 border border-primary/20 rounded-md transition-colors"
                                  title="View Purchase History"
                                  onClick={() => setSelectedProduct(item)}
                                >
                                  <History className="h-3.5 w-3.5" />
                                  <span>History</span>
                                </button>
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>

                    {/* Infinite Scroll Sentinel */}
                    <div ref={observerTarget} className="py-4 text-center text-sm text-muted-foreground">
                      {hasMore ? (
                        <div className="flex items-center justify-center gap-2">
                          <RefreshCw className="h-4 w-4 reports-icon-spin text-primary" />
                          <span>Loading more products...</span>
                        </div>
                      ) : (
                        <span>Showing all {filteredData.length} products</span>
                      )}
                    </div>
                  </div>

                  {/* Infinite Scroll Footer Status */}
                  <div className="reports-table-footer justify-between text-sm text-muted-foreground border-t pt-3 mt-2">
                    <div>
                      Showing <strong>{visibleData.length}</strong> of <strong>{filteredData.length}</strong> products
                    </div>
                    {hasMore && (
                      <button
                        type="button"
                        className="reports-btn-secondary text-xs"
                        onClick={loadMore}
                      >
                        Load More (+{BATCH_SIZE})
                      </button>
                    )}
                  </div>
                </>
              )}
            </div>
          </div>
        </>
      )}

      {/* Purchase History Modal */}
      {selectedProduct && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4 animate-in fade-in duration-200">
          <div className="bg-background border rounded-xl shadow-2xl w-full max-w-4xl max-h-[90vh] flex flex-col overflow-hidden">
            {/* Modal Header */}
            <div className="px-6 py-4 border-b flex items-center justify-between bg-muted/30">
              <div>
                <h2 className="text-xl font-bold flex items-center gap-2">
                  <History className="h-5 w-5 text-primary" />
                  Purchase History — {selectedProduct.productName}
                </h2>
                <p className="text-xs text-muted-foreground mt-0.5">
                  {selectedProduct.companyName || 'N/A'} {selectedProduct.unit ? `| ${selectedProduct.unit}` : ''}
                </p>
              </div>
              <button
                type="button"
                className="rounded-lg p-1.5 text-muted-foreground hover:text-foreground hover:bg-muted transition-colors"
                onClick={() => setSelectedProduct(null)}
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            {/* Modal Body */}
            <div className="p-6 overflow-y-auto space-y-6 flex-1">
              {/* Formula & Explanation Banner */}
              <div className="p-4 rounded-lg bg-blue-50/80 border border-blue-200 text-blue-900 flex items-start gap-3">
                <Info className="h-5 w-5 text-blue-600 mt-0.5 shrink-0" />
                <div className="space-y-1 text-sm">
                  <div className="font-semibold text-blue-950">
                    Weighted Average Purchase Price Formula:
                  </div>
                  <div className="font-mono text-xs bg-white/70 px-2 py-1 rounded border border-blue-200 inline-block">
                    Average Purchase Price = Total Purchase Value ÷ Total Quantity
                  </div>
                  {selectedProduct.totalQuantity > 0 && (
                    <div className="text-xs font-medium text-blue-900 mt-1">
                      Calculation: {formatCurrency(selectedProduct.totalPurchaseValue || 0)} ÷ {selectedProduct.totalQuantity} ={' '}
                      <span className="font-bold text-green-700 bg-green-50 px-1.5 py-0.5 rounded border border-green-200">
                        {formatCurrency(selectedProduct.averagePurchasePrice)}
                      </span>
                    </div>
                  )}
                </div>
              </div>

              {/* History Table */}
              {(!selectedProduct.history || selectedProduct.history.length === 0 || selectedProduct.totalQuantity === 0) ? (
                <div className="py-12 text-center border border-dashed rounded-lg">
                  <Package className="h-10 w-10 text-muted-foreground mx-auto mb-2" />
                  <p className="font-medium text-muted-foreground">No purchase history available</p>
                  <p className="text-xs text-muted-foreground mt-1">
                    No Stock In transactions have been recorded for this product yet.
                  </p>
                </div>
              ) : (
                <div className="border rounded-lg overflow-hidden">
                  <table className="reports-table w-full">
                    <thead className="bg-muted/50">
                      <tr>
                        <th style={{ width: '50px' }}>#</th>
                        <th>Purchase Date</th>
                        <th>Supplier</th>
                        <th className="text-right">Purchase Price</th>
                        <th className="text-right">Quantity</th>
                        <th className="text-right">Total Purchase Value</th>
                      </tr>
                    </thead>
                    <tbody>
                      {selectedProduct.history.map((entry, idx) => {
                        const rowTotal = entry.totalValue ?? ((entry.quantity || 0) * (entry.purchasingPrice || 0));
                        return (
                          <tr key={entry._id || idx} className="hover:bg-muted/30">
                            <td className="text-muted-foreground">{idx + 1}</td>
                            <td className="font-medium">
                              {moment(entry.date).format('DD-MM-YYYY hh:mm A')}
                            </td>
                            <td>{entry.supplierName || 'N/A'}</td>
                            <td className="text-right font-medium text-blue-700">
                              {formatCurrency(entry.purchasingPrice)}
                            </td>
                            <td className="text-right font-medium">
                              {(entry.quantity || 0).toLocaleString()}
                            </td>
                            <td className="text-right font-bold text-green-700">
                              {formatCurrency(rowTotal)}
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              )}

              {/* Summary Cards inside Modal */}
              {selectedProduct.totalQuantity > 0 && (
                <div className="grid grid-cols-1 md:grid-cols-3 gap-4 pt-2">
                  <div className="p-4 rounded-lg bg-muted/40 border">
                    <div className="text-xs text-muted-foreground uppercase font-medium">Total Quantity</div>
                    <div className="text-xl font-bold mt-1">
                      {selectedProduct.totalQuantity.toLocaleString()}
                    </div>
                  </div>
                  <div className="p-4 rounded-lg bg-muted/40 border">
                    <div className="text-xs text-muted-foreground uppercase font-medium">Total Purchase Value</div>
                    <div className="text-xl font-bold text-blue-700 mt-1">
                      {formatCurrency(selectedProduct.totalPurchaseValue || 0)}
                    </div>
                  </div>
                  <div className="p-4 rounded-lg bg-green-50 border border-green-200">
                    <div className="text-xs text-green-800 uppercase font-medium">Average Purchase Price</div>
                    <div className="text-xl font-extrabold text-green-700 mt-1">
                      {formatCurrency(selectedProduct.averagePurchasePrice)}
                    </div>
                  </div>
                </div>
              )}
            </div>

            {/* Modal Footer */}
            <div className="px-6 py-3 border-t bg-muted/20 flex justify-end">
              <button
                type="button"
                className="reports-btn-secondary"
                onClick={() => setSelectedProduct(null)}
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
};

export default AveragePriceReport;
