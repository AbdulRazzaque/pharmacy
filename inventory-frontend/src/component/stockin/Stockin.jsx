import React, { useState, useEffect, useRef, useMemo } from 'react';
import axios from 'axios';
import { getToken, getUserInfo } from '../../utils/auth';
import { Alert, AlertDescription } from '../../components/ui/alert';
import { Badge } from '../../components/ui/badge';
import { Plus, Trash2, Edit, TrendingUp, Save, Package, AlertCircle, CheckCircle2, Search, X } from 'lucide-react';
import moment from 'moment';

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
  const productAutocompleteRef = useRef(null);

  const accessToken = getToken();

  const productSuggestions = useMemo(() => {
    const q = (productQuery || '').trim().toLowerCase();
    if (!q) return products.slice(0, 20);
    return products.filter(
      (p) => (p.name || '').toLowerCase().includes(q) || (p.companyName || '').toLowerCase().includes(q)
    ).slice(0, 20);
  }, [products, productQuery]);

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

  const getTotalQuantity = () => {
    return stockItems.reduce((sum, item) => sum + item.quantity, 0);
  };

  const getGrandTotal = () => {
    return stockItems.reduce((sum, item) => sum + item.total, 0);
  };

  return (
    <div className="min-h-screen bg-gray-50 p-4">
      <div className="max-w-[1600px] mx-auto">
        {/* Header */}
        <div className="bg-white rounded-lg shadow-sm p-4 mb-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <TrendingUp className="w-6 h-6 text-blue-600" />
              <div>
                <h1 className="text-2xl font-bold text-gray-900">Stock In Entry</h1>
                <p className="text-sm text-gray-500">Quick data entry like Excel</p>
              </div>
            </div>
            <div className="flex items-center gap-4">
              <div className="text-right">
                <div className="text-xs text-gray-500">Document No</div>
                <div className="text-lg font-bold text-blue-600">#{docNo}</div>
              </div>
              <div className="text-right">
                <div className="text-xs text-gray-500">Date</div>
                <div className="bg-white rounded-lg shadow-sm p-2">
                  <input
                    type="date"
                    value={date}
                    onChange={(e) => setDate(e.target.value)}
                    className="text-sm font-semibold text-black w-64 border border-gray-300 rounded-md px-2 py-1 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                  />
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Alert */}
        {alert.show && (
          <Alert className={`mb-4 ${alert.type === 'success' ? 'bg-green-50 border-green-200' : 'bg-red-50 border-red-200'}`}>
            <div className="flex items-center gap-2">
              {alert.type === 'success' ? (
                <CheckCircle2 className="w-4 h-4 text-green-600" />
              ) : (
                <AlertCircle className="w-4 h-4 text-red-600" />
              )}
              <AlertDescription className={alert.type === 'success' ? 'text-green-800' : 'text-red-800'}>
                {alert.message}
              </AlertDescription>
            </div>
          </Alert>
        )}

        {/* Excel-like Entry Form */}
        <div className="bg-white rounded-lg shadow-sm mb-4">
          <div className="bg-gradient-to-r from-blue-500 to-blue-600 text-white px-4 py-3 rounded-t-lg">
            <h2 className="font-semibold flex items-center gap-2">
              <Package className="w-4 h-4" />
              Quick Entry Form (Press Tab to move between fields, Enter to add)
            </h2>
          </div>

          <form onSubmit={addItem} className="p-4">
            <div className="grid grid-cols-12 gap-3">
              {/* Supplier */}
              <div className={isAdmin ? "col-span-2" : "col-span-3"}>
                <label className="block text-xs font-medium text-gray-700 mb-1">
                  Supplier *
                </label>
                <select
                  id="supplierId"
                  value={formData.supplierId}
                  onChange={(e) => handleInputChange('supplierId', e.target.value)}
                  className={`w-full h-10 px-3 text-sm border rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 ${formErrors.supplierId ? 'border-red-500' : 'border-gray-300'
                    }`}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') {
                      e.preventDefault();
                      document.getElementById('supplierDocNo')?.focus();
                    }
                  }}
                >
                  <option value="">Select</option>
                  {suppliers.map((supplier) => (
                    <option key={supplier._id} value={supplier._id}>
                      {supplier.name}
                    </option>
                  ))}
                </select>
              </div>

              {/* Supplier Doc */}
              <div className="col-span-2">
                <label className="block text-xs font-medium text-gray-700 mb-1">
                  Supplier Doc *
                </label>
                <input
                  id="supplierDocNo"
                  type="text"
                  value={formData.supplierDocNo}
                  onChange={(e) => handleInputChange('supplierDocNo', e.target.value)}
                  placeholder="INV-001"
                  className={`w-full h-10 px-3 text-sm border rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 ${formErrors.supplierDocNo ? 'border-red-500' : 'border-gray-300'
                    }`}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') {
                      e.preventDefault();
                      document.getElementById('product-input')?.focus();
                    }
                  }}
                />
              </div>

              {/* Product – type-ahead autocomplete */}
              <div className={isAdmin ? "col-span-2 relative" : "col-span-3 relative"} ref={productAutocompleteRef}>
                <label className="block text-xs font-medium text-gray-700 mb-1">
                  Product *
                </label>
                <div className="relative">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400 pointer-events-none" />
                  <input
                    id="product-input"
                    type="text"
                    value={productQuery}
                    onChange={(e) => {
                      setProductQuery(e.target.value);
                      setProductDropdownOpen(true);
                    }}
                    onFocus={() => setProductDropdownOpen(true)}
                    placeholder="Search product..."
                    className={`w-full h-10 pl-9 pr-8 text-sm border rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 ${formErrors.productId ? 'border-red-500' : 'border-gray-300'
                      }`}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') {
                        e.preventDefault();
                        if (productSuggestions.length > 0) {
                          handleSelectProduct(productSuggestions[0]);
                        }
                      }
                    }}
                  />
                  {productQuery && (
                    <button
                      type="button"
                      onClick={clearProduct}
                      className="absolute right-2 top-1/2 -translate-y-1/2 p-1 text-gray-400 hover:text-gray-600"
                    >
                      <X className="w-4 h-4" />
                    </button>
                  )}
                </div>
                {productDropdownOpen && productSuggestions.length > 0 && (
                  <ul className="absolute z-50 w-full mt-1 max-h-48 overflow-y-auto bg-white border border-gray-200 rounded-md shadow-lg py-1 text-sm">
                    {productSuggestions.map((p) => (
                      <li
                        key={p._id}
                        onClick={() => handleSelectProduct(p)}
                        className="px-3 py-2 hover:bg-blue-50 cursor-pointer flex items-center justify-between"
                      >
                        <div>
                          <span className="font-medium text-gray-900">{p.name}</span>
                          {p.companyName && (
                            <span className="text-xs text-gray-500 ml-2">({p.companyName})</span>
                          )}
                        </div>
                        <span className="text-xs bg-gray-100 text-gray-600 px-2 py-0.5 rounded">
                          {p.unit || 'unit'}
                        </span>
                      </li>
                    ))}
                  </ul>
                )}
              </div>

              {/* Quantity */}
              <div className="col-span-1">
                <label className="block text-xs font-medium text-gray-700 mb-1">
                  Quantity *
                </label>
                <input
                  id="quantity"
                  type="number"
                  min="1"
                  value={formData.quantity}
                  onChange={(e) => handleInputChange('quantity', e.target.value)}
                  className={`w-full h-10 px-3 text-sm border rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 ${formErrors.quantity ? 'border-red-500' : 'border-gray-300'
                    }`}
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
                <div className="col-span-1">
                  <label className="block text-xs font-medium text-gray-700 mb-1">
                    Purch. Price *
                  </label>
                  <input
                    id="purchasingPrice"
                    type="number"
                    step="0.01"
                    min="0.01"
                    value={formData.purchasingPrice}
                    onChange={(e) => handleInputChange('purchasingPrice', e.target.value)}
                    className={`w-full h-10 px-3 text-sm border rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 ${formErrors.purchasingPrice ? 'border-red-500' : 'border-gray-300'
                      }`}
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
                <div className="col-span-1">
                  <label className="block text-xs font-medium text-gray-700 mb-1">
                    Sell. Price
                  </label>
                  <input
                    id="sellingPrice"
                    type="number"
                    step="0.01"
                    min="0"
                    value={formData.sellingPrice}
                    onChange={(e) => handleInputChange('sellingPrice', e.target.value)}
                    className={`w-full h-10 px-3 text-sm border rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 ${formErrors.sellingPrice ? 'border-red-500' : 'border-gray-300'
                      }`}
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
              <div className={isAdmin ? "col-span-2" : "col-span-3"}>
                <label className="block text-xs font-medium text-gray-700 mb-1">
                  Expiry Date *
                </label>
                <input
                  id="expiry"
                  type="date"
                  value={formData.expiry || ''}
                  onChange={(e) => handleInputChange('expiry', e.target.value)}
                  className={`w-full h-10 px-3 text-sm border rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 ${formErrors.expiry ? 'border-red-500' : 'border-gray-300'
                    }`}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') {
                      e.preventDefault();
                      addItem();
                    }
                  }}
                />
              </div>
            </div>

            {/* Action Buttons */}
            <div className="mt-4 flex items-center gap-3">
              <button
                type="submit"
                className="px-6 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 font-medium text-sm flex items-center gap-2 focus:outline-none focus:ring-2 focus:ring-blue-500"
              >
                <Plus className="w-4 h-4" />
                Add Item (Enter)
              </button>

              {stockItems.length > 0 && (
                <button
                  type="button"
                  onClick={saveStockIn}
                  disabled={loading}
                  className="px-6 py-2 bg-green-600 text-white rounded-md hover:bg-green-700 font-medium text-sm flex items-center gap-2 focus:outline-none focus:ring-2 focus:ring-green-500 disabled:opacity-50"
                >
                  <Save className="w-4 h-4" />
                  {loading ? 'Saving...' : `Save All (${stockItems.length} items)`}
                </button>
              )}

              {isAdmin && (
                <div className="ml-auto text-right">
                  <div className="text-xs text-gray-500">Grand Total</div>
                  <div className="text-2xl font-bold text-green-600">QR{getGrandTotal().toFixed(2)}</div>
                </div>
              )}
            </div>
          </form>
        </div>

        {/* Items Table */}
        {stockItems.length > 0 && (
          <div className="bg-white rounded-lg shadow-sm overflow-hidden">
            <div className="bg-gray-700 text-white px-4 py-3 flex items-center justify-between">
              <h3 className="font-semibold">Items List</h3>
              <Badge variant="secondary" className="bg-white text-gray-700">
                {stockItems.length} Items • {getTotalQuantity()} Total Qty
              </Badge>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="bg-gray-50 border-b">
                  <tr>
                    <th className="px-4 py-3 text-left font-semibold text-gray-700">#</th>
                    <th className="px-4 py-3 text-left font-semibold text-gray-700">Product Name</th>
                    <th className="px-4 py-3 text-left font-semibold text-gray-700">Company Name</th>
                    <th className="px-4 py-3 text-left font-semibold text-gray-700">Unit</th>
                    <th className="px-4 py-3 text-left font-semibold text-gray-700">Supplier</th>
                    <th className="px-4 py-3 text-left font-semibold text-gray-700">Doc No</th>
                    <th className="px-4 py-3 text-right font-semibold text-gray-700">Qty</th>
                    {isAdmin && <th className="px-4 py-3 text-right font-semibold text-gray-700">Purch. Price</th>}
                    {isAdmin && <th className="px-4 py-3 text-right font-semibold text-gray-700">Sell. Price</th>}
                    {isAdmin && <th className="px-4 py-3 text-right font-semibold text-gray-700">Total</th>}
                    <th className="px-4 py-3 text-left font-semibold text-gray-700">Expiry</th>
                    <th className="px-4 py-3 text-center font-semibold text-gray-700">Action</th>
                  </tr>
                </thead>
                <tbody>
                  {stockItems.map((item, index) => (
                    <tr key={item.id} className="border-b hover:bg-gray-50">
                      <td className="px-4 py-3 font-medium text-gray-600">{index + 1}</td>
                      <td className="px-4 py-3 font-medium text-gray-900">{item.productName}</td>
                      <td className="px-4 py-3 text-gray-700">{item.companyName || '-'}</td>
                      <td className="px-4 py-3 text-gray-700">{item.unit || '-'}</td>
                      <td className="px-4 py-3">{item.supplierName}</td>
                      <td className="px-4 py-3">
                        <span className="px-2 py-1 bg-gray-100 rounded text-xs font-mono">
                          {item.supplierDocNo}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-right font-semibold">{item.quantity}</td>
                      {isAdmin && <td className="px-4 py-3 text-right">QR{item.purchasingPrice.toFixed(2)}</td>}
                      {isAdmin && (
                        <td className="px-4 py-3 text-right">
                          {item.sellingPrice != null ? `QR${item.sellingPrice.toFixed(2)}` : '—'}
                        </td>
                      )}
                      {isAdmin && (
                        <td className="px-4 py-3 text-right font-semibold text-green-600">
                          QR{item.total.toFixed(2)}
                        </td>
                      )}
                      <td className="px-4 py-3 text-sm">{moment(item.expiry).format('DD/MM/YYYY')}</td>
                      <td className="px-4 py-3 text-center">
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
                            onClick={() => removeItem(item.id)}
                            className="p-1.5 text-red-600 hover:bg-red-50 rounded transition-colors"
                            title="Remove item"
                          >
                            <Trash2 className="w-4 h-4" />
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
      </div>

      {/* Edit Item Modal */}
      {editingItem && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-lg shadow-lg w-full max-w-xl overflow-hidden">
            <div className="bg-blue-600 text-white px-5 py-4 flex items-center justify-between">
              <h3 className="font-semibold text-lg flex items-center gap-2">
                <Edit className="w-5 h-5" />
                Edit Stock In Item
              </h3>
              <button
                type="button"
                onClick={handleCloseEditModal}
                className="text-white/80 hover:text-white p-1 rounded"
              >
                <X className="w-5 h-5" />
              </button>
            </div>
            <form onSubmit={handleUpdateItem} className="p-5 space-y-4">
              <div className="grid grid-cols-2 gap-4">
                {/* Supplier */}
                <div>
                  <label className="block text-xs font-medium text-gray-700 mb-1">
                    Supplier *
                  </label>
                  <select
                    value={editFormData.supplierId}
                    onChange={(e) => setEditFormData(prev => ({ ...prev, supplierId: e.target.value }))}
                    className={`w-full h-10 px-3 text-sm border rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 ${editFormErrors.supplierId ? 'border-red-500' : 'border-gray-300'}`}
                  >
                    <option value="">Select Supplier</option>
                    {suppliers.map((s) => (
                      <option key={s._id} value={s._id}>
                        {s.name || s.supplierName}
                      </option>
                    ))}
                  </select>
                  {editFormErrors.supplierId && <p className="text-xs text-red-500 mt-1">{editFormErrors.supplierId}</p>}
                </div>

                {/* Supplier Doc */}
                <div>
                  <label className="block text-xs font-medium text-gray-700 mb-1">
                    Supplier Doc *
                  </label>
                  <input
                    type="text"
                    value={editFormData.supplierDocNo}
                    onChange={(e) => setEditFormData(prev => ({ ...prev, supplierDocNo: e.target.value }))}
                    placeholder="INV-001"
                    className={`w-full h-10 px-3 text-sm border rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 ${editFormErrors.supplierDocNo ? 'border-red-500' : 'border-gray-300'}`}
                  />
                  {editFormErrors.supplierDocNo && <p className="text-xs text-red-500 mt-1">{editFormErrors.supplierDocNo}</p>}
                </div>
              </div>

              {/* Product Autocomplete */}
              <div className="relative" ref={editProductAutocompleteRef}>
                <label className="block text-xs font-medium text-gray-700 mb-1">
                  Product *
                </label>
                <div className="relative">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400 pointer-events-none" />
                  <input
                    type="text"
                    value={editProductQuery}
                    onChange={(e) => {
                      setEditProductQuery(e.target.value);
                      setEditProductDropdownOpen(true);
                    }}
                    onFocus={() => setEditProductDropdownOpen(true)}
                    placeholder="Search product..."
                    className={`w-full h-10 pl-9 pr-8 text-sm border rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 ${editFormErrors.productId ? 'border-red-500' : 'border-gray-300'}`}
                  />
                  {editProductQuery && (
                    <button
                      type="button"
                      onClick={() => {
                        setEditProductQuery('');
                        setEditFormData(prev => ({ ...prev, productId: '' }));
                      }}
                      className="absolute right-2 top-1/2 -translate-y-1/2 p-1 text-gray-400 hover:text-gray-600"
                    >
                      <X className="w-4 h-4" />
                    </button>
                  )}
                </div>
                {editFormErrors.productId && <p className="text-xs text-red-500 mt-1">{editFormErrors.productId}</p>}

                {editProductDropdownOpen && editProductSuggestions.length > 0 && (
                  <ul className="absolute z-50 w-full mt-1 max-h-48 overflow-y-auto bg-white border border-gray-200 rounded-md shadow-lg py-1 text-sm">
                    {editProductSuggestions.map((p) => (
                      <li
                        key={p._id}
                        onClick={() => {
                          setEditFormData(prev => ({ ...prev, productId: p._id }));
                          setEditProductQuery(p.name);
                          setEditProductDropdownOpen(false);
                          if (editFormErrors.productId) setEditFormErrors(prev => ({ ...prev, productId: '' }));
                        }}
                        className="px-3 py-2 hover:bg-blue-50 cursor-pointer flex items-center justify-between"
                      >
                        <div>
                          <span className="font-medium text-gray-900">{p.name}</span>
                          {p.companyName && <span className="text-xs text-gray-500 ml-2">({p.companyName})</span>}
                        </div>
                        <span className="text-xs bg-gray-100 text-gray-600 px-2 py-0.5 rounded">{p.unit || 'unit'}</span>
                      </li>
                    ))}
                  </ul>
                )}
              </div>

              <div className="grid grid-cols-3 gap-4">
                {/* Quantity */}
                <div>
                  <label className="block text-xs font-medium text-gray-700 mb-1">
                    Quantity *
                  </label>
                  <input
                    type="number"
                    min="1"
                    value={editFormData.quantity}
                    onChange={(e) => setEditFormData(prev => ({ ...prev, quantity: e.target.value }))}
                    className={`w-full h-10 px-3 text-sm border rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 ${editFormErrors.quantity ? 'border-red-500' : 'border-gray-300'}`}
                  />
                  {editFormErrors.quantity && <p className="text-xs text-red-500 mt-1">{editFormErrors.quantity}</p>}
                </div>

                {/* Expiry */}
                <div className={isAdmin ? "" : "col-span-2"}>
                  <label className="block text-xs font-medium text-gray-700 mb-1">
                    Expiry Date *
                  </label>
                  <input
                    type="date"
                    value={editFormData.expiry}
                    onChange={(e) => setEditFormData(prev => ({ ...prev, expiry: e.target.value }))}
                    className={`w-full h-10 px-3 text-sm border rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 ${editFormErrors.expiry ? 'border-red-500' : 'border-gray-300'}`}
                  />
                  {editFormErrors.expiry && <p className="text-xs text-red-500 mt-1">{editFormErrors.expiry}</p>}
                </div>

                {/* Purchasing Price */}
                {isAdmin && (
                  <div>
                    <label className="block text-xs font-medium text-gray-700 mb-1">
                      Purch. Price *
                    </label>
                    <input
                      type="number"
                      step="0.01"
                      min="0.01"
                      value={editFormData.purchasingPrice}
                      onChange={(e) => setEditFormData(prev => ({ ...prev, purchasingPrice: e.target.value }))}
                      className={`w-full h-10 px-3 text-sm border rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 ${editFormErrors.purchasingPrice ? 'border-red-500' : 'border-gray-300'}`}
                    />
                    {editFormErrors.purchasingPrice && <p className="text-xs text-red-500 mt-1">{editFormErrors.purchasingPrice}</p>}
                  </div>
                )}
              </div>

              {/* Selling Price & Line Total */}
              {isAdmin && (
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="block text-xs font-medium text-gray-700 mb-1">
                      Selling Price
                    </label>
                    <input
                      type="number"
                      step="0.01"
                      min="0"
                      value={editFormData.sellingPrice}
                      onChange={(e) => setEditFormData(prev => ({ ...prev, sellingPrice: e.target.value }))}
                      className={`w-full h-10 px-3 text-sm border rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 ${editFormErrors.sellingPrice ? 'border-red-500' : 'border-gray-300'}`}
                    />
                    {editFormErrors.sellingPrice && <p className="text-xs text-red-500 mt-1">{editFormErrors.sellingPrice}</p>}
                  </div>

                  <div>
                    <label className="block text-xs font-medium text-gray-700 mb-1">
                      Line Total
                    </label>
                    <div className="h-10 px-3 flex items-center bg-green-50 border border-green-200 rounded-md">
                      <span className="text-sm font-bold text-green-700">
                        QR{editFormData.quantity && editFormData.purchasingPrice ? (Number(editFormData.quantity) * Number(editFormData.purchasingPrice)).toFixed(2) : '0.00'}
                      </span>
                    </div>
                  </div>
                </div>
              )}

              {/* Modal Action Buttons */}
              <div className="pt-3 flex justify-end gap-3 border-t">
                <button
                  type="button"
                  onClick={handleCloseEditModal}
                  className="px-4 py-2 text-sm font-medium text-gray-700 bg-gray-100 hover:bg-gray-200 rounded-md"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="px-5 py-2 text-sm font-medium text-white bg-blue-600 hover:bg-blue-700 rounded-md shadow-sm"
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

export default Stockin;
