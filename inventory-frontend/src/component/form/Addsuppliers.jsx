import React, { useState, useEffect } from 'react';
import axios from 'axios';
import { useForm } from 'react-hook-form';
import { getToken } from '../../utils/auth';
import { Button } from '../../components/ui/button';
import { Input } from '../../components/ui/input';
import { Label } from '../../components/ui/label';
import { Card, CardContent, CardHeader, CardTitle } from '../../components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '../../components/ui/table';
import { Alert, AlertDescription } from '../../components/ui/alert';
import { Trash2, Edit, Plus, Download, Building2, Phone, Mail, MapPin, Search } from 'lucide-react';
import * as XLSX from 'xlsx';
import { saveAs } from '../../utils/fileDownload';
import { PageHeader } from '../../components/ui/page-header';
import { Badge } from '../../components/ui/badge';

const Addsuppliers = () => {
  const [data, setData] = useState([]);
  const [alert, setAlert] = useState({ show: false, message: '', type: '' });
  const [editingId, setEditingId] = useState(null);
  const [selectedRows, setSelectedRows] = useState([]);
  const [searchQuery, setSearchQuery] = useState('');
  
  const accessToken = getToken();
  
  const { register, handleSubmit, reset, setValue, formState: { errors } } = useForm();

  const fetchSuppliers = () => {
    axios.get(`${process.env.REACT_APP_DEVELOPMENT}/api/supplier/getAllSuppliers`, {
      headers: { token: accessToken }
    })
    .then((res) => {
      setData(res.data.result || []);
    })
    .catch((err) => {
      console.error('Error fetching suppliers:', err);
      showAlert('Failed to fetch suppliers', 'error');
    });
  };

  useEffect(() => {
    fetchSuppliers();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const showAlert = (message, type) => {
    setAlert({ show: true, message, type });
    setTimeout(() => setAlert({ show: false, message: '', type: '' }), 3000);
  };

  const onSubmit = (formData) => {
    if (editingId) {
      axios.put(`${process.env.REACT_APP_DEVELOPMENT}/api/supplier/updateSupplier/${editingId}`, 
        formData,
        { headers: { token: accessToken } }
      )
      .then(() => {
        showAlert('Supplier updated successfully!', 'success');
        fetchSuppliers();
        reset();
        setEditingId(null);
      })
      .catch((err) => {
        showAlert('Failed to update supplier', 'error');
        console.error(err);
      });
    } else {
      axios.post(`${process.env.REACT_APP_DEVELOPMENT}/api/supplier/createSupplier`, 
        formData,
        { headers: { token: accessToken } }
      )
      .then(() => {
        showAlert('Supplier added successfully!', 'success');
        fetchSuppliers();
        reset();
      })
      .catch((err) => {
        showAlert('Failed to add supplier', 'error');
        console.error(err);
      });
    }
  };

  const handleEdit = (supplier) => {
    setEditingId(supplier._id);
    setValue('name', supplier.name);
    setValue('contact', supplier.contact || '');
    setValue('address', supplier.address || '');
    setValue('email', supplier.email || '');
  };

  const handleDelete = (id) => {
    if (window.confirm('Are you sure you want to delete this supplier?')) {
      axios.delete(`${process.env.REACT_APP_DEVELOPMENT}/api/supplier/deleteSupplier/${id}`, {
        headers: { token: accessToken }
      })
      .then(() => {
        showAlert('Supplier deleted successfully!', 'success');
        fetchSuppliers();
      })
      .catch((err) => {
        showAlert('Failed to delete supplier', 'error');
        console.error(err);
      });
    }
  };

  const handleBulkDelete = () => {
    if (selectedRows.length === 0) {
      showAlert('Please select suppliers to delete', 'error');
      return;
    }
    
    if (window.confirm(`Are you sure you want to delete ${selectedRows.length} supplier(s)?`)) {
      Promise.all(
        selectedRows.map(id => 
          axios.delete(`${process.env.REACT_APP_DEVELOPMENT}/api/supplier/deleteSupplier/${id}`, {
            headers: { token: accessToken }
          })
        )
      )
      .then(() => {
        showAlert(`${selectedRows.length} supplier(s) deleted successfully!`, 'success');
        setSelectedRows([]);
        fetchSuppliers();
      })
      .catch((err) => {
        showAlert('Failed to delete suppliers', 'error');
        console.error(err);
      });
    }
  };

  const toggleSelectRow = (id) => {
    setSelectedRows(prev => 
      prev.includes(id) ? prev.filter(rowId => rowId !== id) : [...prev, id]
    );
  };

  const toggleSelectAll = () => {
    if (selectedRows.length === data.length) {
      setSelectedRows([]);
    } else {
      setSelectedRows(data.map(item => item._id));
    }
  };

  const exportToExcel = () => {
    const exportData = data.map(item => ({
      'Supplier Name': item.name,
      'Contact': item.contact || '',
      'Email': item.email || '',
      'Address': item.address || ''
    }));

    const ws = XLSX.utils.json_to_sheet(exportData);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Suppliers');
    const excelBuffer = XLSX.write(wb, { bookType: 'xlsx', type: 'array' });
    const dataBlob = new Blob([excelBuffer], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
    saveAs(dataBlob, 'suppliers.xlsx');
  };

  const filteredData = data.filter((s) => {
    if (!searchQuery.trim()) return true;
    const q = searchQuery.toLowerCase();
    return (
      (s.name || '').toLowerCase().includes(q) ||
      (s.contact || '').toLowerCase().includes(q) ||
      (s.email || '').toLowerCase().includes(q) ||
      (s.address || '').toLowerCase().includes(q)
    );
  });

  return (
    <div className="ph-page space-y-6">
      <PageHeader
        title="Suppliers Directory"
        subtitle="Manage pharmaceutical distributors, vendor contacts, and procurement channels"
        badge={
          <Badge variant="teal" className="ml-2">
            {data.length} Vendors
          </Badge>
        }
      >
        {selectedRows.length > 0 && (
          <Button variant="destructive" size="sm" onClick={handleBulkDelete}>
            <Trash2 className="mr-1.5 h-4 w-4" />
            Delete ({selectedRows.length})
          </Button>
        )}
        <Button variant="outline" size="sm" onClick={exportToExcel}>
          <Download className="mr-1.5 h-4 w-4 text-emerald-600" />
          Export Vendors
        </Button>
      </PageHeader>

      {alert.show && (
        <Alert variant={alert.type === 'error' ? 'destructive' : 'default'} className="animate-in fade-in">
          <AlertDescription>{alert.message}</AlertDescription>
        </Alert>
      )}

      {/* Supplier Entry Form Card */}
      <Card className="ph-card shadow-sm border border-[var(--ph-border)]">
        <CardHeader className="border-b border-[var(--ph-border)] pb-4">
          <div className="flex items-center justify-between">
            <div>
              <CardTitle className="text-base font-semibold text-[var(--ph-text)]">
                {editingId ? 'Edit Supplier Details' : 'Register New Supplier'}
              </CardTitle>
              <p className="text-xs text-[var(--ph-text-secondary)] mt-0.5">
                {editingId ? 'Update vendor credentials and communication details' : 'Add a verified medicine distributor to your supplier network'}
              </p>
            </div>
            {editingId && (
              <Badge variant="warning">Editing Mode</Badge>
            )}
          </div>
        </CardHeader>
        <CardContent className="pt-5">
          <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
              <div className="space-y-1.5">
                <Label htmlFor="name" className="text-xs font-semibold text-[var(--ph-text)]">Supplier / Distributor Name *</Label>
                <div className="relative">
                  <Building2 className="absolute left-2.5 top-1/2 -translate-y-1/2 h-4 w-4 text-[var(--ph-muted)]" />
                  <Input
                    id="name"
                    {...register('name', { required: 'Supplier name is required' })}
                    placeholder="e.g. Apex Pharma Dist"
                    className="pl-8.5 h-9.5 text-sm"
                  />
                </div>
                {errors.name && (
                  <p className="text-xs text-rose-600 font-medium">{errors.name.message}</p>
                )}
              </div>

              <div className="space-y-1.5">
                <Label htmlFor="contact" className="text-xs font-semibold text-[var(--ph-text)]">Contact Number</Label>
                <div className="relative">
                  <Phone className="absolute left-2.5 top-1/2 -translate-y-1/2 h-4 w-4 text-[var(--ph-muted)]" />
                  <Input
                    id="contact"
                    {...register('contact')}
                    placeholder="e.g. +1 (555) 019-2834"
                    className="pl-8.5 h-9.5 text-sm"
                  />
                </div>
              </div>

              <div className="space-y-1.5">
                <Label htmlFor="email" className="text-xs font-semibold text-[var(--ph-text)]">Email Address</Label>
                <div className="relative">
                  <Mail className="absolute left-2.5 top-1/2 -translate-y-1/2 h-4 w-4 text-[var(--ph-muted)]" />
                  <Input
                    id="email"
                    type="email"
                    {...register('email')}
                    placeholder="orders@supplier.com"
                    className="pl-8.5 h-9.5 text-sm"
                  />
                </div>
              </div>

              <div className="space-y-1.5">
                <Label htmlFor="address" className="text-xs font-semibold text-[var(--ph-text)]">Business Address</Label>
                <div className="relative">
                  <MapPin className="absolute left-2.5 top-1/2 -translate-y-1/2 h-4 w-4 text-[var(--ph-muted)]" />
                  <Input
                    id="address"
                    {...register('address')}
                    placeholder="e.g. Warehouse 4, West End"
                    className="pl-8.5 h-9.5 text-sm"
                  />
                </div>
              </div>
            </div>

            <div className="flex justify-end gap-2 pt-2 border-t border-[var(--ph-border)]">
              {editingId && (
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => {
                    setEditingId(null);
                    reset();
                  }}
                >
                  Cancel
                </Button>
              )}
              <Button type="submit" size="sm" className="bg-[var(--ph-navy)] hover:bg-[var(--ph-navy-hover)] text-white">
                <Plus className="mr-1.5 h-4 w-4" />
                {editingId ? 'Save Changes' : 'Register Supplier'}
              </Button>
            </div>
          </form>
        </CardContent>
      </Card>

      {/* Suppliers Registry Table Card */}
      <Card className="ph-card shadow-sm border border-[var(--ph-border)] overflow-hidden">
        <CardHeader className="border-b border-[var(--ph-border)] py-3 px-4">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div className="flex items-center gap-2">
              <CardTitle className="text-sm font-semibold text-[var(--ph-text)]">
                Vendors Registry
              </CardTitle>
              <Badge variant="outline" className="text-xs font-mono">
                {filteredData.length} records
              </Badge>
            </div>
            <div className="relative w-full sm:max-w-xs">
              <Search className="absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-[var(--ph-muted)] pointer-events-none" />
              <Input
                type="search"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Search vendors..."
                className="pl-8 h-8 text-xs bg-[var(--ph-surface)] border-[var(--ph-border)]"
                aria-label="Search suppliers"
              />
            </div>
          </div>
        </CardHeader>
        <CardContent className="p-0">
          <div className="overflow-x-auto">
            <Table>
              <TableHeader className="bg-[var(--ph-surface-2)] border-b border-[var(--ph-border)]">
                <TableRow>
                  <TableHead className="w-10 pl-4">
                    <input
                      type="checkbox"
                      checked={selectedRows.length === filteredData.length && filteredData.length > 0}
                      onChange={toggleSelectAll}
                      className="h-3.5 w-3.5 rounded border-gray-300"
                    />
                  </TableHead>
                  <TableHead className="font-semibold text-xs text-[var(--ph-text)]">Supplier Name</TableHead>
                  <TableHead className="font-semibold text-xs text-[var(--ph-text)]">Contact</TableHead>
                  <TableHead className="font-semibold text-xs text-[var(--ph-text)]">Email</TableHead>
                  <TableHead className="font-semibold text-xs text-[var(--ph-text)]">Address</TableHead>
                  <TableHead className="text-right font-semibold text-xs text-[var(--ph-text)] pr-4">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filteredData.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={6} className="text-center py-12 text-sm text-[var(--ph-text-secondary)]">
                      {data.length === 0
                        ? 'No suppliers logged. Register your first vendor above.'
                        : 'No suppliers match your search query.'}
                    </TableCell>
                  </TableRow>
                ) : (
                  filteredData.map((supplier) => (
                    <TableRow key={supplier._id} className="hover:bg-[var(--ph-surface-2)]/60 transition-colors border-b border-[var(--ph-border)]">
                      <TableCell className="w-10 pl-4">
                        <input
                          type="checkbox"
                          checked={selectedRows.includes(supplier._id)}
                          onChange={() => toggleSelectRow(supplier._id)}
                          className="h-3.5 w-3.5 rounded border-gray-300"
                        />
                      </TableCell>
                      <TableCell className="font-medium text-sm text-[var(--ph-text)]">
                        <div className="flex items-center gap-2">
                          <Building2 className="h-4 w-4 text-[var(--ph-teal)] shrink-0" />
                          <span>{supplier.name}</span>
                        </div>
                      </TableCell>
                      <TableCell className="text-xs text-[var(--ph-text-secondary)]">
                        {supplier.contact ? (
                          <span className="inline-flex items-center gap-1">
                            <Phone className="h-3 w-3 text-[var(--ph-muted)]" />
                            {supplier.contact}
                          </span>
                        ) : '-'}
                      </TableCell>
                      <TableCell className="text-xs text-[var(--ph-text-secondary)]">
                        {supplier.email ? (
                          <span className="inline-flex items-center gap-1 text-[var(--ph-teal)]">
                            <Mail className="h-3 w-3" />
                            {supplier.email}
                          </span>
                        ) : '-'}
                      </TableCell>
                      <TableCell className="text-xs text-[var(--ph-text-secondary)]">
                        {supplier.address || '-'}
                      </TableCell>
                      <TableCell className="text-right pr-4">
                        <div className="flex justify-end gap-1">
                          <Button
                            variant="ghost"
                            size="sm"
                            className="h-7 w-7 p-0 text-[var(--ph-text-secondary)] hover:text-[var(--ph-navy)]"
                            onClick={() => handleEdit(supplier)}
                          >
                            <Edit className="h-3.5 w-3.5" />
                          </Button>
                          <Button
                            variant="ghost"
                            size="sm"
                            className="h-7 w-7 p-0 text-[var(--ph-text-secondary)] hover:text-rose-600"
                            onClick={() => handleDelete(supplier._id)}
                          >
                            <Trash2 className="h-3.5 w-3.5 text-rose-500" />
                          </Button>
                        </div>
                      </TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          </div>
        </CardContent>
      </Card>
    </div>
  );
};

export default Addsuppliers;
