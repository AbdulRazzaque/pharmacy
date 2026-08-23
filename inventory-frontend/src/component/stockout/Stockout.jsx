import React, { useState, useEffect, useRef, useMemo } from 'react';
import axios from 'axios';
import { getToken, getUserInfo } from '../../utils/auth';
import { Badge } from '../../components/ui/badge';
import { Alert, AlertDescription } from '../../components/ui/alert';
import { Plus, Trash2, TrendingDown, Save, Package, AlertCircle, CheckCircle2, Search, X, Printer } from 'lucide-react';
import moment from 'moment';
import { useNavigate } from 'react-router-dom';

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
    sellingPrice: ''
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

  const accessToken = getToken();

  const stockSuggestions = useMemo(() => {
    const q = (stockQuery || '').trim().toLowerCase();
    if (!q) return stocks.slice(0, 25);
    return stocks.filter(
      (s) => (s.productName || '').toLowerCase().includes(q) || (s.type || '').toLowerCase().includes(q)
    ).slice(0, 25);
  }, [stocks, stockQuery]);

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
        if (draft.date) setDate(draft.date);
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
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

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
                    sellingPrice: expiryItem.sellingPrice ?? 0,
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
          setDocNo(res.data.result[0].docNo + 1);
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

    const newItem = {
      id: Date.now(),
      stockId: selectedStock.originalStockId || selectedStock._id, // Use originalStockId for grouped items
      productName: selectedStock.productName, // frontend display only
      companyName: selectedStock.companyName, // frontend display only
      type: selectedStock.type,               // frontend display only
      unit: selectedStock.unit,               // frontend display only
      locationId: docLocationId,
      location: selectedLocation ? selectedLocation.name : '', // frontend display only
      quantity: parseInt(formData.quantity),
      sellingPrice: parseFloat(formData.sellingPrice) || selectedStock.sellingPrice || 0,
      total: parseInt(formData.quantity) * (parseFloat(formData.sellingPrice) || selectedStock.sellingPrice || 0),
      expiry: selectedStock.expiry,           // Auto-selected expiry from FIFO
      doctorName: docDoctorName,
      trainerName: docTrainerName
    };

    setStockOutItems([...stockOutItems, newItem]);

    setFormData({
      stockId: '',
      quantity: '',
      sellingPrice: ''
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
            locationId: item.locationId,
            quantity: item.quantity,
            sellingPrice: item.sellingPrice ?? 0,
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
            sellingPrice: item.sellingPrice
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
          sellingPrice: ''
        });
        setStockQuery('');
        setSelectedStock(null);
        localStorage.removeItem('stockout_draft');

        setDocNo(docNo + 1);
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

  const getGrandTotal = () => {
    return stockOutItems.reduce((sum, item) => sum + item.total, 0);
  };

  return (
    <div className="min-h-screen bg-gray-50 p-4">
      <div className="max-w-[1600px] mx-auto">
        {/* Header */}
        <div className="bg-white rounded-lg shadow-sm p-4 mb-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <TrendingDown className="w-6 h-6 text-red-600" />
              <div>
                <h1 className="text-2xl font-bold text-gray-900">Stock Out Entry</h1>
                <p className="text-sm text-gray-500">Quick data entry like Excel</p>
              </div>
            </div>
            <div className="flex items-center gap-4">
              <div className="text-right">
                <div className="text-xs text-gray-500">Document No</div>
                <div className="text-lg font-bold text-red-600">#{docNo}</div>
              </div>
              <div className="text-right">
                <div className="text-xs text-gray-500 mb-1">Date</div>
                <div className="bg-white rounded-lg shadow-sm p-2">
                  <input
                    type="date"
                    value={date}
                    onChange={(e) => setDate(e.target.value)}
                    className="text-sm font-semibold text-black w-64 border border-gray-300 rounded-md px-2 py-1 focus:outline-none focus:ring-2 focus:ring-red-500 focus:border-transparent"
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
        {/* Document Details Form */}
        <div className="bg-white rounded-lg shadow-sm mb-4 border border-gray-200">
          <div className="bg-gradient-to-r from-gray-700 to-gray-800 text-white px-4 py-3 rounded-t-lg">
            <h2 className="font-semibold flex items-center gap-2">
              <Package className="w-4 h-4 text-red-500" />
              Document / Dispatch Information
            </h2>
          </div>
          <div className="p-4 grid grid-cols-1 md:grid-cols-2 gap-4">
            {/* Location Selection */}
            <div>
              <label className="block text-xs font-semibold text-gray-800 mb-1.5">
                Location *
              </label>
              <select
                id="docLocationId"
                value={docLocationId}
                onChange={(e) => setDocLocationId(e.target.value)}
                className={`w-full h-10 px-3 text-sm border-2 rounded-lg shadow-sm bg-white focus:ring-2 focus:ring-red-500 focus:outline-none ${formErrors.locationId && !docLocationId ? 'border-red-500 bg-red-50' : 'border-gray-300'
                  }`}
              >
                <option value="">Select Location</option>
                {locations.map((location) => (
                  <option key={location._id} value={location._id}>
                    {location.name}
                  </option>
                ))}
              </select>
            </div>

            {/* Trainer Name (Editable, auto-filled) */}
            <div>
              <label className="block text-xs font-semibold text-gray-800 mb-1.5">
                Trainer Name
              </label>
              <input
                type="text"
                value={docTrainerName}
                onChange={(e) => setDocTrainerName(e.target.value)}
                placeholder="Trainer Name"
                className="w-full h-10 px-3 text-sm border-2 border-gray-300 rounded-lg shadow-sm bg-white focus:ring-2 focus:ring-red-500 focus:outline-none"
              />
            </div>
          </div>
        </div>

        {/* Excel-like Entry Form */}
        <div className="bg-white rounded-lg shadow-sm mb-4">
          <div className="bg-gradient-to-r from-red-500 to-red-600 text-white px-4 py-3 rounded-t-lg">
            <h2 className="font-semibold flex items-center gap-2">
              <Package className="w-4 h-4" />
              Quick Entry Form (Press Tab to move between fields, Enter to add)
            </h2>
          </div>

          <form onSubmit={addItem} className="p-4">
            <div className="grid grid-cols-12 gap-3">
              {/* Product – type-ahead autocomplete */}
              <div className="col-span-6 relative" ref={stockAutocompleteRef}>
                <label className="block text-xs font-semibold text-gray-800 mb-1.5">
                  Product *
                </label>
                <div className="relative">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400 pointer-events-none" />
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
                      if (e.key === 'Escape') {
                        setStockDropdownOpen(false);
                        if (!formData.stockId) setStockQuery('');
                      }
                      if (e.key === 'Enter' && stockSuggestions.length > 0 && !formData.stockId) {
                        e.preventDefault();
                        handleSelectStock(stockSuggestions[0]);
                      }
                    }}
                    placeholder="Type product name..."
                    autoComplete="off"
                    className={`w-full h-10 pl-9 pr-9 text-sm border-2 rounded-lg shadow-sm transition-all duration-200 hover:border-red-400 focus:outline-none focus:ring-2 focus:ring-red-500 focus:border-transparent ${formErrors.stockId ? 'border-red-500 bg-red-50' : 'border-gray-300 bg-white'
                      }`}
                  />
                  {
                    selectedStock && (
                      <button
                        type="button"
                        onClick={clearStock}
                        className="absolute right-2 top-1/2 -translate-y-1/2 p-1 text-gray-400 hover:text-gray-600 rounded"
                        aria-label="Clear product"
                      >
                        <X className="w-4 h-4" />
                      </button>
                    )}
                  {
                    stockDropdownOpen && (
                      <div className="absolute z-20 left-0 right-0 mt-1 bg-white border-2 border-gray-200 rounded-lg shadow-lg max-h-56 overflow-y-auto">
                        {
                          stocks.length === 0 ? (
                            <div className="px-3 py-4 text-sm text-gray-500">No stock available.</div>
                          ) : stockSuggestions.length === 0 ? (
                            <div className="px-3 py-4 text-sm text-gray-500">No matching products.</div>
                          ) : (
                            stockSuggestions.map((stock) => (
                              <button
                                key={stock._id}
                                type="button"
                                className="w-full px-3 py-2.5 text-left text-sm hover:bg-red-50 flex flex-col gap-0.5 border-b border-gray-50 last:border-0"
                                onClick={() => handleSelectStock(stock)}
                              >
                                <span className="font-medium text-gray-900">
                                  {stock.productName} | {stock.companyName || 'N/A'} | {stock.unit || 'N/A'}
                                </span>
                                <span className="text-xs text-gray-500">
                                  {stock.expiry ? `Exp: ${moment(stock.expiry).format('DD/MM/YY')}` : 'No expiry'} • Qty: {stock.quantity}
                                </span>
                              </button>
                            ))
                          )}
                      </div>
                    )}
                </div>
              </div>

              {/* Selling Price (from Stock In) */}

              <div className="col-span-2">
                <label className="block text-xs font-semibold text-gray-800 mb-1.5">
                  Sell. Price
                </label>
                <input
                  id="sellingPrice"
                  type="number"
                  value={formData.sellingPrice}
                  readOnly
                  tabIndex={-1}
                  placeholder="0.00"
                  className="w-full h-10 px-3 text-sm border-2 border-gray-300 rounded-lg shadow-sm bg-gray-100 text-gray-700 cursor-default"
                  title="Selling price from Stock In (read-only)"
                />
              </div>


              {/* Available Quantity */}
              <div className={"col-span-2"}>
                <label className="block text-xs font-semibold text-gray-800 mb-1.5">
                  Available
                </label>
                <div className="h-10 px-3 flex items-center bg-gradient-to-br from-blue-50 to-blue-100 border-2 border-blue-300 rounded-lg shadow-sm">
                  <span className="text-sm font-bold text-blue-700">
                    {selectedStock?.quantity || 0}
                  </span>
                </div>
              </div>

              {/* Quantity to Issue */}
              <div className="col-span-2">
                <label className="block text-xs font-semibold text-gray-800 mb-1.5">
                  Issue Qty *
                </label>
                <input
                  id="quantity"
                  type="number"
                  value={formData.quantity}
                  onChange={(e) => handleInputChange('quantity', e.target.value)}
                  placeholder="0"
                  min="1"
                  max={selectedStock?.quantity || 999999}
                  className={
                    `w-full h-10 px-3 text-sm border-2 rounded-lg shadow-sm transition-all duration-200 hover:border-red-400 focus:outline-none focus:ring-2 focus:ring-red-500 focus:border-transparent placeholder:text-gray-400 ${formErrors.quantity ? 'border-red-500 bg-red-50' : 'border-gray-300 bg-white'
                    }`
                  }
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
                  <label className="block text-xs font-semibold text-gray-800 mb-1.5">
                    Total
                  </label>
                  <div className="h-10 px-3 flex items-center bg-gradient-to-br from-red-50 to-red-100 border-2 border-red-300 rounded-lg shadow-sm">
                    <span className="text-sm font-bold text-red-700">
                      QR{selectedStock && formData.quantity
                        ? (formData.quantity * (parseFloat(formData.sellingPrice) || selectedStock.sellingPrice || 0)).toFixed(2)
                        : '0.00'}
                    </span>
                  </div>
                </div>
              )}
            </div>

            {/* Stock Info Bar */}
            {selectedStock && (
              <div className="mt-3 p-3 bg-gradient-to-r from-blue-50 to-indigo-50 border-2 border-blue-300 rounded-lg shadow-md text-xs flex items-center gap-4">
                <span><strong>Type:</strong> {selectedStock.type || 'N/A'}</span>
                <span><strong>Unit:</strong> {selectedStock.unit || 'N/A'}</span>
                {isAdmin && <span><strong>Selling Price:</strong> QR{formData.sellingPrice || selectedStock.sellingPrice || 0}</span>}
                <span><strong>Available:</strong> <span className="font-semibold text-blue-600">{selectedStock.quantity}</span></span>
                {selectedStock.expiry && (
                  <span><strong>Expiry (FIFO):</strong> <span className="font-semibold text-orange-600">{moment(selectedStock.expiry).format('DD/MM/YYYY')}</span></span>
                )}
              </div>
            )}

            {formErrors.quantity && (
              <div className="mt-2 text-xs text-red-600 flex items-center gap-1">
                <AlertCircle className="w-3 h-3" />
                {formErrors.quantity}
              </div>
            )}

            {/* Action Buttons */}
            <div className="mt-4 flex items-center gap-3">
              <button
                type="submit"
                className="px-6 py-2.5 bg-gradient-to-r from-red-600 to-red-700 text-white rounded-lg hover:from-red-700 hover:to-red-800 font-semibold text-sm flex items-center gap-2 shadow-md hover:shadow-lg transition-all duration-200 focus:outline-none focus:ring-2 focus:ring-red-500 focus:ring-offset-2"
              >
                <Plus className="w-4 h-4" />
                Add Item (Enter)
              </button>

              {stockOutItems.length > 0 && (
                <>
                  <button
                    type="button"
                    onClick={() => handleSaveAndPrint(false)}
                    disabled={loading}
                    className="px-6 py-2.5 bg-gradient-to-r from-green-600 to-green-700 text-white rounded-lg hover:from-green-700 hover:to-green-800 font-semibold text-sm flex items-center gap-2 shadow-md hover:shadow-lg transition-all duration-200 focus:outline-none focus:ring-2 focus:ring-green-500 focus:ring-offset-2 disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    <Save className="w-4 h-4" />
                    {loading ? 'Saving...' : `Save All (${stockOutItems.length} items)`}
                  </button>
                  <button
                    type="button"
                    onClick={() => handleSaveAndPrint(true)}
                    disabled={loading}
                    className="px-6 py-2.5 bg-gradient-to-r from-blue-600 to-blue-700 text-white rounded-lg hover:from-blue-700 hover:to-blue-800 font-semibold text-sm flex items-center gap-2 shadow-md hover:shadow-lg transition-all duration-200 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    <Printer className="w-4 h-4" />
                    {loading ? 'Processing...' : `Print PDF (${stockOutItems.length} items)`}
                  </button>
                </>
              )}

              {isAdmin && (
                <div className="ml-auto text-right">
                  <div className="text-xs text-gray-500">Grand Total</div>
                  <div className="text-2xl font-bold text-red-600">QR{getGrandTotal().toFixed(2)}</div>
                </div>
              )}
            </div>
          </form>
        </div>

        {/* Items Table */}
        {stockOutItems.length > 0 && (
          <div className="bg-white rounded-lg shadow-sm overflow-hidden">
            <div className="bg-gray-700 text-white px-4 py-3 flex items-center justify-between">
              <h3 className="font-semibold">Items List</h3>
              <Badge variant="secondary" className="bg-white text-gray-700">
                {stockOutItems.length} Items • {getTotalQuantity()} Total Qty
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
                    <th className="px-4 py-3 text-left font-semibold text-gray-700">Location</th>
                    <th className="px-4 py-3 text-left font-semibold text-gray-700">Doctor</th>
                    <th className="px-4 py-3 text-left font-semibold text-gray-700">Trainer</th>
                    <th className="px-4 py-3 text-right font-semibold text-gray-700">Qty</th>
                    {isAdmin && <th className="px-4 py-3 text-right font-semibold text-gray-700">Sell. Price</th>}
                    {isAdmin && <th className="px-4 py-3 text-right font-semibold text-gray-700">Total</th>}
                    <th className="px-4 py-3 text-left font-semibold text-gray-700">Expiry (Auto)</th>
                    <th className="px-4 py-3 text-center font-semibold text-gray-700">Action</th>
                  </tr>
                </thead>
                <tbody>
                  {stockOutItems.map((item, index) => (
                    <tr key={item.id} className="border-b hover:bg-gray-50">
                      <td className="px-4 py-3 font-medium text-gray-600">{index + 1}</td>
                      <td className="px-4 py-3 font-medium text-gray-900">{item.productName}</td>
                      <td className="px-4 py-3 text-gray-700">{item.companyName || '-'}</td>
                      <td className="px-4 py-3 text-gray-700">{item.unit || '-'}</td>
                      <td className="px-4 py-3">{item.location}</td>
                      <td className="px-4 py-3">{item.doctorName || '-'}</td>
                      <td className="px-4 py-3">{item.trainerName || '-'}</td>
                      <td className="px-4 py-3 text-right font-semibold text-red-600">{item.quantity}</td>
                      {isAdmin && <td className="px-4 py-3 text-right">QR{(item.sellingPrice ?? 0).toFixed(2)}</td>}
                      {isAdmin && (
                        <td className="px-4 py-3 text-right font-semibold text-red-600">
                          QR{item.total.toFixed(2)}
                        </td>
                      )}
                      <td className="px-4 py-3">
                        {item.expiry ? moment(item.expiry).format('DD/MM/YYYY') : '-'}
                      </td>
                      <td className="px-4 py-3 text-center">
                        <button
                          onClick={() => {
                            setStockOutItems(stockOutItems.filter(i => i.id !== item.id));
                            showAlert('Item removed', 'success');
                          }}
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

export default Stockout;
