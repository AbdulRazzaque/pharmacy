import React, { useState, useEffect, useRef, useMemo } from 'react';
import axios from 'axios';
import { getToken, getUserInfo } from '../../utils/auth';
import { Alert, AlertDescription } from '../../components/ui/alert';
import { Badge } from '../../components/ui/badge';
import { Plus, Trash2, TrendingUp, Save, Package, AlertCircle, CheckCircle2, Search, X } from 'lucide-react';
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
      supplierName: selectedSupplier.name || '',
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
                      document.getElementById('productId')?.focus();
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
                      if (!e.target.value) {
                        setFormData(prev => ({ ...prev, productId: '' }));
                        setSelectedProduct(null);
                      }
                      setProductDropdownOpen(true);
                    }}
                    onFocus={() => setProductDropdownOpen(true)}
                    onKeyDown={(e) => {
                      if (e.key === 'Escape') {
                        setProductDropdownOpen(false);
                        if (!formData.productId) setProductQuery('');
                      }
                      if (e.key === 'Enter' && productSuggestions.length > 0 && !formData.productId) {
                        e.preventDefault();
                        handleSelectProduct(productSuggestions[0]);
                      }
                    }}
                    placeholder="Type product name..."
                    autoComplete="off"
                    className={`w-full h-10 pl-9 pr-9 text-sm border rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 ${formErrors.productId ? 'border-red-500' : 'border-gray-300'
                      }`}
                  />
                  {selectedProduct && (
                    <button
                      type="button"
                      onClick={clearProduct}
                      className="absolute right-2 top-1/2 -translate-y-1/2 p-1 text-gray-400 hover:text-gray-600 rounded"
                      aria-label="Clear product"
                    >
                      <X className="w-4 h-4" />
                    </button>
                  )}
                  {productDropdownOpen && (
                    <div className="absolute z-20 left-0 right-0 mt-1 bg-white border border-gray-200 rounded-md shadow-lg max-h-56 overflow-y-auto">
                      {products.length === 0 ? (
                        <div className="px-3 py-4 text-sm text-gray-500">No products. Add products in Dashboard.</div>
                      ) : productSuggestions.length === 0 ? (
                        <div className="px-3 py-4 text-sm text-gray-500">No matching products.</div>
                      ) : (
                        productSuggestions.map((product) => (
                          <button
                            key={product._id}
                            type="button"
                            className="w-full px-3 py-2.5 text-left text-sm hover:bg-blue-50 flex flex-col gap-0.5 border-b border-gray-50 last:border-0"
                            onClick={() => handleSelectProduct(product)}
                          >
                            <span className="font-medium text-gray-900">
                              {product.name} | {product.companyName || 'N/A'} | {product.unit || 'N/A'}
                            </span>
                          </button>
                        ))
                      )}
                    </div>
                  )}
                </div>
              </div>

              {/* Quantity */}
              <div className={isAdmin ? "col-span-1" : "col-span-2"}>
                <label className="block text-xs font-medium text-gray-700 mb-1">
                  Qty *
                </label>
                <input
                  id="quantity"
                  type="number"
                  value={formData.quantity}
                  onChange={(e) => handleInputChange('quantity', e.target.value)}
                  placeholder="0"
                  min="1"
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

              {/* Purchasing Price */}
              {isAdmin && (
                <div className="col-span-1">
                  <label className="block text-xs font-medium text-gray-700 mb-1">
                    Purch. Price *
                  </label>
                  <input
                    id="purchasingPrice"
                    type="number"
                    value={formData.purchasingPrice}
                    onChange={(e) => handleInputChange('purchasingPrice', e.target.value)}
                    placeholder="0.00"
                    min="0"
                    step="0.01"
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

              {/* Selling Price – admin only */}
              {isAdmin && (
                <div className="col-span-1">
                  <label className="block text-xs font-medium text-gray-700 mb-1">
                    Sell. Price
                  </label>
                  <input
                    id="sellingPrice"
                    type="number"
                    value={formData.sellingPrice}
                    onChange={(e) => handleInputChange('sellingPrice', e.target.value)}
                    placeholder="0.00"
                    min="0"
                    step="0.01"
                    className={`w-full h-10 px-3 text-sm border rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 ${formErrors.sellingPrice ? 'border-red-500' : 'border-gray-300'}`}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') {
                        e.preventDefault();
                        document.getElementById('expiry')?.focus();
                      }
                    }}
                  />
                </div>
              )}

              {/* Expiry */}
              <div className="col-span-2">
                <label className="block text-xs font-medium text-gray-700 mb-1">
                  Expiry Date *
                </label>
                <input
                  id="expiry"
                  type="date"
                  value={formData.expiry ? moment(formData.expiry).format('YYYY-MM-DD') : ''}
                  onChange={(e) => handleInputChange('expiry', e.target.value ? new Date(e.target.value) : null)}
                  className={`w-full h-10 px-3 text-sm border rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 ${formErrors.expiry ? 'border-red-500' : 'border-gray-300'
                    }`}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') {
                      e.preventDefault();
                      addItem(e);
                    }
                  }}
                />
              </div>

              {/* Total */}
              {isAdmin && (
                <div className="col-span-1">
                  <label className="block text-xs font-medium text-gray-700 mb-1">
                    Total
                  </label>
                  <div className="h-10 px-3 flex items-center bg-green-50 border border-green-200 rounded-md">
                    <span className="text-sm font-bold text-green-700">
                      QR{formData.quantity && formData.purchasingPrice ? (formData.quantity * formData.purchasingPrice).toFixed(2) : '0.00'}
                    </span>
                  </div>
                </div>
              )}
            </div>

            {/* Product Info Bar */}
            {selectedProduct && (
              <div className="mt-3 p-2 bg-blue-50 border border-blue-200 rounded text-xs flex items-center gap-4">
                <span><strong>Type:</strong> {selectedProduct.type || 'N/A'}</span>
                <span><strong>Unit:</strong> {selectedProduct.unit || 'N/A'}</span>
                <span><strong>Stock:</strong> <span className="font-semibold text-blue-600">{selectedProduct.stock || 0}</span></span>
              </div>
            )}

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
                        <button
                          onClick={() => removeItem(item.id)}
                          className="p-1.5 text-red-600 hover:bg-red-50 rounded transition-colors"
                          title="Remove item"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

export default Stockin;
