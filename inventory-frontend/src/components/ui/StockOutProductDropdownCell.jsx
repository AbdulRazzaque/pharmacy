import React, { useState, useRef, useEffect, useCallback } from 'react';
import ReactDOM from 'react-dom';
import moment from 'moment';

/**
 * StockOutProductDropdownCell
 *
 * A table-cell product selector for Stock Out Documents.
 * Mirrors the exact autocomplete behavior of the Stock Out page:
 *
 * - Sources data from getAllStocks (live inventory, not product master)
 * - Displays: Product Name | Company | Unit
 *             Expiry • Qty: N   Unit Price: N.NN
 * - Shows "Out of Stock" badge for 0-qty entries
 * - Prevents selecting out-of-stock products
 * - On selection, auto-fills: expiry, sellingPrice, availableQty, unit, companyName, productId
 * - Renders dropdown via React portal to avoid table overflow clipping
 * - Uses onMouseDown to prevent blur/click race condition
 *
 * Props:
 *   item              - Row data { name, companyName, unit, productId, expiry, sellingPrice }
 *   stocks            - Array from getAllStocks (processed into flat entries per expiry batch)
 *   onSelect          - Callback({ productId, name, companyName, unit, expiry, sellingPrice, availableQty, stockId })
 *   cellId            - Optional id for keyboard navigation
 */
const StockOutProductDropdownCell = ({ item, stocks, onSelect, cellId }) => {
  const [isOpen, setIsOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [dropdownPos, setDropdownPos] = useState({ top: 0, left: 0, width: 0 });

  const displayRef = useRef(null);
  const inputRef = useRef(null);
  const dropdownRef = useRef(null);

  // Filter suggestions — same logic as Stockout.jsx stockSuggestions useMemo
  const filteredStocks = stocks
    .filter(s => {
      const q = (query || '').trim().toLowerCase();
      if (!q) return true;
      return (
        (s.productName || '').toLowerCase().includes(q) ||
        (s.companyName || '').toLowerCase().includes(q) ||
        (s.type || '').toLowerCase().includes(q)
      );
    })
    .slice(0, 30);

  const openDropdown = useCallback(() => {
    if (!displayRef.current) return;
    const rect = displayRef.current.getBoundingClientRect();
    setDropdownPos({
      top: rect.bottom + window.scrollY,
      left: rect.left + window.scrollX,
      width: Math.max(rect.width, 380),
    });
    setQuery('');
    setIsOpen(true);
  }, []);

  const closeDropdown = useCallback(() => {
    setIsOpen(false);
    setQuery('');
  }, []);

  useEffect(() => {
    if (isOpen && inputRef.current) {
      inputRef.current.focus();
    }
  }, [isOpen]);

  useEffect(() => {
    if (!isOpen) return;
    const handleClickOutside = (e) => {
      if (
        dropdownRef.current && !dropdownRef.current.contains(e.target) &&
        displayRef.current && !displayRef.current.contains(e.target)
      ) {
        closeDropdown();
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [isOpen, closeDropdown]);

  const handleSelect = useCallback((stock) => {
    if (stock.quantity <= 0) return; // Out of stock – prevent selection
    onSelect({
      productId: stock.productId,
      stockId: stock.originalStockId || stock._id,
      name: stock.productName,
      companyName: stock.companyName || '-',
      unit: stock.unit || '-',
      expiry: stock.expiry || null,
      sellingPrice: stock.sellingPrice ?? 0,
      availableQty: stock.quantity,
    });
    closeDropdown();
  }, [onSelect, closeDropdown]);

  const handleKeyDown = (e) => {
    if (e.key === 'Escape') {
      closeDropdown();
    } else if (e.key === 'Enter') {
      const selectable = filteredStocks.find(s => s.quantity > 0);
      if (selectable) handleSelect(selectable);
    }
  };

  // Format the display label for the cell (when closed)
  const displayLabel = item.name
    ? `${item.name}${item.companyName && item.companyName !== '-' ? ` (${item.companyName})` : ''}`
    : null;

  const expiryLabel = item.expiry
    ? ` · Exp: ${moment(item.expiry).format('DD/MM/YY')}`
    : '';

  return (
    <>
      {/* Closed cell display */}
      <div
        ref={displayRef}
        id={cellId}
        onClick={openDropdown}
        className={`w-full h-8 px-2 flex items-center gap-1 border rounded cursor-pointer transition-all
          ${isOpen
            ? 'border-red-500 bg-white ring-2 ring-red-300'
            : 'border-transparent hover:border-gray-300 hover:bg-gray-50'
          }`}
        title="Click to change product"
      >
        <span className={`flex-1 truncate text-xs ${displayLabel ? 'text-gray-800 font-medium' : 'text-gray-400 italic'}`}>
          {displayLabel
            ? `${displayLabel}${expiryLabel}`
            : 'Select product from inventory...'}
        </span>
        <svg className="h-3 w-3 text-gray-400 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 9l4-4 4 4m0 6l-4 4-4-4" />
        </svg>
      </div>

      {/* Portal dropdown */}
      {isOpen && ReactDOM.createPortal(
        <div
          ref={dropdownRef}
          style={{
            position: 'absolute',
            top: dropdownPos.top + 4,
            left: dropdownPos.left,
            width: Math.max(dropdownPos.width, 440),
            minWidth: 380,
            zIndex: 9999,
          }}
          className="bg-white border border-gray-300 rounded-lg shadow-2xl overflow-hidden"
        >
          {/* Search input */}
          <div className="p-2 border-b border-gray-200 bg-gray-50">
            <div className="flex items-center gap-2 bg-white border border-red-300 rounded px-2 py-1 focus-within:border-red-500 focus-within:ring-1 focus-within:ring-red-300">
              <svg className="h-3.5 w-3.5 text-red-400 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
              </svg>
              <input
                ref={inputRef}
                type="text"
                value={query}
                onChange={e => setQuery(e.target.value)}
                onKeyDown={handleKeyDown}
                placeholder="Search by product name or company..."
                className="flex-1 text-xs outline-none bg-transparent text-gray-800 placeholder-gray-400 min-w-0"
              />
              {query && (
                <button
                  onMouseDown={e => { e.preventDefault(); setQuery(''); inputRef.current?.focus(); }}
                  className="text-gray-400 hover:text-gray-700 p-0.5 rounded"
                >
                  <svg className="h-3 w-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                  </svg>
                </button>
              )}
            </div>
          </div>

          {/* Results */}
          <div className="max-h-64 overflow-y-auto divide-y divide-gray-100">
            {stocks.length === 0 ? (
              <div className="px-4 py-5 text-xs text-gray-500 text-center">No stock available.</div>
            ) : filteredStocks.length === 0 ? (
              <div className="px-4 py-5 text-xs text-gray-500 text-center">No products match "{query}"</div>
            ) : (
              filteredStocks.map((stock) => {
                const isOutOfStock = stock.quantity <= 0;
                const isCurrent = stock.productId === item.productId &&
                  ((!stock.expiry && !item.expiry) ||
                    moment(stock.expiry).format('YYYY-MM-DD') === moment(item.expiry).format('YYYY-MM-DD'));

                return (
                  <div
                    key={stock._id}
                    onMouseDown={(e) => {
                      e.preventDefault();
                      if (!isOutOfStock) handleSelect(stock);
                    }}
                    className={`px-3 py-2.5 transition-colors
                      ${isOutOfStock
                        ? 'opacity-50 cursor-not-allowed bg-gray-50'
                        : isCurrent
                          ? 'bg-red-50 border-l-2 border-l-red-500 cursor-pointer'
                          : 'cursor-pointer hover:bg-slate-50'
                      }`}
                  >
                    {/* Row 1: Product name + company */}
                    <div className="flex items-center justify-between gap-2">
                      <div className="font-semibold text-xs text-gray-800">
                        {stock.productName}
                        {stock.companyName && (
                          <span className="text-gray-500 font-normal ml-1">
                            ({stock.companyName})
                          </span>
                        )}
                      </div>
                      <div className="flex items-center gap-1 shrink-0">
                        {isOutOfStock && (
                          <span className="text-[10px] font-bold bg-red-100 text-red-600 px-1.5 py-0.5 rounded">
                            OUT
                          </span>
                        )}
                        {isCurrent && !isOutOfStock && (
                          <span className="text-[10px] font-bold bg-red-100 text-red-700 px-1.5 py-0.5 rounded">
                            Current
                          </span>
                        )}
                      </div>
                    </div>

                    {/* Row 2: Badges - Available, Unit, Price, Expiry */}
                    <div className="flex flex-wrap items-center gap-1.5 mt-1.5">
                      <span className={`inline-flex items-center text-[10px] font-semibold px-2 py-0.5 rounded-full border ${
                        isOutOfStock 
                          ? 'bg-red-50 text-red-600 border-red-200' 
                          : 'bg-emerald-50 text-emerald-700 border-emerald-200'
                      }`}>
                        Available:&nbsp;<span className="font-extrabold">{isOutOfStock ? '0' : stock.quantity}</span>
                      </span>

                      {stock.unit ? (
                        <span className="inline-flex items-center text-[10px] font-medium bg-slate-100 text-slate-700 px-2 py-0.5 rounded-full border border-slate-200">
                          Unit:&nbsp;<span className="font-semibold text-slate-800">{stock.unit}</span>
                        </span>
                      ) : null}

                      {stock.sellingPrice > 0 && (
                        <span className="inline-flex items-center text-[10px] font-mono font-medium text-gray-700 bg-gray-100 px-2 py-0.5 rounded-full border border-gray-200">
                          Price:&nbsp;<span className="font-bold">QR {stock.sellingPrice.toFixed(2)}</span>
                        </span>
                      )}

                      {stock.expiry && (
                        <span className="inline-flex items-center text-[10px] font-medium text-amber-700 bg-amber-50 px-2 py-0.5 rounded-full border border-amber-200">
                          Expiry:&nbsp;<span className="font-semibold">{moment(stock.expiry).format('DD/MM/YYYY')}</span>
                        </span>
                      )}
                    </div>
                  </div>
                );
              })
            )}
          </div>

          {/* Footer */}
          <div className="px-3 py-1.5 bg-gray-50 border-t border-gray-200 flex items-center justify-between">
            <span className="text-[10px] text-gray-400">
              {filteredStocks.filter(s => s.quantity > 0).length} in stock
            </span>
            <span className="text-[10px] text-gray-400">
              Enter = select first · Esc = close
            </span>
          </div>
        </div>,
        document.body
      )}
    </>
  );
};

export default StockOutProductDropdownCell;
