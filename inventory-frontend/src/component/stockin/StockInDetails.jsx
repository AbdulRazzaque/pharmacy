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
  Package,
  Building2,
  DollarSign,
  Hash,
  TrendingUp,
  Edit,
  Trash2,
  Save,
  Plus,
  Search,
  X,
} from 'lucide-react';
import moment from 'moment';

const StockInDetails = () => {
  const { docNo } = useParams();
  const navigate = useNavigate();
  const [stockInData, setStockInData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [creating, setCreating] = useState(false);
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [alert, setAlert] = useState({ show: false, message: '', type: '' });
  const [editingItem, setEditingItem] = useState(null);
  const [editForm, setEditForm] = useState({ quantity: '', purchasingPrice: '', sellingPrice: '', expiry: '', supplier: '' });
  const [suppliers, setSuppliers] = useState([]);
  const [products, setProducts] = useState([]);
  const [pendingInItems, setPendingInItems] = useState([]);
  const [batchSupplierId, setBatchSupplierId] = useState('');
  const [batchSupplierDocNo, setBatchSupplierDocNo] = useState('');
  const [lineForm, setLineForm] = useState({
    productId: '',
    quantity: '',
    purchasingPrice: '',
    sellingPrice: '',
    expiry: null
  });
  const [inDate, setInDate] = useState(() => moment().format('YYYY-MM-DD'));
  const [inProductQuery, setInProductQuery] = useState('');
  const [inProductDropdownOpen, setInProductDropdownOpen] = useState(false);
  const [inLineFormErrors, setInLineFormErrors] = useState({});
  const inProductAutocompleteRef = useRef(null);

  const isAdmin = useMemo(
    () => (getUserInfo()?.role || '').toLowerCase() === 'admin',
    []
  );

  const accessToken = getToken();

  const inProductSuggestions = useMemo(() => {
    const q = (inProductQuery || '').trim().toLowerCase();
    if (!q) return products.slice(0, 20);
    return products
      .filter(
        (p) =>
          (p.name || '').toLowerCase().includes(q) ||
          (p.companyName || '').toLowerCase().includes(q)
      )
      .slice(0, 20);
  }, [products, inProductQuery]);

  const selectedProductForLine = useMemo(
    () => (lineForm.productId ? products.find((p) => p._id === lineForm.productId) : null),
    [lineForm.productId, products]
  );

  useEffect(() => {
    const handleClickOutside = (e) => {
      if (
        inProductAutocompleteRef.current &&
        !inProductAutocompleteRef.current.contains(e.target)
      ) {
        setInProductDropdownOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  useEffect(() => {
    if (docNo) {
      fetchStockInDetails();
    }
    fetchSuppliers();
    fetchProducts();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [docNo]);

  const fetchSuppliers = () => {
    axios.get(
      `${process.env.REACT_APP_DEVELOPMENT}/api/supplier/getAllSuppliers`,
      { headers: { token: accessToken } }
    )
      .then((res) => {
        if (res.data.result) {
          setSuppliers(res.data.result);
        }
      })
      .catch((err) => {
        console.error('Error fetching suppliers:', err);
      });
  };

  const fetchProducts = () => {
    axios.get(
      `${process.env.REACT_APP_DEVELOPMENT}/api/product/getAllProducts`,
      { headers: { token: accessToken } }
    )
      .then((res) => {
        setProducts(res.data.result || []);
      })
      .catch((err) => {
        console.error('Error fetching products:', err);
      });
  };

  const fetchStockInDetails = () => {
    setLoading(true);
    axios.post(
      `${process.env.REACT_APP_DEVELOPMENT}/api/stockIn/getStockInByDocNo`,
      { docNo: parseInt(docNo) },
      {
        headers: {
          token: accessToken,
          'Cache-Control': 'no-cache'
        }
      }
    )
      .then((res) => {
        if (res.data.result && res.data.result.length > 0) {
          setStockInData(res.data.result[0]);
        } else {
          // If no data, clear the state
          setStockInData(null);
        }
        setLoading(false);
      })
      .catch((err) => {
        console.error('Error fetching stock in info:', err);
        showAlert('Failed to fetch stock in details', 'error');
        setLoading(false);
      });
  };

  const showAlert = (message, type) => {
    setAlert({ show: true, message, type });
    setTimeout(() => setAlert({ show: false, message: '', type: '' }), 3000);
  };

  const handleEditClick = (item) => {
    setEditingItem(item);
    setEditForm({
      quantity: item.quantity || '',
      purchasingPrice: item.purchasingPrice ?? '',
      sellingPrice: item.sellingPrice ?? '',
      expiry: item.expiry ? moment(item.expiry).format('YYYY-MM-DD') : '',
      supplier: item.supplier?._id || item.supplier || '',
      supplierDocNo: item.supplierDocNo || ''
    });
  };

  const handleEditSave = () => {
    // Prevent multiple submissions
    if (saving) return;

    // Trim values and validate
    const quantity = editForm.quantity?.toString().trim();
    const purchasingPrice = editForm.purchasingPrice?.toString().trim();
    const expiry = editForm.expiry?.trim();
    const supplier = editForm.supplier?.trim();
    const supplierDocNo = editForm.supplierDocNo?.trim();

    if (!quantity || !purchasingPrice || !expiry || !supplier || !supplierDocNo) {
      showAlert('Please fill all required fields', 'error');
      return;
    }
    if (Number(purchasingPrice) <= 0 || Number.isNaN(Number(purchasingPrice))) {
      showAlert('Please enter valid purchasing price', 'error');
      return;
    }
    if (editForm.sellingPrice !== '' && (Number(editForm.sellingPrice) < 0 || Number.isNaN(Number(editForm.sellingPrice)))) {
      showAlert('Please enter valid selling price', 'error');
      return;
    }

    setSaving(true);
    axios.post(
      `${process.env.REACT_APP_DEVELOPMENT}/api/stockIn/stockInUpdateQuantity/${editingItem._id}`,
      {
        quantity: parseInt(quantity),
        originalQuantity: editingItem.quantity,
        originalExpiry: editingItem.expiry, // Send original expiry for StockOut update
        purchasingPrice: parseFloat(purchasingPrice),
        sellingPrice: editForm.sellingPrice !== '' ? parseFloat(editForm.sellingPrice) : undefined,
        expiry: expiry,
        supplier: supplier,
        supplierDocNo: supplierDocNo,
        productName: editingItem.name
      },
      { headers: { token: accessToken } }
    )
      .then(() => {
        showAlert('Stock In updated successfully!', 'success');
        setEditingItem(null);
        setSaving(false);
        fetchStockInDetails();
      })
      .catch((err) => {
        setSaving(false);
        showAlert('Failed to update stock in', 'error');
        console.error(err);
      });
  };

  const getTotalQuantity = () => {
    if (!stockInData || !stockInData.doc) return 0;
    return stockInData.doc.reduce((sum, item) => sum + (item.quantity || 0), 0);
  };

  const getTotalValue = () => {
    if (!stockInData || !stockInData.doc) return 0;
    return stockInData.doc.reduce((sum, item) => sum + ((item.quantity || 0) * (item.purchasingPrice || 0)), 0);
  };

  const getSupplierName = () => {
    if (!stockInData || !stockInData.doc || !stockInData.doc[0]) return 'N/A';
    const supplier = stockInData.doc[0].supplier;
    return supplier ? (supplier.name || supplier.supplierName || 'N/A') : 'N/A';
  };

  const validateInLineForm = () => {
    const errors = {};
    if (!lineForm.productId) errors.productId = 'Please select a product';
    if (!batchSupplierId) errors.supplierId = 'Please select a supplier';
    if (!batchSupplierDocNo || !String(batchSupplierDocNo).trim()) {
      errors.supplierDocNo = 'Please enter supplier document number';
    }
    if (!lineForm.quantity || Number(lineForm.quantity) <= 0) {
      errors.quantity = 'Please enter valid quantity';
    }
    if (!lineForm.purchasingPrice || Number(lineForm.purchasingPrice) <= 0) {
      errors.purchasingPrice = 'Please enter valid purchasing price';
    }
    if (lineForm.sellingPrice !== '' && (Number(lineForm.sellingPrice) < 0 || Number.isNaN(Number(lineForm.sellingPrice)))) {
      errors.sellingPrice = 'Selling price cannot be negative';
    }
    if (!lineForm.expiry) errors.expiry = 'Please select expiry date';
    setInLineFormErrors(errors);
    return Object.keys(errors).length === 0;
  };

  const handleSelectInProduct = (product) => {
    setLineForm((prev) => ({
      ...prev,
      productId: product._id,
      sellingPrice: prev.sellingPrice
    }));
    setInProductQuery(product.name || '');
    setInProductDropdownOpen(false);
    if (inLineFormErrors.productId) {
      setInLineFormErrors((prev) => ({ ...prev, productId: '' }));
    }
    setTimeout(() => document.getElementById('sin-quantity')?.focus(), 50);
  };

  const clearInProduct = () => {
    setLineForm((prev) => ({ ...prev, productId: '' }));
    setInProductQuery('');
    setInProductDropdownOpen(false);
    document.getElementById('sin-product-input')?.focus();
  };

  const addPendingInLine = (e) => {
    if (e) e.preventDefault();
    if (!validateInLineForm()) {
      showAlert('Please fill all required fields correctly', 'error');
      return;
    }
    const selectedProduct = products.find((p) => p._id === lineForm.productId);
    if (!selectedProduct) {
      showAlert('Please select a valid product', 'error');
      return;
    }
    const qty = parseInt(lineForm.quantity, 10);
    const purchasingPrice = parseFloat(lineForm.purchasingPrice);
    if (Number.isNaN(qty) || qty <= 0 || Number.isNaN(purchasingPrice) || purchasingPrice <= 0) {
      showAlert('Quantity and purchasing price must be greater than zero', 'error');
      return;
    }
    const supplier = suppliers.find((s) => s._id === batchSupplierId);
    const newItem = {
      id: Date.now(),
      productId: selectedProduct._id,
      productName: selectedProduct.name,
      companyName: selectedProduct.companyName || '',
      productType: selectedProduct.type || '',
      supplierId: batchSupplierId,
      supplierName: supplier?.name || supplier?.supplierName || '',
      supplierDocNo: batchSupplierDocNo.trim(),
      quantity: qty,
      purchasingPrice,
      sellingPrice: lineForm.sellingPrice !== '' ? parseFloat(lineForm.sellingPrice) : null,
      expiry: lineForm.expiry,
      total: qty * purchasingPrice,
      unit: selectedProduct.unit || ''
    };
    setPendingInItems((prev) => [...prev, newItem]);
    setLineForm((prev) => ({
      productId: '',
      quantity: '',
      purchasingPrice: prev.purchasingPrice,
      sellingPrice: prev.sellingPrice,
      expiry: prev.expiry
    }));
    setInLineFormErrors({});
    setInProductQuery('');
    setTimeout(() => {
      document.getElementById('sin-product-input')?.focus();
    }, 100);
  };

  const removePendingInLine = (id) => {
    setPendingInItems((prev) => prev.filter((i) => i.id !== id));
  };

  const saveAllPendingIn = () => {
    if (!batchSupplierId || !(batchSupplierDocNo || '').trim()) {
      showAlert('Supplier and supplier document number are required', 'error');
      return;
    }
    if (pendingInItems.length === 0) {
      showAlert('Add at least one line before saving', 'error');
      return;
    }

    setCreating(true);

    axios.post(
      `${process.env.REACT_APP_DEVELOPMENT}/api/stockIn/stockIn`,
      {
        docNo: Number(docNo),
        date: inDate,
        items: pendingInItems.map(item => ({
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
      .then(() => {
        showAlert('All Stock In lines saved under this document', 'success');
        setShowCreateModal(false);
        setPendingInItems([]);
        fetchStockInDetails();
      })
      .catch((err) => {
        console.error('Create stock in error:', err.response?.data || err.message);
        showAlert(
          err.response?.data?.result || err.response?.data?.msg || 'Failed to save Stock In',
          'error'
        );
      })
      .finally(() => setCreating(false));
  };

  const closeInCreateModal = () => {
    setShowCreateModal(false);
    setPendingInItems([]);
  };

  const handleOpenCreateModal = () => {
    const first = stockInData?.doc?.[0];
    const sup = first?.supplier;
    const supId = sup?._id || sup;
    setBatchSupplierId(supId ? String(supId) : '');
    setBatchSupplierDocNo(first?.supplierDocNo != null ? String(first.supplierDocNo) : '');
    setLineForm({
      productId: '',
      quantity: '',
      purchasingPrice: '',
      sellingPrice: '',
      expiry: null
    });
    setInDate(moment().format('YYYY-MM-DD'));
    setInProductQuery('');
    setInLineFormErrors({});
    setPendingInItems([]);
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
              <Package className="h-6 w-6" />
              Stock In Details
            </h1>
            <p className="text-sm text-muted-foreground mt-1">
              Document No: <span className="font-semibold">{docNo}</span>
            </p>
          </div>
        </div>
        <Button onClick={handleOpenCreateModal} disabled={loading} className="gap-2">
          <Plus className="h-4 w-4" />
          Stock In
        </Button>
      </div>

      {alert.show && (
        <Alert variant={alert.type === 'error' ? 'destructive' : 'default'}>
          <AlertDescription>{alert.message}</AlertDescription>
        </Alert>
      )}

      {loading ? (
        <div className="text-center py-12">
          <div className="text-muted-foreground">Loading stock in details...</div>
        </div>
      ) : !stockInData || !stockInData.doc ? (
        <Card>
          <CardContent className="pt-6">
            <div className="text-center py-12">
              <Package className="h-12 w-12 mx-auto text-muted-foreground mb-4" />
              <p className="text-muted-foreground">No stock in records found for document number: {docNo}</p>
            </div>
          </CardContent>
        </Card>
      ) : (
        <>
          {/* Summary Cards */}
          <div className={`grid grid-cols-1 ${isAdmin ? 'md:grid-cols-4' : 'md:grid-cols-3'} gap-4`}>
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
                  <TrendingUp className="h-5 w-5 text-green-600" />
                  <div>
                    <div className="text-xl font-bold text-green-600">{getTotalQuantity()}</div>
                    <p className="text-xs text-muted-foreground">Total Quantity</p>
                  </div>
                </div>
              </CardContent>
            </Card>
            {isAdmin && (
              <Card>
                <CardContent className="pt-6">
                  <div className="flex items-center gap-2">
                    <DollarSign className="h-5 w-5 text-green-600" />
                    <div>
                      <div className="text-xl font-bold">${getTotalValue().toFixed(2)}</div>
                      <p className="text-xs text-muted-foreground">Total Value</p>
                    </div>
                  </div>
                </CardContent>
              </Card>
            )}
            <Card>
              <CardContent className="pt-6">
                <div className="flex items-center gap-2">
                  <Building2 className="h-5 w-5 text-blue-600" />
                  <div>
                    <div className="text-lg font-bold truncate">{getSupplierName()}</div>
                    <p className="text-xs text-muted-foreground">Supplier</p>
                  </div>
                </div>
              </CardContent>
            </Card>
          </div>

          {/* Stock In Items Table */}
          <Card>
            <CardHeader>
              <CardTitle>Items Received ({stockInData.doc.length})</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Product Name</TableHead>
                      <TableHead>Company</TableHead>
                      <TableHead>Type</TableHead>
                      <TableHead>Unit</TableHead>
                      <TableHead className="text-right">Quantity</TableHead>
                      {isAdmin && <TableHead className="text-right">Price</TableHead>}
                      {isAdmin && <TableHead className="text-right">Total Value</TableHead>}
                      <TableHead>Expiry Date</TableHead>
                      <TableHead>Received Date</TableHead>
                      {isAdmin && <TableHead className="text-center">Actions</TableHead>}
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {stockInData.doc.map((item, index) => (
                      <TableRow key={item._id || index}>
                        <TableCell className="font-medium">{item.name || '-'}</TableCell>
                        <TableCell>{item.product?.companyName || item.companyName || '-'}</TableCell>
                        <TableCell>{item.product?.type || item.productType || '-'}</TableCell>
                        <TableCell>{item.product?.unit || item.unit || '-'}</TableCell>
                        <TableCell className="text-right font-semibold text-green-600">
                          +{item.quantity || 0}
                        </TableCell>
                        {isAdmin && (
                          <TableCell className="text-right">
                            ${(item.purchasingPrice || 0).toFixed(2)}
                          </TableCell>
                        )}
                        {isAdmin && (
                          <TableCell className="text-right font-semibold">
                            ${((item.quantity || 0) * (item.purchasingPrice || 0)).toFixed(2)}
                          </TableCell>
                        )}
                        <TableCell>
                          {item.expiry ? moment(item.expiry).format('DD/MM/YYYY') : '-'}
                        </TableCell>
                        <TableCell>
                          {item.createdAt ? moment(item.createdAt).format('DD/MM/YYYY HH:mm') : '-'}
                        </TableCell>
                        {isAdmin && (
                          <TableCell className="text-center">
                            <div className="flex items-center justify-center gap-2">
                              <Button
                                size="sm"
                                variant="outline"
                                onClick={() => handleEditClick(item)}
                                className="gap-1"
                                title="Edit Stock In"
                              >
                                <Edit className="h-4 w-4" />
                              </Button>
                              <Button
                                size="sm"
                                variant="destructive"
                                onClick={async () => {
                                  if (window.confirm(`Delete this stock in entry? This will reduce stock quantity by ${item.quantity}.`)) {
                                    try {
                                      // Optimistic update - remove from UI immediately
                                      const deletedItemId = item._id;
                                      setStockInData(prevData => ({
                                        ...prevData,
                                        doc: prevData.doc.filter(doc => doc._id !== deletedItemId)
                                      }));

                                      await axios.delete(
                                        `${process.env.REACT_APP_DEVELOPMENT}/api/stockIn/stockInDelete/${item._id}`,
                                        { headers: { token: accessToken } }
                                      );

                                      // Call fix endpoint to ensure stock is correct
                                      await axios.get(
                                        `${process.env.REACT_APP_DEVELOPMENT}/api/stock/fixQuantities`
                                      );

                                      showAlert('Stock In entry deleted successfully!', 'success');

                                      // Fetch fresh data from server with longer delay to ensure backend completed
                                      setTimeout(() => {
                                        fetchStockInDetails();
                                      }, 1000);
                                    } catch (err) {
                                      showAlert(err.response?.data?.result || 'Failed to delete stock in entry', 'error');
                                      console.error(err);
                                      // Revert optimistic update on error
                                      fetchStockInDetails();
                                    }
                                  }
                                }}
                                className="gap-1"
                                title="Delete Stock In"
                              >
                                <Trash2 className="h-4 w-4" />
                              </Button>
                            </div>
                          </TableCell>
                        )}
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            </CardContent>
          </Card>

          {/* Supplier Information */}
          {stockInData.doc[0] && stockInData.doc[0].supplier && (
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Building2 className="h-5 w-5" />
                  Supplier Information
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div>
                    <label className="text-sm font-medium text-muted-foreground">Supplier Name</label>
                    <p className="text-base font-semibold mt-1">
                      {stockInData.doc[0].supplier.name || stockInData.doc[0].supplier.supplierName || 'N/A'}
                    </p>
                  </div>
                  <div>
                    <label className="text-sm font-medium text-muted-foreground">Contact</label>
                    <p className="text-base font-semibold mt-1">
                      {stockInData.doc[0].supplier.phoneNumber || 'N/A'}
                    </p>
                  </div>
                  <div>
                    <label className="text-sm font-medium text-muted-foreground">Email</label>
                    <p className="text-base font-semibold mt-1">
                      {stockInData.doc[0].supplier.email || 'N/A'}
                    </p>
                  </div>
                  <div>
                    <label className="text-sm font-medium text-muted-foreground">Address</label>
                    <p className="text-base font-semibold mt-1">
                      {stockInData.doc[0].supplier.address || 'N/A'}
                    </p>
                  </div>
                </div>
              </CardContent>
            </Card>
          )}
        </>
      )}

      {/* Edit Modal */}
      {editingItem && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <Card className="w-full max-w-md">
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Edit className="h-5 w-5" />
                Edit Stock In Entry
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="space-y-4">
                <div>
                  <label className="block text-sm font-medium mb-1">Product Name</label>
                  <input
                    type="text"
                    value={editingItem.name || ''}
                    disabled
                    className="w-full px-3 py-2 border rounded-md bg-gray-100"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium mb-1">Quantity *</label>
                  <input
                    type="number"
                    value={editForm.quantity}
                    onChange={(e) => setEditForm({ ...editForm, quantity: e.target.value })}
                    className="w-full px-3 py-2 border rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium mb-1">Purch. Price *</label>
                  <input
                    type="number"
                    step="0.01"
                    value={editForm.purchasingPrice}
                    onChange={(e) => setEditForm({ ...editForm, purchasingPrice: e.target.value })}
                    className="w-full px-3 py-2 border rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium mb-1">Sell. Price</label>
                  <input
                    type="number"
                    step="0.01"
                    min="0"
                    value={editForm.sellingPrice}
                    onChange={(e) => setEditForm({ ...editForm, sellingPrice: e.target.value })}
                    className="w-full px-3 py-2 border rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium mb-1">Expiry Date *</label>
                  <input
                    type="date"
                    value={editForm.expiry}
                    onChange={(e) => setEditForm({ ...editForm, expiry: e.target.value })}
                    className="w-full px-3 py-2 border rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium mb-1">Supplier *</label>
                  <select
                    value={editForm.supplier}
                    onChange={(e) => setEditForm({ ...editForm, supplier: e.target.value })}
                    className="w-full px-3 py-2 border rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                  >
                    <option value="">Select Supplier</option>
                    {suppliers.map((supplier) => (
                      <option key={supplier._id} value={supplier._id}>
                        {supplier.name || supplier.supplierName}
                      </option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="block text-sm font-medium mb-1">Supplier Doc *</label>
                  <input
                    type="text"
                    value={editForm.supplierDocNo || ''}
                    onChange={(e) => setEditForm({ ...editForm, supplierDocNo: e.target.value })}
                    placeholder="INV-001"
                    className="w-full px-3 py-2 border rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                  />
                </div>
                <div className="flex gap-2 justify-end">
                  <Button
                    variant="outline"
                    onClick={() => setEditingItem(null)}
                    disabled={saving}
                  >
                    Cancel
                  </Button>
                  <Button
                    onClick={handleEditSave}
                    disabled={saving}
                  >
                    {saving ? 'Saving...' : 'Save Changes'}
                  </Button>
                </div>
              </div>
            </CardContent>
          </Card>
        </div>
      )}

      {showCreateModal && (
        <div className="fixed inset-0 z-[9999] bg-black/50 flex items-center justify-center p-4">
          <div className="w-full max-w-6xl h-[95vh] overflow-y-auto bg-white rounded-lg">
            <div className="p-4">
              <div className="flex justify-end mb-2">
                <button
                  type="button"
                  onClick={closeInCreateModal}
                  disabled={creating}
                  className="text-sm font-medium text-gray-600 hover:text-gray-900 px-3 py-1.5 rounded-md hover:bg-gray-200/80 disabled:opacity-50"
                >
                  Close
                </button>
              </div>

              <div className="max-w-[1600px] mx-auto">
                <div className="bg-white rounded-lg shadow-sm p-4 mb-4">
                  <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
                    <div className="flex items-center gap-3">
                      <TrendingUp className="w-6 h-6 text-blue-600 shrink-0" />
                      <div>
                        <h2 className="text-2xl font-bold text-gray-900">Stock In Entry</h2>
                        <p className="text-sm text-gray-500">Quick data entry like Excel</p>
                        <p className="text-xs text-blue-600 font-medium mt-1">
                          Saving to existing document #{docNo} (no new document)
                        </p>
                      </div>
                    </div>
                    <div className="flex items-center gap-4 flex-wrap">
                      <div className="text-right">
                        <div className="text-xs text-gray-500">Document No</div>
                        <div className="text-lg font-bold text-blue-600">#{docNo}</div>
                      </div>
                      <div className="text-right">
                        <div className="text-xs text-gray-500">Date</div>
                        <div className="bg-white rounded-lg shadow-sm p-2">
                          <input
                            type="date"
                            value={inDate}
                            onChange={(e) => setInDate(e.target.value)}
                            className="text-sm font-semibold text-black w-full sm:w-64 border border-gray-300 rounded-md px-2 py-1 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                          />
                        </div>
                      </div>
                    </div>
                  </div>
                </div>

                <div className="bg-white rounded-lg shadow-sm mb-4">
                  <div className="bg-gradient-to-r from-blue-500 to-blue-600 text-white px-4 py-3 rounded-t-lg">
                    <h3 className="font-semibold flex items-center gap-2">
                      <Package className="w-4 h-4" />
                      Quick Entry Form (Press Tab to move between fields, Enter to add)
                    </h3>
                  </div>

                  <form onSubmit={addPendingInLine} className="p-4">
                    <div className="grid grid-cols-12 gap-3">
                      <div className="col-span-12 md:col-span-6 lg:col-span-2">
                        <label className="block text-xs font-medium text-gray-700 mb-1">Supplier *</label>
                        <select
                          id="sin-supplierId"
                          disabled
                          value={batchSupplierId}
                          onChange={(e) => {
                            setBatchSupplierId(e.target.value);
                            if (inLineFormErrors.supplierId) {
                              setInLineFormErrors((prev) => ({ ...prev, supplierId: '' }));
                            }
                          }}
                          className={`w-full h-10 px-3 text-sm border rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 ${inLineFormErrors.supplierId ? 'border-red-500' : 'border-gray-300'
                            }`}
                          onKeyDown={(e) => {
                            if (e.key === 'Enter') {
                              e.preventDefault();
                              document.getElementById('sin-supplierDocNo')?.focus();
                            }
                          }}
                        >
                          <option value="">Select</option>

                          {suppliers.map((supplier) => (
                            <option key={supplier._id} value={supplier._id}>
                              {supplier.name || supplier.supplierName}
                            </option>
                          ))}
                        </select>
                      </div>

                      <div className="col-span-12 md:col-span-6 lg:col-span-2">
                        <label className="block text-xs font-medium text-gray-700 mb-1">Supplier Doc *</label>
                        <input
                          id="sin-supplierDocNo"
                          type="text"
                          value={batchSupplierDocNo}
                          onChange={(e) => {
                            setBatchSupplierDocNo(e.target.value);
                            if (inLineFormErrors.supplierDocNo) {
                              setInLineFormErrors((prev) => ({ ...prev, supplierDocNo: '' }));
                            }
                          }}
                          placeholder="INV-001"
                          className={`w-full h-10 px-3 text-sm border rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 ${inLineFormErrors.supplierDocNo ? 'border-red-500' : 'border-gray-300'
                            }`}
                          onKeyDown={(e) => {
                            if (e.key === 'Enter') {
                              e.preventDefault();
                              document.getElementById('sin-product-input')?.focus();
                            }
                          }}
                        />
                      </div>

                      <div className="col-span-12 lg:col-span-2 relative" ref={inProductAutocompleteRef}>
                        <label className="block text-xs font-medium text-gray-700 mb-1">Product *</label>
                        <div className="relative">
                          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400 pointer-events-none" />
                          <input
                            id="sin-product-input"
                            type="text"
                            value={inProductQuery}
                            onChange={(e) => {
                              setInProductQuery(e.target.value);
                              if (!e.target.value) {
                                setLineForm((prev) => ({ ...prev, productId: '' }));
                              }
                              setInProductDropdownOpen(true);
                            }}
                            onFocus={() => setInProductDropdownOpen(true)}
                            onKeyDown={(e) => {
                              if (e.key === 'Escape') {
                                setInProductDropdownOpen(false);
                                if (!lineForm.productId) setInProductQuery('');
                              }
                              if (
                                e.key === 'Enter' &&
                                inProductSuggestions.length > 0 &&
                                !lineForm.productId
                              ) {
                                e.preventDefault();
                                handleSelectInProduct(inProductSuggestions[0]);
                              }
                            }}
                            placeholder="Type product name..."
                            autoComplete="off"
                            className={`w-full h-10 pl-9 pr-9 text-sm border rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 ${inLineFormErrors.productId ? 'border-red-500' : 'border-gray-300'
                              }`}
                          />
                          {selectedProductForLine && (
                            <button
                              type="button"
                              onClick={clearInProduct}
                              className="absolute right-2 top-1/2 -translate-y-1/2 p-1 text-gray-400 hover:text-gray-600 rounded"
                              aria-label="Clear product"
                            >
                              <X className="w-4 h-4" />
                            </button>
                          )}
                          {inProductDropdownOpen && (
                            <div className="absolute z-[100] left-0 right-0 mt-1 bg-white border border-gray-200 rounded-md shadow-lg max-h-56 overflow-y-auto">
                              {products.length === 0 ? (
                                <div className="px-3 py-4 text-sm text-gray-500">
                                  No products. Add products in Dashboard.
                                </div>
                              ) : inProductSuggestions.length === 0 ? (
                                <div className="px-3 py-4 text-sm text-gray-500">No matching products.</div>
                              ) : (
                                inProductSuggestions.map((product) => (
                                  <button
                                    key={product._id}
                                    type="button"
                                    className="w-full px-3 py-2.5 text-left text-sm hover:bg-blue-50 flex flex-col gap-0.5 border-b border-gray-50 last:border-0"
                                    onClick={() => handleSelectInProduct(product)}
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

                      <div className="col-span-6 sm:col-span-3 lg:col-span-1">
                        <label className="block text-xs font-medium text-gray-700 mb-1">Qty *</label>
                        <input
                          id="sin-quantity"
                          type="number"
                          value={lineForm.quantity}
                          onChange={(e) => {
                            setLineForm((prev) => ({ ...prev, quantity: e.target.value }));
                            if (inLineFormErrors.quantity) {
                              setInLineFormErrors((prev) => ({ ...prev, quantity: '' }));
                            }
                          }}
                          placeholder="0"
                          min="1"
                          className={`w-full h-10 px-3 text-sm border rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 ${inLineFormErrors.quantity ? 'border-red-500' : 'border-gray-300'
                            }`}
                          onKeyDown={(e) => {
                            if (e.key === 'Enter') {
                              e.preventDefault();
                              document.getElementById('sin-purchasingPrice')?.focus();
                            }
                          }}
                        />
                      </div>

                      <div className="col-span-6 sm:col-span-3 lg:col-span-1">
                        <label className="block text-xs font-medium text-gray-700 mb-1">Purch. Price *</label>
                        <input
                          id="sin-purchasingPrice"
                          type="number"
                          value={lineForm.purchasingPrice}
                          onChange={(e) => {
                            setLineForm((prev) => ({ ...prev, purchasingPrice: e.target.value }));
                            if (inLineFormErrors.purchasingPrice) {
                              setInLineFormErrors((prev) => ({ ...prev, purchasingPrice: '' }));
                            }
                          }}
                          placeholder="0.00"
                          min="0"
                          step="0.01"
                          className={`w-full h-10 px-3 text-sm border rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 ${inLineFormErrors.purchasingPrice ? 'border-red-500' : 'border-gray-300'
                            }`}
                          onKeyDown={(e) => {
                            if (e.key === 'Enter') {
                              e.preventDefault();
                              document.getElementById('sin-sellingPrice')?.focus();
                            }
                          }}
                        />
                      </div>

                      <div className="col-span-6 sm:col-span-3 lg:col-span-1">
                        <label className="block text-xs font-medium text-gray-700 mb-1">Sell. Price</label>
                        <input
                          id="sin-sellingPrice"
                          type="number"
                          value={lineForm.sellingPrice}
                          onChange={(e) => {
                            setLineForm((prev) => ({ ...prev, sellingPrice: e.target.value }));
                            if (inLineFormErrors.sellingPrice) {
                              setInLineFormErrors((prev) => ({ ...prev, sellingPrice: '' }));
                            }
                          }}
                          placeholder="0.00"
                          min="0"
                          step="0.01"
                          className={`w-full h-10 px-3 text-sm border rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 ${inLineFormErrors.sellingPrice ? 'border-red-500' : 'border-gray-300'
                            }`}
                          onKeyDown={(e) => {
                            if (e.key === 'Enter') {
                              e.preventDefault();
                              document.getElementById('sin-expiry')?.focus();
                            }
                          }}
                        />
                      </div>

                      <div className="col-span-12 sm:col-span-6 lg:col-span-2">
                        <label className="block text-xs font-medium text-gray-700 mb-1">Expiry Date *</label>
                        <input
                          id="sin-expiry"
                          type="date"
                          value={
                            lineForm.expiry ? moment(lineForm.expiry).format('YYYY-MM-DD') : ''
                          }
                          onChange={(e) =>
                            setLineForm((prev) => ({
                              ...prev,
                              expiry: e.target.value ? new Date(e.target.value) : null
                            }))
                          }
                          className={`w-full h-10 px-3 text-sm border rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 ${inLineFormErrors.expiry ? 'border-red-500' : 'border-gray-300'
                            }`}
                          onKeyDown={(e) => {
                            if (e.key === 'Enter') {
                              e.preventDefault();
                              addPendingInLine(e);
                            }
                          }}
                        />
                      </div>

                      <div className="col-span-12 sm:col-span-6 lg:col-span-1">
                        <label className="block text-xs font-medium text-gray-700 mb-1">Total</label>
                        <div className="h-10 px-3 flex items-center bg-green-50 border border-green-200 rounded-md">
                          <span className="text-sm font-bold text-green-700">
                            QR
                            {lineForm.quantity && lineForm.purchasingPrice
                              ? (Number(lineForm.quantity) * Number(lineForm.purchasingPrice)).toFixed(2)
                              : '0.00'}
                          </span>
                        </div>
                      </div>
                    </div>

                    {selectedProductForLine && (
                      <div className="mt-3 p-2 bg-blue-50 border border-blue-200 rounded text-xs flex flex-wrap items-center gap-4">
                        <span>
                          <strong>Type:</strong> {selectedProductForLine.type || 'N/A'}
                        </span>
                        <span>
                          <strong>Unit:</strong> {selectedProductForLine.unit || 'N/A'}
                        </span>
                        <span>
                          <strong>Stock:</strong>{' '}
                          <span className="font-semibold text-blue-600">
                            {selectedProductForLine.stock || 0}
                          </span>
                        </span>
                      </div>
                    )}

                    <div className="mt-4 flex flex-wrap items-center gap-3">
                      <button
                        type="submit"
                        className="px-6 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 font-medium text-sm flex items-center gap-2 focus:outline-none focus:ring-2 focus:ring-blue-500"
                      >
                        <Plus className="w-4 h-4" />
                        Add Item (Enter)
                      </button>

                      {pendingInItems.length > 0 && (
                        <button
                          type="button"
                          onClick={saveAllPendingIn}
                          disabled={creating}
                          className="px-6 py-2 bg-green-600 text-white rounded-md hover:bg-green-700 font-medium text-sm flex items-center gap-2 focus:outline-none focus:ring-2 focus:ring-green-500 disabled:opacity-50"
                        >
                          <Save className="w-4 h-4" />
                          {creating ? 'Saving...' : `Save All (${pendingInItems.length} items)`}
                        </button>
                      )}

                      <div className="ml-auto text-right">
                        <div className="text-xs text-gray-500">Grand Total</div>
                        <div className="text-2xl font-bold text-green-600">
                          QR
                          {pendingInItems.length > 0
                            ? pendingInItems.reduce((s, i) => s + i.total, 0).toFixed(2)
                            : '0.00'}
                        </div>
                      </div>
                    </div>
                  </form>
                </div>

                {pendingInItems.length > 0 && (
                  <div className="bg-white rounded-lg shadow-sm overflow-hidden mb-4">
                    <div className="bg-gray-700 text-white px-4 py-3 flex items-center justify-between">
                      <h3 className="font-semibold">Items List</h3>
                      <Badge variant="secondary" className="bg-white text-gray-700">
                        {pendingInItems.length} Items •{' '}
                        {pendingInItems.reduce((sum, item) => sum + item.quantity, 0)} Total Qty
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
                            <th className="px-4 py-3 text-right font-semibold text-gray-700">Price</th>
                            <th className="px-4 py-3 text-right font-semibold text-gray-700">Total</th>
                            <th className="px-4 py-3 text-left font-semibold text-gray-700">Expiry</th>
                            <th className="px-4 py-3 text-center font-semibold text-gray-700">Action</th>
                          </tr>
                        </thead>
                        <tbody>
                          {pendingInItems.map((item, index) => (
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
                              <td className="px-4 py-3 text-right">QR{item.purchasingPrice.toFixed(2)}</td>
                              <td className="px-4 py-3 text-right font-semibold text-green-600">
                                QR{item.total.toFixed(2)}
                              </td>
                              <td className="px-4 py-3 text-sm">
                                {moment(item.expiry).format('DD/MM/YYYY')}
                              </td>
                              <td className="px-4 py-3 text-center">
                                <button
                                  type="button"
                                  onClick={() => {
                                    removePendingInLine(item.id);
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

export default StockInDetails;
