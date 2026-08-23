import React, { useState, useRef, useEffect, useCallback } from 'react';
import ReactDOM from 'react-dom';

/**
 * ProductDropdownCell
 *
 * A table cell component for selecting a product from a master list.
 * - Renders a clickable display value when closed
 * - Opens a searchable dropdown portal when clicked
 * - Only allows selecting existing products (no free-text entry)
 * - Filters out soft-deleted products (isDeleted === true)
 * - Displays suggestions as: "Product Name (Company) - Unit"
 * - Auto-updates Company and Unit when product is selected
 *
 * Props:
 *   item         - The current row data object { name, companyName, unit, productId, ... }
 *   allProducts  - Array of all products from the master list
 *   onSelect     - Callback(product) called when a product is selected
 *   cellId       - Optional id attribute for keyboard navigation
 *   accentColor  - 'emerald' | 'blue' (default: 'blue')
 */
const ProductDropdownCell = ({ item, allProducts, onSelect, cellId, accentColor = 'blue' }) => {
  const [isOpen, setIsOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [dropdownPos, setDropdownPos] = useState({ top: 0, left: 0, width: 0 });

  const displayRef = useRef(null);
  const inputRef = useRef(null);
  const dropdownRef = useRef(null);

  // Filtered product list (exclude soft-deleted)
  const filteredProducts = allProducts
    .filter(p => !p.isDeleted)
    .filter(p => {
      const q = query.toLowerCase();
      if (!q) return true;
      return (
        (p.name || '').toLowerCase().includes(q) ||
        (p.companyName || '').toLowerCase().includes(q) ||
        (p.unit || '').toLowerCase().includes(q)
      );
    })
    .slice(0, 60);

  // Open dropdown and position it relative to the cell
  const openDropdown = useCallback(() => {
    if (!displayRef.current) return;
    const rect = displayRef.current.getBoundingClientRect();
    setDropdownPos({
      top: rect.bottom + window.scrollY,
      left: rect.left + window.scrollX,
      width: Math.max(rect.width, 320),
    });
    setQuery('');
    setIsOpen(true);
  }, []);

  // Close dropdown and reset query
  const closeDropdown = useCallback(() => {
    setIsOpen(false);
    setQuery('');
  }, []);

  // Auto-focus input when dropdown opens
  useEffect(() => {
    if (isOpen && inputRef.current) {
      inputRef.current.focus();
    }
  }, [isOpen]);

  // Close dropdown on outside click
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

  // Handle product selection
  const handleSelect = useCallback((product) => {
    onSelect(product);
    closeDropdown();
  }, [onSelect, closeDropdown]);

  // Handle keyboard in search input
  const handleKeyDown = (e) => {
    if (e.key === 'Escape') {
      closeDropdown();
    } else if (e.key === 'Enter') {
      if (filteredProducts.length > 0) {
        handleSelect(filteredProducts[0]);
      }
    }
  };

  const isEmerald = accentColor === 'emerald';

  return (
    <>
      {/* Display cell - shown always; clicking opens the portal dropdown */}
      <div
        ref={displayRef}
        id={cellId}
        onClick={openDropdown}
        className={`w-full h-8 px-2 flex items-center gap-1 border rounded cursor-pointer transition-all
          ${isOpen
            ? `border-${isEmerald ? 'emerald' : 'blue'}-500 bg-white ring-2 ring-${isEmerald ? 'emerald' : 'blue'}-400`
            : 'border-transparent hover:border-gray-300 hover:bg-gray-50'
          }`}
        title="Click to select a product"
      >
        <span className={`flex-1 truncate text-xs ${item.name ? 'text-gray-800 font-medium' : 'text-gray-400 italic'}`}>
          {item.name || 'Select product...'}
        </span>
        <svg className="h-3 w-3 text-gray-400 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 9l4-4 4 4m0 6l-4 4-4-4" />
        </svg>
      </div>

      {/* Dropdown portal - renders to document.body to avoid table overflow clipping */}
      {isOpen && ReactDOM.createPortal(
        <div
          ref={dropdownRef}
          style={{
            position: 'absolute',
            top: dropdownPos.top + 4,
            left: dropdownPos.left,
            width: dropdownPos.width,
            zIndex: 9999,
          }}
          className="bg-white border border-gray-300 rounded-lg shadow-2xl overflow-hidden"
        >
          {/* Search input header */}
          <div className="p-2 border-b border-gray-200 bg-gray-50">
            <div className="flex items-center gap-2 bg-white border border-gray-300 rounded px-2 py-1 focus-within:border-blue-400 focus-within:ring-1 focus-within:ring-blue-300">
              <svg className="h-3.5 w-3.5 text-gray-400 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
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

          {/* Suggestions list */}
          <div className="max-h-56 overflow-y-auto">
            {filteredProducts.length === 0 ? (
              <div className="px-3 py-5 text-xs text-gray-400 text-center">
                No products found{query ? ` for "${query}"` : ''}
              </div>
            ) : (
              filteredProducts.map(p => {
                const isCurrent = p._id === item.productId;
                return (
                  <div
                    key={p._id}
                    onMouseDown={(e) => {
                      e.preventDefault();
                      handleSelect(p);
                    }}
                    className={`px-3 py-2 cursor-pointer border-b border-gray-50 last:border-0 transition-colors
                      ${isCurrent
                        ? isEmerald
                          ? 'bg-emerald-50 border-l-2 border-l-emerald-500'
                          : 'bg-blue-50 border-l-2 border-l-blue-500'
                        : isEmerald
                          ? 'hover:bg-emerald-50'
                          : 'hover:bg-blue-50'
                      }`}
                  >
                    <div className={`font-semibold text-xs leading-tight ${isCurrent ? (isEmerald ? 'text-emerald-800' : 'text-blue-800') : 'text-gray-800'}`}>
                      {p.name} ({p.companyName}) - {p.unit || 'N/A'}
                    </div>
                    {isCurrent && (
                      <div className={`text-[10px] mt-0.5 ${isEmerald ? 'text-emerald-600' : 'text-blue-600'}`}>
                        Currently selected
                      </div>
                    )}
                  </div>
                );
              })
            )}
          </div>

          {/* Footer hint */}
          <div className="px-3 py-1.5 bg-gray-50 border-t border-gray-200 flex items-center justify-between">
            <span className="text-[10px] text-gray-400">
              {filteredProducts.length} result{filteredProducts.length !== 1 ? 's' : ''}
            </span>
            <span className="text-[10px] text-gray-400">
              Enter = select first &bull; Esc = close
            </span>
          </div>
        </div>,
        document.body
      )}
    </>
  );
};

export default ProductDropdownCell;
