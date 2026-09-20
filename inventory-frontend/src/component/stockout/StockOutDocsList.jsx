import React, { useState, useEffect } from 'react';
import axios from 'axios';
import { useNavigate } from 'react-router-dom';
import { Card, CardContent, CardHeader, CardTitle } from '../../components/ui/card';
import { Button } from '../../components/ui/button';
import { Input } from '../../components/ui/input';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '../../components/ui/table';
import { Search, FileText, Calendar, User, Package, Hash, Eye, Edit, X, CheckCircle2, AlertCircle, MapPin, Plus } from 'lucide-react';
import moment from 'moment';
import { getToken } from '../../utils/auth';
import { PageHeader } from '../../components/ui/page-header';
import { StatCard } from '../../components/ui/stat-card';
import { Badge } from '../../components/ui/badge';
import { EmptyState } from '../../components/ui/empty-state';

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
        d => {
          const locName = d.location?.name || (typeof d.location === 'string' ? d.location : '') || d.items?.[0]?.location?.name || '';
          return (
            d.docNo.toString().includes(q) ||
            (d.createdBy?.userName || '').toLowerCase().includes(q) ||
            locName.toLowerCase().includes(q)
          );
        }
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
    <div className="ph-page space-y-6">
      <PageHeader
        title="Stock Out Documents"
        subtitle="Manage, verify, and audit outbound medication dispatches by document number"
        badge={
          <Badge variant="teal" className="ml-2">
            {totalDocs} Documents
          </Badge>
        }
      >
        <Button
          size="sm"
          className="bg-[var(--ph-navy)] hover:bg-[var(--ph-navy-hover)] text-white shadow-sm"
          onClick={() => navigate('/dashboard/stockout')}
        >
          <Plus className="mr-1.5 h-4 w-4" />
          New Stock Out Dispatch
        </Button>
      </PageHeader>

      {/* KPI Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <StatCard
          icon={Hash}
          label="Total Dispatches"
          value={totalDocs}
          subtitle="All recorded outbound documents"
          color="primary"
        />
        <StatCard
          icon={Package}
          label="Total Items Dispatched"
          value={totalProducts}
          subtitle="Unique medicine lines sent"
          color="secondary"
        />
        <StatCard
          icon={Eye}
          label="Total Units Out"
          value={totalQty.toLocaleString()}
          subtitle="Cumulative inventory dispersed"
          color="warning"
        />
      </div>

      {/* Documents Table Card */}
      <Card className="ph-card shadow-sm border border-[var(--ph-border)] overflow-hidden">
        <CardHeader className="border-b border-[var(--ph-border)] py-3 px-4">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div className="flex items-center gap-2">
              <CardTitle className="text-sm font-semibold text-[var(--ph-text)]">
                Outbound Document Registry
              </CardTitle>
              <Badge variant="outline" className="text-xs font-mono">
                {filteredDocs.length} records
              </Badge>
            </div>
            <div className="relative w-full sm:max-w-xs">
              <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-[var(--ph-muted)] pointer-events-none" />
              <Input
                placeholder="Search Doc #, Location, Creator..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="pl-8 h-8 text-xs bg-[var(--ph-surface)] border-[var(--ph-border)]"
                clearable
                onClear={() => setSearchQuery('')}
              />
            </div>
          </div>
        </CardHeader>
        <CardContent className="p-0">
          {loading ? (
            <div className="py-12 flex flex-col items-center justify-center gap-2 text-[var(--ph-muted)] text-sm">
              <div className="w-6 h-6 border-2 border-[var(--ph-teal)] border-t-transparent rounded-full animate-spin" />
              <span>Loading documents list...</span>
            </div>
          ) : error ? (
            <div className="py-12 text-center text-xs font-medium text-rose-600 bg-rose-50/50">
              {error}
            </div>
          ) : filteredDocs.length === 0 ? (
            <EmptyState
              icon={FileText}
              title="No Stock Out Documents Found"
              description={searchQuery ? 'No documents matched your search filter.' : 'Begin dispensing to create outbound records.'}
              actionLabel="New Stock Out"
              onAction={() => navigate('/dashboard/stockout')}
            />
          ) : (
            <div className="overflow-x-auto">
              <Table className="ph-table text-xs">
                <TableHeader>
                  <TableRow className="bg-[var(--ph-surface-2)] border-b border-[var(--ph-border)]">
                    <TableHead className="font-semibold text-[var(--ph-text)]">Doc #</TableHead>
                    <TableHead className="font-semibold text-[var(--ph-text)]">Destination Facility</TableHead>
                    <TableHead className="font-semibold text-[var(--ph-text)]">Date Created</TableHead>
                    <TableHead className="font-semibold text-[var(--ph-text)]">Created By</TableHead>
                    <TableHead className="font-semibold text-[var(--ph-text)] text-right">Items</TableHead>
                    <TableHead className="font-semibold text-[var(--ph-text)] text-right">Qty</TableHead>
                    <TableHead className="font-semibold text-[var(--ph-text)] text-right">Subtotal</TableHead>
                    <TableHead className="font-semibold text-amber-700 dark:text-amber-400 text-right">Discount</TableHead>
                    <TableHead className="font-semibold text-rose-700 dark:text-rose-400 text-right">Grand Total</TableHead>
                    <TableHead className="text-center font-semibold text-[var(--ph-text)]">Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filteredDocs.map((doc) => {
                    const locName = doc.location?.name || (typeof doc.location === 'string' ? doc.location : '') || doc.items?.[0]?.location?.name || '-';
                    const subTotal = doc.subTotal !== undefined ? doc.subTotal : (doc.items || []).reduce((s, i) => s + (i.quantity * i.sellingPrice), 0);
                    const totalDisc = doc.totalDiscount !== undefined ? doc.totalDiscount : (doc.items || []).reduce((s, i) => s + (i.discountAmount || 0), 0);
                    const grandTotal = doc.grandTotal !== undefined ? doc.grandTotal : (subTotal - totalDisc);

                    return (
                      <TableRow key={doc.docNo} className="hover:bg-[var(--ph-surface-2)]/60 transition-colors">
                        <TableCell className="font-medium text-[var(--ph-navy)] dark:text-[var(--ph-teal)]">
                          <span className="font-mono font-semibold">#{doc.docNo}</span>
                        </TableCell>
                        <TableCell>
                          <div className="flex items-center gap-1.5 font-medium text-[var(--ph-text)]">
                            <MapPin className="h-3.5 w-3.5 text-[var(--ph-teal)] shrink-0" />
                            <span className="truncate max-w-[180px]">{locName}</span>
                          </div>
                        </TableCell>
                        <TableCell>
                          <div className="flex items-center gap-1.5 text-[var(--ph-text-secondary)] font-mono text-[11px]">
                            <Calendar className="h-3.5 w-3.5 text-[var(--ph-muted)] shrink-0" />
                            {moment(doc.date || doc.createdAt).format('DD/MM/YYYY hh:mm A')}
                          </div>
                        </TableCell>
                        <TableCell>
                          <div className="flex items-center gap-1.5 text-[var(--ph-text-secondary)]">
                            <User className="h-3.5 w-3.5 text-[var(--ph-muted)] shrink-0" />
                            <span>{doc.createdBy?.userName || 'System'}</span>
                          </div>
                        </TableCell>
                        <TableCell className="text-right font-medium text-[var(--ph-text)]">
                          {doc.totalProducts}
                        </TableCell>
                        <TableCell className="text-right font-semibold text-[var(--ph-text)]">
                          {doc.totalQuantity}
                        </TableCell>
                        <TableCell className="text-right font-mono font-medium text-[var(--ph-text)]">
                          QR{subTotal.toFixed(2)}
                        </TableCell>
                        <TableCell className="text-right font-mono font-medium text-amber-600 dark:text-amber-400">
                          {totalDisc > 0 ? `QR${totalDisc.toFixed(2)}` : 'QR0.00'}
                        </TableCell>
                        <TableCell className="text-right font-mono font-bold text-rose-600 dark:text-rose-400">
                          QR{grandTotal.toFixed(2)}
                        </TableCell>
                        <TableCell className="text-center">
                          <div className="flex items-center justify-center gap-1.5">
                            <Button
                              size="sm"
                              variant="outline"
                              onClick={() => handleOpenEditDateModal(doc)}
                              className="h-7 px-2 text-xs hover:bg-amber-50 hover:text-amber-700 border-[var(--ph-border)] transition-colors"
                              title="Edit Date Created"
                            >
                              <Edit className="mr-1 h-3 w-3" />
                              Edit Date
                            </Button>
                            <Button
                              size="sm"
                              variant="outline"
                              onClick={() => navigate(`/dashboard/stockout-docs/${doc.docNo}`)}
                              className="h-7 px-2 text-xs hover:bg-[var(--ph-navy)] hover:text-white border-[var(--ph-border)] transition-colors"
                            >
                              <Eye className="mr-1 h-3 w-3" />
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
          <div className="bg-[var(--ph-surface)] rounded-xl shadow-2xl border border-[var(--ph-border)] max-w-md w-full overflow-hidden animate-in fade-in duration-200">
            <div className="bg-[var(--ph-navy)] px-6 py-4 flex items-center justify-between text-white">
              <div className="flex items-center gap-2 font-semibold text-sm">
                <Calendar className="w-4 h-4 text-[var(--ph-teal)]" />
                Edit Date Created (Doc #{editingDoc.docNo})
              </div>
              <button
                type="button"
                onClick={handleCloseEditDateModal}
                className="text-white/80 hover:text-white p-1 rounded-lg hover:bg-white/10 transition-colors"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <form onSubmit={handleSaveDocDate} className="p-6 space-y-4">
              <div>
                <label className="block text-xs font-semibold text-[var(--ph-text)] mb-1.5">
                  Date Created / Document Date *
                </label>
                <input
                  type="datetime-local"
                  value={editDateValue}
                  onChange={(e) => {
                    setEditDateValue(e.target.value);
                    if (editDateError) setEditDateError('');
                  }}
                  className={`w-full h-10 px-3 text-xs border rounded-lg shadow-sm bg-[var(--ph-surface)] text-[var(--ph-text)] focus:ring-2 focus:ring-[var(--ph-navy)] focus:outline-none ${editDateError ? 'border-rose-500 bg-rose-50/50' : 'border-[var(--ph-border)]'}`}
                />
                {editDateError && (
                  <div className="mt-1.5 text-xs text-rose-600 flex items-center gap-1">
                    <AlertCircle className="w-3.5 h-3.5" />
                    {editDateError}
                  </div>
                )}
              </div>

              {/* Current Date Preview */}
              <div className="bg-[var(--ph-surface-2)] p-3 rounded-lg border border-[var(--ph-border)] text-xs space-y-1">
                <div className="text-[var(--ph-text-secondary)]">Document Date Preview:</div>
                <div className="font-bold text-[var(--ph-navy)] dark:text-[var(--ph-teal)] font-mono">
                  {editDateValue && !isNaN(new Date(editDateValue).getTime())
                    ? moment(editDateValue).format('DD/MM/YYYY hh:mm A')
                    : 'Invalid Date'}
                </div>
              </div>

              <div className="pt-3 flex justify-end gap-3 border-t border-[var(--ph-border)]">
                <Button
                  type="button"
                  variant="outline"
                  onClick={handleCloseEditDateModal}
                  disabled={savingDate}
                  className="text-xs"
                >
                  Cancel
                </Button>
                <Button
                  type="submit"
                  disabled={savingDate}
                  className="bg-[var(--ph-navy)] hover:bg-[var(--ph-navy-hover)] text-white text-xs font-semibold"
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
        <div className="fixed bottom-6 right-6 z-50 flex items-center gap-2 bg-emerald-600 text-white px-4 py-3 rounded-lg shadow-xl animate-in slide-in-from-bottom duration-200 text-xs font-semibold">
          <CheckCircle2 className="w-4 h-4" />
          <span>{toast.message}</span>
        </div>
      )}
    </div>
  );
};

export default StockOutDocsList;
