import React, { useState, useEffect } from 'react';
import axios from 'axios';
import { useNavigate } from 'react-router-dom';
import { Card, CardContent } from '../../components/ui/card';
import { Button } from '../../components/ui/button';
import { Input } from '../../components/ui/input';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '../../components/ui/table';
import { Search, FileText, Calendar, User, Package, Hash, Eye, Edit, X, CheckCircle2, AlertCircle } from 'lucide-react';
import moment from 'moment';
import { getToken } from '../../utils/auth';

const StockOutDocsList = () => {
  const navigate = useNavigate();
  const [docs, setDocs] = useState([]);
  const [filteredDocs, setFilteredDocs] = useState([]);
  const [searchQuery, setSearchQuery] = useState('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [toast, setToast] = useState({ show: false, message: '', type: '' });

  // Edit Date modal state
  const [editingDoc, setEditingDoc] = useState(null);
  const [editDateValue, setEditDateValue] = useState('');
  const [editDateError, setEditDateError] = useState('');
  const [savingDate, setSavingDate] = useState(false);

  useEffect(() => {
    fetchDocs();
  }, []);

  const fetchDocs = async () => {
    try {
      setLoading(true);
      const token = getToken();
      const res = await axios.get(
        `${process.env.REACT_APP_DEVELOPMENT}/api/stockOut/getStockOutDocs`,
        { headers: { token } }
      );
      if (res.data?.msg === 'success') {
        const sorted = (res.data.result || []).sort((a, b) => b.docNo - a.docNo);
        setDocs(sorted);
        setFilteredDocs(sorted);
      } else {
        setError('Failed to fetch documents');
      }
    } catch (err) {
      console.error(err);
      setError(err.response?.data?.result || 'Internal Server Error');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (!searchQuery) {
      setFilteredDocs(docs);
    } else {
      const q = searchQuery.toLowerCase();
      const filtered = docs.filter(
        d =>
          d.docNo.toString().includes(q) ||
          (d.createdBy?.userName || '').toLowerCase().includes(q)
      );
      setFilteredDocs(filtered);
    }
  }, [searchQuery, docs]);

  const showNotification = (message, type = 'success') => {
    setToast({ show: true, message, type });
    setTimeout(() => setToast({ show: false, message: '', type: '' }), 4000);
  };

  const handleOpenEditDateModal = (doc) => {
    setEditingDoc(doc);
    const currentDate = doc.date || doc.createdAt;
    setEditDateValue(currentDate ? moment(currentDate).format('YYYY-MM-DDTHH:mm') : '');
    setEditDateError('');
  };

  const handleCloseEditDateModal = () => {
    setEditingDoc(null);
    setEditDateValue('');
    setEditDateError('');
  };

  const handleSaveDocDate = async (e) => {
    if (e) e.preventDefault();
    if (!editDateValue) {
      setEditDateError('Document date is required');
      return;
    }
    const parsed = new Date(editDateValue);
    if (isNaN(parsed.getTime())) {
      setEditDateError('Please enter a valid date and time');
      return;
    }

    try {
      setSavingDate(true);
      const token = getToken();
      const res = await axios.patch(
        `${process.env.REACT_APP_DEVELOPMENT}/api/stockOut/documents/${editingDoc.docNo}`,
        { documentDate: editDateValue },
        { headers: { token } }
      );

      if (res.data?.msg === 'success') {
        const updatedDate = res.data.result?.date || editDateValue;
        setDocs(prevDocs => prevDocs.map(d => d.docNo === editingDoc.docNo ? { ...d, date: updatedDate } : d));
        setFilteredDocs(prevDocs => prevDocs.map(d => d.docNo === editingDoc.docNo ? { ...d, date: updatedDate } : d));
        showNotification(`Doc #${editingDoc.docNo} Date Created updated successfully!`, 'success');
        handleCloseEditDateModal();
      } else {
        setEditDateError(res.data?.result || 'Failed to update document date');
      }
    } catch (err) {
      console.error(err);
      setEditDateError(err.response?.data?.result || err.response?.data?.error || 'Error updating document date');
    } finally {
      setSavingDate(false);
    }
  };

  // Aggregate stats
  const totalDocs = docs.length;
  const totalProducts = docs.reduce((sum, d) => sum + (d.totalProducts || 0), 0);
  const totalQty = docs.reduce((sum, d) => sum + (d.totalQuantity || 0), 0);

  return (
    <div className="container mx-auto p-6 space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold flex items-center gap-2 text-gray-800 dark:text-gray-100">
            <FileText className="h-8 w-8 text-blue-600" />
            Stock Out Documents
          </h1>
          <p className="text-sm text-gray-500 mt-1">Manage and edit your Stock Out entries by document number.</p>
        </div>
      </div>

      {/* KPI Cards */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <Card className="bg-white dark:bg-gray-800 shadow-sm border border-gray-200">
          <CardContent className="pt-6">
            <div className="flex items-center justify-between">
              <div>
                <div className="text-2xl font-bold text-gray-800 dark:text-gray-100">{totalDocs}</div>
                <p className="text-xs text-gray-500 uppercase tracking-wider font-semibold mt-1">Total Documents</p>
              </div>
              <Hash className="h-10 w-10 text-blue-500 opacity-20" />
            </div>
          </CardContent>
        </Card>
        <Card className="bg-white dark:bg-gray-800 shadow-sm border border-gray-200">
          <CardContent className="pt-6">
            <div className="flex items-center justify-between">
              <div>
                <div className="text-2xl font-bold text-gray-800 dark:text-gray-100">{totalProducts}</div>
                <p className="text-xs text-gray-500 uppercase tracking-wider font-semibold mt-1">Total Items Logged</p>
              </div>
              <Package className="h-10 w-10 text-emerald-500 opacity-20" />
            </div>
          </CardContent>
        </Card>
        <Card className="bg-white dark:bg-gray-800 shadow-sm border border-gray-200">
          <CardContent className="pt-6">
            <div className="flex items-center justify-between">
              <div>
                <div className="text-2xl font-bold text-gray-800 dark:text-gray-100">{totalQty}</div>
                <p className="text-xs text-gray-500 uppercase tracking-wider font-semibold mt-1">Total Quantity Out</p>
              </div>
              <Eye className="h-10 w-10 text-orange-500 opacity-20" />
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Filters */}
      <Card className="bg-white dark:bg-gray-800 shadow-sm border border-gray-200">
        <CardContent className="pt-6">
          <div className="relative">
            <Input
              icon={Search}
              placeholder="Search by Document Number or Creator..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              clearable
              onClear={() => setSearchQuery('')}
            />
          </div>
        </CardContent>
      </Card>

      {/* Documents Table */}
      <Card className="bg-white dark:bg-gray-800 shadow-sm border border-gray-200 overflow-hidden">
        <div className="p-4 border-b border-gray-200 bg-gray-50 dark:bg-gray-900/50">
          <h2 className="text-lg font-semibold text-gray-800 dark:text-gray-100">Document Registry</h2>
        </div>
        <CardContent className="p-0">
          {loading ? (
            <div className="text-center py-12 text-gray-500">Loading documents list...</div>
          ) : error ? (
            <div className="text-center py-12 text-red-500">{error}</div>
          ) : filteredDocs.length === 0 ? (
            <div className="text-center py-12 text-gray-500">No documents found.</div>
          ) : (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="font-semibold">Document Number</TableHead>
                    <TableHead className="font-semibold">Date Created</TableHead>
                    <TableHead className="font-semibold">Created By</TableHead>
                    <TableHead className="font-semibold text-right">Distinct Products</TableHead>
                    <TableHead className="font-semibold text-right">Total Quantity</TableHead>
                    <TableHead className="font-semibold text-right">Subtotal</TableHead>
                    <TableHead className="font-semibold text-right text-orange-700">Total Discount</TableHead>
                    <TableHead className="font-semibold text-right text-red-700">Grand Total</TableHead>
                    <TableHead className="text-center font-semibold">Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filteredDocs.map((doc) => {
                    const subTotal = doc.subTotal !== undefined ? doc.subTotal : (doc.items || []).reduce((s, i) => s + (i.quantity * i.sellingPrice), 0);
                    const totalDisc = doc.totalDiscount !== undefined ? doc.totalDiscount : (doc.items || []).reduce((s, i) => s + (i.discountAmount || 0), 0);
                    const grandTotal = doc.grandTotal !== undefined ? doc.grandTotal : (subTotal - totalDisc);

                    return (
                      <TableRow key={doc.docNo} className="hover:bg-slate-50/50">
                        <TableCell className="font-medium text-blue-600">
                          Doc #{doc.docNo}
                        </TableCell>
                        <TableCell>
                          <div className="flex items-center gap-1.5 text-gray-700 font-medium">
                            <Calendar className="h-4 w-4 text-blue-500" />
                            {moment(doc.date || doc.createdAt).format('DD/MM/YYYY hh:mm A')}
                          </div>
                        </TableCell>
                        <TableCell>
                          <div className="flex items-center gap-1.5 text-gray-600">
                            <User className="h-4 w-4 text-gray-400" />
                            {doc.createdBy?.userName || 'System'}
                          </div>
                        </TableCell>
                        <TableCell className="text-right font-medium">
                          {doc.totalProducts}
                        </TableCell>
                        <TableCell className="text-right font-semibold text-gray-900">
                          {doc.totalQuantity}
                        </TableCell>
                        <TableCell className="text-right font-medium text-gray-700">QR{subTotal.toFixed(2)}</TableCell>
                        <TableCell className="text-right font-medium text-orange-600">
                          {totalDisc > 0 ? `QR${totalDisc.toFixed(2)}` : 'QR0.00'}
                        </TableCell>
                        <TableCell className="text-right font-black text-red-600">
                          QR{grandTotal.toFixed(2)}
                        </TableCell>
                        <TableCell className="text-center">
                          <div className="flex items-center justify-center gap-2">
                            <Button
                              size="sm"
                              variant="outline"
                              onClick={() => handleOpenEditDateModal(doc)}
                              className="hover:bg-amber-50 hover:text-amber-700 border-amber-200 transition-colors"
                              title="Edit Date Created"
                            >
                              <Edit className="mr-1 h-3.5 w-3.5" />
                              Edit Date
                            </Button>
                            <Button
                              size="sm"
                              variant="outline"
                              onClick={() => navigate(`/dashboard/stockout-docs/${doc.docNo}`)}
                              className="hover:bg-blue-50 hover:text-blue-600 transition-colors"
                            >
                              <Eye className="mr-1 h-3.5 w-3.5" />
                              Excel Edit
                            </Button>
                          </div>
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Edit Date Modal */}
      {editingDoc && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
          <div className="bg-white dark:bg-gray-800 rounded-xl shadow-2xl border border-gray-200 dark:border-gray-700 max-w-md w-full overflow-hidden animate-in fade-in duration-200">
            <div className="bg-gradient-to-r from-blue-600 to-blue-700 px-6 py-4 flex items-center justify-between text-white">
              <div className="flex items-center gap-2 font-semibold text-lg">
                <Calendar className="w-5 h-5" />
                Edit Date Created (Doc #{editingDoc.docNo})
              </div>
              <button
                type="button"
                onClick={handleCloseEditDateModal}
                className="text-white/80 hover:text-white p-1 rounded-lg hover:bg-white/10 transition-colors"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleSaveDocDate} className="p-6 space-y-4">
              <div>
                <label className="block text-xs font-semibold text-gray-700 dark:text-gray-300 mb-1.5">
                  Date Created / Document Date *
                </label>
                <input
                  type="datetime-local"
                  value={editDateValue}
                  onChange={(e) => {
                    setEditDateValue(e.target.value);
                    if (editDateError) setEditDateError('');
                  }}
                  className={`w-full h-10 px-3 text-sm border rounded-lg shadow-sm bg-white dark:bg-gray-900 focus:ring-2 focus:ring-blue-500 focus:outline-none ${editDateError ? 'border-red-500 bg-red-50' : 'border-gray-300 dark:border-gray-600'}`}
                />
                {editDateError && (
                  <div className="mt-1.5 text-xs text-red-600 flex items-center gap-1">
                    <AlertCircle className="w-3.5 h-3.5" />
                    {editDateError}
                  </div>
                )}
              </div>

              {/* Current Date Preview */}
              <div className="bg-gray-50 dark:bg-gray-900/50 p-3 rounded-lg border text-xs space-y-1">
                <div className="text-gray-500">Document Date Preview:</div>
                <div className="font-bold text-blue-600 dark:text-blue-400">
                  {editDateValue && !isNaN(new Date(editDateValue).getTime())
                    ? moment(editDateValue).format('DD/MM/YYYY hh:mm A')
                    : 'Invalid Date'}
                </div>
              </div>

              <div className="pt-3 flex justify-end gap-3 border-t border-gray-200 dark:border-gray-700">
                <Button
                  type="button"
                  variant="outline"
                  onClick={handleCloseEditDateModal}
                  disabled={savingDate}
                >
                  Cancel
                </Button>
                <Button
                  type="submit"
                  disabled={savingDate}
                  className="bg-blue-600 hover:bg-blue-700 text-white font-semibold"
                >
                  {savingDate ? 'Updating...' : 'Update Date'}
                </Button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Toast Notification */}
      {toast.show && (
        <div className="fixed bottom-6 right-6 z-50 flex items-center gap-2 bg-emerald-600 text-white px-4 py-3 rounded-lg shadow-xl animate-in slide-in-from-bottom duration-200">
          <CheckCircle2 className="w-5 h-5" />
          <span className="text-sm font-semibold">{toast.message}</span>
        </div>
      )}
    </div>
  );
};

export default StockOutDocsList;
