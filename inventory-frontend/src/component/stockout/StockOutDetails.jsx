import React, { useState, useEffect, useRef, useMemo } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import axios from 'axios';
import { getToken, getUserInfo } from '../../utils/auth';
import { Button } from '../../components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '../../components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '../../components/ui/table';
import { Alert, AlertDescription } from '../../components/ui/alert';
import { Badge } from '../../components/ui/badge';
import {
  ArrowLeft,
  PackageMinus,
  MapPin,
  User,
  Hash,
  TrendingDown,
  Edit,
  Trash2,
  PlusCircle,
  Save,
  Plus,
  Search,
  X,
  AlertCircle,
  Package
} from 'lucide-react';
import moment from 'moment';

const StockOutDetails = () => {
  const { docNo } = useParams();
  const navigate = useNavigate();
  const [stockOutData, setStockOutData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [alert, setAlert] = useState({ show: false, message: '', type: '' });
  const [editingItem, setEditingItem] = useState(null);
  const [creating, setCreating] = useState(false);
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [groupedStocks, setGroupedStocks] = useState([]);
  const [pendingOutItems, setPendingOutItems] = useState([]);
  const [outDate, setOutDate] = useState(() => moment().format('YYYY-MM-DD'));
  const [outFormData, setOutFormData] = useState({
    stockId: '',
    locationId: '',
    quantity: '',
    sellingPrice: '',
    doctorName: '',
    trainerName: ''
  });
  const [outFormErrors, setOutFormErrors] = useState({});
  const [outStockQuery, setOutStockQuery] = useState('');
  const [outSelectedStock, setOutSelectedStock] = useState(null);
  const [outStockDropdownOpen, setOutStockDropdownOpen] = useState(false);
  const outStockAutocompleteRef = useRef(null);
  const [editForm, setEditForm] = useState({ quantity: '', sellingPrice: '', doctorName: '', trainerName: '', productName: '', locationId: '' });
  const [locations, setLocations] = useState([]);

  const isAdmin = useMemo(
    () => (getUserInfo()?.role || '').toLowerCase() === 'admin',
    []
  );

  const accessToken = getToken();

  useEffect(() => {
    if (docNo) {
      fetchStockOutInfo();
    }
    fetchLocations();
    fetchStocks();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [docNo]);

  const fetchLocations = () => {
    axios.get(`${process.env.REACT_APP_DEVELOPMENT}/api/location/getAllLocations`, {
      headers: { token: accessToken }
    })
      .then((res) => setLocations(res.data.result || []))
      .catch((err) => console.error('Error fetching locations:', err));
  };

  const fetchStocks = () => {
    axios
      .get(`${process.env.REACT_APP_DEVELOPMENT}/api/stock/getAllStocks`, {
        headers: { token: accessToken }
      })
      .then((res) => {
        const stockMap = new Map();
        (res.data.result || []).forEach((stock) => {
          if (stock.totalQuantity > 0 && stock.expiryArray && stock.expiryArray.length > 0) {
            stock.expiryArray.forEach((expiryItem) => {
              if (expiryItem.quantity > 0) {
                const productName = stock.name || stock.product?.name || 'Unknown Product';
                const expiryDate = expiryItem.expiry
                  ? moment(expiryItem.expiry).format('YYYY-MM-DD')
                  : 'no-expiry';
                const mapKey = `${productName}_${expiryDate}`;
                if (stockMap.has(mapKey)) {
                  const existing = stockMap.get(mapKey);
                  existing.quantity += expiryItem.quantity || 0;
                  existing.stockIds.push(stock._id);
                } else {
                  stockMap.set(mapKey, {
                    _id: `${stock._id}_${expiryDate}`,
                    originalStockId: stock._id,
                    stockIds: [stock._id],
                    productName,
                    companyName: stock.product?.companyName || '',
                    type: stock.product?.type || '',
                    unit: stock.product?.unit || '',
                    quantity: expiryItem.quantity || 0,
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
        setGroupedStocks(Array.from(stockMap.values()));
      })
      .catch((err) => console.error('Error fetching stocks:', err));
  };

  const stockOutSuggestions = useMemo(() => {
    const q = (outStockQuery || '').trim().toLowerCase();
    if (!q) return groupedStocks.slice(0, 25);
    return groupedStocks
      .filter(
        (s) =>
          (s.productName || '').toLowerCase().includes(q) || (s.type || '').toLowerCase().includes(q)
      )
      .slice(0, 25);
  }, [groupedStocks, outStockQuery]);

  useEffect(() => {
    if (outFormData.stockId) {
      const stock = groupedStocks.find((s) => s._id === outFormData.stockId);
      setOutSelectedStock(stock || null);
      if (stock) {
        setOutStockQuery(
          `${stock.productName}${stock.expiry ? ` | Exp: ${moment(stock.expiry).format('DD/MM/YY')}` : ''
          } (Qty: ${stock.quantity})`
        );
      }
    } else {
      setOutSelectedStock(null);
      setOutStockQuery('');
    }
  }, [outFormData.stockId, groupedStocks]);

  useEffect(() => {
    if (outFormData.locationId) {
      const location = locations.find((l) => l._id === outFormData.locationId);
      if (location) {
        setOutFormData((prev) => ({
          ...prev,
          trainerName: location.trainerName || prev.trainerName,
          doctorName: location.doctorName || prev.doctorName
        }));
      }
    }
  }, [outFormData.locationId, locations]);

  useEffect(() => {
    const handleClickOutside = (e) => {
      if (outStockAutocompleteRef.current && !outStockAutocompleteRef.current.contains(e.target)) {
        setOutStockDropdownOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const fetchStockOutInfo = () => {
    setLoading(true);
    axios.post(
      `${process.env.REACT_APP_DEVELOPMENT}/api/stockOut/getStockOutByDocNo`,
      { docNo: parseInt(docNo) },
      { headers: { token: accessToken } }
    )
      .then((res) => {
        if (res.data.result && res.data.result.length > 0) {
          setStockOutData(res.data.result[0]);
        }
        setLoading(false);
      })
      .catch((err) => {
        console.error('Error fetching stock out info:', err);
        showAlert('Failed to fetch stock out details', 'error');
        setLoading(false);
      });
  };

  const showAlert = (message, type) => {
    setAlert({ show: true, message, type });
    setTimeout(() => setAlert({ show: false, message: '', type: '' }), 3000);
  };

  const handleEditClick = (item) => {
    setEditingItem(item);

    // Get location ID - handle both populated and non-populated cases
    let currentLocationId = '';
    if (item.locationId) {
      currentLocationId = typeof item.locationId === 'object' ? item.locationId._id : item.locationId;
    } else if (item.locationName && locations.length > 0) {
      // Try to find location by name if locationId is not available
      const matchedLocation = locations.find(loc =>
        loc.name === item.locationName ||
        loc.doctorName === item.doctorName
      );
      if (matchedLocation) {
        currentLocationId = matchedLocation._id;
      }
    }

    const formData = {
      quantity: Math.abs(item.quantity) || '',
      sellingPrice: item.sellingPrice ?? '',
      discountPercentage: item.discountPercentage ?? '0',
      doctorName: item.doctorName || '',
      trainerName: item.trainerName || '',
      productName: item.name || '',
      locationId: currentLocationId
    };

    setEditForm(formData);
  };

  const handleEditSave = () => {
    if (!editForm.quantity) {
      showAlert('Please enter quantity', 'error');
      return;
    }
    if (!editForm.locationId) {
      showAlert('Please select location', 'error');
      return;
    }
    if (editForm.sellingPrice === '' || Number(editForm.sellingPrice) < 0 || Number.isNaN(Number(editForm.sellingPrice))) {
      showAlert('Please enter valid selling price', 'error');
      return;
    }

    const updateData = {
      quantity: parseInt(editForm.quantity),
      sellingPrice: parseFloat(editForm.sellingPrice),
      discountPercentage: parseFloat(editForm.discountPercentage || 0),
      originalQuantity: Math.abs(editingItem.quantity),
      productId: editingItem.productId?._id || editingItem.productId,
      productName: editingItem.name,
      locationId: editForm.locationId,
      doctorName: editForm.doctorName,
      trainerName: editForm.trainerName
    };

    axios.post(
      `${process.env.REACT_APP_DEVELOPMENT}/api/stockOut/stockOutUpdateQuantity/${editingItem._id}`,
      updateData,
      { headers: { token: accessToken } }
    )
      .then(() => {
        showAlert('Stock Out updated successfully!', 'success');
        setEditingItem(null);
        fetchStockOutInfo();
        fetchStocks();
      })
      .catch((err) => {
        console.error('Update error:', err.response?.data || err.message);
        showAlert(err.response?.data?.result || 'Failed to update stock out', 'error');
      });
  };

  const getTotalQuantity = () => {
    if (!stockOutData || !stockOutData.doc) return 0;
    return stockOutData.doc.reduce((sum, item) => sum + (item.quantity || 0), 0);
  };

  const getSubTotal = () => {
    if (!stockOutData || !stockOutData.doc) return 0;
    return stockOutData.doc.reduce((sum, item) => sum + (item.itemTotal !== undefined && item.itemTotal !== 0 ? item.itemTotal : (Math.abs(item.quantity || 0) * Number(item.sellingPrice || 0))), 0);
  };

  const getTotalDiscount = () => {
    if (!stockOutData || !stockOutData.doc) return 0;
    return stockOutData.doc.reduce((sum, item) => sum + (item.discountAmount || 0), 0);
  };

  const getGrandTotal = () => {
    if (!stockOutData || !stockOutData.doc) return 0;
    return stockOutData.doc.reduce((sum, item) => sum + (item.netTotal !== undefined && item.netTotal !== 0 ? item.netTotal : ((Math.abs(item.quantity || 0) * Number(item.sellingPrice || 0)) - (item.discountAmount || 0))), 0);
  };

  const getLocationName = () => {
    if (!stockOutData || !stockOutData.doc || !stockOutData.doc[0]) return 'N/A';
    return stockOutData.doc[0].locationName || 'N/A';
  };

  const getDoctorName = () => {
    if (!stockOutData || !stockOutData.doc || !stockOutData.doc[0]) return 'N/A';
    return stockOutData.doc[0].doctorName || 'N/A';
  };

  const getTrainerName = () => {
    if (!stockOutData || !stockOutData.doc || !stockOutData.doc[0]) return 'N/A';
    return stockOutData.doc[0].trainerName || 'N/A';
  };

  const getOutStockDisplayLabel = (stock) =>
    `${stock.productName}${stock.expiry ? ` | Exp: ${moment(stock.expiry).format('DD/MM/YY')}` : ''
    } (Qty: ${stock.quantity})`;

  const handleOutChange = (field, value) => {
    setOutFormData((prev) => ({ ...prev, [field]: value }));
    if (outFormErrors[field]) {
      setOutFormErrors((prev) => ({ ...prev, [field]: '' }));
    }
  };

  const handleSelectOutStock = (stock) => {
    setOutFormData((prev) => ({ ...prev, stockId: stock._id, sellingPrice: stock.sellingPrice ?? '' }));
    setOutSelectedStock(stock);
    setOutStockQuery(getOutStockDisplayLabel(stock));
    setOutStockDropdownOpen(false);
    if (outFormErrors.stockId) setOutFormErrors((prev) => ({ ...prev, stockId: '' }));
    setTimeout(() => document.getElementById('sod-quantity')?.focus(), 50);
  };

  const clearOutStock = () => {
    setOutFormData((prev) => ({ ...prev, stockId: '', sellingPrice: '' }));
    setOutSelectedStock(null);
    setOutStockQuery('');
    setOutStockDropdownOpen(false);
    document.getElementById('sod-stock-input')?.focus();
  };

  const validateOutLine = () => {
    const errors = {};
    if (!outFormData.stockId) errors.stockId = 'Please select a product';
    if (!outFormData.locationId) errors.locationId = 'Please select a location';
    if (!outFormData.quantity || Number(outFormData.quantity) <= 0) {
      errors.quantity = 'Please enter valid quantity';
    }
    if (outFormData.sellingPrice === '' || Number(outFormData.sellingPrice) < 0 || Number.isNaN(Number(outFormData.sellingPrice))) {
      errors.sellingPrice = 'Please enter valid selling price';
    }
    const selected = outSelectedStock || groupedStocks.find((s) => s._id === outFormData.stockId);
    if (selected && Number(outFormData.quantity) > selected.quantity) {
      errors.quantity = `Only ${selected.quantity} units available`;
    }
    setOutFormErrors(errors);
    return Object.keys(errors).length === 0;
  };

  const addPendingOutLine = (e) => {
    if (e) e.preventDefault();
    if (!validateOutLine()) {
      showAlert('Please fill all required fields correctly', 'error');
      return;
    }
    const selectedStock = outSelectedStock || groupedStocks.find((s) => s._id === outFormData.stockId);
    const selectedLocation = locations.find((l) => l._id === outFormData.locationId);
    const sellingPrice = parseFloat(outFormData.sellingPrice);
    const newItem = {
      id: Date.now(),
      stockId: selectedStock.originalStockId || selectedStock._id,
      productName: selectedStock.productName,
      companyName: selectedStock.companyName || '',
      type: selectedStock.type,
      unit: selectedStock.unit,
      locationId: selectedLocation._id,
      location: selectedLocation.name,
      quantity: parseInt(outFormData.quantity, 10),
      sellingPrice,
      total: parseInt(outFormData.quantity, 10) * sellingPrice,
      expiry: selectedStock.expiry,
      doctorName: outFormData.doctorName,
      trainerName: outFormData.trainerName
    };
    setPendingOutItems((prev) => [...prev, newItem]);
    setOutFormData((prev) => ({
      ...prev,
      stockId: '',
      quantity: '',
      sellingPrice: ''
    }));
    setOutFormErrors({});
    setOutStockQuery('');
    setOutSelectedStock(null);
    setTimeout(() => document.getElementById('sod-stock-input')?.focus(), 100);
  };

  const removePendingOutLine = (id) => {
    setPendingOutItems((prev) => prev.filter((i) => i.id !== id));
  };

  const getPendingOutGrandTotal = () =>
    pendingOutItems.reduce((sum, item) => sum + (item.total || 0), 0);

  const saveAllPendingOut = () => {
    if (pendingOutItems.length === 0) {
      showAlert('Add at least one line before saving', 'error');
      return;
    }
    setCreating(true);
    const promises = pendingOutItems.map((item) =>
      axios.post(
        `${process.env.REACT_APP_DEVELOPMENT}/api/stockOut/stockOuts`,
        {
          docNo: Number(docNo),
          date: outDate,
          stockId: item.stockId,
          locationId: item.locationId,
          quantity: item.quantity,
          sellingPrice: item.sellingPrice,
          doctorName: item.doctorName || '',
          trainerName: item.trainerName || ''
        },
        { headers: { token: accessToken } }
      )
    );
    Promise.all(promises)
      .then(() => {
        showAlert('All Stock Out lines saved under this document', 'success');
        setShowCreateModal(false);
        setPendingOutItems([]);
        fetchStockOutInfo();
        fetchStocks();
      })
      .catch((err) => {
        console.error('Create stock out error:', err.response?.data || err.message);
        showAlert(
          err.response?.data?.message || err.response?.data?.result || 'Failed to save Stock Out',
          'error'
        );
      })
      .finally(() => setCreating(false));
  };

  const closeCreateModal = () => {
    setShowCreateModal(false);
    setPendingOutItems([]);
  };

  const handleOpenCreateModal = () => {
    const first = stockOutData?.doc?.[0];
    const rawLoc = first?.locationId;
    const defaultLocId =
      typeof rawLoc === 'object' && rawLoc?._id ? String(rawLoc._id) : rawLoc ? String(rawLoc) : '';
    setOutFormData({
      stockId: '',
      locationId: defaultLocId,
      quantity: '',
      sellingPrice: '',
      doctorName: first?.doctorName || '',
      trainerName: first?.trainerName || ''
    });
    setOutFormErrors({});
    setPendingOutItems([]);
    setOutStockQuery('');
    setOutSelectedStock(null);
    setOutDate(moment().format('YYYY-MM-DD'));
    setShowCreateModal(true);
  };

  return (
    <div className="container mx-auto p-6 space-y-6">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-4">
          <Button variant="outline" onClick={() => navigate(-1)}>
            <ArrowLeft className="mr-2 h-4 w-4" />
            Back
          </Button>
          <div>
            <h1 className="text-2xl font-bold flex items-center gap-2">
              <PackageMinus className="h-6 w-6" />
              Stock Out Details
            </h1>
            <p className="text-sm text-muted-foreground mt-1">
              Document No: <span className="font-semibold">{docNo}</span>
            </p>
          </div>
        </div>
        <Button onClick={handleOpenCreateModal} disabled={loading} className="gap-2">
          <PlusCircle className="h-4 w-4" />
          Stock Out
        </Button>
      </div>

      {alert.show && (
        <Alert variant={alert.type === 'error' ? 'destructive' : 'default'}>
          <AlertDescription>{alert.message}</AlertDescription>
        </Alert>
      )}

      {loading ? (
        <div className="text-center py-12">
          <div className="text-muted-foreground">Loading stock out details...</div>
        </div>
      ) : !stockOutData || !stockOutData.doc ? (
        <Card>
          <CardContent className="pt-6">
            <div className="text-center py-12">
              <PackageMinus className="h-12 w-12 mx-auto text-muted-foreground mb-4" />
              <p className="text-muted-foreground">No stock out records found for document number: {docNo}</p>
            </div>
          </CardContent>
        </Card>
      ) : (
        <>
          {/* Summary Cards */}
          <div className="grid grid-cols-1 md:grid-cols-6 gap-4">
            <Card>
              <CardContent className="pt-6">
                <div className="flex items-center gap-2">
                  <Hash className="h-5 w-5 text-blue-600" />
                  <div>
                    <div className="text-xl font-bold">{docNo}</div>
                    <p className="text-xs text-muted-foreground">Doc Number</p>
                  </div>
                </div>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="pt-6">
                <div className="flex items-center gap-2">
                  <TrendingDown className="h-5 w-5 text-red-600" />
                  <div>
                    <div className="text-xl font-bold text-red-600">{getTotalQuantity()}</div>
                    <p className="text-xs text-muted-foreground">Total Quantity</p>
                  </div>
                </div>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="pt-6">
                <div className="flex items-center gap-2">
                  <MapPin className="h-5 w-5 text-blue-600" />
                  <div>
                    <div className="text-lg font-bold truncate">{getLocationName()}</div>
                    <p className="text-xs text-muted-foreground">Location</p>
                  </div>
                </div>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="pt-6">
                <div>
                  <div className="text-lg font-bold text-gray-800">
                    QR{getSubTotal().toFixed(2)}
                  </div>
                  <p className="text-xs text-muted-foreground">Subtotal</p>
                </div>
              </CardContent>
            </Card>
            <Card className="bg-orange-50/50 border-orange-200">
              <CardContent className="pt-6">
                <div>
                  <div className="text-lg font-bold text-orange-700">
                    QR{getTotalDiscount().toFixed(2)}
                  </div>
                  <p className="text-xs text-orange-600 font-medium">Total Discount</p>
                </div>
              </CardContent>
            </Card>
            <Card className="bg-red-50/50 border-red-200">
              <CardContent className="pt-6">
                <div>
                  <div className="text-xl font-black text-red-700">
                    QR{getGrandTotal().toFixed(2)}
                  </div>
                  <p className="text-xs text-red-600 font-bold uppercase tracking-wider">Grand Total</p>
                </div>
              </CardContent>
            </Card>
          </div>

          {/* Stock Out Items Table */}
          <Card>
            <CardHeader>
              <CardTitle>Items Dispatched ({stockOutData.doc.length})</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Product Name</TableHead>
                      <TableHead>Company Name</TableHead>
                      <TableHead>Unit</TableHead>
                      <TableHead className="text-right">Quantity</TableHead>
                      <TableHead className="text-right">Sell. Price</TableHead>
                      <TableHead className="text-right">Total</TableHead>
                      <TableHead className="text-right">Disc %</TableHead>
                      <TableHead className="text-right">Disc Amt</TableHead>
                      <TableHead className="text-right">Net Total</TableHead>
                      <TableHead>Doctor Name</TableHead>
                      <TableHead>Trainer Name</TableHead>
                      <TableHead className="text-right">Expiry Date</TableHead>
                      <TableHead>Date Issued</TableHead>
                      <TableHead className="text-center">Actions</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {stockOutData.doc.map((item, index) => {
                      const qty = Math.abs(item.quantity) || 0;
                      const price = item.sellingPrice || 0;
                      const itemTotal = item.itemTotal !== undefined ? item.itemTotal : (qty * price);
                      const discPct = item.discountPercentage || 0;
                      const discAmt = item.discountAmount !== undefined ? item.discountAmount : ((itemTotal * discPct) / 100);
                      const netTotal = item.netTotal !== undefined ? item.netTotal : (itemTotal - discAmt);

                      return (
                        <TableRow key={item._id || index}>
                          <TableCell className="font-medium">{item.name || '-'}</TableCell>
                          <TableCell>{item.companyName || item.productId?.companyName || '-'}</TableCell>
                          <TableCell>{item.unit || '-'}</TableCell>
                          <TableCell className="text-right font-semibold text-gray-900">
                            -{qty}
                          </TableCell>
                          <TableCell className="text-right">QR{price.toFixed(2)}</TableCell>
                          <TableCell className="text-right text-gray-700 font-medium">QR{itemTotal.toFixed(2)}</TableCell>
                          <TableCell className="text-right text-orange-700 font-medium">{discPct > 0 ? `${discPct}%` : '0%'}</TableCell>
                          <TableCell className="text-right text-orange-700 font-medium">QR{discAmt.toFixed(2)}</TableCell>
                          <TableCell className="text-right font-bold text-red-600">QR{netTotal.toFixed(2)}</TableCell>
                          <TableCell>{item.doctorName || '-'}</TableCell>
                          <TableCell>{item.trainerName || '-'}</TableCell>
                          <TableCell>
                            {item.expiry ? moment(item.expiry).format('DD/MM/YYYY') : '-'}
                          </TableCell>
                          <TableCell>
                            {item.date ? moment(item.date).format('DD/MM/YYYY') :
                              item.createdAt ? moment(item.createdAt).format('DD/MM/YYYY HH:mm') : '-'}
                          </TableCell>
                          <TableCell className="text-center">
                            <div className="flex items-center justify-center gap-2">
                              <Button
                                size="sm"
                                variant="outline"
                                onClick={() => handleEditClick(item)}
                                className="gap-1"
                                title="Edit Stock Out"
                              >
                                <Edit className="h-4 w-4" />
                              </Button>
                              <Button
                                size="sm"
                                variant="destructive"
                                onClick={() => {
                                  if (window.confirm(`Delete this stock out entry?`)) {

                                    axios.post(`${process.env.REACT_APP_DEVELOPMENT}/api/stockOut/deleteStockOut`, {
                                      stockOutId: item._id,
                                      productId: item.productId?._id || item.productId, // Handle both populated and non-populated
                                      productName: item.name,
                                      quantity: Math.abs(item.quantity),
                                      expiry: item.expiry,
                                      docNo: stockOutData.docNo
                                    }, {
                                      headers: { token: accessToken }
                                    })
                                      .then(() => {
                                        showAlert('Stock Out entry deleted successfully!', 'success');
                                        setTimeout(() => window.location.reload(), 1500);
                                      })
                                      .catch((err) => {
                                        console.error('Delete error:', err.response?.data || err.message);
                                        showAlert(err.response?.data?.result || 'Failed to delete stock out entry', 'error');
                                      });
                                  }
                                }}
                                className="gap-1"
                                title="Delete Stock Out"
                              >
                                <Trash2 className="h-4 w-4" />
                              </Button>
                            </div>
                          </TableCell>
                        </TableRow>
                      );
                    })}
                  </TableBody>
                </Table>
              </div>
            </CardContent>
          </Card>

          {/* Additional Information */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <MapPin className="h-5 w-5" />
                Dispatch Information
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <div>
                  <label className="text-sm font-medium text-muted-foreground">Location</label>
                  <p className="text-base font-semibold mt-1">{getLocationName()}</p>
                </div>
                <div>
                  <label className="text-sm font-medium text-muted-foreground">Doctor Name</label>
                  <p className="text-base font-semibold mt-1">{getDoctorName()}</p>
                </div>
                <div>
                  <label className="text-sm font-medium text-muted-foreground">Trainer Name</label>
                  <p className="text-base font-semibold mt-1">{getTrainerName()}</p>
                </div>
              </div>
            </CardContent>
          </Card>
        </>
      )}

      {/* Edit Modal */}
      {editingItem && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <Card className="w-full max-w-md">
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Edit className="h-5 w-5" />
                Edit Stock Out Entry
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="space-y-4">
                <div>
                  <label className="block text-sm font-medium mb-1">Product Name</label>
                  <input
                    type="text"
                    value={editForm.productName || ''}
                    disabled
                    className="w-full px-3 py-2 border rounded-md bg-gray-100"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium mb-1">Location *</label>
                  <select
                    value={editForm.locationId}
                    onChange={(e) => {
                      const selectedLoc = locations.find(l => l._id === e.target.value);
                      setEditForm({
                        ...editForm,
                        locationId: e.target.value,
                        doctorName: selectedLoc?.doctorName || '',
                        trainerName: selectedLoc?.trainerName || ''
                      });
                    }}
                    className="w-full px-3 py-2 border rounded-md focus:outline-none focus:ring-2 focus:ring-red-500"
                  >
                    <option value="">Select Location</option>
                    {locations.map(location => (
                      <option key={location._id} value={location._id}>
                        {location.name}
                      </option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="block text-sm font-medium mb-1">Quantity *</label>
                  <input
                    type="number"
                    value={editForm.quantity}
                    onChange={(e) => setEditForm({ ...editForm, quantity: e.target.value })}
                    className="w-full px-3 py-2 border rounded-md focus:outline-none focus:ring-2 focus:ring-red-500"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium mb-1">Sell. Price *</label>
                  <input
                    type="number"
                    value={editForm.sellingPrice}
                    onChange={(e) => setEditForm({ ...editForm, sellingPrice: e.target.value })}
                    min="0"
                    step="0.01"
                    className="w-full px-3 py-2 border rounded-md focus:outline-none focus:ring-2 focus:ring-red-500"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium mb-1">Discount (%)</label>
                  <input
                    type="number"
                    value={editForm.discountPercentage}
                    onChange={(e) => setEditForm({ ...editForm, discountPercentage: e.target.value })}
                    min="0"
                    max="100"
                    step="any"
                    className="w-full px-3 py-2 border rounded-md focus:outline-none focus:ring-2 focus:ring-red-500"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium mb-1">Doctor Name</label>
                  <input
                    type="text"
                    value={editForm.doctorName}
                    onChange={(e) => setEditForm({ ...editForm, doctorName: e.target.value })}
                    className="w-full px-3 py-2 border rounded-md focus:outline-none focus:ring-2 focus:ring-red-500"
                    placeholder="Doctor Name"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium mb-1">Trainer Name</label>
                  <input
                    type="text"
                    value={editForm.trainerName}
                    onChange={(e) => setEditForm({ ...editForm, trainerName: e.target.value })}
                    className="w-full px-3 py-2 border rounded-md focus:outline-none focus:ring-2 focus:ring-red-500"
                    placeholder="Trainer Name"
                  />
                </div>
                <div className="flex gap-2 justify-end">
                  <Button
                    variant="outline"
                    onClick={() => setEditingItem(null)}
                  >
                    Cancel
                  </Button>
                  <Button
                    onClick={handleEditSave}
                    className="bg-red-600 hover:bg-red-700"
                  >
                    Save Changes
                  </Button>
                </div>
              </div>
            </CardContent>
          </Card>
        </div>
      )}

      {showCreateModal && (
        <div className="fixed inset-0 z-[9999] bg-black/50 flex items-center justify-center p-4">
          <div className="w-full max-w-5xl h-[95vh] overflow-y-auto bg-white rounded-lg">
            <div className="p-4">
              <div className="flex justify-end mb-2">
                <button
                  type="button"
                  onClick={closeCreateModal}
                  disabled={creating}
                  className="text-sm font-medium text-gray-600 hover:text-gray-900 px-3 py-1.5 rounded-md hover:bg-gray-200/80 disabled:opacity-50"
                >
                  Close
                </button>
              </div>

              {/* Match Stock Out Entry page layout */}
              <div className="max-w-[1600px] mx-auto">
                <div className="bg-white rounded-lg shadow-sm p-4 mb-4">
                  <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
                    <div className="flex items-center gap-3">
                      <TrendingDown className="w-6 h-6 text-red-600 shrink-0" />
                      <div>
                        <h2 className="text-2xl font-bold text-gray-900">Stock Out Entry</h2>
                        <p className="text-sm text-gray-500">Quick data entry like Excel</p>
                        <p className="text-xs text-red-600 font-medium mt-1">
                          Saving to existing document #{docNo} (no new document)
                        </p>
                      </div>
                    </div>
                    <div className="flex items-center gap-4 flex-wrap">
                      <div className="text-right">
                        <div className="text-xs text-gray-500">Document No</div>
                        <div className="text-lg font-bold text-red-600">#{docNo}</div>
                      </div>
                      <div className="text-right">
                        <div className="text-xs text-gray-500 mb-1">Date</div>
                        <div className="bg-white rounded-lg shadow-sm p-2">
                          <input
                            type="date"
                            value={outDate}
                            onChange={(e) => setOutDate(e.target.value)}
                            className="text-sm font-semibold text-black w-full sm:w-64 border border-gray-300 rounded-md px-2 py-1 focus:outline-none focus:ring-2 focus:ring-red-500 focus:border-transparent"
                          />
                        </div>
                      </div>
                    </div>
                  </div>
                </div>

                <div className="bg-white rounded-lg shadow-sm mb-4">
                  <div className="bg-gradient-to-r from-red-500 to-red-600 text-white px-4 py-3 rounded-t-lg">
                    <h3 className="font-semibold flex items-center gap-2">
                      <Package className="w-4 h-4" />
                      Quick Entry Form (Press Tab to move between fields, Enter to add)
                    </h3>
                  </div>

                  <form onSubmit={addPendingOutLine} className="p-4">
                    <div className="grid grid-cols-12 gap-3">
                      <div className="col-span-12 sm:col-span-6 lg:col-span-2">
                        <label className="block text-xs font-semibold text-gray-800 mb-1.5">Location *</label>
                        <select
                          id="sod-locationId"
                          value={outFormData.locationId}
                          onChange={(e) => handleOutChange('locationId', e.target.value)}
                          className={`w-full h-10 px-3 text-sm border-2 rounded-lg shadow-sm transition-all duration-200 hover:border-red-400 focus:outline-none focus:ring-2 focus:ring-red-500 focus:border-transparent ${outFormErrors.locationId ? 'border-red-500 bg-red-50' : 'border-gray-300 bg-white'
                            }`}
                          onKeyDown={(e) => {
                            if (e.key === 'Enter') {
                              e.preventDefault();
                              document.getElementById('sod-doctorName')?.focus();
                            }
                          }}
                        >
                          <option value="">Select</option>
                          {locations.map((location) => (
                            <option key={location._id} value={location._id}>
                              {location.name}
                            </option>
                          ))}
                        </select>
                      </div>

                      <div className="col-span-12 sm:col-span-6 lg:col-span-2">
                        <label className="block text-xs font-semibold text-gray-800 mb-1.5">Doctor Name</label>
                        <input
                          id="sod-doctorName"
                          type="text"
                          value={outFormData.doctorName}
                          onChange={(e) => handleOutChange('doctorName', e.target.value)}
                          placeholder="Enter doctor name"
                          className="w-full h-10 px-3 text-sm border-2 border-gray-300 rounded-lg shadow-sm bg-white transition-all duration-200 hover:border-red-400 focus:outline-none focus:ring-2 focus:ring-red-500 focus:border-transparent placeholder:text-gray-400"
                          onKeyDown={(e) => {
                            if (e.key === 'Enter') {
                              e.preventDefault();
                              document.getElementById('sod-trainerName')?.focus();
                            }
                          }}
                        />
                      </div>

                      <div className="col-span-12 sm:col-span-6 lg:col-span-2">
                        <label className="block text-xs font-semibold text-gray-800 mb-1.5">Trainer Name</label>
                        <input
                          id="sod-trainerName"
                          type="text"
                          value={outFormData.trainerName}
                          onChange={(e) => handleOutChange('trainerName', e.target.value)}
                          placeholder="Enter trainer name"
                          className="w-full h-10 px-3 text-sm border-2 border-gray-300 rounded-lg shadow-sm bg-white transition-all duration-200 hover:border-red-400 focus:outline-none focus:ring-2 focus:ring-red-500 focus:border-transparent placeholder:text-gray-400"
                          onKeyDown={(e) => {
                            if (e.key === 'Enter') {
                              e.preventDefault();
                              document.getElementById('sod-stock-input')?.focus();
                            }
                          }}
                        />
                      </div>

                      <div className="col-span-12 lg:col-span-2 relative" ref={outStockAutocompleteRef}>
                        <label className="block text-xs font-semibold text-gray-800 mb-1.5">Product *</label>
                        <div className="relative">
                          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400 pointer-events-none" />
                          <input
                            id="sod-stock-input"
                            type="text"
                            value={outStockQuery}
                            onChange={(e) => {
                              setOutStockQuery(e.target.value);
                              if (!e.target.value) {
                                setOutFormData((prev) => ({ ...prev, stockId: '' }));
                                setOutSelectedStock(null);
                              }
                              setOutStockDropdownOpen(true);
                            }}
                            onFocus={() => setOutStockDropdownOpen(true)}
                            onKeyDown={(e) => {
                              if (e.key === 'Escape') {
                                setOutStockDropdownOpen(false);
                                if (!outFormData.stockId) setOutStockQuery('');
                              }
                              if (e.key === 'Enter' && stockOutSuggestions.length > 0 && !outFormData.stockId) {
                                e.preventDefault();
                                handleSelectOutStock(stockOutSuggestions[0]);
                              }
                            }}
                            placeholder="Type product name..."
                            autoComplete="off"
                            className={`w-full h-10 pl-9 pr-9 text-sm border-2 rounded-lg shadow-sm transition-all duration-200 hover:border-red-400 focus:outline-none focus:ring-2 focus:ring-red-500 focus:border-transparent ${outFormErrors.stockId ? 'border-red-500 bg-red-50' : 'border-gray-300 bg-white'
                              }`}
                            autoFocus
                          />
                          {outSelectedStock && (
                            <button
                              type="button"
                              onClick={clearOutStock}
                              className="absolute right-2 top-1/2 -translate-y-1/2 p-1 text-gray-400 hover:text-gray-600 rounded"
                              aria-label="Clear product"
                            >
                              <X className="w-4 h-4" />
                            </button>
                          )}
                          {outStockDropdownOpen && (
                            <div className="absolute z-[100] left-0 right-0 mt-1 bg-white border-2 border-gray-200 rounded-lg shadow-lg max-h-56 overflow-y-auto">
                              {groupedStocks.length === 0 ? (
                                <div className="px-3 py-4 text-sm text-gray-500">No stock available.</div>
                              ) : stockOutSuggestions.length === 0 ? (
                                <div className="px-3 py-4 text-sm text-gray-500">No matching products.</div>
                              ) : (
                                stockOutSuggestions.map((stock) => (
                                  <button
                                    key={stock._id}
                                    type="button"
                                    className="w-full px-3 py-2.5 text-left text-sm hover:bg-red-50 flex flex-col gap-0.5 border-b border-gray-50 last:border-0"
                                    onClick={() => handleSelectOutStock(stock)}
                                  >
                                    <span className="font-medium text-gray-900">
                                      {stock.productName} | {stock.companyName || 'N/A'} | {stock.unit || 'N/A'}
                                    </span>
                                    <span className="text-xs text-gray-500">
                                      {stock.expiry ? `Exp: ${moment(stock.expiry).format('DD/MM/YY')}` : 'No expiry'} •
                                      Qty: {stock.quantity}
                                    </span>
                                  </button>
                                ))
                              )}
                            </div>
                          )}
                        </div>
                      </div>

                      <div className={`col-span-6 sm:col-span-3 ${isAdmin ? 'lg:col-span-1' : 'lg:col-span-2'}`}>
                        <label className="block text-xs font-semibold text-gray-800 mb-1.5">Available</label>
                        <div className="h-10 px-3 flex items-center bg-gradient-to-br from-blue-50 to-blue-100 border-2 border-blue-300 rounded-lg shadow-sm">
                          <span className="text-sm font-bold text-blue-700">{outSelectedStock?.quantity || 0}</span>
                        </div>
                      </div>

                      <div className={`col-span-6 sm:col-span-3 ${isAdmin ? 'lg:col-span-1' : 'lg:col-span-2'}`}>
                        <label className="block text-xs font-semibold text-gray-800 mb-1.5">Issue Qty *</label>
                        <input
                          id="sod-quantity"
                          type="number"
                          value={outFormData.quantity}
                          onChange={(e) => handleOutChange('quantity', e.target.value)}
                          placeholder="0"
                          min="1"
                          max={outSelectedStock?.quantity || 999999}
                          className={`w-full h-10 px-3 text-sm border-2 rounded-lg shadow-sm transition-all duration-200 hover:border-red-400 focus:outline-none focus:ring-2 focus:ring-red-500 focus:border-transparent placeholder:text-gray-400 ${outFormErrors.quantity ? 'border-red-500 bg-red-50' : 'border-gray-300 bg-white'
                            }`}
                          onKeyDown={(e) => {
                            if (e.key === 'Enter') {
                              e.preventDefault();
                              if (isAdmin) {
                                document.getElementById('sod-sellingPrice')?.focus();
                              } else {
                                addPendingOutLine(e);
                              }
                            }
                          }}
                        />
                      </div>

                      {isAdmin && (
                        <div className="col-span-6 sm:col-span-3 lg:col-span-1">
                          <label className="block text-xs font-semibold text-gray-800 mb-1.5">Sell. Price *</label>
                          <input
                            id="sod-sellingPrice"
                            type="number"
                            value={outFormData.sellingPrice}
                            onChange={(e) => handleOutChange('sellingPrice', e.target.value)}
                            placeholder="0.00"
                            min="0"
                            step="0.01"
                            className={`w-full h-10 px-3 text-sm border-2 rounded-lg shadow-sm transition-all duration-200 hover:border-red-400 focus:outline-none focus:ring-2 focus:ring-red-500 focus:border-transparent placeholder:text-gray-400 ${outFormErrors.sellingPrice ? 'border-red-500 bg-red-50' : 'border-gray-300 bg-white'
                              }`}
                            onKeyDown={(e) => {
                              if (e.key === 'Enter') {
                                e.preventDefault();
                                addPendingOutLine(e);
                              }
                            }}
                          />
                        </div>
                      )}

                      {isAdmin && (
                        <div className="col-span-12 sm:col-span-6 lg:col-span-1">
                          <label className="block text-xs font-semibold text-gray-800 mb-1.5">Total</label>
                          <div className="h-10 px-3 flex items-center bg-gradient-to-br from-red-50 to-red-100 border-2 border-red-300 rounded-lg shadow-sm">
                            <span className="text-sm font-bold text-red-700">
                              QR
                              {outSelectedStock && outFormData.quantity
                                ? (Number(outFormData.quantity) * Number(outFormData.sellingPrice || 0)).toFixed(2)
                                : '0.00'}
                            </span>
                          </div>
                        </div>
                      )}
                    </div>

                    {outSelectedStock && (
                      <div className="mt-3 p-3 bg-gradient-to-r from-blue-50 to-indigo-50 border-2 border-blue-300 rounded-lg shadow-md text-xs flex flex-wrap items-center gap-4">
                        <span>
                          <strong>Type:</strong> {outSelectedStock.type || 'N/A'}
                        </span>
                        <span>
                          <strong>Unit:</strong> {outSelectedStock.unit || 'N/A'}
                        </span>
                        {isAdmin && (
                          <span>
                            <strong>Selling Price:</strong> QR{outSelectedStock.sellingPrice || 0}
                          </span>
                        )}
                        <span>
                          <strong>Available:</strong>{' '}
                          <span className="font-semibold text-blue-600">{outSelectedStock.quantity}</span>
                        </span>
                        {outSelectedStock.expiry && (
                          <span>
                            <strong>Expiry (FIFO):</strong>{' '}
                            <span className="font-semibold text-orange-600">
                              {moment(outSelectedStock.expiry).format('DD/MM/YYYY')}
                            </span>
                          </span>
                        )}
                      </div>
                    )}

                    {outFormErrors.quantity && (
                      <div className="mt-2 text-xs text-red-600 flex items-center gap-1">
                        <AlertCircle className="w-3 h-3" />
                        {outFormErrors.quantity}
                      </div>
                    )}

                    <div className="mt-4 flex flex-wrap items-center gap-3">
                      <button
                        type="submit"
                        className="px-6 py-2.5 bg-gradient-to-r from-red-600 to-red-700 text-white rounded-lg hover:from-red-700 hover:to-red-800 font-semibold text-sm flex items-center gap-2 shadow-md hover:shadow-lg transition-all duration-200 focus:outline-none focus:ring-2 focus:ring-red-500 focus:ring-offset-2"
                      >
                        <Plus className="w-4 h-4" />
                        Add Item (Enter)
                      </button>

                      {pendingOutItems.length > 0 && (
                        <button
                          type="button"
                          onClick={saveAllPendingOut}
                          disabled={creating}
                          className="px-6 py-2.5 bg-gradient-to-r from-green-600 to-green-700 text-white rounded-lg hover:from-green-700 hover:to-green-800 font-semibold text-sm flex items-center gap-2 shadow-md hover:shadow-lg transition-all duration-200 focus:outline-none focus:ring-2 focus:ring-green-500 focus:ring-offset-2 disabled:opacity-50 disabled:cursor-not-allowed"
                        >
                          <Save className="w-4 h-4" />
                          {creating ? 'Saving...' : `Save All (${pendingOutItems.length} items)`}
                        </button>
                      )}

                      <div className="ml-auto text-right">
                        <div className="text-xs text-gray-500">Grand Total</div>
                        <div className="text-2xl font-bold text-red-600">QR{getPendingOutGrandTotal().toFixed(2)}</div>
                      </div>
                    </div>
                  </form>
                </div>

                {pendingOutItems.length > 0 && (
                  <div className="bg-white rounded-lg shadow-sm overflow-hidden mb-4">
                    <div className="bg-gray-700 text-white px-4 py-3 flex items-center justify-between">
                      <h3 className="font-semibold">Items List</h3>
                      <Badge variant="secondary" className="bg-white text-gray-700">
                        {pendingOutItems.length} Items •{' '}
                        {pendingOutItems.reduce((sum, item) => sum + item.quantity, 0)} Total Qty
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
                            <th className="px-4 py-3 text-right font-semibold text-gray-700">Price</th>
                            <th className="px-4 py-3 text-right font-semibold text-gray-700">Total</th>
                            <th className="px-4 py-3 text-left font-semibold text-gray-700">Expiry (Auto)</th>
                            <th className="px-4 py-3 text-center font-semibold text-gray-700">Action</th>
                          </tr>
                        </thead>
                        <tbody>
                          {pendingOutItems.map((item, index) => (
                            <tr key={item.id} className="border-b hover:bg-gray-50">
                              <td className="px-4 py-3 font-medium text-gray-600">{index + 1}</td>
                              <td className="px-4 py-3 font-medium text-gray-900">{item.productName}</td>
                              <td className="px-4 py-3 text-gray-700">{item.companyName || '-'}</td>
                              <td className="px-4 py-3 text-gray-700">{item.unit || '-'}</td>
                              <td className="px-4 py-3">{item.location}</td>
                              <td className="px-4 py-3">{item.doctorName || '-'}</td>
                              <td className="px-4 py-3">{item.trainerName || '-'}</td>
                              <td className="px-4 py-3 text-right font-semibold text-red-600">{item.quantity}</td>
                              <td className="px-4 py-3 text-right">QR{(item.sellingPrice ?? 0).toFixed(2)}</td>
                              <td className="px-4 py-3 text-right font-semibold text-red-600">QR{item.total.toFixed(2)}</td>
                              <td className="px-4 py-3">
                                {item.expiry ? moment(item.expiry).format('DD/MM/YYYY') : '-'}
                              </td>
                              <td className="px-4 py-3 text-center">
                                <button
                                  type="button"
                                  onClick={() => {
                                    removePendingOutLine(item.id);
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
          </div>
        </div>
      )}
    </div>
  );
};

export default StockOutDetails;
