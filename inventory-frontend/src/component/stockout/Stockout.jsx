import React, { useState, useEffect, useRef, useMemo } from 'react';
import axios from 'axios';
import { getToken, getUserInfo } from '../../utils/auth';
import { Badge } from '../../components/ui/badge';
import { Alert, AlertDescription } from '../../components/ui/alert';
import { Plus, Trash2, Save, Package, AlertCircle, CheckCircle2, Search, X, Printer, Edit, Calendar, Building2, FileText } from 'lucide-react';
import moment from 'moment';
import { useNavigate } from 'react-router-dom';
import { PageHeader } from '../../components/ui/page-header';

const Stockout = () => {
  const navigate = useNavigate();
  const [stocks, setStocks] = useState([]);
  const [locations, setLocations] = useState([]);
  const [stockOutItems, setStockOutItems] = useState([]);
  const [alert, setAlert] = useState({ show: false, message: '', type: '' });
  const [docNo, setDocNo] = useState(1);
  const [loading, setLoading] = useState(false);
  const [date, setDate] = useState(moment().format('YYYY-MM-DD'));

  // Document-level state
  const [docLocationId, setDocLocationId] = useState('');
  const [docTrainerName, setDocTrainerName] = useState('');
  const [docDoctorName, setDocDoctorName] = useState(''); // Veterinarian
  const [storeIncharge, setStoreIncharge] = useState('');
  const [takenBy, setTakenBy] = useState('');
  const [comments, setComments] = useState('');

  // Form state
  const [formData, setFormData] = useState({
    stockId: '',
    quantity: '',
    sellingPrice: '',
    discountPercentage: ''
  });

  const isAdmin = useMemo(
    () => (getUserInfo()?.role || '').toLowerCase() === 'admin',
    []
  );

  const [formErrors, setFormErrors] = useState({});
  const [selectedStock, setSelectedStock] = useState(null);
  const [selectedLocation, setSelectedLocation] = useState(null);
  const [stockQuery, setStockQuery] = useState('');
  const [stockDropdownOpen, setStockDropdownOpen] = useState(false);
  const stockAutocompleteRef = useRef(null);
  const [activeStockSugIdx, setActiveStockSugIdx] = useState(0);

  const stockSuggestions = useMemo(() => {
    const q = (stockQuery || '').trim().toLowerCase();
    if (!q) return stocks.slice(0, 25);
    return stocks.filter(
      (s) => (s.productName || '').toLowerCase().includes(q) || (s.type || '').toLowerCase().includes(q)
    ).slice(0, 25);
  }, [stocks, stockQuery]);

  const handleSaveAndPrintRef = useRef(null);
  const loadingRef = useRef(loading);
  useEffect(() => {
    handleSaveAndPrintRef.current = handleSaveAndPrint;
    loadingRef.current = loading;
  });

  useEffect(() => {
    const handleGlobalKeyDown = (e) => {
      const isF10 = e.key === 'F10' || e.code === 'F10' || e.keyCode === 121;
      if (isF10) {
        e.preventDefault();
        e.stopPropagation();
        if (e.stopImmediatePropagation) e.stopImmediatePropagation();
        if (!loadingRef.current && typeof handleSaveAndPrintRef.current === 'function') {
          handleSaveAndPrintRef.current(false);
        }
      }
    };
    window.addEventListener('keydown', handleGlobalKeyDown, true);
    return () => window.removeEventListener('keydown', handleGlobalKeyDown, true);
  }, []);

  useEffect(() => {
    setActiveStockSugIdx(0);
  }, [stockQuery, stockSuggestions]);

  useEffect(() => {
    if (stockDropdownOpen && stockSuggestions.length > 0) {
      const activeEl = document.querySelector(`[data-stockout-sug-idx="${activeStockSugIdx}"]`);
      if (activeEl) {
        activeEl.scrollIntoView({ block: 'nearest' });
      }
    }
  }, [activeStockSugIdx, stockDropdownOpen, stockSuggestions]);

  // Edit item state
  const [editingItem, setEditingItem] = useState(null);
  const [editFormData, setEditFormData] = useState({
    stockId: '',
    productId: '',
    quantity: '',
    sellingPrice: '',
    discountPercentage: '',
    locationId: '',
    doctorName: '',
    trainerName: ''
  });
  const [editFormErrors, setEditFormErrors] = useState({});
  const [editSelectedStock, setEditSelectedStock] = useState(null);
  const [editStockQuery, setEditStockQuery] = useState('');
  const [editStockDropdownOpen, setEditStockDropdownOpen] = useState(false);
  const editStockAutocompleteRef = useRef(null);

  const accessToken = getToken();

  const editStockSuggestions = useMemo(() => {
    const q = (editStockQuery || '').trim().toLowerCase();
    if (!q) return stocks.slice(0, 25);
    return stocks.filter(
      (s) => (s.productName || '').toLowerCase().includes(q) || (s.type || '').toLowerCase().includes(q)
    ).slice(0, 25);
  }, [stocks, editStockQuery]);

  useEffect(() => {
    fetchStocks();
    fetchLocations();
    fetchDocNo();
    // eslint-disable-next-line
  }, []);

  // Load draft on mount
  useEffect(() => {
    const savedDraft = localStorage.getItem('stockout_draft');
    if (savedDraft) {
      try {
        const draft = JSON.parse(savedDraft);
        // if (draft.date) setDate(draft.date);
        if (draft.docLocationId) setDocLocationId(draft.docLocationId);
        if (draft.docTrainerName) setDocTrainerName(draft.docTrainerName);
        if (draft.stockOutItems) setStockOutItems(draft.stockOutItems);
      } catch (e) {
        console.error("Error loading draft from localStorage:", e);
      }
    }
  }, []);

  // Save draft on changes
  useEffect(() => {
    localStorage.setItem('stockout_draft', JSON.stringify({
      date,
      docLocationId,
      docTrainerName,
      stockOutItems
    }));
  }, [date, docLocationId, docTrainerName, stockOutItems]);

  useEffect(() => {
    if (formData.stockId) {
      const stock = stocks.find(s => s._id === formData.stockId);
      setSelectedStock(stock || null);
      if (stock) {
        setStockQuery(`${stock.productName}${stock.expiry ? ` | Exp: ${moment(stock.expiry).format('DD/MM/YY')}` : ''} (Qty: ${stock.quantity})`);
        const sp = stock.sellingPrice ?? 0;
        setFormData(prev => (
          prev.sellingPrice === String(sp) ? prev : { ...prev, sellingPrice: String(sp) }
        ));
      }
    } else {
      setSelectedStock(null);
      setStockQuery('');
    }
  }, [formData.stockId, stocks]);

  useEffect(() => {
    const handleClickOutside = (e) => {
      if (stockAutocompleteRef.current && !stockAutocompleteRef.current.contains(e.target)) {
        setStockDropdownOpen(false);
      }
      if (editStockAutocompleteRef.current && !editStockAutocompleteRef.current.contains(e.target)) {
        setEditStockDropdownOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const handleOpenEditModal = (item) => {
    const matchedStock = stocks.find(s => s._id === item.stockId || s.originalStockId === item.stockId) || null;
    setEditingItem(item);
    setEditFormData({
      stockId: item.stockId || '',
      productId: item.productId || item.stockId || '',
      quantity: String(item.quantity || ''),
      sellingPrice: String(item.sellingPrice ?? ''),
      discountPercentage: String(item.discountPercentage ?? '0'),
      locationId: item.locationId || docLocationId || '',
      doctorName: item.doctorName || docDoctorName || '',
      trainerName: item.trainerName || docTrainerName || ''
    });
    setEditFormErrors({});
    setEditSelectedStock(matchedStock);
    setEditStockQuery(item.productName || '');
    setEditStockDropdownOpen(false);
  };

  const handleCloseEditModal = () => {
    setEditingItem(null);
    setEditFormData({
      stockId: '',
      productId: '',
      quantity: '',
      sellingPrice: '',
      discountPercentage: '',
      locationId: '',
      doctorName: '',
      trainerName: ''
    });
    setEditFormErrors({});
    setEditSelectedStock(null);
    setEditStockQuery('');
    setEditStockDropdownOpen(false);
  };

  const handleSelectEditStock = (stock) => {
    setEditFormData(prev => ({
      ...prev,
      stockId: stock.originalStockId || stock._id,
      productId: stock.productId || stock.originalStockId || stock._id,
      sellingPrice: String(stock.sellingPrice ?? prev.sellingPrice)
    }));
    setEditSelectedStock(stock);
    setEditStockQuery(`${stock.productName}${stock.expiry ? ` | Exp: ${moment(stock.expiry).format('DD/MM/YY')}` : ''} (Qty: ${stock.quantity})`);
    setEditStockDropdownOpen(false);
    if (editFormErrors.stockId) setEditFormErrors(prev => ({ ...prev, stockId: '' }));
  };

  const handleUpdateItem = (e) => {
    if (e) e.preventDefault();
    const errors = {};
    if (!editFormData.quantity || Number(editFormData.quantity) <= 0) {
      errors.quantity = 'Please enter a valid quantity';
    }
    if (editFormData.discountPercentage !== '' && (Number(editFormData.discountPercentage) < 0 || Number(editFormData.discountPercentage) > 100)) {
      errors.discountPercentage = 'Discount percentage must be between 0 and 100';
    }

    const availableQty = editSelectedStock?.quantity;
    if (availableQty !== undefined && Number(editFormData.quantity) > availableQty) {
      errors.quantity = `Only ${availableQty} units available`;
    }

    if (Object.keys(errors).length > 0) {
      setEditFormErrors(errors);
      return;
    }

    const qty = parseInt(editFormData.quantity, 10);
    const price = parseFloat(editFormData.sellingPrice) || editSelectedStock?.sellingPrice || editingItem.sellingPrice || 0;
    const discPct = parseFloat(editFormData.discountPercentage) || 0;
    const itemTotal = Math.round((qty * price) * 100) / 100;
    const discountAmount = Math.round((itemTotal * discPct / 100) * 100) / 100;
    const netTotal = Math.round((itemTotal - discountAmount) * 100) / 100;

    const selectedLoc = locations.find(l => l._id === editFormData.locationId);

    const updatedItems = stockOutItems.map(i => {
      if (i.id === editingItem.id) {
        return {
          ...i,
          stockId: editSelectedStock?.originalStockId || editSelectedStock?._id || editFormData.stockId || i.stockId,
          productId: editSelectedStock?.productId || editSelectedStock?.originalStockId || editSelectedStock?._id || editFormData.productId || i.productId,
          productName: editSelectedStock?.productName || i.productName,
          companyName: editSelectedStock?.companyName || i.companyName,
          type: editSelectedStock?.type || i.type,
          unit: editSelectedStock?.unit || i.unit,
          locationId: editFormData.locationId || i.locationId,
          location: selectedLoc ? selectedLoc.name : i.location,
          quantity: qty,
          sellingPrice: price,
          discountPercentage: discPct,
          discountAmount: discountAmount,
          itemTotal: itemTotal,
          netTotal: netTotal,
          total: netTotal,
          expiry: editSelectedStock?.expiry || i.expiry,
          doctorName: editFormData.doctorName,
          trainerName: editFormData.trainerName
        };
      }
      return i;
    });

    setStockOutItems(updatedItems);
    handleCloseEditModal();
    showAlert('Item updated successfully', 'success');
  };

  useEffect(() => {
    if (docLocationId) {
      const location = locations.find(l => l._id === docLocationId);
      setSelectedLocation(location || null);
      if (location) {
        setDocTrainerName(location.trainerName || '');
        setDocDoctorName(location.doctorName || '');
      }
    } else {
      setSelectedLocation(null);
      setDocTrainerName('');
      setDocDoctorName('');
    }
  }, [docLocationId, locations]);

  const fetchStocks = () => {
    axios.get(`${process.env.REACT_APP_DEVELOPMENT}/api/stock/getAllStocks`, {
      headers: { token: accessToken }
    })
      .then((res) => {
        // Group stocks by product name and expiry
        const stockMap = new Map();

        (res.data.result || []).forEach(stock => {
          if (stock.totalQuantity > 0 && stock.expiryArray && stock.expiryArray.length > 0) {
            stock.expiryArray.forEach(expiryItem => {
              if (expiryItem.quantity > 0) {
                const productName = stock.name || (stock.product?.name) || 'Unknown Product';
                const expiryDate = expiryItem.expiry ? moment(expiryItem.expiry).format('YYYY-MM-DD') : 'no-expiry';
                const mapKey = `${productName}_${expiryDate}`;

                if (stockMap.has(mapKey)) {
                  // Add to existing entry
                  const existing = stockMap.get(mapKey);
                  existing.quantity += expiryItem.quantity || 0;
                  existing.stockIds.push(stock._id);
                } else {
                  // Create new entry
                  stockMap.set(mapKey, {
                    _id: `${stock._id}_${expiryDate}`,
                    originalStockId: stock._id,
                    stockIds: [stock._id],
                    productName: productName,
                    companyName: stock.product?.companyName || '',
                    type: stock.product?.type || '',
                    unit: stock.product?.unit || '',
                    quantity: expiryItem.quantity || 0,
                    purchasingPrice: expiryItem.purchasingPrice ?? 0,
                    sellingPrice: expiryItem.sellingPrice || stock.sellingPrice || stock.product?.sellingPrice || 0,
                    productId: stock.product?._id || stock.product,
                    expiry: expiryItem.expiry,
                    expiryArray: stock.expiryArray || []
                  });
                }
              }
            });
          }
        });

        const availableStocks = Array.from(stockMap.values());
        setStocks(availableStocks);
      })
      .catch((err) => console.error('Error fetching stocks:', err));
  };

  const fetchLocations = () => {
    axios.get(`${process.env.REACT_APP_DEVELOPMENT}/api/location/getAllLocations`, {
      headers: { token: accessToken }
    })
      .then((res) => setLocations(res.data.result || []))
      .catch((err) => console.error('Error fetching locations:', err));
  };

  const fetchDocNo = () => {
    axios.get(`${process.env.REACT_APP_DEVELOPMENT}/api/stockOut/getStockOutDocNo`, {
      headers: { token: accessToken }
    })
      .then((res) => {
        if (res.data.result && res.data.result.length > 0) {
          setDocNo(res.data.result[0].docNo);
        }
      })
      .catch((err) => console.error('Error fetching doc number:', err));
  };

  const showAlert = (message, type) => {
    setAlert({ show: true, message, type });
    setTimeout(() => setAlert({ show: false, message: '', type: '' }), 4000);
  };

  const handleInputChange = (field, value) => {
    setFormData(prev => ({ ...prev, [field]: value }));
    if (formErrors[field]) {
      setFormErrors(prev => ({ ...prev, [field]: '' }));
    }
  };

  const getStockDisplayLabel = (stock) =>
    `${stock.productName}${stock.expiry ? ` | Exp: ${moment(stock.expiry).format('DD/MM/YY')}` : ''} (Qty: ${stock.quantity})`;

  const handleSelectStock = (stock) => {
    const sellingPrice = stock.sellingPrice ?? 0;
    setFormData(prev => ({
      ...prev,
      stockId: stock._id,
      sellingPrice: String(sellingPrice)
    }));
    setSelectedStock(stock);
    setStockQuery(getStockDisplayLabel(stock));
    setStockDropdownOpen(false);
    if (formErrors.stockId) setFormErrors(prev => ({ ...prev, stockId: '' }));
    setTimeout(() => document.getElementById('quantity')?.focus(), 50);
  };

  const clearStock = () => {
    setFormData(prev => ({ ...prev, stockId: '', sellingPrice: '' }));
    setSelectedStock(null);
    setStockQuery('');
    setStockDropdownOpen(false);
    document.getElementById('stock-input')?.focus();
  };

  const validateForm = () => {
    const errors = {};

    if (!formData.stockId) errors.stockId = 'Please select a product';
    if (!docLocationId) errors.locationId = 'Please select a location';
    if (!formData.quantity || formData.quantity <= 0) errors.quantity = 'Please enter valid quantity';

    if (selectedStock && formData.quantity > selectedStock.quantity) {
      errors.quantity = `Only ${selectedStock.quantity} units available`;
    }

    setFormErrors(errors);
    return Object.keys(errors).length === 0;
  };

  const addItem = (e) => {
    if (e) e.preventDefault();

    if (!validateForm()) {
      showAlert('Please fill all required fields correctly', 'error');
      return;
    }

    const qty = parseInt(formData.quantity);
    const price = parseFloat(formData.sellingPrice) || selectedStock.sellingPrice || 0;
    const discPct = parseFloat(formData.discountPercentage) || 0;
    const itemTotal = Math.round((qty * price) * 100) / 100;
    const discountAmount = Math.round((itemTotal * discPct / 100) * 100) / 100;
    const netTotal = Math.round((itemTotal - discountAmount) * 100) / 100;

    const newItem = {
      id: Date.now(),
      stockId: selectedStock.originalStockId || selectedStock._id, // Use originalStockId for grouped items
      productId: selectedStock.productId || selectedStock.originalStockId || selectedStock._id,
      productName: selectedStock.productName, // frontend display only
      companyName: selectedStock.companyName, // frontend display only
      type: selectedStock.type,               // frontend display only
      unit: selectedStock.unit,               // frontend display only
      locationId: docLocationId,
      location: selectedLocation ? selectedLocation.name : '', // frontend display only
      quantity: qty,
      sellingPrice: price,
      discountPercentage: discPct,
      discountAmount: discountAmount,
      itemTotal: itemTotal,
      netTotal: netTotal,
      total: netTotal,
      expiry: selectedStock.expiry,           // Auto-selected expiry from FIFO
      doctorName: docDoctorName,
      trainerName: docTrainerName
    };

    setStockOutItems([...stockOutItems, newItem]);

    setFormData({
      stockId: '',
      quantity: '',
      sellingPrice: '',
      discountPercentage: ''
    });
    setFormErrors({});
    setStockQuery('');
    setSelectedStock(null);

    setTimeout(() => {
      document.getElementById('stock-input')?.focus();
    }, 100);
  };

  const handleSaveAndPrint = (isPrintFlow) => {
    // 1. Validation
    if (!docLocationId) {
      showAlert('Please select a location', 'error');
      return;
    }
    if (stockOutItems.length === 0) {
      showAlert('Please add at least one item to the list', 'error');
      return;
    }

    setLoading(true);

    // 2. Save Stock OUT records sequentially to prevent race conditions
    let saveChain = Promise.resolve();
    stockOutItems.forEach(item => {
      saveChain = saveChain.then(() =>
        axios.post(
          `${process.env.REACT_APP_DEVELOPMENT}/api/stockOut/stockOuts`,
          {
            docNo: docNo,
            date: date,
            stockId: item.stockId,
            productId: item.productId || item.stockId,
            locationId: item.locationId,
            quantity: item.quantity,
            sellingPrice: item.sellingPrice ?? 0,
            discountPercentage: item.discountPercentage !== undefined ? item.discountPercentage : 0,
            discountAmount: item.discountAmount ?? 0,
            itemTotal: item.itemTotal ?? 0,
            netTotal: item.netTotal ?? 0,
            doctorName: item.doctorName || '',
            trainerName: item.trainerName || ''
          },
          { headers: { token: accessToken } }
        )
      );
    });

    saveChain
      .then(() => {
        // 3. Save PDF record in the database
        const selectedLoc = locations.find(l => l._id === docLocationId);
        const pdfPayload = {
          docNo: docNo,
          date: date,
          locationId: docLocationId,
          locationName: selectedLoc ? selectedLoc.name : '',
          trainerName: docTrainerName,
          storeIncharge: storeIncharge,
          takenBy: takenBy,
          veterinarian: docDoctorName,
          comments: comments,
          items: stockOutItems.map(item => ({
            productId: item.productId,
            productName: item.companyName ? `${item.productName} (${item.companyName})` : item.productName,
            unit: item.unit || '',
            quantity: item.quantity,
            sellingPrice: item.sellingPrice,
            discountPercentage: item.discountPercentage || 0,
            discountAmount: item.discountAmount || 0,
            itemTotal: item.itemTotal || (item.quantity * item.sellingPrice),
            netTotal: item.netTotal || (item.quantity * item.sellingPrice - (item.discountAmount || 0))
          }))
        };

        return axios.post(
          `${process.env.REACT_APP_DEVELOPMENT}/api/stockOutPdf`,
          pdfPayload,
          { headers: { token: accessToken } }
        );
      })
      .then((pdfRes) => {
        const savedPdf = pdfRes.data.data;
        showAlert('Stock Out and PDF records saved successfully! 🎉', 'success');

        // Clear states and localStorage
        setStockOutItems([]);
        setStoreIncharge('');
        setTakenBy('');
        setComments('');
        setFormData({
          stockId: '',
          quantity: '',
          sellingPrice: '',
          discountPercentage: ''
        });
        setStockQuery('');
        setSelectedStock(null);
        localStorage.removeItem('stockout_draft');

        fetchDocNo();
        fetchStocks(); // Refresh stocks
        setLoading(false);

        // Redirect to exact design print view
        navigate(`/stockoutpdf/${savedPdf._id}?autoPrint=${isPrintFlow}`);
      })
      .catch((err) => {
        showAlert(err.response?.data?.message || 'Failed to save stock out transaction.', 'error');
        console.error(err);
        setLoading(false);
      });
  };


  const getTotalQuantity = () => {
    return stockOutItems.reduce((sum, item) => sum + item.quantity, 0);
  };

  const getSubTotal = () => {
    return stockOutItems.reduce((sum, item) => sum + (item.itemTotal !== undefined ? item.itemTotal : (item.quantity * item.sellingPrice)), 0);
  };

  const getTotalDiscount = () => {
    return stockOutItems.reduce((sum, item) => sum + (item.discountAmount || 0), 0);
  };

  const getGrandTotal = () => {
    return stockOutItems.reduce((sum, item) => sum + (item.netTotal !== undefined ? item.netTotal : (item.quantity * item.sellingPrice - (item.discountAmount || 0))), 0);
  };

  return (
    <div className="ph-page space-y-6">
      <PageHeader
        title="Stock Out Dispensing Console"
        subtitle="Dispense medications to wards, facilities, or departments with real-time inventory balances"
        badge={
          <Badge variant="teal" className="ml-2 font-mono text-xs">
            Doc #{docNo}
          </Badge>
        }
      >
        <div className="flex items-center gap-2 text-xs text-[var(--ph-text-secondary)] bg-[var(--ph-surface)] px-3 py-1.5 rounded-lg border border-[var(--ph-border)]">
          <Calendar className="w-3.5 h-3.5 text-[var(--ph-teal)]" />
          <span>Dispatch Date: <strong>{date}</strong></span>
        </div>
      </PageHeader>

      {/* Financial Summary Strip */}
      {isAdmin && (
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          <div className="ph-card p-4 border border-[var(--ph-border)] flex items-center justify-between">
            <div>
              <span className="text-xs uppercase font-semibold text-[var(--ph-text-secondary)]">Gross Subtotal</span>
              <div className="text-xl font-bold text-[var(--ph-text)] mt-1">QR {getSubTotal().toFixed(2)}</div>
            </div>
            <Badge variant="outline" className="text-xs font-mono">Gross</Badge>
          </div>
          <div className="ph-card p-4 border border-[var(--ph-border)] flex items-center justify-between">
            <div>
              <span className="text-xs uppercase font-semibold text-amber-600 dark:text-amber-400">Total Deductions</span>
              <div className="text-xl font-bold text-amber-600 dark:text-amber-400 mt-1">QR {getTotalDiscount().toFixed(2)}</div>
            </div>
            <Badge variant="warning" className="text-xs font-mono">Discount</Badge>
          </div>
          <div className="ph-card p-4 border border-emerald-200 dark:border-emerald-900/50 bg-emerald-50/40 dark:bg-emerald-950/20 flex items-center justify-between">
            <div>
              <span className="text-xs uppercase font-semibold text-emerald-800 dark:text-emerald-300">Net Payable Total</span>
              <div className="text-2xl font-black text-emerald-700 dark:text-emerald-400 mt-0.5">QR {getGrandTotal().toFixed(2)}</div>
            </div>
            <Badge variant="success" className="text-xs font-mono font-bold">Net Total</Badge>
          </div>
        </div>
      )}

      {/* Alert */}
      {alert.show && (
        <Alert className={`animate-in fade-in ${alert.type === 'success' ? 'bg-emerald-50 text-emerald-800 border-emerald-200 dark:bg-emerald-950/40 dark:text-emerald-300' : 'bg-rose-50 text-rose-800 border-rose-200 dark:bg-rose-950/40 dark:text-rose-300'}`}>
          <div className="flex items-center gap-2">
            {alert.type === 'success' ? (
              <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
            ) : (
              <AlertCircle className="w-4 h-4 text-rose-600 shrink-0" />
            )}
            <AlertDescription className="text-xs sm:text-sm font-medium">
              {alert.message}
            </AlertDescription>
          </div>
        </Alert>
      )}

      {/* Facility & Dispensing Destination */}
      <div className="ph-card shadow-sm border border-[var(--ph-border)] overflow-hidden">
        <div className="bg-[var(--ph-surface-2)] border-b border-[var(--ph-border)] px-5 py-3.5 flex items-center gap-2">
          <Building2 className="w-4 h-4 text-[var(--ph-teal)]" />
          <h2 className="font-semibold text-sm text-[var(--ph-text)]">
            Facility & Dispensing Destination
          </h2>
        </div>
        <div className="p-5 grid grid-cols-12 gap-4">
          {/* Row 1: Receiving Facility / Location (50%) */}
          <div className="col-span-12 md:col-span-6">
            <label className="block text-xs font-semibold text-[var(--ph-text)] mb-1.5">
              Receiving Facility / Location *
            </label>
            <select
              id="docLocationId"
              value={docLocationId}
              onChange={(e) => setDocLocationId(e.target.value)}
              className={`w-full h-10 px-3 text-xs sm:text-sm bg-[var(--ph-surface)] border rounded-lg focus:ring-2 focus:ring-[var(--ph-navy)]/30 focus:border-[var(--ph-navy)] focus:outline-none transition-colors ${formErrors.locationId && !docLocationId ? 'border-rose-500' : 'border-[var(--ph-border)]'
                }`}
            >
              <option value="">Select Target Location</option>
              {locations.map((location) => (
                <option key={location._id} value={location._id}>
                  {location.name}
                </option>
              ))}
            </select>
          </div>

          {/* Row 1: Supervisor / Trainer Name (50%) */}
          <div className="col-span-12 md:col-span-6">
            <label className="block text-xs font-semibold text-[var(--ph-text)] mb-1.5">
              Supervisor / Trainer Name
            </label>
            <input
              type="text"
              value={docTrainerName}
              onChange={(e) => setDocTrainerName(e.target.value)}
              placeholder="e.g. Dr. Jane Doe"
              className="w-full h-10 px-3 text-xs sm:text-sm bg-[var(--ph-surface)] border border-[var(--ph-border)] rounded-lg focus:ring-2 focus:ring-[var(--ph-navy)]/30 focus:border-[var(--ph-navy)] focus:outline-none transition-colors"
            />
          </div>

          {/* Row 2: Prescribing Doctor / Veterinarian (60% desktop) */}
          <div className="col-span-12 md:col-span-6 lg:col-span-7">
            <label className="block text-xs font-semibold text-[var(--ph-text)] mb-1.5">
              Prescribing Doctor / Veterinarian
            </label>
            <input
              type="text"
              value={docDoctorName}
              onChange={(e) => setDocDoctorName(e.target.value)}
              placeholder="e.g. Dr. Robert Smith"
              className="w-full h-10 px-3 text-xs sm:text-sm bg-[var(--ph-surface)] border border-[var(--ph-border)] rounded-lg focus:ring-2 focus:ring-[var(--ph-navy)]/30 focus:border-[var(--ph-navy)] focus:outline-none transition-colors"
            />
          </div>

          {/* Row 2: Transaction Date (40% desktop) */}
          <div className="col-span-12 md:col-span-6 lg:col-span-5">
            <label className="block text-xs font-semibold text-[var(--ph-text)] mb-1.5">
              Transaction Date
            </label>
            <input
              type="date"
              value={date}
              onChange={(e) => setDate(e.target.value)}
              className="w-full h-10 px-3 text-xs sm:text-sm bg-[var(--ph-surface)] border border-[var(--ph-border)] rounded-lg focus:ring-2 focus:ring-[var(--ph-navy)]/30 focus:border-[var(--ph-navy)] focus:outline-none transition-colors"
            />
          </div>
        </div>
      </div>

      {/* Fast Item Entry Form */}
      <div className="ph-card shadow-sm border border-[var(--ph-border)] overflow-visible relative z-30">
        <div className="bg-[var(--ph-surface-2)] border-b border-[var(--ph-border)] px-5 py-3.5 flex flex-wrap items-center justify-between gap-3 rounded-t-xl">
          <div className="flex items-center gap-2">
            <Package className="w-4 h-4 text-[var(--ph-teal)]" />
            <h2 className="font-semibold text-sm text-[var(--ph-text)]">
              Dispense Line Entry
            </h2>
          </div>
          <div className="flex items-center gap-2 text-xs text-[var(--ph-text-secondary)]">
            <span className="px-2 py-0.5 bg-[var(--ph-surface)] border border-[var(--ph-border)] rounded text-[11px] font-mono">Tab: Next</span>
            <span className="px-2 py-0.5 bg-[var(--ph-surface)] border border-[var(--ph-border)] rounded text-[11px] font-mono">Enter: Add Item</span>
          </div>
        </div>

        <form onSubmit={addItem} className="p-5">
          <div className="grid grid-cols-12 gap-3.5">
            {/* Product – type-ahead autocomplete (Prioritized width) */}
            <div className="col-span-12 lg:col-span-6 relative" ref={stockAutocompleteRef}>
              <label className="block text-xs font-semibold text-[var(--ph-text)] mb-1.5">
                Medication / Stock Batch *
              </label>
              <div className="relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-[var(--ph-muted)] pointer-events-none" />
                <input
                  id="stock-input"
                  type="text"
                  value={stockQuery}
                  onChange={(e) => {
                    setStockQuery(e.target.value);
                    if (!e.target.value) {
                      setFormData(prev => ({ ...prev, stockId: '' }));
                      setSelectedStock(null);
                    }
                    setStockDropdownOpen(true);
                  }}
                  onFocus={() => setStockDropdownOpen(true)}
                  onKeyDown={(e) => {
                    if (e.key === 'ArrowDown') {
                      e.preventDefault();
                      if (!stockDropdownOpen) setStockDropdownOpen(true);
                      else {
                        setActiveStockSugIdx(prev => Math.min(prev + 1, stockSuggestions.length - 1));
                      }
                    } else if (e.key === 'ArrowUp') {
                      e.preventDefault();
                      if (!stockDropdownOpen) setStockDropdownOpen(true);
                      else {
                        setActiveStockSugIdx(prev => Math.max(prev - 1, 0));
                      }
                    } else if (e.key === 'Enter') {
                      if (stockDropdownOpen && stockSuggestions.length > 0) {
                        e.preventDefault();
                        e.stopPropagation();
                        const item = stockSuggestions[activeStockSugIdx] || stockSuggestions[0];
                        if (item) handleSelectStock(item);
                      }
                    } else if (e.key === 'Escape') {
                      e.preventDefault();
                      setStockDropdownOpen(false);
                      if (!formData.stockId) setStockQuery('');
                    } else if (e.key === 'Tab') {
                      setStockDropdownOpen(false);
                    }
                  }}
                  placeholder="Search medication by name, brand, batch..."
                  autoComplete="off"
                  className={`w-full h-10 pl-9.5 pr-8 text-xs sm:text-sm bg-[var(--ph-surface)] border rounded-lg focus:outline-none focus:ring-2 focus:ring-[var(--ph-navy)]/30 focus:border-[var(--ph-navy)] transition-colors ${formErrors.stockId ? 'border-rose-500' : 'border-[var(--ph-border)]'
                    }`}
                />
                {selectedStock && (
                  <button
                    type="button"
                    onClick={clearStock}
                    className="absolute right-2.5 top-1/2 -translate-y-1/2 p-1 text-[var(--ph-muted)] hover:text-[var(--ph-text)] rounded-full hover:bg-[var(--ph-surface-2)] transition-colors"
                    aria-label="Clear product"
                  >
                    <X className="w-3.5 h-3.5" />
                  </button>
                )}
                {stockDropdownOpen && (
                  <div className="absolute z-[70] left-0 top-[calc(100%+4px)] w-full min-w-full sm:min-w-[460px] max-w-[95vw] max-h-72 overflow-y-auto bg-[var(--ph-surface)] border border-[var(--ph-border)] rounded-xl shadow-2xl py-1 text-xs divide-y divide-[var(--ph-border)]/40">
                    {stockSuggestions.length === 0 ? (
                      <div className="px-4 py-5 text-center">
                        <Search className="w-6 h-6 mx-auto mb-1 text-[var(--ph-muted)] opacity-40" />
                        <p className="font-semibold text-[var(--ph-text)] text-xs">No matching products found</p>
                        <p className="text-[11px] text-[var(--ph-text-secondary)] mt-0.5">Try searching with a different name or batch</p>
                      </div>
                    ) : (
                      stockSuggestions.map((s, idx) => {
                        const active = idx === activeStockSugIdx;
                        return (
                          <div
                            key={s._id || s.originalStockId || idx}
                            data-stockout-sug-idx={idx}
                            onClick={() => handleSelectStock(s)}
                            className={`px-3.5 py-2.5 cursor-pointer flex items-center justify-between gap-3 border-l-4 transition-colors ${active
                                ? 'bg-[var(--ph-navy)]/10 dark:bg-[var(--ph-navy)]/25 border-[var(--ph-navy)]'
                                : 'border-transparent hover:bg-[var(--ph-surface-2)]'
                              }`}
                          >
                            <div className="min-w-0 flex-1">
                              <div className="font-semibold text-xs sm:text-sm text-[var(--ph-text)] whitespace-normal leading-snug">
                                {s.productName}
                              </div>
                              {s.companyName && (
                                <div className="text-[11px] text-[var(--ph-text-secondary)] mt-0.5">
                                  {s.companyName}
                                </div>
                              )}
                            </div>
                            <div className="flex flex-col sm:flex-row items-end sm:items-center gap-1.5 shrink-0 text-right">
                              <span className="text-[10px] font-semibold bg-emerald-50 dark:bg-emerald-950/50 text-emerald-700 dark:text-emerald-300 px-2 py-0.5 rounded-full border border-emerald-200 dark:border-emerald-800/60">
                                Available: {s.quantity} {s.unit || ''}
                              </span>
                              <span className="text-[10px] font-mono font-bold text-[var(--ph-text)] bg-[var(--ph-surface-2)] px-2 py-0.5 rounded-full border border-[var(--ph-border)]">
                                QR {(s.sellingPrice || 0).toFixed(2)}
                              </span>
                              {s.expiry && (
                                <span className="text-[10px] text-amber-700 dark:text-amber-300 bg-amber-50 dark:bg-amber-950/40 px-1.5 py-0.5 rounded border border-amber-200 dark:border-amber-800/40">
                                  Exp: {moment(s.expiry).format('DD/MM/YYYY')}
                                </span>
                              )}
                            </div>
                          </div>
                        );
                      })
                    )}
                  </div>
                )}
              </div>
            </div>

            {/* Quantity */}
            <div className="col-span-4 sm:col-span-4 lg:col-span-2">
              <label className="block text-xs font-semibold text-[var(--ph-text)] mb-1.5">
                Quantity *
              </label>
              <input
                id="quantity"
                type="number"
                value={formData.quantity}
                onChange={(e) => handleInputChange('quantity', e.target.value)}
                placeholder="0"
                min="1"
                max={selectedStock?.quantity || 999999}
                className={`w-full h-10 px-3 text-xs sm:text-sm bg-[var(--ph-surface)] border rounded-lg focus:outline-none focus:ring-2 focus:ring-[var(--ph-navy)]/30 focus:border-[var(--ph-navy)] font-semibold ${formErrors.quantity ? 'border-rose-500' : 'border-[var(--ph-border)]'
                  }`}
              />
            </div>

            {/* Product Discount (%) */}
            <div className="col-span-4 sm:col-span-4 lg:col-span-2">
              <label className="block text-xs font-semibold text-[var(--ph-text)] mb-1.5">
                Discount (%) <span className="text-[var(--ph-muted)] font-normal">(Opt)</span>
              </label>
              <div className="relative">
                <input
                  id="discountPercentage"
                  type="number"
                  min="0"
                  max="100"
                  step="any"
                  value={formData.discountPercentage}
                  onChange={(e) => {
                    const val = e.target.value;
                    if (val === '' || (parseFloat(val) >= 0 && parseFloat(val) <= 100)) {
                      handleInputChange('discountPercentage', val);
                    }
                  }}
                  placeholder="0"
                  className="w-full h-10 pl-3 pr-7 text-xs sm:text-sm bg-[var(--ph-surface)] border border-[var(--ph-border)] rounded-lg focus:ring-2 focus:ring-[var(--ph-navy)]/30 focus:border-[var(--ph-navy)] focus:outline-none font-semibold text-amber-700 dark:text-amber-400"
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') {
                      e.preventDefault();
                      addItem(e);
                    }
                  }}
                />
                <span className="absolute right-2.5 top-1/2 -translate-y-1/2 text-xs font-bold text-amber-500 pointer-events-none">%</span>
              </div>
            </div>

            {/* Net Line Total */}
            <div className="col-span-4 sm:col-span-4 lg:col-span-2">
              <label className="block text-xs font-semibold text-[var(--ph-text)] mb-1.5">
                Line Total
              </label>
              <div className="h-10 px-3 flex items-center justify-between bg-[var(--ph-surface-2)] border border-[var(--ph-border)] rounded-lg">
                <span className="text-xs text-[var(--ph-text-secondary)] font-medium">QR</span>
                <span className="text-xs sm:text-sm font-bold text-emerald-600 dark:text-emerald-400">
                  {selectedStock && formData.quantity
                    ? (() => {
                      const qty = parseFloat(formData.quantity) || 0;
                      const price = parseFloat(formData.sellingPrice) || selectedStock.sellingPrice || 0;
                      const discPct = parseFloat(formData.discountPercentage) || 0;
                      const itemTotal = qty * price;
                      const discAmt = (itemTotal * discPct) / 100;
                      return (itemTotal - discAmt).toFixed(2);
                    })()
                    : '0.00'}
                </span>
              </div>
            </div>
          </div>

          {/* Stock Info Bar */}
          {selectedStock && (
            <div className="mt-3 p-2.5 bg-[var(--ph-navy)]/5 border border-[var(--ph-navy)]/15 rounded-lg text-xs flex flex-wrap items-center gap-4 text-[var(--ph-text)]">
              <span>Type: <strong>{selectedStock.type || 'N/A'}</strong></span>
              <span>Unit: <strong>{selectedStock.unit || 'N/A'}</strong></span>
              <span>Price: <strong>QR {(formData.sellingPrice || selectedStock.sellingPrice || 0)}</strong></span>
              <span>Available in Lot: <strong className="text-[var(--ph-teal)]">{selectedStock.quantity}</strong></span>
              {selectedStock.expiry && (
                <span>Batch Expiry (FIFO): <strong className="text-amber-600 dark:text-amber-400">{moment(selectedStock.expiry).format('DD/MM/YYYY')}</strong></span>
              )}
            </div>
          )}

          {/* Action Ribbon */}
          <div className="mt-4 pt-3.5 border-t border-[var(--ph-border)] flex flex-wrap items-center justify-between gap-3">
            <div className="flex items-center gap-2.5">
              <button
                type="submit"
                className="px-4 py-2 bg-[var(--ph-navy)] text-white rounded-lg hover:bg-[var(--ph-navy-hover)] font-medium text-xs flex items-center gap-1.5 transition-colors"
              >
                <Plus className="w-3.5 h-3.5" />
                Add Item (Enter)
              </button>

              {stockOutItems.length > 0 && (
                <>
                  <button
                    type="button"
                    onClick={() => handleSaveAndPrint(false)}
                    disabled={loading}
                    className="px-4 py-2 bg-[var(--ph-teal)] text-white rounded-lg hover:bg-[var(--ph-teal-hover)] font-semibold text-xs flex items-center gap-1.5 shadow-xs transition-colors disabled:opacity-50"
                  >
                    <Save className="w-3.5 h-3.5" />
                    Save Dispatch
                  </button>

                  <button
                    type="button"
                    onClick={() => handleSaveAndPrint(true)}
                    disabled={loading}
                    className="px-4 py-2 bg-emerald-600 text-white rounded-lg hover:bg-emerald-700 font-semibold text-xs flex items-center gap-1.5 shadow-xs transition-colors disabled:opacity-50"
                  >
                    <Printer className="w-3.5 h-3.5" />
                    Save & Print Voucher
                  </button>
                </>
              )}
            </div>
          </div>
        </form>
      </div>

      {/* Staged Items List */}
      {stockOutItems.length > 0 && (
        <div className="ph-card shadow-sm border border-[var(--ph-border)] overflow-hidden">
          <div className="bg-[var(--ph-surface-2)] border-b border-[var(--ph-border)] px-4 py-3 flex items-center justify-between">
            <div className="flex items-center gap-2">
              <FileText className="w-4 h-4 text-[var(--ph-navy)]" />
              <h3 className="font-semibold text-sm text-[var(--ph-text)]">
                Staged Outbound Dispatch Items
              </h3>
            </div>
            <div className="flex items-center gap-3">
              <Badge variant="teal">
                {stockOutItems.length} Items • {getTotalQuantity()} Units
              </Badge>
              <button
                onClick={() => {
                  if (window.confirm('Clear all items from list?')) {
                    setStockOutItems([]);
                  }
                }}
                className="text-xs font-semibold text-rose-600 hover:text-rose-800"
              >
                Clear All
              </button>
            </div>
          </div>
          <div className="overflow-x-auto">
            <table className="ph-table w-full text-xs">
              <thead>
                <tr className="bg-[var(--ph-surface-2)] border-b border-[var(--ph-border)]">
                  <th className="px-3 py-3 text-left font-semibold text-gray-700">#</th>
                  <th className="px-3 py-3 text-left font-semibold text-gray-700">Product Name</th>
                  <th className="px-3 py-3 text-left font-semibold text-gray-700">Company</th>
                  <th className="px-3 py-3 text-left font-semibold text-gray-700">Unit</th>
                  <th className="px-3 py-3 text-left font-semibold text-gray-700">Location</th>
                  <th className="px-3 py-3 text-left font-semibold text-gray-700">Doctor</th>
                  <th className="px-3 py-3 text-left font-semibold text-gray-700">Trainer</th>
                  <th className="px-3 py-3 text-right font-semibold text-gray-700">Qty</th>
                  <th className="px-3 py-3 text-right font-semibold text-gray-700">Sell. Price</th>
                  <th className="px-3 py-3 text-right font-semibold text-gray-700">Total</th>
                  <th className="px-3 py-3 text-right font-semibold text-orange-700">Disc %</th>
                  <th className="px-3 py-3 text-right font-semibold text-orange-700">Disc Amt</th>
                  <th className="px-3 py-3 text-right font-semibold text-red-700">Net Total</th>
                  <th className="px-3 py-3 text-left font-semibold text-gray-700">Expiry (Auto)</th>
                  <th className="px-3 py-3 text-center font-semibold text-gray-700">Action</th>
                </tr>
              </thead>
              <tbody>
                {stockOutItems.map((item, index) => {
                  const itemTotal = item.itemTotal !== undefined ? item.itemTotal : (item.quantity * (item.sellingPrice || 0));
                  const discPct = item.discountPercentage || 0;
                  const discAmt = item.discountAmount !== undefined ? item.discountAmount : ((itemTotal * discPct) / 100);
                  const netTotal = item.netTotal !== undefined ? item.netTotal : (itemTotal - discAmt);

                  return (
                    <tr key={item.id} className="border-b hover:bg-gray-50">
                      <td className="px-3 py-3 font-medium text-gray-600">{index + 1}</td>
                      <td className="px-3 py-3 font-medium text-gray-900">{item.productName}</td>
                      <td className="px-3 py-3 text-gray-700">{item.companyName || '-'}</td>
                      <td className="px-3 py-3 text-gray-700">{item.unit || '-'}</td>
                      <td className="px-3 py-3">{item.location}</td>
                      <td className="px-3 py-3">{item.doctorName || '-'}</td>
                      <td className="px-3 py-3">{item.trainerName || '-'}</td>
                      <td className="px-3 py-3 text-right font-semibold text-gray-900">{item.quantity}</td>
                      <td className="px-3 py-3 text-right">QR{(item.sellingPrice ?? 0).toFixed(2)}</td>
                      <td className="px-3 py-3 text-right text-gray-700 font-medium">QR{itemTotal.toFixed(2)}</td>
                      <td className="px-3 py-3 text-right text-orange-700 font-medium">{discPct > 0 ? `${discPct}%` : '0%'}</td>
                      <td className="px-3 py-3 text-right text-orange-700 font-medium">QR{discAmt.toFixed(2)}</td>
                      <td className="px-3 py-3 text-right font-bold text-red-600">
                        QR{netTotal.toFixed(2)}
                      </td>
                      <td className="px-3 py-3">
                        {item.expiry ? moment(item.expiry).format('DD/MM/YYYY') : '-'}
                      </td>
                      <td className="px-3 py-3 text-center">
                        <div className="flex items-center justify-center gap-1">
                          <button
                            type="button"
                            onClick={() => handleOpenEditModal(item)}
                            className="p-1.5 text-blue-600 hover:bg-blue-50 rounded transition-colors"
                            title="Edit item"
                          >
                            <Edit className="w-4 h-4" />
                          </button>
                          <button
                            type="button"
                            onClick={() => {
                              setStockOutItems(stockOutItems.filter(i => i.id !== item.id));
                              showAlert('Item removed', 'success');
                            }}
                            className="p-1.5 text-red-600 hover:bg-red-50 rounded transition-colors"
                            title="Remove item"
                          >
                            <Trash2 className="w-4 h-4" />
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
              <tfoot className="bg-gray-50 font-semibold border-t-2 border-gray-300">
                <tr>
                  <td colSpan="9" className="px-4 py-2.5 text-right text-gray-700">Total:</td>
                  <td colSpan="6" className="px-4 py-2.5 text-right text-gray-900 font-bold">QR{getSubTotal().toFixed(2)}</td>
                </tr>
                {getTotalDiscount() > 0 && (
                  <tr>
                    <td colSpan="9" className="px-4 py-2 text-right text-orange-700">Total Discount:</td>
                    <td colSpan="6" className="px-4 py-2 text-right text-orange-700 font-bold">-QR{getTotalDiscount().toFixed(2)}</td>
                  </tr>
                )}
                <tr className="bg-red-50 text-red-800 text-base">
                  <td colSpan="9" className="px-4 py-3 text-right font-bold">Grand Total:</td>
                  <td colSpan="6" className="px-4 py-3 text-right font-black text-red-700">QR{getGrandTotal().toFixed(2)}</td>
                </tr>
              </tfoot>
            </table>
          </div>
        </div>
      )}

      {/* Edit Item Modal */}
      {editingItem && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4 overflow-y-auto">
          <div className="bg-white rounded-xl shadow-2xl max-w-lg w-full overflow-hidden animate-in fade-in duration-200">
            <div className="bg-gradient-to-r from-red-600 to-red-700 px-6 py-4 flex items-center justify-between text-white">
              <div className="flex items-center gap-2 font-semibold text-lg">
                <Edit className="w-5 h-5" />
                Edit Stock Out Item
              </div>
              <button
                type="button"
                onClick={handleCloseEditModal}
                className="text-white/80 hover:text-white p-1 rounded-lg hover:bg-white/10 transition-colors"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleUpdateItem} className="p-6 space-y-4">
              {/* Product Autocomplete */}
              <div className="relative" ref={editStockAutocompleteRef}>
                <label className="block text-xs font-semibold text-gray-800 mb-1">
                  Product *
                </label>
                <div className="relative">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400 pointer-events-none" />
                  <input
                    type="text"
                    value={editStockQuery}
                    onChange={(e) => {
                      setEditStockQuery(e.target.value);
                      setEditStockDropdownOpen(true);
                    }}
                    onFocus={() => setEditStockDropdownOpen(true)}
                    placeholder="Search product..."
                    className={`w-full h-10 pl-9 pr-8 text-sm border-2 rounded-lg shadow-sm focus:outline-none focus:ring-2 focus:ring-red-500 ${editFormErrors.stockId ? 'border-red-500 bg-red-50' : 'border-gray-300'}`}
                  />
                  {editStockQuery && (
                    <button
                      type="button"
                      onClick={() => {
                        setEditStockQuery('');
                        setEditFormData(prev => ({ ...prev, stockId: '' }));
                        setEditSelectedStock(null);
                      }}
                      className="absolute right-2 top-1/2 -translate-y-1/2 p-1 text-gray-400 hover:text-gray-600"
                    >
                      <X className="w-4 h-4" />
                    </button>
                  )}
                </div>
                {editFormErrors.stockId && <p className="text-xs text-red-500 mt-1">{editFormErrors.stockId}</p>}

                {editStockDropdownOpen && editStockSuggestions.length > 0 && (
                  <div className="absolute z-50 left-0 right-0 mt-1 bg-white border-2 border-gray-200 rounded-lg shadow-lg max-h-48 overflow-y-auto">
                    {editStockSuggestions.map((s) => (
                      <button
                        key={s._id}
                        type="button"
                        onClick={() => handleSelectEditStock(s)}
                        className="w-full px-3 py-2 text-left text-sm hover:bg-red-50 flex flex-col gap-0.5 border-b border-gray-50 last:border-0"
                      >
                        <span className="font-medium text-gray-900">{s.productName} | {s.companyName || 'N/A'}</span>
                        <span className="text-xs text-gray-500">
                          {s.expiry ? `Exp: ${moment(s.expiry).format('DD/MM/YY')}` : 'No expiry'} • Available: {s.quantity}
                        </span>
                      </button>
                    ))}
                  </div>
                )}
              </div>

              <div className="grid grid-cols-2 gap-4">
                {/* Sell Price */}
                <div>
                  <label className="block text-xs font-semibold text-gray-800 mb-1">
                    Sell. Price
                  </label>
                  <input
                    type="number"
                    value={editFormData.sellingPrice}
                    readOnly
                    tabIndex={-1}
                    placeholder="0.00"
                    className="w-full h-10 px-3 text-sm border-2 border-gray-300 rounded-lg bg-gray-100 text-gray-700 cursor-default font-medium text-right"
                  />
                </div>

                {/* Available Stock */}
                <div>
                  <label className="block text-xs font-semibold text-gray-800 mb-1">
                    Available Stock
                  </label>
                  <div className="h-10 px-3 flex items-center justify-center bg-blue-50 border-2 border-blue-300 rounded-lg">
                    <span className="text-sm font-bold text-blue-700">
                      {editSelectedStock?.quantity ?? 'N/A'}
                    </span>
                  </div>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4">
                {/* Issue Qty */}
                <div>
                  <label className="block text-xs font-semibold text-gray-800 mb-1">
                    Issue Qty *
                  </label>
                  <input
                    type="number"
                    min="1"
                    value={editFormData.quantity}
                    onChange={(e) => setEditFormData(prev => ({ ...prev, quantity: e.target.value }))}
                    className={`w-full h-10 px-3 text-sm border-2 rounded-lg focus:outline-none focus:ring-2 focus:ring-red-500 font-semibold ${editFormErrors.quantity ? 'border-red-500 bg-red-50' : 'border-gray-300'}`}
                  />
                  {editFormErrors.quantity && <p className="text-xs text-red-500 mt-1">{editFormErrors.quantity}</p>}
                </div>

                {/* Discount (%) */}
                <div>
                  <label className="block text-xs font-semibold text-gray-800 mb-1">
                    Discount (%)
                  </label>
                  <div className="relative">
                    <input
                      type="number"
                      min="0"
                      max="100"
                      step="any"
                      value={editFormData.discountPercentage}
                      onChange={(e) => {
                        const val = e.target.value;
                        if (val === '' || (parseFloat(val) >= 0 && parseFloat(val) <= 100)) {
                          setEditFormData(prev => ({ ...prev, discountPercentage: val }));
                        }
                      }}
                      placeholder="0%"
                      className="w-full h-10 pl-3 pr-7 text-sm border-2 border-orange-300 rounded-lg bg-orange-50/50 focus:ring-2 focus:ring-orange-500 focus:outline-none font-semibold text-orange-900"
                    />
                    <span className="absolute right-2.5 top-1/2 -translate-y-1/2 text-xs font-bold text-orange-500 pointer-events-none">%</span>
                  </div>
                  {editFormErrors.discountPercentage && <p className="text-xs text-red-500 mt-1">{editFormErrors.discountPercentage}</p>}
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4">
                {/* Location */}
                <div>
                  <label className="block text-xs font-semibold text-gray-800 mb-1">
                    Location
                  </label>
                  <select
                    value={editFormData.locationId}
                    onChange={(e) => {
                      const locId = e.target.value;
                      const selectedLoc = locations.find(l => l._id === locId);
                      setEditFormData(prev => ({
                        ...prev,
                        locationId: locId,
                        doctorName: selectedLoc?.doctorName || prev.doctorName,
                        trainerName: selectedLoc?.trainerName || prev.trainerName
                      }));
                    }}
                    className="w-full h-10 px-3 text-sm border-2 border-gray-300 rounded-lg bg-white focus:ring-2 focus:ring-red-500 focus:outline-none"
                  >
                    <option value="">Select Location</option>
                    {locations.map((loc) => (
                      <option key={loc._id} value={loc._id}>{loc.name}</option>
                    ))}
                  </select>
                </div>

                {/* Expiry Date (Auto) */}
                <div>
                  <label className="block text-xs font-semibold text-gray-800 mb-1">
                    Expiry (Auto)
                  </label>
                  <input
                    type="text"
                    value={editSelectedStock?.expiry ? moment(editSelectedStock.expiry).format('DD/MM/YYYY') : (editingItem.expiry ? moment(editingItem.expiry).format('DD/MM/YYYY') : 'N/A')}
                    readOnly
                    tabIndex={-1}
                    className="w-full h-10 px-3 text-sm border-2 border-gray-300 rounded-lg bg-gray-100 text-gray-700 cursor-default"
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4">
                {/* Doctor Name */}
                <div>
                  <label className="block text-xs font-semibold text-gray-800 mb-1">
                    Doctor Name
                  </label>
                  <input
                    type="text"
                    value={editFormData.doctorName}
                    onChange={(e) => setEditFormData(prev => ({ ...prev, doctorName: e.target.value }))}
                    placeholder="Doctor Name"
                    className="w-full h-10 px-3 text-sm border-2 border-gray-300 rounded-lg bg-white focus:ring-2 focus:ring-red-500 focus:outline-none"
                  />
                </div>

                {/* Trainer Name */}
                <div>
                  <label className="block text-xs font-semibold text-gray-800 mb-1">
                    Trainer Name
                  </label>
                  <input
                    type="text"
                    value={editFormData.trainerName}
                    onChange={(e) => setEditFormData(prev => ({ ...prev, trainerName: e.target.value }))}
                    placeholder="Trainer Name"
                    className="w-full h-10 px-3 text-sm border-2 border-gray-300 rounded-lg bg-white focus:ring-2 focus:ring-red-500 focus:outline-none"
                  />
                </div>
              </div>

              {/* Recalculated Net Total Preview */}
              <div>
                <label className="block text-xs font-semibold text-gray-800 mb-1">
                  Net Total Preview
                </label>
                <div className="h-10 px-3 flex items-center justify-between bg-red-50 border-2 border-red-300 rounded-lg">
                  <span className="text-xs text-red-600 font-semibold">QR</span>
                  <span className="text-sm font-bold text-red-700">
                    {(() => {
                      const q = parseFloat(editFormData.quantity) || 0;
                      const p = parseFloat(editFormData.sellingPrice) || editSelectedStock?.sellingPrice || editingItem.sellingPrice || 0;
                      const d = parseFloat(editFormData.discountPercentage) || 0;
                      const tot = q * p;
                      const disc = (tot * d) / 100;
                      return (tot - disc).toFixed(2);
                    })()}
                  </span>
                </div>
              </div>

              {/* Modal Action Buttons */}
              <div className="pt-4 flex justify-end gap-3 border-t">
                <button
                  type="button"
                  onClick={handleCloseEditModal}
                  className="px-5 py-2 text-sm font-semibold text-gray-700 bg-gray-100 hover:bg-gray-200 rounded-lg transition-colors"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="px-6 py-2 text-sm font-semibold text-white bg-red-600 hover:bg-red-700 rounded-lg shadow-md hover:shadow-lg transition-all"
                >
                  Update
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};

export default Stockout;
