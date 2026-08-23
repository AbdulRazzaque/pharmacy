import React, { useState, useEffect, useRef, useMemo, useCallback } from 'react';
import { createPortal } from 'react-dom';
import axios from 'axios';
import { Navigate } from 'react-router-dom';
import { getToken, getUserInfo } from '../../utils/auth';
import {
  AlertCircle, CheckCircle2, X, Save,
  Upload, Download, Trash2, RefreshCw,
  FileSpreadsheet, Info, Keyboard
} from 'lucide-react';
import moment from 'moment';
import * as XLSX from 'xlsx';

const API = process.env.REACT_APP_DEVELOPMENT;

/* ─────────────────────────────────────────────────────────────────────────────
   HELPERS
───────────────────────────────────────────────────────────────────────────── */
let _rowId = 1;
const newRowId = () => `row-${_rowId++}-${Date.now()}`;

const emptyRow = () => ({
  id: newRowId(),
  productId: '',
  productName: '',
  companyName: '',
  type: '',
  unit: '',
  expiry: '',
  currentQty: '',
  qtyIn: '',
  qtyOut: '',
  price: '',
  remarks: '',
  _query: '',
  _showDrop: false,
  _batches: [],     // available expiry batches for selected product
  _requiresExpiry: false,
});

const IMPORT_CHUNK = 500;
const FIELD_ORDER  = ['product', 'expiry', 'qtyIn', 'qtyOut', 'price', 'remarks'];
const MAX_SUGS     = 25;

/* ─────────────────────────────────────────────────────────────────────────────
   FUZZY SEARCH  (barcode · SKU · company · fuzzy char-order, < 1ms / 20k items)
───────────────────────────────────────────────────────────────────────────── */
function fuzzySearch(products, stockMap, query) {
  const q = (query || '').trim().toLowerCase();
  if (!q) {
    return products.slice(0, MAX_SUGS).map(p => ({
      ...p, _stock: stockMap.get(String(p._id))?.totalQuantity ?? 0, _score: 0,
    }));
  }
  const scored = [];
  for (let i = 0; i < products.length; i++) {
    const p       = products[i];
    const name    = (p.name || p.productName || '').toLowerCase();
    const company = (p.companyName || '').toLowerCase();
    const barcode = (p.barcode || '').toLowerCase();
    const sku     = (p.sku    || '').toLowerCase();
    let score = 0;
    if      (name.startsWith(q))    score = 100;
    else if (name.includes(q))      score = 80;
    else if (barcode === q)         score = 90;
    else if (sku === q)             score = 85;
    else if (company.startsWith(q)) score = 60;
    else if (company.includes(q))   score = 50;
    else {
      let qi = 0;
      for (let ci = 0; ci < name.length && qi < q.length; ci++) {
        if (name[ci] === q[qi]) qi++;
      }
      if (qi === q.length) score = 20;
    }
    if (score > 0) scored.push({ ...p, _stock: stockMap.get(String(p._id))?.totalQuantity ?? 0, _score: score });
  }
  scored.sort((a, b) => b._score - a._score);
  return scored.slice(0, MAX_SUGS);
}

/* ─────────────────────────────────────────────────────────────────────────────
   HIGHLIGHT MATCHING TEXT
───────────────────────────────────────────────────────────────────────────── */
function Highlight({ text, query }) {
  if (!query || !text) return <span>{text}</span>;
  const q   = query.trim().toLowerCase();
  const idx = text.toLowerCase().indexOf(q);
  if (idx === -1) return <span>{text}</span>;
  return (
    <span>
      {text.slice(0, idx)}
      <mark style={{ background: '#fde68a', color: '#78350f', borderRadius: '2px', fontWeight: 700, fontStyle: 'normal' }}>
        {text.slice(idx, idx + q.length)}
      </mark>
      {text.slice(idx + q.length)}
    </span>
  );
}

/* ─────────────────────────────────────────────────────────────────────────────
   PORTAL DROPDOWN — rendered into document.body via createPortal.
   Completely escapes the overflow:auto table container.
   Auto-flips upward when near the bottom of the viewport.
───────────────────────────────────────────────────────────────────────────── */
function ProductDropdownPortal({ anchorRef, suggestions, activeSug, query, onSelect }) {
  const [rect, setRect] = useState(null);

  useEffect(() => {
    const update = () => {
      if (anchorRef.current) setRect(anchorRef.current.getBoundingClientRect());
    };
    update();
    window.addEventListener('scroll', update, true);
    window.addEventListener('resize', update);
    return () => {
      window.removeEventListener('scroll', update, true);
      window.removeEventListener('resize', update);
    };
  }, [anchorRef]);

  if (!rect) return null;

  const PANEL_H   = 360;
  const spaceDown = window.innerHeight - rect.bottom;
  const openUp    = spaceDown < PANEL_H && rect.top > PANEL_H;
  const panelStyle = {
    position: 'fixed', left: rect.left, width: Math.max(rect.width, 420), zIndex: 99999,
    boxShadow: '0 20px 60px -12px rgba(0,0,0,.25)',
    ...(openUp ? { bottom: window.innerHeight - rect.top + 4 } : { top: rect.bottom + 4 }),
  };

  return createPortal(
    <div style={panelStyle} className="bg-white border border-slate-200 rounded-xl overflow-hidden"
         onMouseDown={e => e.preventDefault()}>

      {/* mini-header */}
      <div className="px-3 py-1.5 bg-slate-50 border-b border-slate-100 flex items-center justify-between">
        <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">
          {suggestions.length} result{suggestions.length !== 1 ? 's' : ''}{query ? ` · "${query}"` : ''}
        </span>
        <span className="text-[10px] text-slate-300">↑↓ · Enter/Tab select · Esc close</span>
      </div>

      <div className="overflow-y-auto" style={{ maxHeight: PANEL_H - 36 }}>
        {suggestions.length === 0 ? (
          <div className="flex flex-col items-center py-8 gap-2 text-slate-400">
            <svg className="w-8 h-8 text-slate-200" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5}
                    d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
            </svg>
            <p className="text-xs font-medium">No products found{query ? ` for "${query}"` : ''}</p>
          </div>
        ) : suggestions.map((s, i) => {
          const active   = i === activeSug;
          const stockVal = s._stock ?? 0;
          const stockCls = stockVal > 50
            ? 'text-emerald-700 bg-emerald-50 border-emerald-200'
            : stockVal > 0
            ? 'text-amber-700 bg-amber-50 border-amber-200'
            : 'text-red-600 bg-red-50 border-red-200';
          const name        = s.name || s.productName || '';
          const firstExpiry = (s._batches || [])[0]?.expiryLabel || null;

          return (
            <div key={s._id} data-suggestion-idx={i}
              className={`flex items-start gap-3 px-3 py-2.5 cursor-pointer border-l-2 transition-all ${
                active ? 'bg-amber-50 border-amber-500' : 'border-transparent hover:bg-slate-50 hover:border-slate-300'
              }`}
              onMouseDown={() => onSelect(s)}>

              {/* avatar */}
              <div className={`mt-0.5 flex-shrink-0 w-8 h-8 rounded-lg flex items-center justify-center
                text-xs font-black select-none ${
                  active ? 'bg-amber-500 text-white' : 'bg-slate-100 text-slate-500'
                }`}>
                {name.charAt(0).toUpperCase()}
              </div>

              {/* info */}
              <div className="flex-1 min-w-0">
                <p className={`text-sm font-bold leading-tight truncate ${
                  active ? 'text-amber-900' : 'text-slate-800'
                }`}>
                  <Highlight text={name} query={query} />
                </p>
                <p className="text-[11px] text-slate-500 mt-0.5 leading-tight">
                  <Highlight text={s.companyName || '\u2014'} query={query} />
                  {s.type && <><span className="mx-1 text-slate-300">\u00B7</span><span>{s.type}</span></>}
                  {s.unit && <><span className="mx-1 text-slate-300">\u00B7</span><span>{s.unit}</span></>}
                </p>
                <div className="flex items-center gap-2 mt-1 flex-wrap">
                  {s.barcode && (
                    <span className="text-[9px] font-mono text-slate-400 bg-slate-100 px-1.5 py-0.5 rounded">
                      {s.barcode}
                    </span>
                  )}
                  {firstExpiry && (
                    <span className="text-[10px] text-slate-500">
                      Exp: <span className="font-semibold">{firstExpiry}</span>
                    </span>
                  )}
                </div>
              </div>

              {/* stock + price */}
              <div className="flex flex-col items-end gap-1 flex-shrink-0">
                <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full border ${stockCls}`}>
                  Stk {stockVal}
                </span>
                {(s.sellingPrice || s.purchasingPrice) ? (
                  <span className="text-[10px] text-slate-500 font-semibold">
                    {(s.sellingPrice || s.purchasingPrice || 0).toFixed(2)}
                  </span>
                ) : null}
              </div>
            </div>
          );
        })}
      </div>
    </div>,
    document.body
  );
}

/* ─────────────────────────────────────────────────────────────────────────────
   MEMOIZED ROW — re-renders only when its own data or focus changes
───────────────────────────────────────────────────────────────────────────── */
const GridRow = React.memo(({
  row, rowIdx, isFocused, activeCell,
  onQueryChange, onKeyDownProduct,
  onCellChange, onCellKeyDown, onCellFocus,
  onRemove, inputRef,
}) => {
  const inQty  = parseFloat(row.qtyIn)  || 0;
  const outQty = parseFloat(row.qtyOut) || 0;
  const avail  = parseFloat(row.currentQty) || 0;
  const finalQty = avail + inQty - outQty;
  const hasAdjust = inQty > 0 || outQty > 0;

  const cellCls = (field) =>
    `w-full h-7 px-1.5 text-xs bg-transparent focus:outline-none focus:bg-amber-50 border-0 focus:ring-1 focus:ring-amber-400 rounded transition-colors ${
      activeCell === field && isFocused ? 'ring-1 ring-amber-400 bg-amber-50' : ''
    }`;

  return (
    <tr className={`border-b border-slate-100 ${hasAdjust ? 'bg-amber-50/20' : rowIdx % 2 === 0 ? 'bg-white' : 'bg-slate-50/40'} hover:bg-amber-50/30 transition-colors`}>

      {/* # */}
      <td className="w-9 px-1 text-center text-[10px] text-slate-400 font-mono select-none border-r border-slate-100">
        {rowIdx + 1}
      </td>

      {/* PRODUCT — inputRef passed to focused row for portal anchor */}
      <td className="border-r border-slate-100 min-w-[220px]">
        <input
          ref={isFocused ? inputRef : null}
          type="text"
          value={row._query}
          data-row-id={row.id} data-field="product"
          placeholder={row.productId ? '' : 'Search product\u2026'}
          autoComplete="off"
          onFocus={()    => { onCellFocus(row.id, 'product'); onQueryChange(row.id, row._query, true); }}
          onChange={(e)  => onQueryChange(row.id, e.target.value, false)}
          onKeyDown={(e) => onKeyDownProduct(e, row.id)}
          className="w-full h-7 px-2 text-xs font-medium bg-transparent focus:outline-none
                     focus:bg-amber-50 focus:ring-1 focus:ring-amber-400 rounded transition-colors
                     text-slate-800 placeholder:text-slate-300"
        />
      </td>

      {/* COMPANY */}
      <td className="border-r border-slate-100 min-w-[130px]">
        <div className="px-2 py-1 text-xs text-slate-600 truncate">{row.companyName || <span className="text-slate-300">—</span>}</div>
      </td>

      {/* TYPE */}
      <td className="border-r border-slate-100 min-w-[90px]">
        <div className="px-2 py-1 text-xs text-slate-500 truncate">{row.type || <span className="text-slate-300">—</span>}</div>
      </td>

      {/* UNIT */}
      <td className="border-r border-slate-100 min-w-[65px]">
        <div className="px-2 py-1 text-xs text-center text-slate-600 font-medium">{row.unit || <span className="text-slate-300">—</span>}</div>
      </td>

      {/* EXPIRY */}
      <td className="border-r border-slate-100 min-w-[150px]">
        {!row.productId ? (
          <div className="px-2 py-1 text-slate-300 text-xs text-center">—</div>
        ) : !row._requiresExpiry ? (
          <div className="px-2 py-1 text-[10px] font-semibold text-slate-400 text-center bg-slate-50 rounded mx-1">Not Required</div>
        ) : row._batches.length > 1 ? (
          <select
            value={row.expiry}
            data-row-id={row.id} data-field="expiry"
            onFocus={() => onCellFocus(row.id, 'expiry')}
            onChange={(e) => onCellChange(row.id, 'expiry', e.target.value)}
            onKeyDown={(e) => onCellKeyDown(e, row.id, 'expiry')}
            className="w-full h-7 px-1.5 text-xs bg-transparent focus:outline-none focus:bg-amber-50 focus:ring-1 focus:ring-amber-400 rounded border-0 cursor-pointer"
          >
            <option value="">Choose expiry…</option>
            {row._batches.map((b, i) => (
              <option key={i} value={b.expiry}>{b.expiryLabel} (Avail: {b.qty})</option>
            ))}
          </select>
        ) : (
          <input
            type="date"
            value={row.expiry}
            data-row-id={row.id} data-field="expiry"
            onFocus={() => onCellFocus(row.id, 'expiry')}
            onChange={(e) => onCellChange(row.id, 'expiry', e.target.value)}
            onKeyDown={(e) => onCellKeyDown(e, row.id, 'expiry')}
            className={cellCls('expiry')}
          />
        )}
      </td>

      {/* CURRENT QTY (read-only display) */}
      <td className="border-r border-slate-100 min-w-[80px]">
        <div className="px-2 py-1 text-xs text-right font-semibold text-slate-600">
          {row.productId ? (avail || 0) : <span className="text-slate-300">—</span>}
        </div>
      </td>

      {/* QTY IN */}
      <td className="border-r border-slate-100 min-w-[90px]">
        <input
          type="number" min="0" placeholder="0"
          value={row.qtyIn}
          disabled={!row.productId}
          data-row-id={row.id} data-field="qtyIn"
          onFocus={(e) => { onCellFocus(row.id, 'qtyIn'); e.target.select(); }}
          onChange={(e) => onCellChange(row.id, 'qtyIn', e.target.value)}
          onKeyDown={(e) => onCellKeyDown(e, row.id, 'qtyIn')}
          className={`${cellCls('qtyIn')} text-right font-bold text-green-700 disabled:text-slate-300`}
        />
      </td>

      {/* QTY OUT */}
      <td className="border-r border-slate-100 min-w-[90px]">
        <input
          type="number" min="0" placeholder="0"
          value={row.qtyOut}
          disabled={!row.productId}
          data-row-id={row.id} data-field="qtyOut"
          onFocus={(e) => { onCellFocus(row.id, 'qtyOut'); e.target.select(); }}
          onChange={(e) => onCellChange(row.id, 'qtyOut', e.target.value)}
          onKeyDown={(e) => onCellKeyDown(e, row.id, 'qtyOut')}
          className={`${cellCls('qtyOut')} text-right font-bold text-red-600 disabled:text-slate-300`}
        />
      </td>

      {/* FINAL QTY (computed) */}
      <td className="border-r border-slate-100 min-w-[80px]">
        <div className={`px-2 py-1 text-xs text-right font-bold ${
          !hasAdjust ? 'text-slate-400' : finalQty < 0 ? 'text-red-600' : 'text-slate-700'
        }`}>
          {row.productId ? (hasAdjust ? (
            <span className={`px-1.5 rounded ${finalQty < 0 ? 'bg-red-50' : 'bg-slate-100'}`}>{finalQty}</span>
          ) : avail) : '—'}
        </div>
      </td>

      {/* UNIT PRICE */}
      <td className="border-r border-slate-100 min-w-[90px]">
        <input
          type="number" min="0" step="0.01"
          placeholder={row.price ? Number(row.price).toFixed(2) : '0.00'}
          value={row.price}
          disabled={!row.productId}
          data-row-id={row.id} data-field="price"
          onFocus={(e) => { onCellFocus(row.id, 'price'); e.target.select(); }}
          onChange={(e) => onCellChange(row.id, 'price', e.target.value)}
          onKeyDown={(e) => onCellKeyDown(e, row.id, 'price')}
          className={`${cellCls('price')} text-right text-slate-700 disabled:text-slate-300`}
        />
      </td>

      {/* REMARKS */}
      <td className="border-r border-slate-100 min-w-[120px]">
        <input
          type="text"
          placeholder="Optional…"
          value={row.remarks}
          disabled={!row.productId}
          data-row-id={row.id} data-field="remarks"
          onFocus={() => onCellFocus(row.id, 'remarks')}
          onChange={(e) => onCellChange(row.id, 'remarks', e.target.value)}
          onKeyDown={(e) => onCellKeyDown(e, row.id, 'remarks')}
          className={`${cellCls('remarks')} text-slate-600 disabled:text-slate-300`}
        />
      </td>

      {/* DELETE */}
      <td className="text-center min-w-[40px]">
        <button
          type="button"
          onClick={() => onRemove(row.id)}
          className="p-1 text-slate-300 hover:text-red-500 hover:bg-red-50 rounded transition-colors"
          title="Delete row"
        >
          <X className="w-3.5 h-3.5" />
        </button>
      </td>
    </tr>
  );
}, (prev, next) => {
  if (prev.rowIdx    !== next.rowIdx)    return false;
  if (prev.row       !== next.row)       return false;
  if (prev.isFocused !== next.isFocused) return false;
  if (next.isFocused && prev.activeCell !== next.activeCell) return false;
  return true;
});

/* ─────────────────────────────────────────────────────────────────────────────
   IMPORT PROGRESS MODAL
───────────────────────────────────────────────────────────────────────────── */
const ImportProgressModal = ({ progress, onClose }) => {
  const { phase, total, done, imported, updated, skipped, failed, errors, finished } = progress;
  const pct = total > 0 ? Math.round((done / total) * 100) : 0;
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-lg mx-4 overflow-hidden">
        <div className="bg-gradient-to-r from-amber-600 to-amber-700 px-6 py-4 flex items-center gap-3">
          <FileSpreadsheet className="w-6 h-6 text-white" />
          <h2 className="text-white font-bold text-lg">Excel Import Progress</h2>
        </div>
        <div className="p-6 space-y-4">
          <div className="text-sm font-semibold text-slate-600 flex items-center gap-2">
            <RefreshCw className={`w-4 h-4 ${finished ? 'text-green-500' : 'text-amber-500 animate-spin'}`} />
            {phase}
          </div>
          <div className="w-full bg-slate-100 rounded-full h-4 overflow-hidden">
            <div
              className="h-4 rounded-full bg-gradient-to-r from-amber-500 to-amber-600 transition-all duration-300"
              style={{ width: `${pct}%` }}
            />
          </div>
          <div className="text-center text-sm font-bold text-slate-700">{pct}% — {done} / {total} rows</div>
          <div className="grid grid-cols-4 gap-3">
            {[
              { label: 'Imported', val: imported, color: 'text-green-700 bg-green-50' },
              { label: 'Updated',  val: updated,  color: 'text-blue-700 bg-blue-50' },
              { label: 'Skipped',  val: skipped,  color: 'text-amber-700 bg-amber-50' },
              { label: 'Failed',   val: failed,   color: 'text-red-700 bg-red-50' },
            ].map(({ label, val, color }) => (
              <div key={label} className={`rounded-xl p-3 text-center ${color}`}>
                <div className="text-xl font-black">{val}</div>
                <div className="text-[10px] font-bold uppercase tracking-wider">{label}</div>
              </div>
            ))}
          </div>
          {errors.length > 0 && (
            <div className="bg-red-50 rounded-lg p-3 max-h-32 overflow-y-auto">
              <p className="text-xs font-bold text-red-700 mb-1">Validation Errors:</p>
              {errors.slice(0, 20).map((e, i) => (
                <p key={i} className="text-[11px] text-red-600">• Row {e.row}: {e.msg}</p>
              ))}
              {errors.length > 20 && <p className="text-[11px] text-red-500 font-semibold">…and {errors.length - 20} more errors</p>}
            </div>
          )}
          {finished && (
            <div className="flex gap-3">
              {errors.length > 0 && (
                <button
                  type="button"
                  onClick={() => {
                    const ws = XLSX.utils.json_to_sheet(errors.map(e => ({ Row: e.row, Error: e.msg, Data: JSON.stringify(e.data || {}) })));
                    const wb = XLSX.utils.book_new();
                    XLSX.utils.book_append_sheet(wb, ws, 'Errors');
                    XLSX.writeFile(wb, 'import_errors.xlsx');
                  }}
                  className="flex-1 py-2 text-sm font-semibold text-red-700 bg-red-50 hover:bg-red-100 rounded-xl border border-red-200 flex items-center justify-center gap-2 transition-colors"
                >
                  <Download className="w-4 h-4" /> Download Error Report
                </button>
              )}
              <button
                type="button"
                onClick={onClose}
                className="flex-1 py-2 text-sm font-semibold text-white bg-amber-600 hover:bg-amber-700 rounded-xl transition-colors"
              >
                Close
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

/* ─────────────────────────────────────────────────────────────────────────────
   MAIN COMPONENT
───────────────────────────────────────────────────────────────────────────── */



const StockAdjustment = () => {
  // ── DATA ──────────────────────────────────────────────────────────────────
  const [products, setProducts]   = useState([]);
  const [stocks,   setStocks]     = useState([]);
  const [docNo,    setDocNo]      = useState(1);
  const [docDate,  setDocDate]    = useState(moment().format('YYYY-MM-DD'));
  const [docNote,  setDocNote]    = useState('');

  // ── GRID ──────────────────────────────────────────────────────────────────
  const [gridRows, setGridRows] = useState([emptyRow()]);
  const [focusedRowId, setFocusedRowId] = useState(null);
  const [activeCell,    setActiveCell]    = useState(null);
  const [activeSug,     setActiveSug]     = useState(0);
  // debounced search query — keeps typing instantaneous, fuzzy search at 250ms
  const [searchQuery,   setSearchQuery]   = useState('');
  const debounceRef = useRef(null);

  // ── UI STATE ──────────────────────────────────────────────────────────────
  const [loading, setLoading] = useState(false);
  const [alert,   setAlert]   = useState({ show: false, message: '', type: '' });
  const [importProgress, setImportProgress] = useState(null);

  const accessToken     = getToken();
  const productInputRef = useRef(null); // anchor for Portal dropdown
  const fileInputRef    = useRef(null);

  /* ── FETCH ─────────────────────────────────────────────────────────────── */
  const fetchAll = useCallback(() => {
    axios.get(`${API}/api/product/getAllProducts`, { headers: { token: accessToken } })
      .then(r => setProducts(r.data.result || []))
      .catch(console.error);
    axios.get(`${API}/api/stock/getAllStocks`, { headers: { token: accessToken } })
      .then(r => setStocks(r.data.result || []))
      .catch(console.error);
    axios.get(`${API}/api/stockAdjustment/getStockAdjustmentDocNo`, { headers: { token: accessToken } })
      .then(r => {
        const arr = r.data.result;
        setDocNo((Array.isArray(arr) && arr.length > 0) ? (arr[0].docNo || 1) : 1);
      })
      .catch(console.error);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [accessToken]);

  useEffect(() => { fetchAll(); }, [fetchAll]);

  /* ── STOCK LOOKUP MAP ──────────────────────────────────────────────────── */
  // productId → stock record (cached for O(1) lookup even with 50k products)
  const stockMap = useMemo(() => {
    const m = new Map();
    stocks.forEach(s => {
      const id = String(s.product?._id || s.product || '');
      if (id) m.set(id, s);
    });
    return m;
  }, [stocks]);

  /* ── SUGGESTIONS (debounced, fuzzy: name · company · barcode · SKU) ──── */
  const rowSuggestions = useMemo(() => {
    if (focusedRowId === null) return [];
    return fuzzySearch(products, stockMap, searchQuery);
  }, [products, stockMap, searchQuery, focusedRowId]);

  /* ── outside-click: close dropdown ──────────────────────────────────── */
  useEffect(() => {
    const handler = (e) => {
      if (!e.target.closest('[data-field="product"]') && !e.target.closest('[data-suggestion-idx]')) {
        setGridRows(prev => {
          if (prev.some(r => r._showDrop))
            return prev.map(r => r._showDrop ? { ...r, _showDrop: false } : r);
          return prev;
        });
      }
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  /* ── ALERT ─────────────────────────────────────────────────────────────── */
  const showAlert = (msg, type) => {
    setAlert({ show: true, message: msg, type });
    setTimeout(() => setAlert({ show: false, message: '', type: '' }), 4500);
  };

  /* ── FOCUS CELL DOM ────────────────────────────────────────────────────── */
  const focusDom = useCallback((rowId, field, delay = 40) => {
    setTimeout(() => {
      const el = document.querySelector(`[data-row-id="${rowId}"][data-field="${field}"]`);
      if (el) { el.focus(); if (el.select) el.select(); }
    }, delay);
  }, []);

  /* ── PRODUCT SELECTION ─────────────────────────────────────────────────── */
  const applyProduct = useCallback((rowId, product) => {
    const pid   = String(product._id);
    const stock = stockMap.get(pid);
    const reqEx = product.requiresExpiry !== false;
    const batches = (stock?.expiryArray || [])
      .filter(b => (b.quantity || 0) > 0)
      .map(b => ({
        expiry:      b.expiry ? moment(b.expiry).format('YYYY-MM-DD') : '',
        expiryLabel: b.expiry ? moment(b.expiry).format('DD/MM/YYYY') : 'No expiry',
        qty:         b.quantity || 0,
        batchNumber: b.batchNumber || '',
        price:       b.purchasingPrice || b.sellingPrice || 0,
      }));

    let expiry = '', currentQty = 0, price = '';
    if (!reqEx) {
      currentQty = stock?.totalQuantity || 0;
      price      = '';
    } else if (batches.length === 1) {
      expiry     = batches[0].expiry;
      currentQty = batches[0].qty;
      price      = batches[0].price || '';
    }

    setGridRows(prev => {
      const idx = prev.findIndex(r => r.id === rowId);
      if (idx === -1) return prev;
      const next = [...prev];
      next[idx] = {
        ...next[idx],
        productId:   pid,
        productName: product.name || product.productName || '',
        companyName: product.companyName || '',
        type:        product.type || product.category || '',
        unit:        product.unit || '',
        expiry,
        currentQty,
        price,
        _query:          product.name || product.productName || '',
        _showDrop:       false,
        _batches:        batches,
        _requiresExpiry: reqEx,
      };
      // always ensure there is one empty row after the last filled one
      const isLast = idx === prev.length - 1;
      if (isLast) next.push(emptyRow());
      return next;
    });
    setActiveSug(0);
    setSearchQuery('');  // reset debounced search so portal closes

    // focus next cell
    const nextField = reqEx && batches.length !== 1 ? 'expiry' : 'qtyIn';
    setActiveCell(nextField);
    focusDom(rowId, nextField);
  }, [stockMap, focusDom]);

  /* ── EXPIRY CHANGE ─────────────────────────────────────────────────────── */
  const applyExpiry = useCallback((rowId, expiryVal) => {
    setGridRows(prev => {
      const idx = prev.findIndex(r => r.id === rowId);
      if (idx === -1) return prev;
      const next  = [...prev];
      const row   = { ...next[idx] };
      const batch = row._batches.find(b => b.expiry === expiryVal);
      row.expiry     = expiryVal;
      row.currentQty = batch?.qty   ?? 0;
      row.price      = batch?.price ?? row.price;
      next[idx] = row;
      return next;
    });
    setActiveCell('qtyIn');
    focusDom(rowId, 'qtyIn');
  }, [focusDom]);

  /* ── GRID HANDLERS ─────────────────────────────────────────────────────── */
  const handleQueryChange = useCallback((rowId, val, isFocus) => {
    setFocusedRowId(rowId);
    setActiveSug(0);
    setGridRows(prev => {
      const idx = prev.findIndex(r => r.id === rowId);
      if (idx === -1) return prev;
      const next = [...prev];
      const row  = { ...next[idx] };
      row._query    = val;
      row._showDrop = true;
      if (!val && !isFocus) {
        // clear product selection when user blanks the field
        row.productId = '';  row.productName = '';
        row.companyName = ''; row.type = ''; row.unit = '';
        row.expiry = ''; row.currentQty = ''; row.price = '';
        row._batches = []; row._requiresExpiry = false;
      }
      next[idx] = row;
      return next;
    });
    // debounce fuzzy search update by 250ms to keep typing lag-free
    clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => setSearchQuery(val), 250);
  }, []);

  const handleKeyDownProduct = useCallback((e, rowId) => {
    const row = gridRows.find(r => r.id === rowId);
    if (!row) return;
    switch (e.key) {
      case 'ArrowDown':
        e.preventDefault();
        if (!row._showDrop) {
          setGridRows(prev => prev.map(r => r.id === rowId ? { ...r, _showDrop: true } : r));
        } else {
          setActiveSug(p => Math.min(p + 1, rowSuggestions.length - 1));
        }
        break;
      case 'ArrowUp':
        e.preventDefault();
        setActiveSug(p => Math.max(p - 1, 0));
        break;
      case 'Enter':
        e.preventDefault();
        if (row._showDrop && rowSuggestions[activeSug]) applyProduct(rowId, rowSuggestions[activeSug]);
        break;
      case 'Tab':
        if (row._showDrop && rowSuggestions[activeSug]) { e.preventDefault(); applyProduct(rowId, rowSuggestions[activeSug]); }
        break;
      case 'Escape':
        e.preventDefault();
        setGridRows(prev => prev.map(r => r.id === rowId ? { ...r, _showDrop: false } : r));
        break;
      default: break;
    }
  }, [gridRows, activeSug, rowSuggestions, applyProduct]);

  const handleCellChange = useCallback((rowId, field, val) => {
    if (field === 'expiry') {
      applyExpiry(rowId, val);
      return;
    }
    setGridRows(prev => {
      const idx = prev.findIndex(r => r.id === rowId);
      if (idx === -1) return prev;
      const next = [...prev];
      next[idx] = { ...next[idx], [field]: val };
      // auto-create new row if editing last row's qty
      if ((field === 'qtyIn' || field === 'qtyOut') && idx === prev.length - 1 && val !== '' && next[idx].productId) {
        next.push(emptyRow());
      }
      return next;
    });
  }, [applyExpiry]);

  const handleCellKeyDown = useCallback((e, rowId, field) => {
    const rows = gridRows;
    const ri = rows.findIndex(r => r.id === rowId);
    if (ri === -1) return;

    if (e.key === 'Enter' || (e.key === 'Tab' && !e.shiftKey)) {
      e.preventDefault();
      const curIdx = FIELD_ORDER.indexOf(field);
      const nextField = FIELD_ORDER[curIdx + 1];
      if (nextField) {
        setActiveCell(nextField);
        focusDom(rowId, nextField);
      } else {
        // last field → jump to next row product
        const nextRi = ri + 1;
        let nextRow = rows[nextRi];
        if (nextRi >= rows.length) {
          const newRow = emptyRow();
          nextRow = newRow;
          setGridRows(prev => [...prev, newRow]);
        }
        setFocusedRowId(nextRow.id);
        setActiveCell('product');
        focusDom(nextRow.id, 'product');
      }
    } else if (e.key === 'Tab' && e.shiftKey) {
      e.preventDefault();
      const curIdx = FIELD_ORDER.indexOf(field);
      if (curIdx > 0) {
        const prevField = FIELD_ORDER[curIdx - 1];
        setActiveCell(prevField);
        focusDom(rowId, prevField);
      }
    } else if (e.key === 'ArrowDown') {
      e.preventDefault();
      const nextRi = ri + 1;
      if (nextRi < rows.length) {
        const nextRow = rows[nextRi];
        setFocusedRowId(nextRow.id);
        focusDom(nextRow.id, field);
      }
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      const prevRi = ri - 1;
      if (prevRi >= 0) {
        const prevRow = rows[prevRi];
        setFocusedRowId(prevRow.id);
        focusDom(prevRow.id, field);
      }
    } else if (e.key === 'Escape') {
      e.preventDefault();
      setFocusedRowId(rowId);
      setActiveCell('product');
      focusDom(rowId, 'product');
    }
  }, [gridRows, focusDom]);

  const handleCellFocus = useCallback((rowId, field) => {
    setFocusedRowId(rowId);
    setActiveCell(field);
    if (field !== 'product') {
      setGridRows(prev => {
        const idx = prev.findIndex(r => r.id === rowId);
        if (idx !== -1 && prev[idx]._showDrop) {
          const n = [...prev]; n[idx] = { ...n[idx], _showDrop: false }; return n;
        }
        return prev;
      });
    }
  }, []);

  const handleRemoveRow = useCallback((id) => {
    setGridRows(prev => {
      const filtered = prev.filter(r => r.id !== id);
      return filtered.length === 0 ? [emptyRow()] : filtered;
    });
  }, []);

  /* ── STATS ─────────────────────────────────────────────────────────────── */
  const { filledCount, activeCount } = useMemo(() => {
    let filled = 0, active = 0;
    gridRows.forEach(r => {
      if (!r.productId) return;
      filled++;
      const inQty = parseFloat(r.qtyIn) || 0;
      const outQty = parseFloat(r.qtyOut) || 0;
      if (inQty > 0 || outQty > 0) active++;
    });
    return { filledCount: filled, activeCount: active };
  }, [gridRows]);

  /* ── BULK SAVE ─────────────────────────────────────────────────────────── */
  const [validationErrors, setValidationErrors] = useState([]);

  const saveDocument = () => {
    const lines = [];
    const errors = [];

    // Filter rows that are actively submitted (ignore trailing completely empty row if untouched)
    const rowsToValidate = gridRows.filter((r, idx) => {
      const isLastEmpty = idx === gridRows.length - 1 && !r.productId && !r._query && !r.expiry && !r.qtyIn && !r.qtyOut;
      return !isLastEmpty;
    });

    if (rowsToValidate.length === 0) {
      showAlert('Please add at least one product row to perform stock adjustment.', 'error');
      return;
    }

    rowsToValidate.forEach((row, idx) => {
      const excelRow = idx + 1;
      let rowHasError = false;

      // 1. Product Name check
      if (!row.productId || !row.productName) {
        errors.push(`Row ${excelRow}: Product Name is required.`);
        rowHasError = true;
      }

      // 2. Expiry Date check
      if (row._requiresExpiry && !row.expiry) {
        errors.push(`Row ${excelRow}: Expiry Date is required.`);
        rowHasError = true;
      }

      // 3. Quantity In or Quantity Out check
      const inQty  = Math.max(0, parseFloat(row.qtyIn)  || 0);
      const outQty = Math.max(0, parseFloat(row.qtyOut) || 0);

      if (inQty === 0 && outQty === 0) {
        errors.push(`Row ${excelRow}: Either Quantity In or Quantity Out is required.`);
        rowHasError = true;
      } else if (inQty > 0 && outQty > 0) {
        errors.push(`Row ${excelRow}: Cannot have both Quantity In and Quantity Out.`);
        rowHasError = true;
      } else if (outQty > 0 && outQty > Number(row.currentQty || 0)) {
        errors.push(`Row ${excelRow}: Quantity Out exceeds available stock (${row.currentQty || 0}).`);
        rowHasError = true;
      }

      const price = row.price !== '' && row.price != null ? parseFloat(row.price) : 0;
      if (price < 0) {
        errors.push(`Row ${excelRow}: Unit Price cannot be negative.`);
        rowHasError = true;
      }

      if (!rowHasError) {
        lines.push({
          productId:     row.productId,
          productName:   row.productName,
          companyName:   row.companyName || '',
          unit:          row.unit || '',
          expiry:        row._requiresExpiry ? row.expiry : null,
          batchNumber:   '',
          quantityDelta: inQty > 0 ? inQty : -outQty,
          price,
          reason:        docNote || 'Stock Adjustment',
        });
      }
    });

    if (errors.length > 0) {
      setValidationErrors(errors);
      showAlert(`Validation failed: ${errors.length} issue(s) found. Please fix all errors before saving.`, 'error');
      return;
    }

    setValidationErrors([]);
    setLoading(true);
    axios.post(
      `${API}/api/stockAdjustment/createAdjustmentDocument`,
      { date: docDate, note: docNote, items: lines },
      { headers: { token: accessToken } }
    )
      .then(res => {
        const no = res.data?.assignedDocNo || res.data?.result?.docNo;
        setLoading(false);
        fetchAll();
        setGridRows([emptyRow()]);
        setDocNote('');
        setDocDate(moment().format('YYYY-MM-DD'));
        showAlert(no ? `Document #${no} saved successfully` : 'Document saved', 'success');
      })
      .catch(err => {
        setLoading(false);
        showAlert(err.response?.data?.result || err.response?.data?.error || err.message || 'Save failed', 'error');
      });
  };

  /* ── DOWNLOAD SAMPLE EXCEL ─────────────────────────────────────────────── */
  const downloadSample = () => {
    // ── Column headers ──────────────────────────────────────────────────────
    const headers = [
      'Product Name',
      'Company Name',
      'Type',
      'Unit',
      'Expiry Date (DD-MM-YYYY)',
      'Current Quantity (Reference)',
      'Quantity In',
      'Quantity Out',
      'Unit Price',
      'Remarks',
    ];

    // ── Sample rows ─────────────────────────────────────────────────────────
    // Dates must be in DD-MM-YYYY format (e.g. 31-12-2026).
    // Provide EITHER Quantity In OR Quantity Out — not both.
    // Current Quantity is for reference only; leave it as-is from your stock list.
    const sample = [
      // Product Name       Company Name   Type       Unit     Expiry         CurrQty  QtyIn  QtyOut  Price  Remarks
      ['Paracetamol 500mg', 'PharmaCo',   'Tablet',  'Box',   '31-12-2026',  100,     20,    0,      2.50,  'Monthly audit correction'],
      ['Amoxicillin 250mg', 'MediCorp',   'Capsule', 'Strip', '30-06-2025',   50,      0,    5,      4.75,  'Expired batch removal'],
      ['Ibuprofen 400mg',   'HealthPlus', 'Tablet',  'Pack',  '15-03-2027',  200,     50,    0,      3.00,  'Stock replenishment'],
      ['Vitamin C 1000mg',  'NutriLab',  'Tablet',  'Bottle','',              0,     100,    0,      1.50,  'New arrival — no expiry'],
      ['Cough Syrup 100ml', 'PharmaCo',  'Syrup',   'Bottle','20-09-2026',   30,     10,    0,      6.00,  'Quarterly stock check'],
    ];

    // ── Build workbook ───────────────────────────────────────────────────────
    const wb = XLSX.utils.book_new();

    // Sheet 1 — Data sheet
    const ws = XLSX.utils.aoa_to_sheet([headers, ...sample]);

    // Column widths
    const colWidths = [30, 20, 12, 10, 26, 24, 12, 12, 12, 30];
    ws['!cols'] = colWidths.map(wch => ({ wch }));

    XLSX.utils.book_append_sheet(wb, ws, 'Stock Adjustment');

    // Sheet 2 — Instructions
    const instructions = [
      ['STOCK ADJUSTMENT IMPORT — INSTRUCTIONS'],
      [''],
      ['Column',                    'Description',                                              'Required?'],
      ['Product Name',              'Exact product name as registered in the system',            'YES'],
      ['Company Name',              'Exact company/manufacturer name as in the system',          'YES'],
      ['Type',                      'Product type (Tablet, Capsule, Syrup, Injection, etc.)',    'Optional'],
      ['Unit',                      'Unit of measurement (Box, Strip, Bottle, etc.)',            'Optional'],
      ['Expiry Date (DD-MM-YYYY)',  'Expiry date in DD-MM-YYYY format (e.g. 31-12-2026). Leave blank if no expiry.', 'Optional'],
      ['Current Quantity (Reference)', 'Your current stock count — for reference only, not imported.', 'DO NOT EDIT'],
      ['Quantity In',               'Quantity to ADD to stock. Enter 0 or leave blank if not adding.', 'Either Qty In OR Qty Out'],
      ['Quantity Out',              'Quantity to REMOVE from stock. Enter 0 or leave blank if not removing.', 'Either Qty In OR Qty Out'],
      ['Unit Price',                'Unit cost/selling price. Leave blank if not changing.',     'Optional'],
      ['Remarks',                   'Reason for adjustment (audit, damage, correction, etc.)',   'Optional'],
      [''],
      ['IMPORTANT RULES:'],
      ['1. You must provide EITHER Quantity In OR Quantity Out per row — not both.'],
      ['2. Product Name and Company Name must exactly match your system records.'],
      ['3. Expiry Date must be in DD-MM-YYYY format (e.g. 19-04-2025, 31-12-2026).'],
      ['4. Do NOT edit the Current Quantity column — it is for reference only.'],
      ['5. Leave Expiry Date blank for products that do not expire.'],
      ['6. Each row = one product + one expiry batch adjustment.'],
    ];

    const wsInstr = XLSX.utils.aoa_to_sheet(instructions);
    wsInstr['!cols'] = [{ wch: 32 }, { wch: 70 }, { wch: 26 }];
    XLSX.utils.book_append_sheet(wb, wsInstr, 'Instructions');

    XLSX.writeFile(wb, 'stock_adjustment_sample.xlsx');
  };


  /* ── EXCEL IMPORT ──────────────────────────────────────────────────────── */
  const handleImportFile = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    e.target.value = '';

    // read file
    const buf  = await file.arrayBuffer();
    // cellDates:true makes XLSX return native JS Date objects for date cells,
    // avoiding raw serial-number ambiguity
    const wb   = XLSX.read(buf, { type: 'array', cellDates: true });
    const ws   = wb.Sheets[wb.SheetNames[0]];
    const raw  = XLSX.utils.sheet_to_json(ws, { header: 1, defval: '' });

    if (raw.length < 2) { showAlert('Excel file is empty or has no data rows', 'error'); return; }

    const headerRow = raw[0].map(h => String(h).trim().toLowerCase());
    const requiredCols = ['product name', 'company name'];
    const missingCols  = requiredCols.filter(c => !headerRow.some(h => h.includes(c.split(' ')[1])));
    if (missingCols.length > 0) {
      showAlert(`Missing required columns: ${missingCols.join(', ')}`, 'error');
      return;
    }

    const colIdx = {
      name:        headerRow.findIndex(h => h.includes('product')),
      company:     headerRow.findIndex(h => h.includes('company')),
      type:        headerRow.findIndex(h => h.includes('type')),
      unit:        headerRow.findIndex(h => h.includes('unit')),
      expiry:      headerRow.findIndex(h => h.includes('expiry')),
      currentQty:  headerRow.findIndex(h => h.includes('current')),
      qtyIn:       headerRow.findIndex(h => h.includes('quantity in') || h.includes('qty in')),
      qtyOut:      headerRow.findIndex(h => h.includes('quantity out') || h.includes('qty out')),
      price:       headerRow.findIndex(h => h.includes('price')),
      remarks:     headerRow.findIndex(h => h.includes('remark')),
    };

    const dataRows = raw.slice(1).filter(r => r.some(c => c !== ''));
    const totalRows = dataRows.length;

    if (totalRows === 0) { showAlert('No data rows found in Excel file', 'error'); return; }

    // initialise progress
    const prog = {
      phase: 'Validating rows…',
      total: totalRows, done: 0,
      imported: 0, updated: 0, skipped: 0, failed: 0,
      errors: [], finished: false,
    };
    setImportProgress({ ...prog });

    // ── Product search index (O(1), multi-tier keying) ──────────────────────
    // Products can share the same name+company but differ by unit or type
    // (e.g. "Aintree E1000 | Day Son | 1kg" vs "Aintree E1000 | Day Son | 3.5kg").
    // We build keys at four specificity levels so we always resolve the most
    // precise match, with graceful fallback when Excel omits type/unit columns.
    //
    //  key4 = name::company::type::unit  ← most specific (set always)
    //  key3 = name::company::unit        ← set only once (first product wins)
    //  key2 = name::company              ← set only once (first product wins)
    //  key1 = name                       ← set only once (first product wins)
    const nameIndex = new Map();
    products.forEach(p => {
      const n = (p.name || p.productName || '').toLowerCase().trim();
      const c = (p.companyName || '').toLowerCase().trim();
      const t = (p.type     || '').toLowerCase().trim();
      const u = (p.unit     || '').toLowerCase().trim();

      // Most specific key always overwrites (last product in sort wins for key4,
      // but for key3/key2/key1 only the FIRST product in the array is stored so
      // there is a stable, deterministic winner for ambiguous lookups).
      nameIndex.set(`${n}::${c}::${t}::${u}`, p);          // key4
      if (!nameIndex.has(`${n}::${c}::${u}`)) nameIndex.set(`${n}::${c}::${u}`, p);  // key3
      if (!nameIndex.has(`${n}::${c}`))       nameIndex.set(`${n}::${c}`, p);         // key2
      if (!nameIndex.has(n))                  nameIndex.set(n, p);                    // key1
    });

    // process in chunks
    const newGridRows = [];
    let imported = 0, updated = 0, skipped = 0, failed = 0;
    const errors = [];

    const processChunk = async (startIdx) => {
      const endIdx = Math.min(startIdx + IMPORT_CHUNK, totalRows);

      for (let i = startIdx; i < endIdx; i++) {
        const r   = dataRows[i];
        const rNo = i + 2; // Excel row number (1-based header + 1)

        const nameVal    = String(r[colIdx.name]    ?? '').trim();
        const compVal    = String(r[colIdx.company]  ?? '').trim();
        const typeVal    = String(r[colIdx.type]     ?? '').trim();
        const unitVal    = String(r[colIdx.unit]     ?? '').trim();
        // Keep the raw cell value WITHOUT String-coercing so we can detect
        // JS Date objects returned by XLSX when cellDates:true is set.
        const expiryRaw  = colIdx.expiry >= 0 ? (r[colIdx.expiry] ?? '') : '';
        const qtyInRaw   = colIdx.qtyIn  >= 0 ? r[colIdx.qtyIn]  : '';
        const qtyOutRaw  = colIdx.qtyOut >= 0 ? r[colIdx.qtyOut] : '';
        const priceRaw   = colIdx.price  >= 0 ? r[colIdx.price]  : '';
        const remarksVal = colIdx.remarks >= 0 ? String(r[colIdx.remarks] ?? '').trim() : '';

        // Validate required
        if (!nameVal) { errors.push({ row: rNo, msg: 'Product Name is required', data: r }); failed++; continue; }
        if (!compVal) { errors.push({ row: rNo, msg: 'Company Name is required', data: r }); failed++; continue; }

        // ── Expiry Date Parsing ─────────────────────────────────────────────
        // Supports: JS Date objects (from cellDates:true), Excel serial numbers,
        // and all common string formats including DD-MM-YYYY (user's format).
        let expiryVal = '';
        if (expiryRaw !== '' && expiryRaw != null) {
          if (expiryRaw instanceof Date) {
            // XLSX returned a native JS Date (cellDates:true)
            if (!isNaN(expiryRaw.getTime())) {
              expiryVal = moment(expiryRaw).format('YYYY-MM-DD');
            } else {
              errors.push({ row: rNo, msg: `Invalid Expiry Date: ${expiryRaw}`, data: r }); failed++; continue;
            }
          } else {
            const rawStr = String(expiryRaw).trim();
            if (!rawStr) {
              // empty string — skip, expiry stays ''
            } else if (!isNaN(Number(rawStr)) && rawStr !== '') {
              // Excel serial number (e.g. 45765)
              const d = XLSX.SSF.parse_date_code(Number(rawStr));
              if (d) {
                expiryVal = `${d.y}-${String(d.m).padStart(2,'0')}-${String(d.d).padStart(2,'0')}`;
              } else {
                errors.push({ row: rNo, msg: `Invalid Expiry Date serial: ${rawStr}`, data: r }); failed++; continue;
              }
            } else {
              // String date — support all common formats including DD-MM-YYYY (user's format)
              const ACCEPTED_FORMATS = [
                'YYYY-MM-DD',   // ISO standard
                'DD-MM-YYYY',   // User's format: 19-04-2025
                'DD/MM/YYYY',   // Common: 19/04/2025
                'MM/DD/YYYY',   // US: 04/19/2025
                'MM-DD-YYYY',   // US with dashes
                'YYYY/MM/DD',   // Asian ISO variant
                'D-M-YYYY',     // Single-digit day/month with dashes
                'D/M/YYYY',     // Single-digit day/month with slashes
                'M/D/YYYY',     // US single-digit
                'DD MMM YYYY',  // 19 Apr 2025
                'D MMM YYYY',   // 9 Apr 2025
                'YYYY-MM-DDTHH:mm:ss.SSSZ', // ISO with time
              ];
              const parsed = moment(rawStr, ACCEPTED_FORMATS, true);
              if (!parsed.isValid()) {
                errors.push({ row: rNo, msg: `Invalid Expiry Date format "${rawStr}" — accepted: DD-MM-YYYY, YYYY-MM-DD, DD/MM/YYYY`, data: r });
                failed++; continue;
              }
              expiryVal = parsed.format('YYYY-MM-DD');
            }
          }
        }

        // Validate quantities
        const qtyIn  = parseFloat(qtyInRaw)  || 0;
        const qtyOut = parseFloat(qtyOutRaw) || 0;
        if (qtyIn < 0)  { errors.push({ row: rNo, msg: 'Quantity In cannot be negative', data: r }); failed++; continue; }
        if (qtyOut < 0) { errors.push({ row: rNo, msg: 'Quantity Out cannot be negative', data: r }); failed++; continue; }
        if (qtyIn > 0 && qtyOut > 0) { errors.push({ row: rNo, msg: 'Cannot have both Qty In and Qty Out', data: r }); failed++; continue; }

        const price = parseFloat(priceRaw) || 0;
        if (price < 0) { errors.push({ row: rNo, msg: 'Price cannot be negative', data: r }); failed++; continue; }

        // ── Product matching (most-specific key first, then fallback) ───────
        // Build normalised lookup tokens from the Excel row.
        const nLow = nameVal.toLowerCase().trim();
        const cLow = compVal.toLowerCase().trim();
        const tLow = typeVal.toLowerCase().trim();
        const uLow = unitVal.toLowerCase().trim();

        // Try keys from most-specific to least-specific:
        //   1. name + company + type + unit  — distinguishes 1kg vs 3.5kg
        //   2. name + company + unit          — when type column is absent/blank
        //   3. name + company                 — when unit column is also absent/blank
        //   4. name only                      — last resort
        const product =
          nameIndex.get(`${nLow}::${cLow}::${tLow}::${uLow}`) ||
          nameIndex.get(`${nLow}::${cLow}::${uLow}`)           ||
          nameIndex.get(`${nLow}::${cLow}`)                    ||
          nameIndex.get(nLow);

        if (!product) {
          errors.push({ row: rNo, msg: `Product not found: "${nameVal}" / "${compVal}" / "${unitVal}"`, data: r });
          failed++;
          continue;
        }

        // Build grid row
        const pid   = String(product._id);
        const stock = stockMap.get(pid);
        const reqEx = product.requiresExpiry !== false;
        const batches = (stock?.expiryArray || []).filter(b => (b.quantity || 0) > 0).map(b => ({
          expiry:      b.expiry ? moment(b.expiry).format('YYYY-MM-DD') : '',
          expiryLabel: b.expiry ? moment(b.expiry).format('DD/MM/YYYY') : 'No expiry',
          qty:         b.quantity || 0,
          price:       b.purchasingPrice || b.sellingPrice || 0,
        }));

        let currentQty = 0;
        if (!reqEx) {
          currentQty = stock?.totalQuantity || 0;
        } else if (expiryVal) {
          const batch = batches.find(b => b.expiry === expiryVal);
          currentQty  = batch?.qty || 0;
        }

        newGridRows.push({
          id:          newRowId(),
          productId:   pid,
          productName: product.name || product.productName || nameVal,
          companyName: compVal,
          type:        typeVal || product.type || product.category || '',
          unit:        unitVal || product.unit || '',
          expiry:      expiryVal,
          currentQty,
          qtyIn:    qtyIn  > 0 ? String(qtyIn)  : '',
          qtyOut:   qtyOut > 0 ? String(qtyOut) : '',
          price:    price > 0  ? String(price)  : '',
          remarks:  remarksVal,
          _query:          product.name || product.productName || nameVal,
          _showDrop:       false,
          _batches:        batches,
          _requiresExpiry: reqEx,
        });

        if (qtyIn > 0 || qtyOut > 0) imported++;
        else skipped++;
      }

      prog.done     = endIdx;
      prog.imported = imported;
      prog.updated  = updated;
      prog.skipped  = skipped;
      prog.failed   = failed;
      prog.errors   = errors;
      prog.phase    = endIdx < totalRows
        ? `Processing batch ${Math.ceil(endIdx / IMPORT_CHUNK)} of ${Math.ceil(totalRows / IMPORT_CHUNK)}…`
        : 'Import complete';

      setImportProgress({ ...prog });

      if (endIdx < totalRows) {
        await new Promise(r => setTimeout(r, 10)); // yield to browser
        await processChunk(endIdx);
      } else {
        // done
        prog.finished = true;
        setImportProgress({ ...prog });
        // push rows into grid
        setGridRows(prev => {
          const existing = prev.filter(r => r.productId);
          const combined = [...existing, ...newGridRows, emptyRow()];
          return combined;
        });
      }
    };

    // start processing asynchronously
    setTimeout(() => processChunk(0), 50);
  };

  /* ── REDIRECT ──────────────────────────────────────────────────────────── */
  if ((getUserInfo()?.role || '').toLowerCase() === 'user') {
    return <Navigate to="/dashboard" replace />;
  }

  /* ── RENDER ────────────────────────────────────────────────────────────── */
  const focusedRow = focusedRowId !== null ? gridRows.find(r => r.id === focusedRowId) : null;
  const showPortal = !!(focusedRow?._showDrop && productInputRef.current);

  return (
    <div className="min-h-screen bg-slate-50/60 flex flex-col">
      {/* Import Progress Modal */}
      {importProgress && (
        <ImportProgressModal
          progress={importProgress}
          onClose={() => setImportProgress(null)}
        />
      )}

      {/* Portal Dropdown — rendered into document.body, escapes overflow:auto */}
      {showPortal && (
        <ProductDropdownPortal
          anchorRef={productInputRef}
          suggestions={rowSuggestions}
          activeSug={activeSug}
          query={searchQuery}
          onSelect={(product) => applyProduct(focusedRowId, product)}
        />
      )}

      <div className="flex-1 p-4 md:p-6">
        <div className="max-w-[1600px] mx-auto space-y-5">

          {/* ── HEADER ─────────────────────────────────────────────────── */}
          <div className="bg-gradient-to-r from-amber-600 to-amber-700 rounded-2xl text-white shadow-lg p-6">
            <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
              <div className="flex items-center gap-4">
                <div className="p-3 bg-white/15 rounded-xl shadow-inner backdrop-blur-sm">
                  <FileSpreadsheet className="w-8 h-8 text-white" />
                </div>
                <div>
                  <h1 className="text-2xl md:text-3xl font-black tracking-tight">Stock Adjustment</h1>
                  <p className="text-amber-100 text-xs mt-1 max-w-md">
                    Excel-style bulk entry — search products, fill quantities, press Enter to jump rows.
                  </p>
                </div>
              </div>
              <div className="flex flex-wrap items-center gap-2">
                {/* Download Sample */}
                <button
                  type="button"
                  onClick={downloadSample}
                  className="flex items-center gap-1.5 px-3.5 py-2 bg-white/10 hover:bg-white/20 border border-white/25 rounded-xl text-xs font-semibold text-white transition-all"
                >
                  <Download className="w-3.5 h-3.5" />
                  Sample Excel
                </button>
                {/* Import Excel */}
                <button
                  type="button"
                  onClick={() => fileInputRef.current?.click()}
                  className="flex items-center gap-1.5 px-3.5 py-2 bg-white/10 hover:bg-white/20 border border-white/25 rounded-xl text-xs font-semibold text-white transition-all"
                >
                  <Upload className="w-3.5 h-3.5" />
                  Import Excel
                </button>
                <input
                  ref={fileInputRef}
                  type="file"
                  accept=".xlsx,.xls,.csv"
                  className="hidden"
                  onChange={handleImportFile}
                />
                {/* Keyboard hint */}
                <div className="flex items-center gap-1.5 px-3 py-2 bg-white/10 border border-white/20 rounded-xl text-[10px] text-amber-100">
                  <Keyboard className="w-3.5 h-3.5" />
                  Enter/Tab moves cells · ↑↓ navigates rows
                 </div>
               </div>
             </div>
           </div>

          {/* ── STACKED VALIDATION ERRORS ALERT ───────────────────────── */}
          {validationErrors.length > 0 && (
            <div className="bg-red-50 border border-red-200 rounded-xl p-4 text-red-900 shadow-md">
              <div className="flex items-center justify-between pb-2 mb-2 border-b border-red-200">
                <div className="font-bold flex items-center gap-2 text-sm text-red-800">
                  <AlertCircle className="w-5 h-5 text-red-600 flex-shrink-0" />
                  <span>Stock Adjustment Validation Errors ({validationErrors.length})</span>
                </div>
                <button
                  type="button"
                  onClick={() => setValidationErrors([])}
                  className="text-red-500 hover:text-red-700 p-1 rounded-lg hover:bg-red-100 transition-colors"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>
              <ul className="list-disc list-inside space-y-1 text-xs font-semibold text-red-700 max-h-48 overflow-y-auto">
                {validationErrors.map((err, i) => (
                  <li key={i}>{err}</li>
                ))}
              </ul>
            </div>
          )}

          {/* ── DOC META + STATS ────────────────────────────────────────── */}
          <div className="grid grid-cols-1 md:grid-cols-12 gap-4">
            {/* Doc meta */}
            <div className="md:col-span-8 bg-white rounded-xl border border-slate-100 shadow-sm p-5">
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                <div>
                  <label className="block text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-1.5">Doc No</label>
                  <div className="h-10 px-3.5 border border-amber-100 rounded-lg flex items-center font-black text-amber-800 bg-amber-50/40 text-base">
                    #{docNo}
                  </div>
                </div>
                <div>
                  <label className="block text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-1.5">Date</label>
                  <input
                    type="date" value={docDate}
                    onChange={e => setDocDate(e.target.value)}
                    className="w-full h-10 px-3.5 text-sm font-medium text-slate-700 border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-amber-500 bg-white"
                  />
                </div>
                <div>
                  <label className="block text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-1.5">Note / Reason</label>
                  <input
                    type="text" value={docNote}
                    onChange={e => setDocNote(e.target.value)}
                    placeholder="Audit correction, damages, etc."
                    className="w-full h-10 px-3.5 text-sm font-medium text-slate-700 border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-amber-500 bg-white placeholder:text-slate-400"
                  />
                </div>
              </div>
            </div>

            {/* Stats + Save */}
            <div className="md:col-span-4 bg-white rounded-xl border border-slate-100 shadow-sm p-5 flex flex-col justify-between gap-4">
              <div className="grid grid-cols-2 gap-3">
                <div className="rounded-lg bg-blue-50 p-3 text-center">
                  <div className="text-2xl font-black text-blue-700">{filledCount}</div>
                  <div className="text-[9px] font-bold text-blue-500 uppercase tracking-wider mt-0.5">Products</div>
                </div>
                <div className="rounded-lg bg-emerald-50 p-3 text-center">
                  <div className="text-2xl font-black text-emerald-700">{activeCount}</div>
                  <div className="text-[9px] font-bold text-emerald-500 uppercase tracking-wider mt-0.5">With Qty</div>
                </div>
              </div>
              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={saveDocument}
                  disabled={loading || activeCount === 0}
                  className="flex-1 h-10 bg-amber-600 hover:bg-amber-700 disabled:bg-slate-100 disabled:text-slate-400 text-white text-sm font-bold rounded-lg flex items-center justify-center gap-2 transition-all shadow-sm"
                >
                  {loading
                    ? <><RefreshCw className="w-4 h-4 animate-spin" /> Saving…</>
                    : <><Save className="w-4 h-4" /> Save Document #{docNo}</>
                  }
                </button>
                <button
                  type="button"
                  onClick={() => setGridRows([emptyRow()])}
                  title="Clear grid"
                  className="px-3 h-10 border border-slate-200 hover:bg-red-50 hover:text-red-600 text-slate-400 rounded-lg transition-colors"
                >
                  <Trash2 className="w-4 h-4" />
                </button>
              </div>
            </div>
          </div>

          {/* ── ALERT ────────────────────────────────────────────────────── */}
          {alert.show && (
            <div className={`p-4 rounded-xl flex items-start gap-3 border shadow-sm ${
              alert.type === 'success'
                ? 'bg-emerald-50 text-emerald-800 border-emerald-200'
                : 'bg-rose-50 text-rose-800 border-rose-200'
            }`}>
              {alert.type === 'success'
                ? <CheckCircle2 className="w-5 h-5 text-emerald-500 flex-shrink-0 mt-0.5" />
                : <AlertCircle  className="w-5 h-5 text-rose-500 flex-shrink-0 mt-0.5" />}
              <p className="text-sm font-medium">{alert.message}</p>
            </div>
          )}

          {/* ── EXCEL GRID ───────────────────────────────────────────────── */}
          <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
            {/* Grid header bar */}
            <div className="px-4 py-3 bg-slate-800 text-white text-sm font-bold flex items-center justify-between">
              <div className="flex items-center gap-2">
                <FileSpreadsheet className="w-4 h-4 text-amber-400" />
                <span>Excel-Style Entry Grid</span>
                <span className="ml-2 text-xs font-normal text-slate-400">{gridRows.length} rows loaded</span>
              </div>
              <div className="flex items-center gap-1 text-[10px] text-slate-400">
                <Info className="w-3.5 h-3.5 text-amber-300" />
                <span>Arrow keys navigate · Esc returns to Product · Enter advances · Tab moves right</span>
              </div>
            </div>

            {/* Scrollable grid */}
            <div className="overflow-auto max-h-[62vh]" style={{ scrollbarWidth: 'thin' }}>
              <table className="w-full border-collapse table-fixed text-sm" style={{ minWidth: '1300px' }}>
                <thead className="sticky top-0 z-20 bg-slate-700 text-white shadow-md">
                  <tr>
                    <th className="w-9  px-1 py-2.5 text-center text-[10px] font-bold uppercase tracking-wider border-r border-slate-600">#</th>
                    <th className="px-2 py-2.5 text-left text-[10px] font-bold uppercase tracking-wider border-r border-slate-600 min-w-[220px]">Product Name</th>
                    <th className="px-2 py-2.5 text-left text-[10px] font-bold uppercase tracking-wider border-r border-slate-600 min-w-[130px]">Company</th>
                    <th className="px-2 py-2.5 text-left text-[10px] font-bold uppercase tracking-wider border-r border-slate-600 min-w-[90px]">Type</th>
                    <th className="px-2 py-2.5 text-center text-[10px] font-bold uppercase tracking-wider border-r border-slate-600 min-w-[65px]">Unit</th>
                    <th className="px-2 py-2.5 text-left text-[10px] font-bold uppercase tracking-wider border-r border-slate-600 min-w-[150px]">Expiry Date</th>
                    <th className="px-2 py-2.5 text-right text-[10px] font-bold uppercase tracking-wider border-r border-slate-600 min-w-[80px]">Current Qty</th>
                    <th className="px-2 py-2.5 text-center text-[10px] font-bold uppercase tracking-wider border-r border-slate-600 min-w-[90px] text-green-300">Qty IN ▲</th>
                    <th className="px-2 py-2.5 text-center text-[10px] font-bold uppercase tracking-wider border-r border-slate-600 min-w-[90px] text-red-300">Qty OUT ▼</th>
                    <th className="px-2 py-2.5 text-right text-[10px] font-bold uppercase tracking-wider border-r border-slate-600 min-w-[80px] text-amber-300">Final Qty</th>
                    <th className="px-2 py-2.5 text-right text-[10px] font-bold uppercase tracking-wider border-r border-slate-600 min-w-[90px]">Unit Price</th>
                    <th className="px-2 py-2.5 text-left text-[10px] font-bold uppercase tracking-wider border-r border-slate-600 min-w-[120px]">Remarks</th>
                    <th className="w-10 px-1 py-2.5 text-center text-[10px] font-bold uppercase tracking-wider">✕</th>
                  </tr>
                </thead>
                <tbody>
                  {gridRows.map((row, ri) => (
                    <GridRow
                      key={row.id}
                      row={row}
                      rowIdx={ri}
                      isFocused={focusedRowId === row.id}
                      activeCell={activeCell}
                      inputRef={productInputRef}
                      onQueryChange={handleQueryChange}
                      onKeyDownProduct={handleKeyDownProduct}
                      onCellChange={handleCellChange}
                      onCellKeyDown={handleCellKeyDown}
                      onCellFocus={handleCellFocus}
                      onRemove={handleRemoveRow}
                    />
                  ))}
                </tbody>
              </table>
            </div>

            {/* Footer */}
            <div className="px-4 py-2.5 bg-slate-50 border-t border-slate-100 flex items-center justify-between">
              <button
                type="button"
                onClick={() => setGridRows(prev => [...prev, emptyRow()])}
                className="text-xs font-semibold text-amber-700 hover:text-amber-800 hover:bg-amber-50 px-3 py-1.5 rounded-lg transition-colors flex items-center gap-1.5"
              >
                + Add Row
              </button>
              <div className="text-[10px] text-slate-400">
                {gridRows.filter(r => r.productId).length} products · {activeCount} with adjustments
              </div>
            </div>
          </div>

        </div>
      </div>
    </div>
  );
};

export default StockAdjustment;
