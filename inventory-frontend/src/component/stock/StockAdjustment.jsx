import React, { useState, useEffect, useRef, useMemo, useCallback } from 'react';
import { createPortal } from 'react-dom';
import axios from 'axios';
import { Navigate } from 'react-router-dom';
import { getToken, getUserInfo } from '../../utils/auth';
import {
  AlertCircle, CheckCircle2, X, Save,
  Upload, Download, Trash2, RefreshCw,
  FileSpreadsheet, Info, Keyboard, Search,
  FolderOpen, PlusCircle
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
  _id: null,
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
  _prevDelta: 0,
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
───────────────────────────────────────────────────────────────────────────── */
function ProductDropdownPortal({ anchorRef, suggestions, activeSug, query, onSelect, onHover }) {
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

  useEffect(() => {
    if (activeSug >= 0) {
      const el = document.querySelector(`[data-suggestion-idx="${activeSug}"]`);
      if (el) {
        el.scrollIntoView({ block: 'nearest' });
      }
    }
  }, [activeSug]);

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
              onMouseEnter={() => onHover && onHover(i)}
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
                  <Highlight text={s.companyName || '—'} query={query} />
                  {s.type && <><span className="mx-1 text-slate-300">·</span><span>{s.type}</span></>}
                  {s.unit && <><span className="mx-1 text-slate-300">·</span><span>{s.unit}</span></>}
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
   KEYBOARD-FRIENDLY EXPIRY INPUT CELL
───────────────────────────────────────────────────────────────────────────── */
const ExpiryInputCell = React.memo(({ row, cellCls, onCellFocus, onCellChange, onCellKeyDown }) => {
  const formatForDisplay = (val) => {
    if (!val) return '';
    const m = moment(val, ['YYYY-MM-DD', 'DD/MM/YYYY', 'DD-MM-YYYY', 'YYYY/MM/DD'], true);
    if (m.isValid()) return m.format('DD/MM/YYYY');
    return val;
  };

  const [inputText, setInputText] = useState(() => formatForDisplay(row.expiry));
  const [isFocused, setIsFocused] = useState(false);

  useEffect(() => {
    if (!isFocused) {
      setInputText(formatForDisplay(row.expiry));
    }
  }, [row.expiry, isFocused]);

  if (!row.productId) {
    return <div className="px-2 py-1 text-slate-300 text-xs text-center">—</div>;
  }
  if (!row._requiresExpiry) {
    return <div className="px-2 py-1 text-[10px] font-semibold text-slate-400 text-center bg-slate-50 rounded mx-1">Not Required</div>;
  }

  const handleChange = (e) => {
    let val = e.target.value;

    // Smart auto-slash insertion if user types 8 digits e.g. "05092026" -> "05/09/2026"
    const digitsOnly = val.replace(/\D/g, '');
    if (digitsOnly.length === 8 && !val.includes('/') && !val.includes('-')) {
      val = `${digitsOnly.slice(0,2)}/${digitsOnly.slice(2,4)}/${digitsOnly.slice(4,8)}`;
    }

    setInputText(val);

    const formats = ['DD/MM/YYYY', 'DD-MM-YYYY', 'YYYY-MM-DD', 'DDMMYYYY', 'D/M/YYYY', 'D-M-YYYY'];
    const parsed = moment(val, formats, true);
    if (parsed.isValid()) {
      onCellChange(row.id, 'expiry', parsed.format('YYYY-MM-DD'));
    } else {
      onCellChange(row.id, 'expiry', val);
    }
  };

  const handleBlur = () => {
    setIsFocused(false);
    const parsed = moment(inputText, ['DD/MM/YYYY', 'DD-MM-YYYY', 'YYYY-MM-DD', 'DDMMYYYY', 'D/M/YYYY', 'D-M-YYYY'], true);
    if (parsed.isValid()) {
      const formatted = parsed.format('DD/MM/YYYY');
      setInputText(formatted);
      onCellChange(row.id, 'expiry', parsed.format('YYYY-MM-DD'));
    }
  };

  const isoVal = moment(row.expiry, ['YYYY-MM-DD', 'DD/MM/YYYY', 'DD-MM-YYYY']).isValid()
    ? moment(row.expiry, ['YYYY-MM-DD', 'DD/MM/YYYY', 'DD-MM-YYYY']).format('YYYY-MM-DD')
    : '';

  return (
    <div className="relative flex items-center w-full">
      <input
        type="text"
        placeholder="DD/MM/YYYY"
        value={inputText}
        data-row-id={row.id} data-field="expiry"
        onFocus={(e) => {
          setIsFocused(true);
          onCellFocus(row.id, 'expiry');
          e.target.select();
        }}
        onBlur={handleBlur}
        onChange={handleChange}
        onKeyDown={(e) => onCellKeyDown(e, row.id, 'expiry')}
        className={`${cellCls('expiry')} text-xs font-medium tracking-tight pr-6 placeholder:text-slate-300 placeholder:font-normal`}
      />
      <input
        type="date"
        value={isoVal}
        onChange={(e) => {
          const dVal = e.target.value;
          if (dVal) {
            const formatted = moment(dVal).format('DD/MM/YYYY');
            setInputText(formatted);
            onCellChange(row.id, 'expiry', dVal);
          }
        }}
        className="absolute right-1 w-4 h-4 opacity-40 hover:opacity-100 cursor-pointer border-0 bg-transparent p-0 flex-shrink-0"
        tabIndex={-1}
        title="Choose date from calendar"
      />
    </div>
  );
});

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
  const currentStock = parseFloat(row.currentQty) || 0;

  // Base stock before this row's previous adjustment
  const baseStock = row._id ? currentStock - (row._prevDelta || 0) : currentStock;
  const finalQty = baseStock + inQty - outQty;
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

      {/* PRODUCT */}
      <td className="border-r border-slate-100 min-w-[220px]">
        <input
          ref={isFocused ? inputRef : null}
          type="text"
          value={row._query}
          data-row-id={row.id} data-field="product"
          placeholder={row.productId ? '' : 'Search product…'}
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
        <ExpiryInputCell
          row={row}
          cellCls={cellCls}
          onCellFocus={onCellFocus}
          onCellChange={onCellChange}
          onCellKeyDown={onCellKeyDown}
        />
      </td>

      {/* CURRENT QTY (read-only display) */}
      <td className="border-r border-slate-100 min-w-[80px]">
        <div className="px-2 py-1 text-xs text-right font-semibold text-slate-600">
          {row.productId ? (baseStock || 0) : <span className="text-slate-300">—</span>}
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
          ) : baseStock) : '—'}
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
   OPEN EXISTING DOCUMENT SELECTOR MODAL
───────────────────────────────────────────────────────────────────────────── */
const DocumentSelectorModal = ({ isOpen, onClose, onSelectDoc }) => {
  const [docs, setDocs] = useState([]);
  const [loading, setLoading] = useState(false);
  const [search, setSearch] = useState('');
  const accessToken = getToken();

  const fetchDocs = useCallback(() => {
    setLoading(true);
    axios.get(`${API}/api/stockAdjustment/getAdjustmentDocuments`, { headers: { token: accessToken } })
      .then(res => {
        setDocs(res.data.result || []);
        setLoading(false);
      })
      .catch(err => {
        console.error(err);
        setLoading(false);
      });
  }, [accessToken]);

  useEffect(() => {
    if (isOpen) fetchDocs();
  }, [isOpen, fetchDocs]);

  const filteredDocs = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return docs;
    return docs.filter(d => {
      const docNoStr = String(d.docNo || '');
      const noteStr = String(d.note || '').toLowerCase();
      const creatorStr = String(d.createdBy || '').toLowerCase();
      const dateStr = d.date ? moment(d.date).format('DD/MM/YYYY').toLowerCase() : '';
      const dateIsoStr = d.date ? moment(d.date).format('YYYY-MM-DD').toLowerCase() : '';
      return docNoStr.includes(q) ||
             `#${docNoStr}`.includes(q) ||
             `adjustment #${docNoStr}`.includes(q) ||
             noteStr.includes(q) ||
             creatorStr.includes(q) ||
             dateStr.includes(q) ||
             dateIsoStr.includes(q);
    });
  }, [docs, search]);

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm p-4">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-3xl overflow-hidden flex flex-col max-h-[85vh]">
        {/* Header */}
        <div className="bg-slate-800 text-white px-6 py-4 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <FolderOpen className="w-5 h-5 text-amber-400" />
            <h2 className="text-lg font-bold">Open Existing Stock Adjustment Document</h2>
          </div>
          <button onClick={onClose} className="p-1 hover:bg-slate-700 rounded-lg text-slate-300 hover:text-white transition-colors">
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Search Bar */}
        <div className="p-4 border-b border-slate-100 bg-slate-50 flex items-center gap-3">
          <div className="relative flex-1">
            <input
              type="text"
              placeholder="Search by Document Number (#2), Date, Reason, or Created By..."
              value={search}
              onChange={e => setSearch(e.target.value)}
              className="w-full h-10 pl-9 pr-4 text-sm font-medium text-slate-700 bg-white border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-amber-500"
              autoFocus
            />
            <Search className="w-4 h-4 text-slate-400 absolute left-3 top-3" />
          </div>
          <button
            onClick={fetchDocs}
            className="p-2.5 text-slate-600 bg-white hover:bg-slate-100 border border-slate-200 rounded-xl transition-colors"
            title="Refresh document list"
          >
            <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
          </button>
        </div>

        {/* Document List Table */}
        <div className="overflow-y-auto flex-1 p-4">
          {loading ? (
            <div className="py-12 text-center text-slate-400 flex flex-col items-center gap-2">
              <RefreshCw className="w-6 h-6 animate-spin text-amber-500" />
              <p className="text-sm font-medium">Loading documents...</p>
            </div>
          ) : filteredDocs.length === 0 ? (
            <div className="py-12 text-center text-slate-400">
              <p className="text-sm font-medium">No stock adjustment documents found</p>
            </div>
          ) : (
            <table className="w-full text-left text-sm border-collapse">
              <thead>
                <tr className="border-b border-slate-200 text-[11px] font-bold text-slate-400 uppercase tracking-wider bg-slate-50">
                  <th className="px-4 py-2.5">Doc No</th>
                  <th className="px-4 py-2.5">Date</th>
                  <th className="px-4 py-2.5">Note / Reason</th>
                  <th className="px-4 py-2.5">Created By</th>
                  <th className="px-4 py-2.5 text-center">Items</th>
                  <th className="px-4 py-2.5 text-right">Total Qty</th>
                  <th className="px-4 py-2.5 text-center">Action</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {filteredDocs.map(doc => (
                  <tr key={doc._id} className="hover:bg-amber-50/50 transition-colors">
                    <td className="px-4 py-3 font-bold text-amber-800 font-mono">#{doc.docNo}</td>
                    <td className="px-4 py-3 text-slate-600 font-medium">
                      {doc.date ? moment(doc.date).format('DD/MM/YYYY') : '—'}
                    </td>
                    <td className="px-4 py-3 text-slate-700 max-w-xs truncate font-medium">
                      {doc.note || <span className="text-slate-300 italic">No note</span>}
                    </td>
                    <td className="px-4 py-3 text-slate-500 text-xs">{doc.createdBy || 'N/A'}</td>
                    <td className="px-4 py-3 text-center font-semibold text-slate-600">
                      <span className="px-2 py-0.5 bg-blue-50 text-blue-700 rounded-full text-xs">
                        {doc.itemCount} Product{doc.itemCount !== 1 ? 's' : ''}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-right font-bold text-slate-700">
                      {doc.totalQtyAdjusted}
                    </td>
                    <td className="px-4 py-3 text-center">
                      <button
                        onClick={() => onSelectDoc(doc.docNo)}
                        className="px-3 py-1.5 bg-amber-600 hover:bg-amber-700 text-white font-bold text-xs rounded-lg transition-colors shadow-sm"
                      >
                        Open Document
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>

        {/* Footer */}
        <div className="px-6 py-3 bg-slate-50 border-t border-slate-100 flex items-center justify-between text-xs text-slate-400">
          <span>Total {filteredDocs.length} documents</span>
          <button
            onClick={onClose}
            className="px-4 py-2 bg-slate-200 hover:bg-slate-300 text-slate-700 font-semibold rounded-xl transition-colors"
          >
            Cancel
          </button>
        </div>
      </div>
    </div>
  );
};

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

  // ── EDITING MODE ──────────────────────────────────────────────────────────
  const [isEditing, setIsEditing] = useState(false);
  const [loadedDocNo, setLoadedDocNo] = useState(null);
  const [showDocSelectorModal, setShowDocSelectorModal] = useState(false);

  // ── GRID ──────────────────────────────────────────────────────────────────
  const [gridRows, setGridRows] = useState([emptyRow()]);
  const [focusedRowId, setFocusedRowId] = useState(null);
  const [activeCell,    setActiveCell]    = useState(null);
  const [activeSug,     setActiveSug]     = useState(0);
  const [searchQuery,   setSearchQuery]   = useState('');
  const activeSugRef       = useRef(0);
  const rowSuggestionsRef  = useRef([]);
  const debounceRef        = useRef(null);

  // Keep refs up to date on every render
  activeSugRef.current = activeSug;

  // ── UI STATE ──────────────────────────────────────────────────────────────
  const [loading, setLoading] = useState(false);
  const [alert,   setAlert]   = useState({ show: false, message: '', type: '' });
  const [importProgress, setImportProgress] = useState(null);

  const accessToken     = getToken();
  const productInputRef = useRef(null);
  const fileInputRef    = useRef(null);

  /* ── FETCH ─────────────────────────────────────────────────────────────── */
  const fetchAll = useCallback(() => {
    axios.get(`${API}/api/product/getAllProducts`, { headers: { token: accessToken } })
      .then(r => setProducts(r.data.result || []))
      .catch(console.error);
    axios.get(`${API}/api/stock/getAllStocks`, { headers: { token: accessToken } })
      .then(r => setStocks(r.data.result || []))
      .catch(console.error);

    if (!isEditing) {
      axios.get(`${API}/api/stockAdjustment/getStockAdjustmentDocNo`, { headers: { token: accessToken } })
        .then(r => {
          const arr = r.data.result;
          setDocNo((Array.isArray(arr) && arr.length > 0) ? (arr[0].docNo || 1) : 1);
        })
        .catch(console.error);
    }
  }, [accessToken, isEditing]);

  useEffect(() => { fetchAll(); }, [fetchAll]);

  /* ── STOCK LOOKUP MAP ──────────────────────────────────────────────────── */
  const stockMap = useMemo(() => {
    const m = new Map();
    stocks.forEach(s => {
      const id = String(s.product?._id || s.product || '');
      if (id) m.set(id, s);
    });
    return m;
  }, [stocks]);

  /* ── OPEN DOCUMENT HANDLER ─────────────────────────────────────────────── */
  const handleOpenDocument = useCallback((targetDocNo) => {
    setLoading(true);
    setShowDocSelectorModal(false);
    axios.post(`${API}/api/stockAdjustment/getStockAdjustmentByDocNo`, { docNo: targetDocNo }, { headers: { token: accessToken } })
      .then(res => {
        const doc = res.data.result;
        if (!doc) {
          showAlert(`Document #${targetDocNo} not found`, 'error');
          setLoading(false);
          return;
        }
        setIsEditing(true);
        setLoadedDocNo(doc.docNo);
        setDocNo(doc.docNo);
        setDocDate(doc.date ? moment(doc.date).format('YYYY-MM-DD') : moment().format('YYYY-MM-DD'));
        setDocNote(doc.note || '');

        const loadedRows = (doc.items || []).map(item => {
          const pid = String(item.productId?._id || item.productId || '');
          const stock = stockMap.get(pid);
          const delta = item.quantityDelta || 0;
          const currentQty = stock?.totalQuantity || 0;

          return {
            id: newRowId(),
            _id: item._id,
            productId: pid,
            productName: item.productName || item.productId?.name || '',
            companyName: item.companyName || item.productId?.companyName || '',
            type: item.type || item.productId?.type || '',
            unit: item.unit || item.productId?.unit || '',
            expiry: item.expiry ? moment(item.expiry).format('YYYY-MM-DD') : '',
            currentQty,
            qtyIn: delta > 0 ? String(delta) : '',
            qtyOut: delta < 0 ? String(Math.abs(delta)) : '',
            price: item.price ? String(item.price) : '',
            remarks: item.reason || '',
            _query: item.productName || item.productId?.name || '',
            _showDrop: false,
            _batches: (stock?.expiryArray || []).map(b => ({
              expiry: b.expiry ? moment(b.expiry).format('YYYY-MM-DD') : '',
              expiryLabel: b.expiry ? moment(b.expiry).format('DD/MM/YYYY') : 'No expiry',
              qty: b.quantity || 0,
              price: b.purchasingPrice || b.sellingPrice || 0
            })),
            _requiresExpiry: item.requiresExpiry !== false,
            _prevDelta: delta
          };
        });

        loadedRows.push(emptyRow());
        setGridRows(loadedRows);
        setLoading(false);
        showAlert(`Document #${doc.docNo} loaded successfully. You are now editing this document.`, 'success');
      })
      .catch(err => {
        console.error(err);
        setLoading(false);
        showAlert(err.response?.data?.result || err.message || 'Failed to load document', 'error');
      });
  }, [accessToken, stockMap]);

  /* ── START NEW DOCUMENT ─────────────────────────────────────────────────── */
  const startNewDocument = () => {
    setIsEditing(false);
    setLoadedDocNo(null);
    setGridRows([emptyRow()]);
    setDocNote('');
    setDocDate(moment().format('YYYY-MM-DD'));
    axios.get(`${API}/api/stockAdjustment/getStockAdjustmentDocNo`, { headers: { token: accessToken } })
      .then(r => {
        const arr = r.data.result;
        setDocNo((Array.isArray(arr) && arr.length > 0) ? (arr[0].docNo || 1) : 1);
      })
      .catch(console.error);
  };

  /* ── SUGGESTIONS ───────────────────────────────────────────────────────── */
  const rowSuggestions = useMemo(() => {
    if (focusedRowId === null) return [];
    return fuzzySearch(products, stockMap, searchQuery);
  }, [products, stockMap, searchQuery, focusedRowId]);

  rowSuggestionsRef.current = rowSuggestions;

  useEffect(() => {
    if (activeSug >= rowSuggestions.length && rowSuggestions.length > 0) {
      const clamped = Math.max(0, rowSuggestions.length - 1);
      setActiveSug(clamped);
      activeSugRef.current = clamped;
    }
  }, [rowSuggestions, activeSug]);

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
      const isLast = idx === prev.length - 1;
      if (isLast) next.push(emptyRow());
      return next;
    });
    setActiveSug(0);
    activeSugRef.current = 0;
    setSearchQuery('');

    const nextField = reqEx ? 'expiry' : 'qtyIn';
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
      const isoExp = moment(expiryVal, ['YYYY-MM-DD', 'DD/MM/YYYY', 'DD-MM-YYYY', 'DDMMYYYY'], true).isValid()
        ? moment(expiryVal, ['YYYY-MM-DD', 'DD/MM/YYYY', 'DD-MM-YYYY', 'DDMMYYYY']).format('YYYY-MM-DD')
        : expiryVal;

      const batch = (row._batches || []).find(b => b.expiry === isoExp);
      row.expiry = expiryVal;
      if (batch) {
        row.currentQty = batch.qty;
        if (batch.price) row.price = batch.price;
      } else {
        const stock = stockMap.get(row.productId);
        if (!row._requiresExpiry) {
          row.currentQty = stock?.totalQuantity || 0;
        } else {
          row.currentQty = 0;
        }
      }
      next[idx] = row;
      return next;
    });
  }, [stockMap]);

  /* ── GRID HANDLERS ─────────────────────────────────────────────────────── */
  const handleQueryChange = useCallback((rowId, val, isFocus) => {
    setFocusedRowId(rowId);
    setActiveSug(0);
    activeSugRef.current = 0;
    setGridRows(prev => {
      const idx = prev.findIndex(r => r.id === rowId);
      if (idx === -1) return prev;
      const next = [...prev];
      const row  = { ...next[idx] };
      row._query    = val;
      row._showDrop = true;
      if (!val && !isFocus) {
        row.productId = '';  row.productName = '';
        row.companyName = ''; row.type = ''; row.unit = '';
        row.expiry = ''; row.currentQty = ''; row.price = '';
        row._batches = []; row._requiresExpiry = false;
      }
      next[idx] = row;
      return next;
    });
    clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => setSearchQuery(val), 250);
  }, []);

  const handleKeyDownProduct = useCallback((e, rowId) => {
    const row = gridRows.find(r => r.id === rowId);
    if (!row) return;
    const currentSugList = rowSuggestionsRef.current;
    const currentIdx = activeSugRef.current;

    switch (e.key) {
      case 'ArrowDown':
        e.preventDefault();
        e.stopPropagation();
        if (!row._showDrop) {
          setGridRows(prev => prev.map(r => r.id === rowId ? { ...r, _showDrop: true } : r));
          setActiveSug(0);
          activeSugRef.current = 0;
        } else if (currentSugList.length > 0) {
          const nextIdx = Math.min(currentIdx + 1, currentSugList.length - 1);
          setActiveSug(nextIdx);
          activeSugRef.current = nextIdx;
        }
        break;
      case 'ArrowUp':
        e.preventDefault();
        e.stopPropagation();
        if (row._showDrop && currentSugList.length > 0) {
          const prevIdx = Math.max(currentIdx - 1, 0);
          setActiveSug(prevIdx);
          activeSugRef.current = prevIdx;
        }
        break;
      case 'Enter':
        if (row._showDrop && currentSugList.length > 0) {
          e.preventDefault();
          e.stopPropagation();
          const targetProduct = currentSugList[currentIdx] || currentSugList[0];
          if (targetProduct) {
            applyProduct(rowId, targetProduct);
          }
        }
        break;
      case 'Tab':
        if (row._showDrop && currentSugList.length > 0) {
          e.preventDefault();
          e.stopPropagation();
          const targetProduct = currentSugList[currentIdx] || currentSugList[0];
          if (targetProduct) {
            applyProduct(rowId, targetProduct);
          }
        }
        break;
      case 'Escape':
        e.preventDefault();
        e.stopPropagation();
        setGridRows(prev => prev.map(r => r.id === rowId ? { ...r, _showDrop: false } : r));
        break;
      default: break;
    }
  }, [gridRows, applyProduct]);

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
  }, []);

  const handleRemoveRow = useCallback((rowId) => {
    setGridRows(prev => {
      const next = prev.filter(r => r.id !== rowId);
      if (next.length === 0) return [emptyRow()];
      return next;
    });
  }, []);

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

  /* ── SAVE DOCUMENT ──────────────────────────────────────────────────────── */
  const [validationErrors, setValidationErrors] = useState([]);

  const saveDocument = () => {
    const lines = [];
    const errors = [];

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

      if (!row.productId || !row.productName) {
        errors.push(`Row ${excelRow}: Product Name is required.`);
        rowHasError = true;
      }

      if (row._requiresExpiry && !row.expiry) {
        errors.push(`Row ${excelRow}: Expiry Date is required.`);
        rowHasError = true;
      } else if (row.expiry) {
        const parsedExp = moment(row.expiry, ['YYYY-MM-DD', 'DD-MM-YYYY', 'DD/MM/YYYY'], true);
        if (!parsedExp.isValid()) {
          errors.push(`Row ${excelRow}: Expiry Date "${row.expiry}" is invalid.`);
          rowHasError = true;
        }
      }

      const inQty  = Math.max(0, parseFloat(row.qtyIn)  || 0);
      const outQty = Math.max(0, parseFloat(row.qtyOut) || 0);

      if (inQty === 0 && outQty === 0) {
        errors.push(`Row ${excelRow}: Either Quantity In or Quantity Out is required.`);
        rowHasError = true;
      } else if (inQty > 0 && outQty > 0) {
        errors.push(`Row ${excelRow}: Cannot have both Quantity In and Quantity Out.`);
        rowHasError = true;
      }

      if (outQty > 0) {
        const currentAvail = Number(row.currentQty || 0);
        const prevDelta = Number(row._prevDelta || 0);
        const baseStock = row._id ? currentAvail - prevDelta : currentAvail;
        if (outQty > baseStock) {
          errors.push(`Row ${excelRow}: Quantity Out (${outQty}) exceeds available stock (${baseStock}).`);
          rowHasError = true;
        }
      }

      const price = row.price !== '' && row.price != null ? parseFloat(row.price) : 0;
      if (price < 0) {
        errors.push(`Row ${excelRow}: Unit Price cannot be negative.`);
        rowHasError = true;
      }

      if (!rowHasError) {
        const lineObj = {
          productId:     row.productId,
          productName:   row.productName,
          companyName:   row.companyName || '',
          unit:          row.unit || '',
          expiry:        row._requiresExpiry ? moment(row.expiry, ['YYYY-MM-DD', 'DD-MM-YYYY', 'DD/MM/YYYY']).format('YYYY-MM-DD') : null,
          batchNumber:   '',
          quantityDelta: inQty > 0 ? inQty : -outQty,
          price,
          reason:        docNote || row.remarks || 'Stock Adjustment',
        };
        if (row._id) {
          lineObj._id = row._id;
        }
        lines.push(lineObj);
      }
    });

    if (errors.length > 0) {
      setValidationErrors(errors);
      showAlert(`Validation failed: ${errors.length} issue(s) found. Please fix all errors before saving.`, 'error');
      return;
    }

    setValidationErrors([]);
    setLoading(true);

    if (isEditing) {
      axios.post(
        `${API}/api/stockAdjustment/updateAdjustmentDocument`,
        { docNo: loadedDocNo, date: docDate, note: docNote, items: lines },
        { headers: { token: accessToken } }
      )
        .then(res => {
          const no = res.data?.assignedDocNo || loadedDocNo;
          setLoading(false);
          fetchAll();
          handleOpenDocument(no);
          showAlert(`Document #${no} updated successfully`, 'success');
        })
        .catch(err => {
          setLoading(false);
          showAlert(err.response?.data?.result || err.response?.data?.error || err.message || 'Update failed', 'error');
        });
    } else {
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
    }
  };

  const saveDocumentRef = useRef(saveDocument);
  const loadingRef = useRef(loading);
  useEffect(() => {
    saveDocumentRef.current = saveDocument;
    loadingRef.current = loading;
  });

  useEffect(() => {
    const handleF10Key = (e) => {
      const isF10 = e.key === 'F10' || e.code === 'F10' || e.keyCode === 121;
      if (isF10) {
        e.preventDefault();
        e.stopPropagation();
        if (e.stopImmediatePropagation) e.stopImmediatePropagation();
        if (!loadingRef.current && typeof saveDocumentRef.current === 'function') {
          saveDocumentRef.current();
        }
      }
    };
    window.addEventListener('keydown', handleF10Key, true);
    return () => window.removeEventListener('keydown', handleF10Key, true);
  }, []);

  /* ── DOWNLOAD SAMPLE EXCEL ─────────────────────────────────────────────── */
  const downloadSample = () => {
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

    const sample = [
      ['Paracetamol 500mg', 'PharmaCo',   'Tablet',  'Box',   '31-12-2026',  100,     20,    0,      2.50,  'Monthly audit correction'],
      ['Amoxicillin 250mg', 'MediCorp',   'Capsule', 'Strip', '30-06-2025',   50,      0,    5,      4.75,  'Expired batch removal'],
      ['Ibuprofen 400mg',   'HealthPlus', 'Tablet',  'Pack',  '15-03-2027',  200,     50,    0,      3.00,  'Stock replenishment'],
      ['Vitamin C 1000mg',  'NutriLab',  'Tablet',  'Bottle','',              0,     100,    0,      1.50,  'New arrival — no expiry'],
      ['Cough Syrup 100ml', 'PharmaCo',  'Syrup',   'Bottle','20-09-2026',   30,     10,    0,      6.00,  'Quarterly stock check'],
    ];

    const wb = XLSX.utils.book_new();
    const ws = XLSX.utils.aoa_to_sheet([headers, ...sample]);
    const colWidths = [30, 20, 12, 10, 26, 24, 12, 12, 12, 30];
    ws['!cols'] = colWidths.map(wch => ({ wch }));
    XLSX.utils.book_append_sheet(wb, ws, 'Stock Adjustment');

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

    const buf  = await file.arrayBuffer();
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

    const prog = {
      phase: 'Validating rows…',
      total: totalRows, done: 0,
      imported: 0, updated: 0, skipped: 0, failed: 0,
      errors: [], finished: false,
    };
    setImportProgress({ ...prog });

    const nameIndex = new Map();
    products.forEach(p => {
      const n = (p.name || p.productName || '').toLowerCase().trim();
      const c = (p.companyName || '').toLowerCase().trim();
      const t = (p.type     || '').toLowerCase().trim();
      const u = (p.unit     || '').toLowerCase().trim();

      nameIndex.set(`${n}::${c}::${t}::${u}`, p);
      if (!nameIndex.has(`${n}::${c}::${u}`)) nameIndex.set(`${n}::${c}::${u}`, p);
      if (!nameIndex.has(`${n}::${c}`))       nameIndex.set(`${n}::${c}`, p);
      if (!nameIndex.has(n))                  nameIndex.set(n, p);
    });

    const newGridRows = [];
    let imported = 0, updated = 0, skipped = 0, failed = 0;
    const errors = [];

    const processChunk = async (startIdx) => {
      const endIdx = Math.min(startIdx + IMPORT_CHUNK, totalRows);

      for (let i = startIdx; i < endIdx; i++) {
        const r   = dataRows[i];
        const rNo = i + 2;

        const nameVal    = String(r[colIdx.name]    ?? '').trim();
        const compVal    = String(r[colIdx.company]  ?? '').trim();
        const typeVal    = String(r[colIdx.type]     ?? '').trim();
        const unitVal    = String(r[colIdx.unit]     ?? '').trim();
        const expiryRaw  = colIdx.expiry >= 0 ? (r[colIdx.expiry] ?? '') : '';
        const qtyInRaw   = colIdx.qtyIn  >= 0 ? r[colIdx.qtyIn]  : '';
        const qtyOutRaw  = colIdx.qtyOut >= 0 ? r[colIdx.qtyOut] : '';
        const priceRaw   = colIdx.price  >= 0 ? r[colIdx.price]  : '';
        const remarksVal = colIdx.remarks >= 0 ? String(r[colIdx.remarks] ?? '').trim() : '';

        if (!nameVal) { errors.push({ row: rNo, msg: 'Product Name is required', data: r }); failed++; continue; }
        if (!compVal) { errors.push({ row: rNo, msg: 'Company Name is required', data: r }); failed++; continue; }

        let expiryVal = '';
        if (expiryRaw !== '' && expiryRaw != null) {
          if (expiryRaw instanceof Date) {
            if (!isNaN(expiryRaw.getTime())) {
              expiryVal = moment(expiryRaw).format('YYYY-MM-DD');
            } else {
              errors.push({ row: rNo, msg: `Invalid Expiry Date: ${expiryRaw}`, data: r }); failed++; continue;
            }
          } else {
            const rawStr = String(expiryRaw).trim();
            if (rawStr) {
              if (!isNaN(Number(rawStr))) {
                const d = XLSX.SSF.parse_date_code(Number(rawStr));
                if (d) {
                  expiryVal = `${d.y}-${String(d.m).padStart(2,'0')}-${String(d.d).padStart(2,'0')}`;
                } else {
                  errors.push({ row: rNo, msg: `Invalid Expiry Date serial: ${rawStr}`, data: r }); failed++; continue;
                }
              } else {
                const ACCEPTED_FORMATS = [
                  'YYYY-MM-DD', 'DD-MM-YYYY', 'DD/MM/YYYY', 'MM/DD/YYYY',
                  'MM-DD-YYYY', 'YYYY/MM/DD', 'D-M-YYYY', 'D/M/YYYY',
                  'M/D/YYYY', 'DD MMM YYYY', 'D MMM YYYY',
                ];
                const parsed = moment(rawStr, ACCEPTED_FORMATS, true);
                if (!parsed.isValid()) {
                  errors.push({ row: rNo, msg: `Invalid Expiry Date format "${rawStr}"`, data: r });
                  failed++; continue;
                }
                expiryVal = parsed.format('YYYY-MM-DD');
              }
            }
          }
        }

        const qtyIn  = parseFloat(qtyInRaw)  || 0;
        const qtyOut = parseFloat(qtyOutRaw) || 0;
        if (qtyIn < 0)  { errors.push({ row: rNo, msg: 'Quantity In cannot be negative', data: r }); failed++; continue; }
        if (qtyOut < 0) { errors.push({ row: rNo, msg: 'Quantity Out cannot be negative', data: r }); failed++; continue; }
        if (qtyIn > 0 && qtyOut > 0) { errors.push({ row: rNo, msg: 'Cannot have both Qty In and Qty Out', data: r }); failed++; continue; }

        const price = parseFloat(priceRaw) || 0;
        if (price < 0) { errors.push({ row: rNo, msg: 'Price cannot be negative', data: r }); failed++; continue; }

        const nLow = nameVal.toLowerCase().trim();
        const cLow = compVal.toLowerCase().trim();
        const tLow = typeVal.toLowerCase().trim();
        const uLow = unitVal.toLowerCase().trim();

        const product =
          nameIndex.get(`${nLow}::${cLow}::${tLow}::${uLow}`) ||
          nameIndex.get(`${nLow}::${cLow}::${uLow}`)           ||
          nameIndex.get(`${nLow}::${cLow}`)                    ||
          nameIndex.get(nLow);

        if (!product) {
          errors.push({ row: rNo, msg: `Product not found: "${nameVal}" / "${compVal}"`, data: r });
          failed++;
          continue;
        }

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
          _id:         null,
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
          _prevDelta:      0
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
        await new Promise(r => setTimeout(r, 10));
        await processChunk(endIdx);
      } else {
        prog.finished = true;
        setImportProgress({ ...prog });
        setGridRows(prev => {
          const existing = prev.filter(r => r.productId);
          const combined = [...existing, ...newGridRows, emptyRow()];
          return combined;
        });
      }
    };

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
      {/* Document Selector Modal */}
      <DocumentSelectorModal
        isOpen={showDocSelectorModal}
        onClose={() => setShowDocSelectorModal(false)}
        onSelectDoc={handleOpenDocument}
      />

      {/* Import Progress Modal */}
      {importProgress && (
        <ImportProgressModal
          progress={importProgress}
          onClose={() => setImportProgress(null)}
        />
      )}

      {/* Portal Dropdown */}
      {showPortal && (
        <ProductDropdownPortal
          anchorRef={productInputRef}
          suggestions={rowSuggestions}
          activeSug={activeSug}
          query={searchQuery}
          onSelect={(product) => applyProduct(focusedRowId, product)}
          onHover={(i) => {
            setActiveSug(i);
            activeSugRef.current = i;
          }}
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
                  <div className="flex items-center gap-3">
                    <h1 className="text-2xl md:text-3xl font-black tracking-tight">Stock Adjustment</h1>
                    {isEditing ? (
                      <span className="bg-blue-500/30 text-blue-100 border border-blue-300/40 px-3 py-1 rounded-full text-xs font-bold flex items-center gap-1.5 shadow-sm">
                        <FolderOpen className="w-3.5 h-3.5" /> Editing Document #{loadedDocNo}
                      </span>
                    ) : (
                      <span className="bg-amber-500/30 text-amber-100 border border-amber-300/40 px-3 py-1 rounded-full text-xs font-bold flex items-center gap-1.5 shadow-sm">
                        <PlusCircle className="w-3.5 h-3.5" /> New Adjustment (#{docNo})
                      </span>
                    )}
                  </div>
                  <p className="text-amber-100 text-xs mt-1 max-w-md">
                    Excel-style bulk entry — search products, fill quantities, edit existing documents, or press Enter to jump rows.
                  </p>
                </div>
              </div>

              {/* Header Buttons */}
              <div className="flex flex-wrap items-center gap-2">
                {/* New Adjustment Button */}
                <button
                  type="button"
                  onClick={startNewDocument}
                  className={`flex items-center gap-1.5 px-3.5 py-2 rounded-xl text-xs font-bold transition-all shadow-sm ${
                    !isEditing
                      ? 'bg-white text-amber-800 border border-white'
                      : 'bg-white/15 hover:bg-white/25 text-white border border-white/30'
                  }`}
                >
                  <PlusCircle className="w-3.5 h-3.5" />
                  New Adjustment
                </button>

                {/* Open Existing Document Button */}
                <button
                  type="button"
                  onClick={() => setShowDocSelectorModal(true)}
                  className={`flex items-center gap-1.5 px-3.5 py-2 rounded-xl text-xs font-bold transition-all shadow-sm ${
                    isEditing
                      ? 'bg-blue-600 hover:bg-blue-700 text-white border border-blue-400'
                      : 'bg-white/15 hover:bg-white/25 text-white border border-white/30'
                  }`}
                >
                  <FolderOpen className="w-3.5 h-3.5" />
                  Open Existing Document
                </button>

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
                  <div className={`h-10 px-3.5 border rounded-lg flex items-center font-black text-base ${
                    isEditing ? 'border-blue-200 bg-blue-50/50 text-blue-900' : 'border-amber-100 bg-amber-50/40 text-amber-800'
                  }`}>
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
                  className={`flex-1 h-10 text-white text-sm font-bold rounded-lg flex items-center justify-center gap-2 transition-all shadow-sm ${
                    isEditing
                      ? 'bg-blue-600 hover:bg-blue-700 disabled:bg-slate-100 disabled:text-slate-400'
                      : 'bg-amber-600 hover:bg-amber-700 disabled:bg-slate-100 disabled:text-slate-400'
                  }`}
                >
                  {loading ? (
                    <><RefreshCw className="w-4 h-4 animate-spin" /> {isEditing ? 'Updating…' : 'Saving…'}</>
                  ) : (
                    <><Save className="w-4 h-4" /> {isEditing ? `Update Document #${docNo}` : `Save Document #${docNo}`}</>
                  )}
                </button>
                <button
                  type="button"
                  onClick={startNewDocument}
                  title="Clear / New document"
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
                    <th className="px-2 py-2.5 text-left text-[10px] font-bold uppercase tracking-wider border-r border-slate-600 min-w-[140px]">Expiry Date (DD/MM/YYYY)</th>
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
