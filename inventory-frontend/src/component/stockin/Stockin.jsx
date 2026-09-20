import React, { useState, useEffect, useRef, useMemo } from 'react';
import axios from 'axios';
import { getToken, getUserInfo } from '../../utils/auth';
import { Alert, AlertDescription } from '../../components/ui/alert';
import { Badge } from '../../components/ui/badge';
import { Plus, Trash2, Edit, Save, Package, AlertCircle, CheckCircle2, Search, X, Calendar, FileText } from 'lucide-react';
import moment from 'moment';
import { PageHeader } from '../../components/ui/page-header';

const Stockin = () => {
  const [products, setProducts] = useState([]);
  const [suppliers, setSuppliers] = useState([]);
  const [stockItems, setStockItems] = useState([]);
  const [alert, setAlert] = useState({ show: false, message: '', type: '' });
  const [docNo, setDocNo] = useState(1);
  const [loading, setLoading] = useState(false);
  const [date, setDate] = useState(moment().format('YYYY-MM-DD'));

  // Form state
  const [formData, setFormData] = useState({
    productId: '',
    supplierId: '',
    quantity: '',
    purchasingPrice: '',
    sellingPrice: '',
    expiry: null,
    supplierDocNo: ''
  });

  // Edit Modal State
  const [editingItem, setEditingItem] = useState(null);
  const [editFormData, setEditFormData] = useState({
    productId: '',
    supplierId: '',
    quantity: '',
    purchasingPrice: '',
    sellingPrice: '',
    expiry: '',
    supplierDocNo: ''
  });
  const [editFormErrors, setEditFormErrors] = useState({});
  const [editProductQuery, setEditProductQuery] = useState('');
  const [editProductDropdownOpen, setEditProductDropdownOpen] = useState(false);
  const editProductAutocompleteRef = useRef(null);

  const isAdmin = useMemo(
    () => (getUserInfo()?.role || '').toLowerCase() === 'admin',
    []
  );

  const [formErrors, setFormErrors] = useState({});
  const [selectedProduct, setSelectedProduct] = useState(null);
  const [selectedSupplier, setSelectedSupplier] = useState(null);
  const [productQuery, setProductQuery] = useState('');
  const [productDropdownOpen, setProductDropdownOpen] = useState(false);
  const [activeSugIdx, setActiveSugIdx] = useState(0);
  const productAutocompleteRef = useRef(null);

  const accessToken = getToken();

  const productSuggestions = useMemo(() => {
    const q = (productQuery || '').trim().toLowerCase();
    if (!q) return products.slice(0, 20);
    return products.filter(
      (p) => (p.name || '').toLowerCase().includes(q) || (p.companyName || '').toLowerCase().includes(q) || (p.sku || '').toLowerCase().includes(q)
    ).slice(0, 20);
  }, [products, productQuery]);

  useEffect(() => {
    setActiveSugIdx(0);
  }, [productQuery, productSuggestions]);

  useEffect(() => {
    if (productDropdownOpen && activeSugIdx >= 0) {
      const el = document.querySelector(`[data-stockin-sug-idx="${activeSugIdx}"]`);
      if (el) el.scrollIntoView({ block: 'nearest' });
    }
  }, [activeSugIdx, productDropdownOpen]);

  const editProductSuggestions = useMemo(() => {
    const q = (editProductQuery || '').trim().toLowerCase();
    if (!q) return products.slice(0, 20);
    return products.filter(
      (p) => (p.name || '').toLowerCase().includes(q) || (p.companyName || '').toLowerCase().includes(q)
    ).slice(0, 20);
  }, [products, editProductQuery]);

  useEffect(() => {
    fetchProducts();
    fetchSuppliers();
    fetchDocNo();
    // eslint-disable-next-line
  }, []);

  useEffect(() => {
    if (formData.productId) {
      const product = products.find(p => p._id === formData.productId);
      setSelectedProduct(product);
    } else {
      setSelectedProduct(null);
    }
  }, [formData.productId, products]);

  useEffect(() => {
    const handleClickOutside = (e) => {
      if (productAutocompleteRef.current && !productAutocompleteRef.current.contains(e.target)) {
        setProductDropdownOpen(false);
      }
      if (editProductAutocompleteRef.current && !editProductAutocompleteRef.current.contains(e.target)) {
        setEditProductDropdownOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  useEffect(() => {
    if (formData.supplierId) {
      const supplier = suppliers.find(s => s._id === formData.supplierId);
      setSelectedSupplier(supplier);
    } else {
      setSelectedSupplier(null);
    }
  }, [formData.supplierId, suppliers]);

  const fetchProducts = () => {
    axios.get(`${process.env.REACT_APP_DEVELOPMENT}/api/product/getAllProducts`, {
      headers: { token: accessToken }
    })
      .then((res) => setProducts(res.data.result || []))
      .catch((err) => console.error('Error fetching products:', err));
  };

  const fetchSuppliers = () => {
    axios.get(`${process.env.REACT_APP_DEVELOPMENT}/api/supplier/getAllSuppliers`, {
      headers: { token: accessToken }
    })
      .then((res) => setSuppliers(res.data.result || []))
      .catch((err) => console.error('Error fetching suppliers:', err));
  };

  const fetchDocNo = () => {
    axios.get(`${process.env.REACT_APP_DEVELOPMENT}/api/stockIn/getStockInDocNo`, {
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
    // Clear error for this field
    if (formErrors[field]) {
      setFormErrors(prev => ({ ...prev, [field]: '' }));
    }
  };

  const validateForm = () => {
    const errors = {};

    if (!formData.productId) errors.productId = 'Please select a product';
    if (!formData.supplierId) errors.supplierId = 'Please select a supplier';
    if (!formData.quantity || formData.quantity <= 0) errors.quantity = 'Please enter valid quantity';
    if (isAdmin && (!formData.purchasingPrice || formData.purchasingPrice <= 0)) {
      errors.purchasingPrice = 'Please enter valid purchasing price';
    }
    if (isAdmin && formData.sellingPrice !== '' && formData.sellingPrice <= 0) {
      errors.sellingPrice = 'Please enter valid selling price';
    }
    if (!formData.expiry) errors.expiry = 'Please select expiry date';
    if (!formData.supplierDocNo) errors.supplierDocNo = 'Please enter supplier document number';

    setFormErrors(errors);
    return Object.keys(errors).length === 0;
  };

  const addItem = (e) => {
    if (e) e.preventDefault();

    if (!validateForm()) {
      showAlert('Please fill all required fields correctly', 'error');
      return;
    }

    const newItem = {
      id: Date.now(),
      productId: selectedProduct._id,
      productName: selectedProduct.name,
      unit: selectedProduct.unit || '',
      supplierId: selectedSupplier._id,
      supplierName: selectedSupplier.name || selectedSupplier.supplierName || '',
      supplierDocNo: formData.supplierDocNo,
      quantity: parseInt(formData.quantity),
      purchasingPrice: isAdmin ? parseFloat(formData.purchasingPrice) : 0,
      sellingPrice: isAdmin && formData.sellingPrice !== ''
        ? parseFloat(formData.sellingPrice)
        : null,
      expiry: formData.expiry,
      total: parseInt(formData.quantity) * (isAdmin ? parseFloat(formData.purchasingPrice) : 0),
      // Store for display only
      companyName: selectedProduct.companyName || '',
      type: selectedProduct.type || ''
    };

    setStockItems([...stockItems, newItem]);

    // Reset only product and quantity for fast Excel-like entry
    setFormData({
      productId: '',
      supplierId: formData.supplierId,
      quantity: '',
      purchasingPrice: formData.purchasingPrice,
      sellingPrice: isAdmin ? formData.sellingPrice : '',
      expiry: formData.expiry,
      supplierDocNo: formData.supplierDocNo
    });
    setFormErrors({});
    setProductQuery('');
    setSelectedProduct(null);

    // Auto-focus product field for next entry
    setTimeout(() => {
      document.getElementById('product-input')?.focus();
    }, 100);
  };

  const handleOpenEditModal = (item) => {
    setEditingItem(item);
    setEditFormData({
      productId: item.productId,
      supplierId: item.supplierId,
      quantity: item.quantity ? String(item.quantity) : '',
      purchasingPrice: item.purchasingPrice != null ? String(item.purchasingPrice) : '',
      sellingPrice: item.sellingPrice != null ? String(item.sellingPrice) : '',
      expiry: item.expiry ? moment(item.expiry).format('YYYY-MM-DD') : '',
      supplierDocNo: item.supplierDocNo || ''
    });
    setEditProductQuery(item.productName || '');
    setEditFormErrors({});
  };

  const handleCloseEditModal = () => {
    setEditingItem(null);
    setEditFormErrors({});
  };

  const handleUpdateItem = (e) => {
    if (e) e.preventDefault();

    const errors = {};
    if (!editFormData.productId) errors.productId = 'Please select a product';
    if (!editFormData.supplierId) errors.supplierId = 'Please select a supplier';
    if (!editFormData.quantity || Number(editFormData.quantity) <= 0) errors.quantity = 'Please enter valid quantity';
    if (isAdmin && (!editFormData.purchasingPrice || Number(editFormData.purchasingPrice) <= 0)) {
      errors.purchasingPrice = 'Please enter valid purchasing price';
    }
    if (isAdmin && editFormData.sellingPrice !== '' && Number(editFormData.sellingPrice) < 0) {
      errors.sellingPrice = 'Selling price cannot be negative';
    }
    if (!editFormData.expiry) errors.expiry = 'Please select expiry date';
    if (!editFormData.supplierDocNo) errors.supplierDocNo = 'Please enter supplier document number';

    setEditFormErrors(errors);
    if (Object.keys(errors).length > 0) {
      return;
    }

    const selectedProd = products.find(p => p._id === editFormData.productId);
    const selectedSupp = suppliers.find(s => s._id === editFormData.supplierId);

    const qty = parseInt(editFormData.quantity, 10);
    const purchasing = isAdmin ? parseFloat(editFormData.purchasingPrice) : 0;
    const selling = isAdmin && editFormData.sellingPrice !== '' ? parseFloat(editFormData.sellingPrice) : null;

    setStockItems(prev => prev.map(item => {
      if (item.id === editingItem.id) {
        return {
          ...item,
          productId: selectedProd ? selectedProd._id : item.productId,
          productName: selectedProd ? selectedProd.name : item.productName,
          unit: selectedProd?.unit || item.unit || '',
          companyName: selectedProd?.companyName || item.companyName || '',
          type: selectedProd?.type || item.type || '',
          supplierId: selectedSupp ? selectedSupp._id : item.supplierId,
          supplierName: selectedSupp ? (selectedSupp.name || selectedSupp.supplierName || '') : item.supplierName,
          supplierDocNo: editFormData.supplierDocNo,
          quantity: qty,
          purchasingPrice: purchasing,
          sellingPrice: selling,
          expiry: editFormData.expiry,
          total: qty * purchasing
        };
      }
      return item;
    }));

    setEditingItem(null);
    showAlert('Item updated successfully', 'success');
  };

  const handleSelectProduct = (product) => {
    setFormData(prev => ({ ...prev, productId: product._id }));
    setSelectedProduct(product);
    setProductQuery(product.name || '');
    setProductDropdownOpen(false);
    if (formErrors.productId) setFormErrors(prev => ({ ...prev, productId: '' }));
    setTimeout(() => document.getElementById('quantity')?.focus(), 50);
  };

  const clearProduct = () => {
    setFormData(prev => ({ ...prev, productId: '' }));
    setSelectedProduct(null);
    setProductQuery('');
    setProductDropdownOpen(false);
    document.getElementById('product-input')?.focus();
  };

  const removeItem = (id) => {
    setStockItems(stockItems.filter(item => item.id !== id));
    showAlert('Item removed', 'success');
  };

  const saveStockIn = () => {
    if (stockItems.length === 0) {
      showAlert('Please add at least one item', 'error');
      return;
    }

    setLoading(true);

    axios.post(
      `${process.env.REACT_APP_DEVELOPMENT}/api/stockIn/stockIn`,
      {
        docNo: docNo,
        date: date,
        items: stockItems.map(item => ({
          productName: item.productName,
          productId: item.productId,
          supplierId: item.supplierId,
          supplierDocNo: item.supplierDocNo,
          quantity: item.quantity,
          purchasingPrice: item.purchasingPrice,
          sellingPrice: item.sellingPrice,
          expiry: item.expiry,
          unit: item.unit
        }))
      },
      { headers: { token: accessToken } }
    )
      .then((res) => {
        showAlert('Stock In saved successfully! 🎉', 'success');
        setStockItems([]);
        setProductQuery('');
        setSelectedProduct(null);
        setFormData({
          productId: '',
          supplierId: '',
          quantity: '',
          purchasingPrice: '',
          sellingPrice: '',
          expiry: null,
          supplierDocNo: ''
        });
        fetchDocNo();
        setLoading(false);
      })
      .catch((err) => {
        showAlert('Failed to save stock in. Please try again.', 'error');
        console.error(err);
        setLoading(false);
      });
  };

  const saveStockInRef = useRef(saveStockIn);
  const loadingRef = useRef(loading);
  useEffect(() => {
    saveStockInRef.current = saveStockIn;
    loadingRef.current = loading;
  });

  useEffect(() => {
    const handleF10Key = (e) => {
      const isF10 = e.key === 'F10' || e.code === 'F10' || e.keyCode === 121;
      if (isF10) {
        e.preventDefault();
        e.stopPropagation();
        if (e.stopImmediatePropagation) e.stopImmediatePropagation();
        if (!loadingRef.current && typeof saveStockInRef.current === 'function') {
          saveStockInRef.current();
        }
      }
    };
    window.addEventListener('keydown', handleF10Key, true);
    return () => window.removeEventListener('keydown', handleF10Key, true);
  }, []);

  const getTotalQuantity = () => {
    return stockItems.reduce((sum, item) => sum + item.quantity, 0);
  };

  const getGrandTotal = () => {
    return stockItems.reduce((sum, item) => sum + item.total, 0);
  };

  return (
    <div className="ph-page space-y-6">
      <PageHeader
        title="Stock In Receiving Console"
        subtitle="Stage and verify incoming pharmaceutical shipments, lot expiry dates, and purchase invoice batches"
        badge={
          <Badge variant="teal" className="ml-2 font-mono text-xs">
            Doc #{docNo}
          </Badge>
        }
      >
        <div className="flex items-center gap-2 text-xs text-[var(--ph-text-secondary)] bg-[var(--ph-surface)] px-3 py-1.5 rounded-lg border border-[var(--ph-border)]">
          <Calendar className="w-3.5 h-3.5 text-[var(--ph-teal)]" />
          <span>Date: <strong>{date}</strong></span>
        </div>
      </PageHeader>

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

      {/* Rapid Entry Form Card */}
      <div className="ph-card shadow-sm border border-[var(--ph-border)] overflow-visible relative z-30">
        <div className="bg-[var(--ph-surface-2)] border-b border-[var(--ph-border)] px-5 py-3.5 flex flex-wrap items-center justify-between gap-3 rounded-t-xl">
          <div className="flex items-center gap-2">
            <Package className="w-4 h-4 text-[var(--ph-teal)]" />
            <h2 className="font-semibold text-sm text-[var(--ph-text)]">
              Fast Receipt Entry
            </h2>
          </div>
          <div className="flex items-center gap-2 text-xs text-[var(--ph-text-secondary)]">
            <span className="px-2 py-0.5 bg-[var(--ph-surface)] border border-[var(--ph-border)] rounded text-[11px] font-mono">Tab: Next</span>
            <span className="px-2 py-0.5 bg-[var(--ph-surface)] border border-[var(--ph-border)] rounded text-[11px] font-mono">Enter: Stage</span>
            <span className="px-2 py-0.5 bg-[var(--ph-teal)]/10 text-[var(--ph-teal)] border border-[var(--ph-teal)]/20 rounded text-[11px] font-mono font-semibold">F10: Save All</span>
          </div>
        </div>

        <form onSubmit={addItem} className="p-5">
          <div className="space-y-3.5">
            {/* Row 1: Supplier & Invoice Information */}
            <div className="grid grid-cols-12 gap-3.5 pb-3 border-b border-[var(--ph-border)]/60">
              {/* Supplier */}
              <div className="col-span-12 sm:col-span-6">
                <label className="block text-xs font-semibold text-[var(--ph-text)] mb-1.5">
                  Supplier / Vendor *
                </label>
                <select
                  id="supplierId"
                  value={formData.supplierId}
                  onChange={(e) => handleInputChange('supplierId', e.target.value)}
                  className={`w-full h-10 px-3 text-xs sm:text-sm bg-[var(--ph-surface)] border rounded-lg focus:outline-none focus:ring-2 focus:ring-[var(--ph-navy)]/30 focus:border-[var(--ph-navy)] ${formErrors.supplierId ? 'border-rose-500' : 'border-[var(--ph-border)]'}`}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') {
                      e.preventDefault();
                      document.getElementById('supplierDocNo')?.focus();
                    }
                  }}
                >
                  <option value="">Select Supplier</option>
                  {suppliers.map((supplier) => (
                    <option key={supplier._id} value={supplier._id}>
                      {supplier.name}
                    </option>
                  ))}
                </select>
              </div>

              {/* Supplier Doc */}
              <div className="col-span-12 sm:col-span-6">
                <label className="block text-xs font-semibold text-[var(--ph-text)] mb-1.5">
                  Supplier Doc / Inv # *
                </label>
                <input
                  id="supplierDocNo"
                  type="text"
                  value={formData.supplierDocNo}
                  onChange={(e) => handleInputChange('supplierDocNo', e.target.value)}
                  placeholder="e.g. INV-001"
                  className={`w-full h-10 px-3 text-xs sm:text-sm bg-[var(--ph-surface)] border rounded-lg focus:outline-none focus:ring-2 focus:ring-[var(--ph-navy)]/30 focus:border-[var(--ph-navy)] ${formErrors.supplierDocNo ? 'border-rose-500' : 'border-[var(--ph-border)]'}`}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') {
                      e.preventDefault();
                      document.getElementById('product-input')?.focus();
                    }
                  }}
                />
              </div>
            </div>

            {/* Row 2: Medication & Line Details */}
            <div className="grid grid-cols-12 gap-3.5">
              {/* Product – type-ahead autocomplete (Prioritized width) */}
              <div className={isAdmin ? "col-span-12 lg:col-span-5 relative" : "col-span-12 lg:col-span-6 relative"} ref={productAutocompleteRef}>
                <label className="block text-xs font-semibold text-[var(--ph-text)] mb-1.5">
                  Medication / Product *
                </label>
                <div className="relative">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-[var(--ph-muted)] pointer-events-none" />
                  <input
                    id="product-input"
                    type="text"
                    value={productQuery}
                    onChange={(e) => {
                      setProductQuery(e.target.value);
                      setProductDropdownOpen(true);
                      setActiveSugIdx(0);
                    }}
                    onFocus={() => setProductDropdownOpen(true)}
                    placeholder="Search medication by name, brand, generic..."
                    autoComplete="off"
                    className={`w-full h-10 pl-9.5 pr-8 text-xs sm:text-sm bg-[var(--ph-surface)] border rounded-lg focus:outline-none focus:ring-2 focus:ring-[var(--ph-navy)]/30 focus:border-[var(--ph-navy)] transition-colors ${formErrors.productId ? 'border-rose-500' : 'border-[var(--ph-border)]'}`}
                    onKeyDown={(e) => {
                      if (e.key === 'ArrowDown') {
                        e.preventDefault();
                        if (!productDropdownOpen) setProductDropdownOpen(true);
                        else setActiveSugIdx(p => Math.min(p + 1, productSuggestions.length - 1));
                      } else if (e.key === 'ArrowUp') {
                        e.preventDefault();
                        setActiveSugIdx(p => Math.max(p - 1, 0));
                      } else if (e.key === 'Enter') {
                        e.preventDefault();
                        if (productDropdownOpen && productSuggestions[activeSugIdx]) {
                          handleSelectProduct(productSuggestions[activeSugIdx]);
                        }
                      } else if (e.key === 'Escape') {
                        e.preventDefault();
                        setProductDropdownOpen(false);
                      } else if (e.key === 'Tab') {
                        if (productDropdownOpen && productSuggestions[activeSugIdx]) {
                          handleSelectProduct(productSuggestions[activeSugIdx]);
                        }
                      }
                    }}
                  />
                  {productQuery && (
                    <button
                      type="button"
                      onClick={clearProduct}
                      className="absolute right-2.5 top-1/2 -translate-y-1/2 p-1 text-[var(--ph-muted)] hover:text-[var(--ph-text)] rounded-full hover:bg-[var(--ph-surface-2)] transition-colors"
                    >
                      <X className="w-3.5 h-3.5" />
                    </button>
                  )}
                </div>
                {productDropdownOpen && (
                  <div className="absolute z-[70] left-0 top-[calc(100%+4px)] w-full min-w-full sm:min-w-[460px] max-w-[95vw] max-h-72 overflow-y-auto bg-[var(--ph-surface)] border border-[var(--ph-border)] rounded-xl shadow-2xl py-1 text-xs divide-y divide-[var(--ph-border)]/40">
                    {productSuggestions.length === 0 ? (
                      <div className="px-4 py-5 text-center">
                        <Search className="w-6 h-6 mx-auto mb-1 text-[var(--ph-muted)] opacity-40" />
                        <p className="font-semibold text-[var(--ph-text)] text-xs">No products found</p>
                        <p className="text-[11px] text-[var(--ph-text-secondary)] mt-0.5">Try searching with a different name or brand</p>
                      </div>
                    ) : (
                      productSuggestions.map((p, idx) => {
                        const active = idx === activeSugIdx;
                        return (
                          <div
                            key={p._id}
                            data-stockin-sug-idx={idx}
                            onClick={() => handleSelectProduct(p)}
                            className={`px-3.5 py-2.5 cursor-pointer flex items-center justify-between gap-3 border-l-4 transition-colors ${
                              active
                                ? 'bg-[var(--ph-navy)]/10 dark:bg-[var(--ph-navy)]/25 border-[var(--ph-navy)]'
                                : 'border-transparent hover:bg-[var(--ph-surface-2)]'
                            }`}
                          >
                            <div className="min-w-0 flex-1">
                              <div className="font-semibold text-xs sm:text-sm text-[var(--ph-text)] whitespace-normal leading-snug">
                                {p.name}
                              </div>
                              {p.companyName && (
                                <div className="text-[11px] text-[var(--ph-text-secondary)] mt-0.5">
                                  {p.companyName}
                                </div>
                              )}
                            </div>
                            <div className="flex items-center gap-2 shrink-0">
                              <span className="text-[10px] font-medium bg-[var(--ph-surface-2)] text-[var(--ph-text-secondary)] px-2 py-0.5 rounded-full border border-[var(--ph-border)]">
                                {p.unit || 'unit'}
                              </span>
                              {p.purchasingPrice !== undefined && p.purchasingPrice !== null && (
                                <span className="text-[10px] font-mono text-[var(--ph-text)] bg-emerald-50 dark:bg-emerald-950/40 text-emerald-700 dark:text-emerald-300 px-2 py-0.5 rounded-full border border-emerald-200 dark:border-emerald-800/40">
                                  Cost: QR {Number(p.purchasingPrice).toFixed(2)}
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

              {/* Quantity */}
              <div className={isAdmin ? "col-span-6 sm:col-span-3 lg:col-span-1" : "col-span-6 sm:col-span-3 lg:col-span-3"}>
                <label className="block text-xs font-semibold text-[var(--ph-text)] mb-1.5">
                  Quantity *
                </label>
                <input
                  id="quantity"
                  type="number"
                  min="1"
                  value={formData.quantity}
                  onChange={(e) => handleInputChange('quantity', e.target.value)}
                  className={`w-full h-10 px-3 text-xs sm:text-sm bg-[var(--ph-surface)] border rounded-lg focus:outline-none focus:ring-2 focus:ring-[var(--ph-navy)]/30 focus:border-[var(--ph-navy)] ${formErrors.quantity ? 'border-rose-500' : 'border-[var(--ph-border)]'}`}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') {
                      e.preventDefault();
                      if (isAdmin) {
                        document.getElementById('purchasingPrice')?.focus();
                      } else {
                        document.getElementById('expiry')?.focus();
                      }
                    }
                  }}
                />
              </div>

              {/* Purchasing Price - Admin only */}
              {isAdmin && (
                <div className="col-span-6 sm:col-span-3 lg:col-span-2">
                  <label className="block text-xs font-semibold text-[var(--ph-text)] mb-1.5">
                    Cost (QR) *
                  </label>
                  <input
                    id="purchasingPrice"
                    type="number"
                    step="0.01"
                    min="0.01"
                    value={formData.purchasingPrice}
                    onChange={(e) => handleInputChange('purchasingPrice', e.target.value)}
                    className={`w-full h-10 px-3 text-xs sm:text-sm bg-[var(--ph-surface)] border rounded-lg focus:outline-none focus:ring-2 focus:ring-[var(--ph-navy)]/30 focus:border-[var(--ph-navy)] ${formErrors.purchasingPrice ? 'border-rose-500' : 'border-[var(--ph-border)]'}`}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') {
                        e.preventDefault();
                        document.getElementById('sellingPrice')?.focus();
                      }
                    }}
                  />
                </div>
              )}

              {/* Selling Price - Admin only */}
              {isAdmin && (
                <div className="col-span-6 sm:col-span-3 lg:col-span-2">
                  <label className="block text-xs font-semibold text-[var(--ph-text)] mb-1.5">
                    Sell (QR)
                  </label>
                  <input
                    id="sellingPrice"
                    type="number"
                    step="0.01"
                    min="0"
                    value={formData.sellingPrice}
                    onChange={(e) => handleInputChange('sellingPrice', e.target.value)}
                    className={`w-full h-10 px-3 text-xs sm:text-sm bg-[var(--ph-surface)] border rounded-lg focus:outline-none focus:ring-2 focus:ring-[var(--ph-navy)]/30 focus:border-[var(--ph-navy)] ${formErrors.sellingPrice ? 'border-rose-500' : 'border-[var(--ph-border)]'}`}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') {
                        e.preventDefault();
                        document.getElementById('expiry')?.focus();
                      }
                    }}
                  />
                </div>
              )}

              {/* Expiry Date */}
              <div className={isAdmin ? "col-span-12 sm:col-span-6 lg:col-span-2" : "col-span-6 sm:col-span-3 lg:col-span-3"}>
                <label className="block text-xs font-semibold text-[var(--ph-text)] mb-1.5">
                  Expiry Date *
                </label>
                <input
                  id="expiry"
                  type="date"
                  value={formData.expiry || ''}
                  onChange={(e) => handleInputChange('expiry', e.target.value)}
                  className={`w-full h-10 px-3 text-xs sm:text-sm bg-[var(--ph-surface)] border rounded-lg focus:outline-none focus:ring-2 focus:ring-[var(--ph-navy)]/30 focus:border-[var(--ph-navy)] ${formErrors.expiry ? 'border-rose-500' : 'border-[var(--ph-border)]'}`}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') {
                      e.preventDefault();
                      addItem();
                    }
                  }}
                />
              </div>
            </div>
          </div>

          {/* Action Ribbon */}
          <div className="mt-4 pt-3.5 border-t border-[var(--ph-border)] flex flex-wrap items-center justify-between gap-3">
            <div className="flex items-center gap-2.5">
              <button
                type="submit"
                className="px-4 py-2 bg-[var(--ph-navy)] text-white rounded-lg hover:bg-[var(--ph-navy-hover)] font-medium text-xs flex items-center gap-1.5 transition-colors"
              >
                <Plus className="w-3.5 h-3.5" />
                Stage Item (Enter)
              </button>

              {stockItems.length > 0 && (
                <button
                  type="button"
                  onClick={saveStockIn}
                  disabled={loading}
                  className="px-5 py-2 bg-emerald-600 text-white rounded-lg hover:bg-emerald-700 font-semibold text-xs flex items-center gap-1.5 shadow-xs transition-colors disabled:opacity-50"
                >
                  <Save className="w-3.5 h-3.5" />
                  {loading ? 'Saving...' : `Save All Receipt (${stockItems.length} items)`}
                </button>
              )}
            </div>

            {isAdmin && stockItems.length > 0 && (
              <div className="text-right">
                <span className="text-[11px] uppercase tracking-wider text-[var(--ph-text-secondary)] font-semibold mr-2">
                  Grand Receipt Total:
                </span>
                <span className="text-lg font-bold text-emerald-600 dark:text-emerald-400">
                  QR {getGrandTotal().toFixed(2)}
                </span>
              </div>
            )}
          </div>
        </form>
      </div>

      {/* Staged Items Table */}
      {stockItems.length > 0 && (
        <div className="ph-card shadow-sm border border-[var(--ph-border)] overflow-hidden">
          <div className="bg-[var(--ph-surface-2)] border-b border-[var(--ph-border)] px-4 py-3 flex items-center justify-between">
            <div className="flex items-center gap-2">
              <FileText className="w-4 h-4 text-[var(--ph-navy)]" />
              <h3 className="font-semibold text-sm text-[var(--ph-text)]">
                Staged Shipment Batches
              </h3>
            </div>
            <Badge variant="teal">
              {stockItems.length} Items • {getTotalQuantity()} Units
            </Badge>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-xs">
              <thead className="bg-[var(--ph-surface-2)] border-b border-[var(--ph-border)] text-[var(--ph-text-secondary)] font-semibold">
                <tr>
                  <th className="px-4 py-2.5 text-left w-10">#</th>
                  <th className="px-4 py-2.5 text-left">Product Name</th>
                  <th className="px-4 py-2.5 text-left">Manufacturer</th>
                  <th className="px-4 py-2.5 text-left">Unit</th>
                  <th className="px-4 py-2.5 text-left">Supplier</th>
                  <th className="px-4 py-2.5 text-left">Inv Doc</th>
                  <th className="px-4 py-2.5 text-right">Qty</th>
                  {isAdmin && <th className="px-4 py-2.5 text-right">Cost (QR)</th>}
                  {isAdmin && <th className="px-4 py-2.5 text-right">Sell (QR)</th>}
                  {isAdmin && <th className="px-4 py-2.5 text-right">Total (QR)</th>}
                  <th className="px-4 py-2.5 text-left">Expiry</th>
                  <th className="px-4 py-2.5 text-center">Action</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[var(--ph-border)]">
                {stockItems.map((item, index) => (
                  <tr key={item.id} className="hover:bg-[var(--ph-surface-2)]/50 transition-colors">
                    <td className="px-4 py-2.5 font-medium text-[var(--ph-muted)]">{index + 1}</td>
                    <td className="px-4 py-2.5 font-semibold text-[var(--ph-text)]">{item.productName}</td>
                    <td className="px-4 py-2.5 text-[var(--ph-text-secondary)]">{item.companyName || '-'}</td>
                    <td className="px-4 py-2.5">
                      <Badge variant="outline" className="text-[10px] py-0">{item.unit || '-'}</Badge>
                    </td>
                    <td className="px-4 py-2.5 text-[var(--ph-text-secondary)]">{item.supplierName}</td>
                    <td className="px-4 py-2.5">
                      <span className="px-1.5 py-0.5 bg-[var(--ph-surface-2)] rounded font-mono text-[11px] border border-[var(--ph-border)]">
                        {item.supplierDocNo}
                      </span>
                    </td>
                    <td className="px-4 py-2.5 text-right font-bold text-[var(--ph-text)]">{item.quantity}</td>
                    {isAdmin && <td className="px-4 py-2.5 text-right font-mono">{item.purchasingPrice.toFixed(2)}</td>}
                    {isAdmin && (
                      <td className="px-4 py-2.5 text-right font-mono text-[var(--ph-text-secondary)]">
                        {item.sellingPrice != null ? item.sellingPrice.toFixed(2) : '—'}
                      </td>
                    )}
                    {isAdmin && (
                      <td className="px-4 py-2.5 text-right font-mono font-bold text-emerald-600 dark:text-emerald-400">
                        {item.total.toFixed(2)}
                      </td>
                    )}
                    <td className="px-4 py-2.5">
                      <span className="text-[11px] font-mono text-[var(--ph-text-secondary)]">
                        {moment(item.expiry).format('DD/MM/YYYY')}
                      </span>
                    </td>
                    <td className="px-4 py-2.5 text-center">
                      <div className="flex items-center justify-center gap-1">
                        <button
                          type="button"
                          onClick={() => handleOpenEditModal(item)}
                          className="p-1 text-[var(--ph-text-secondary)] hover:text-[var(--ph-navy)] rounded transition-colors"
                          title="Edit item"
                        >
                          <Edit className="w-3.5 h-3.5" />
                        </button>
                        <button
                          type="button"
                          onClick={() => removeItem(item.id)}
                          className="p-1 text-rose-500 hover:text-rose-700 rounded transition-colors"
                          title="Remove item"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Edit Item Modal */}
      {editingItem && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-xs flex items-center justify-center z-50 p-4 animate-in fade-in">
          <div className="bg-[var(--ph-surface)] border border-[var(--ph-border)] rounded-xl shadow-2xl w-full max-w-xl overflow-visible relative">
            <div className="bg-[var(--ph-surface-2)] border-b border-[var(--ph-border)] px-5 py-3.5 flex items-center justify-between rounded-t-xl">
              <h3 className="font-semibold text-sm text-[var(--ph-text)] flex items-center gap-2">
                <Edit className="w-4 h-4 text-[var(--ph-teal)]" />
                Edit Staged Item
              </h3>
              <button
                type="button"
                onClick={handleCloseEditModal}
                className="text-[var(--ph-muted)] hover:text-[var(--ph-text)] p-1 rounded"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
            <form onSubmit={handleUpdateItem} className="p-5 space-y-4">
              <div className="grid grid-cols-2 gap-3.5">
                {/* Supplier */}
                <div>
                  <label className="block text-xs font-semibold text-[var(--ph-text)] mb-1">
                    Supplier *
                  </label>
                  <select
                    value={editFormData.supplierId}
                    onChange={(e) => setEditFormData(prev => ({ ...prev, supplierId: e.target.value }))}
                    className={`w-full h-9 px-3 text-xs bg-[var(--ph-surface)] border rounded-lg focus:outline-none focus:ring-2 focus:ring-[var(--ph-navy)] ${editFormErrors.supplierId ? 'border-rose-500' : 'border-[var(--ph-border)]'}`}
                  >
                    <option value="">Select Supplier</option>
                    {suppliers.map((s) => (
                      <option key={s._id} value={s._id}>
                        {s.name || s.supplierName}
                      </option>
                    ))}
                  </select>
                  {editFormErrors.supplierId && <p className="text-[11px] text-rose-500 mt-1">{editFormErrors.supplierId}</p>}
                </div>

                {/* Supplier Doc */}
                <div>
                  <label className="block text-xs font-semibold text-[var(--ph-text)] mb-1">
                    Supplier Doc *
                  </label>
                  <input
                    type="text"
                    value={editFormData.supplierDocNo}
                    onChange={(e) => setEditFormData(prev => ({ ...prev, supplierDocNo: e.target.value }))}
                    placeholder="INV-001"
                    className={`w-full h-9 px-3 text-xs bg-[var(--ph-surface)] border rounded-lg focus:outline-none focus:ring-2 focus:ring-[var(--ph-navy)] ${editFormErrors.supplierDocNo ? 'border-rose-500' : 'border-[var(--ph-border)]'}`}
                  />
                  {editFormErrors.supplierDocNo && <p className="text-[11px] text-rose-500 mt-1">{editFormErrors.supplierDocNo}</p>}
                </div>
              </div>

              {/* Product Autocomplete */}
              <div className="relative" ref={editProductAutocompleteRef}>
                <label className="block text-xs font-semibold text-[var(--ph-text)] mb-1">
                  Product *
                </label>
                <div className="relative">
                  <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-[var(--ph-muted)] pointer-events-none" />
                  <input
                    type="text"
                    value={editProductQuery}
                    onChange={(e) => {
                      setEditProductQuery(e.target.value);
                      setEditProductDropdownOpen(true);
                    }}
                    onFocus={() => setEditProductDropdownOpen(true)}
                    placeholder="Search product..."
                    className={`w-full h-9 pl-8 pr-7 text-xs bg-[var(--ph-surface)] border rounded-lg focus:outline-none focus:ring-2 focus:ring-[var(--ph-navy)] ${editFormErrors.productId ? 'border-rose-500' : 'border-[var(--ph-border)]'}`}
                  />
                  {editProductQuery && (
                    <button
                      type="button"
                      onClick={() => {
                        setEditProductQuery('');
                        setEditFormData(prev => ({ ...prev, productId: '' }));
                      }}
                      className="absolute right-2 top-1/2 -translate-y-1/2 p-0.5 text-[var(--ph-muted)] hover:text-[var(--ph-text)]"
                    >
                      <X className="w-3.5 h-3.5" />
                    </button>
                  )}
                </div>
                {editFormErrors.productId && <p className="text-[11px] text-rose-500 mt-1">{editFormErrors.productId}</p>}

                {editProductDropdownOpen && editProductSuggestions.length > 0 && (
                  <div className="absolute z-[70] left-0 top-[calc(100%+4px)] w-full min-w-full max-h-56 overflow-y-auto bg-[var(--ph-surface)] border border-[var(--ph-border)] rounded-xl shadow-2xl py-1 text-xs divide-y divide-[var(--ph-border)]/40">
                    {editProductSuggestions.map((p) => (
                      <div
                        key={p._id}
                        onClick={() => {
                          setEditFormData(prev => ({ ...prev, productId: p._id }));
                          setEditProductQuery(p.name);
                          setEditProductDropdownOpen(false);
                          if (editFormErrors.productId) setEditFormErrors(prev => ({ ...prev, productId: '' }));
                        }}
                        className="px-3 py-2 hover:bg-[var(--ph-surface-2)] cursor-pointer flex items-center justify-between transition-colors"
                      >
                        <div className="min-w-0 flex-1">
                          <span className="font-medium text-[var(--ph-text)]">{p.name}</span>
                          {p.companyName && <span className="text-[11px] text-[var(--ph-text-secondary)] ml-1.5">({p.companyName})</span>}
                        </div>
                        <span className="text-[10px] bg-[var(--ph-surface-2)] text-[var(--ph-text-secondary)] px-1.5 py-0.5 rounded border border-[var(--ph-border)] shrink-0">{p.unit || 'unit'}</span>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              <div className="grid grid-cols-3 gap-3.5">
                {/* Quantity */}
                <div>
                  <label className="block text-xs font-semibold text-[var(--ph-text)] mb-1">
                    Quantity *
                  </label>
                  <input
                    type="number"
                    min="1"
                    value={editFormData.quantity}
                    onChange={(e) => setEditFormData(prev => ({ ...prev, quantity: e.target.value }))}
                    className={`w-full h-9 px-3 text-xs bg-[var(--ph-surface)] border rounded-lg focus:outline-none focus:ring-2 focus:ring-[var(--ph-navy)] ${editFormErrors.quantity ? 'border-rose-500' : 'border-[var(--ph-border)]'}`}
                  />
                  {editFormErrors.quantity && <p className="text-[11px] text-rose-500 mt-1">{editFormErrors.quantity}</p>}
                </div>

                {/* Expiry */}
                <div className={isAdmin ? "" : "col-span-2"}>
                  <label className="block text-xs font-semibold text-[var(--ph-text)] mb-1">
                    Expiry Date *
                  </label>
                  <input
                    type="date"
                    value={editFormData.expiry}
                    onChange={(e) => setEditFormData(prev => ({ ...prev, expiry: e.target.value }))}
                    className={`w-full h-9 px-3 text-xs bg-[var(--ph-surface)] border rounded-lg focus:outline-none focus:ring-2 focus:ring-[var(--ph-navy)] ${editFormErrors.expiry ? 'border-rose-500' : 'border-[var(--ph-border)]'}`}
                  />
                  {editFormErrors.expiry && <p className="text-[11px] text-rose-500 mt-1">{editFormErrors.expiry}</p>}
                </div>

                {/* Purchasing Price */}
                {isAdmin && (
                  <div>
                    <label className="block text-xs font-semibold text-[var(--ph-text)] mb-1">
                      Cost (QR) *
                    </label>
                    <input
                      type="number"
                      step="0.01"
                      min="0.01"
                      value={editFormData.purchasingPrice}
                      onChange={(e) => setEditFormData(prev => ({ ...prev, purchasingPrice: e.target.value }))}
                      className={`w-full h-9 px-3 text-xs bg-[var(--ph-surface)] border rounded-lg focus:outline-none focus:ring-2 focus:ring-[var(--ph-navy)] ${editFormErrors.purchasingPrice ? 'border-rose-500' : 'border-[var(--ph-border)]'}`}
                    />
                    {editFormErrors.purchasingPrice && <p className="text-[11px] text-rose-500 mt-1">{editFormErrors.purchasingPrice}</p>}
                  </div>
                )}
              </div>

              {/* Selling Price & Line Total */}
              {isAdmin && (
                <div className="grid grid-cols-2 gap-3.5">
                  <div>
                    <label className="block text-xs font-semibold text-[var(--ph-text)] mb-1">
                      Selling Price
                    </label>
                    <input
                      type="number"
                      step="0.01"
                      min="0"
                      value={editFormData.sellingPrice}
                      onChange={(e) => setEditFormData(prev => ({ ...prev, sellingPrice: e.target.value }))}
                      className={`w-full h-9 px-3 text-xs bg-[var(--ph-surface)] border rounded-lg focus:outline-none focus:ring-2 focus:ring-[var(--ph-navy)] ${editFormErrors.sellingPrice ? 'border-rose-500' : 'border-[var(--ph-border)]'}`}
                    />
                    {editFormErrors.sellingPrice && <p className="text-[11px] text-rose-500 mt-1">{editFormErrors.sellingPrice}</p>}
                  </div>

                  <div>
                    <label className="block text-xs font-semibold text-[var(--ph-text)] mb-1">
                      Batch Total
                    </label>
                    <div className="h-9 px-3 flex items-center bg-emerald-50 dark:bg-emerald-950/30 border border-emerald-200 dark:border-emerald-900/50 rounded-lg">
                      <span className="text-xs font-bold text-emerald-700 dark:text-emerald-400">
                        QR {editFormData.quantity && editFormData.purchasingPrice ? (Number(editFormData.quantity) * Number(editFormData.purchasingPrice)).toFixed(2) : '0.00'}
                      </span>
                    </div>
                  </div>
                </div>
              )}

              {/* Modal Action Buttons */}
              <div className="pt-3 flex justify-end gap-2 border-t border-[var(--ph-border)]">
                <button
                  type="button"
                  onClick={handleCloseEditModal}
                  className="px-3 py-1.5 text-xs font-medium text-[var(--ph-text-secondary)] hover:bg-[var(--ph-surface-2)] rounded-lg border border-[var(--ph-border)]"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="px-4 py-1.5 text-xs font-semibold text-white bg-[var(--ph-navy)] hover:bg-[var(--ph-navy-hover)] rounded-lg shadow-xs"
                >
                  Update Item
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};

export default Stockin;
