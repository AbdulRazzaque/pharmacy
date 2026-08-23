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
import { Trash2, Edit, Plus, Download } from 'lucide-react';
import * as XLSX from 'xlsx';
import { saveAs } from '../../utils/fileDownload';

const Addsuppliers = () => {
  const [data, setData] = useState([]);
  const [alert, setAlert] = useState({ show: false, message: '', type: '' });
  const [editingId, setEditingId] = useState(null);
  const [selectedRows, setSelectedRows] = useState([]);
  
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

  return (
    <div className="container mx-auto p-6 space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-3xl font-bold">Suppliers Management</h1>
        <div className="flex gap-2">
          {selectedRows.length > 0 && (
            <Button variant="destructive" onClick={handleBulkDelete}>
              <Trash2 className="mr-2 h-4 w-4" />
              Delete ({selectedRows.length})
            </Button>
          )}
          <Button variant="outline" onClick={exportToExcel}>
            <Download className="mr-2 h-4 w-4" />
            Export
          </Button>
        </div>
      </div>

      {alert.show && (
        <Alert variant={alert.type === 'error' ? 'destructive' : 'default'}>
          <AlertDescription>{alert.message}</AlertDescription>
        </Alert>
      )}

      <Card>
        <CardHeader>
          <CardTitle>{editingId ? 'Edit Supplier' : 'Add New Supplier'}</CardTitle>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="name">Supplier Name *</Label>
                <Input
                  id="name"
                  {...register('name', { required: 'Supplier name is required' })}
                  placeholder="Enter supplier name"
                />
                {errors.name && (
                  <p className="text-sm text-red-500">{errors.name.message}</p>
                )}
              </div>

              <div className="space-y-2">
                <Label htmlFor="contact">Contact Number</Label>
                <Input
                  id="contact"
                  {...register('contact')}
                  placeholder="Enter contact number"
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="email">Email</Label>
                <Input
                  id="email"
                  type="email"
                  {...register('email')}
                  placeholder="Enter email address"
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="address">Address</Label>
                <Input
                  id="address"
                  {...register('address')}
                  placeholder="Enter address"
                />
              </div>
            </div>

            <div className="flex gap-2">
              <Button type="submit">
                <Plus className="mr-2 h-4 w-4" />
                {editingId ? 'Update Supplier' : 'Add Supplier'}
              </Button>
              {editingId && (
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => {
                    setEditingId(null);
                    reset();
                  }}
                >
                  Cancel
                </Button>
              )}
            </div>
          </form>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Suppliers List ({data.length})</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-12">
                    <input
                      type="checkbox"
                      checked={selectedRows.length === data.length && data.length > 0}
                      onChange={toggleSelectAll}
                      className="h-4 w-4 rounded border-gray-300"
                    />
                  </TableHead>
                  <TableHead>Supplier Name</TableHead>
                  <TableHead>Contact</TableHead>
                  <TableHead>Email</TableHead>
                  <TableHead>Address</TableHead>
                  <TableHead className="text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {data.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={6} className="text-center py-8 text-muted-foreground">
                      No suppliers found. Add your first supplier above.
                    </TableCell>
                  </TableRow>
                ) : (
                  data.map((supplier) => (
                    <TableRow key={supplier._id}>
                      <TableCell>
                        <input
                          type="checkbox"
                          checked={selectedRows.includes(supplier._id)}
                          onChange={() => toggleSelectRow(supplier._id)}
                          className="h-4 w-4 rounded border-gray-300"
                        />
                      </TableCell>
                      <TableCell className="font-medium">{supplier.name}</TableCell>
                      <TableCell>{supplier.contact || '-'}</TableCell>
                      <TableCell>{supplier.email || '-'}</TableCell>
                      <TableCell>{supplier.address || '-'}</TableCell>
                      <TableCell className="text-right">
                        <div className="flex justify-end gap-2">
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => handleEdit(supplier)}
                          >
                            <Edit className="h-4 w-4" />
                          </Button>
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => handleDelete(supplier._id)}
                          >
                            <Trash2 className="h-4 w-4 text-red-500" />
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
