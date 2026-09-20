import React, { useState, useEffect } from 'react';
import axios from 'axios';
import { useForm } from 'react-hook-form';
import { Button } from '../../components/ui/button';
import { Input } from '../../components/ui/input';
import { Label } from '../../components/ui/label';
import { Card, CardContent, CardHeader, CardTitle } from '../../components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '../../components/ui/table';
import { Alert, AlertDescription } from '../../components/ui/alert';
import { Trash2, Edit, Plus, Download, MapPin, Stethoscope, UserCheck, Search } from 'lucide-react';
import * as XLSX from 'xlsx';
import { saveAs } from '../../utils/fileDownload';
import { getToken } from '../../utils/auth';
import { PageHeader } from '../../components/ui/page-header';
import { Badge } from '../../components/ui/badge';

const AddLocations = () => {
  const [data, setData] = useState([]);
  const [alert, setAlert] = useState({ show: false, message: '', type: '' });
  const [editingId, setEditingId] = useState(null);
  const [selectedRows, setSelectedRows] = useState([]);
  const [searchQuery, setSearchQuery] = useState('');

  const accessToken = getToken();

  const { register, handleSubmit, reset, setValue, formState: { errors } } = useForm();

  const fetchLocations = () => {
    axios.get(`${process.env.REACT_APP_DEVELOPMENT}/api/location/getAllLocations`, {
      headers: { token: accessToken }
    })
      .then((res) => {
        setData(res.data.result || []);
      })
      .catch((err) => {
        console.error('Error fetching locations:', err);
        showAlert('Failed to fetch locations', 'error');
      });
  };

  useEffect(() => {
    fetchLocations();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const showAlert = (message, type) => {
    setAlert({ show: true, message, type });
    setTimeout(() => setAlert({ show: false, message: '', type: '' }), 3000);
  };

  const onSubmit = (formData) => {
    if (editingId) {
      axios.put(`${process.env.REACT_APP_DEVELOPMENT}/api/location/updateLocation/${editingId}`,
        formData,
        { headers: { token: accessToken } }
      )
        .then(() => {
          showAlert('Location updated successfully!', 'success');
          fetchLocations();
          reset();
          setEditingId(null);
        })
        .catch((err) => {
          showAlert('Failed to update location', 'error');
          console.error(err);
        });
    } else {
      axios.post(`${process.env.REACT_APP_DEVELOPMENT}/api/location/createLocation`,
        formData,
        { headers: { token: accessToken } }
      )
        .then(() => {
          showAlert('Location added successfully!', 'success');
          fetchLocations();
          reset();
        })
        .catch((err) => {
          showAlert('Failed to add location', 'error');
          console.error(err);
        });
    }
  };

  const handleEdit = (location) => {
    setEditingId(location._id);
    setValue('name', location.name);
    setValue('trainerName', location.trainerName || '');
    setValue('doctorName', location.doctorName || '');
    setValue('address', location.address || '');
  };

  const handleDelete = (id) => {
    if (window.confirm('Are you sure you want to delete this location?')) {
      axios.delete(`${process.env.REACT_APP_DEVELOPMENT}/api/location/deleteLocation/${id}`, {
        headers: { token: accessToken }
      })
        .then(() => {
          showAlert('Location deleted successfully!', 'success');
          fetchLocations();
        })
        .catch((err) => {
          showAlert('Failed to delete location', 'error');
          console.error(err);
        });
    }
  };

  const handleBulkDelete = () => {
    if (selectedRows.length === 0) {
      showAlert('Please select locations to delete', 'error');
      return;
    }

    if (window.confirm(`Are you sure you want to delete ${selectedRows.length} location(s)?`)) {
      Promise.all(
        selectedRows.map(id =>
          axios.delete(`${process.env.REACT_APP_DEVELOPMENT}/api/location/deleteLocation/${id}`, {
            headers: { token: accessToken }
          })
        )
      )
        .then(() => {
          showAlert(`${selectedRows.length} location(s) deleted successfully!`, 'success');
          setSelectedRows([]);
          fetchLocations();
        })
        .catch((err) => {
          showAlert('Failed to delete locations', 'error');
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
      'Location Name': item.name,
      'Trainer Name': item.trainerName || '',
      'Doctor Name': item.doctorName || '',
      'Address': item.address || ''
    }));

    const ws = XLSX.utils.json_to_sheet(exportData);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Locations');
    const excelBuffer = XLSX.write(wb, { bookType: 'xlsx', type: 'array' });
    const dataBlob = new Blob([excelBuffer], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
    saveAs(dataBlob, 'locations.xlsx');
  };

  const filteredData = data.filter((loc) => {
    if (!searchQuery.trim()) return true;
    const q = searchQuery.toLowerCase();
    return (
      (loc.name || '').toLowerCase().includes(q) ||
      (loc.trainerName || '').toLowerCase().includes(q) ||
      (loc.doctorName || '').toLowerCase().includes(q) ||
      (loc.address || '').toLowerCase().includes(q)
    );
  });

  return (
    <div className="ph-page space-y-6">
      <PageHeader
        title="Storage & Facility Locations"
        subtitle="Manage pharmacy storage rooms, branch facilities, and medical dispensaries"
        badge={
          <Badge variant="teal" className="ml-2">
            {data.length} Facilities
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
          Export Locations
        </Button>
      </PageHeader>

      {alert.show && (
        <Alert variant={alert.type === 'error' ? 'destructive' : 'default'} className="animate-in fade-in">
          <AlertDescription>{alert.message}</AlertDescription>
        </Alert>
      )}

      {/* Location Entry Form Card */}
      <Card className="ph-card shadow-sm border border-[var(--ph-border)]">
        <CardHeader className="border-b border-[var(--ph-border)] pb-4">
          <div className="flex items-center justify-between">
            <div>
              <CardTitle className="text-base font-semibold text-[var(--ph-text)]">
                {editingId ? 'Edit Facility Details' : 'Register New Facility / Location'}
              </CardTitle>
              <p className="text-xs text-[var(--ph-text-secondary)] mt-0.5">
                {editingId ? 'Update facility personnel and address records' : 'Set up a medical ward, dispensing branch, or storage room'}
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
                <Label htmlFor="name" className="text-xs font-semibold text-[var(--ph-text)]">Location / Facility Name *</Label>
                <div className="relative">
                  <MapPin className="absolute left-2.5 top-1/2 -translate-y-1/2 h-4 w-4 text-[var(--ph-muted)]" />
                  <Input
                    id="name"
                    {...register('name', { required: 'Location name is required' })}
                    placeholder="e.g. Ward A / Main Dispensary"
                    className="pl-8.5 h-9.5 text-sm"
                  />
                </div>
                {errors.name && (
                  <p className="text-xs text-rose-600 font-medium">{errors.name.message}</p>
                )}
              </div>

              <div className="space-y-1.5">
                <Label htmlFor="trainerName" className="text-xs font-semibold text-[var(--ph-text)]">Supervisor / Incharge</Label>
                <div className="relative">
                  <UserCheck className="absolute left-2.5 top-1/2 -translate-y-1/2 h-4 w-4 text-[var(--ph-muted)]" />
                  <Input
                    id="trainerName"
                    {...register('trainerName')}
                    placeholder="e.g. Dr. Jane Doe"
                    className="pl-8.5 h-9.5 text-sm"
                  />
                </div>
              </div>

              <div className="space-y-1.5">
                <Label htmlFor="doctorName" className="text-xs font-semibold text-[var(--ph-text)]">Consulting Doctor / Veterinarian</Label>
                <div className="relative">
                  <Stethoscope className="absolute left-2.5 top-1/2 -translate-y-1/2 h-4 w-4 text-[var(--ph-muted)]" />
                  <Input
                    id="doctorName"
                    {...register('doctorName')}
                    placeholder="e.g. Dr. Robert Smith"
                    className="pl-8.5 h-9.5 text-sm"
                  />
                </div>
              </div>

              <div className="space-y-1.5">
                <Label htmlFor="address" className="text-xs font-semibold text-[var(--ph-text)]">Physical Address / Shelf Info</Label>
                <div className="relative">
                  <MapPin className="absolute left-2.5 top-1/2 -translate-y-1/2 h-4 w-4 text-[var(--ph-muted)]" />
                  <Input
                    id="address"
                    {...register('address')}
                    placeholder="e.g. Block B, Ground Floor"
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
                {editingId ? 'Save Changes' : 'Register Location'}
              </Button>
            </div>
          </form>
        </CardContent>
      </Card>

      {/* Locations Registry Table Card */}
      <Card className="ph-card shadow-sm border border-[var(--ph-border)] overflow-hidden">
        <CardHeader className="border-b border-[var(--ph-border)] py-3 px-4">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div className="flex items-center gap-2">
              <CardTitle className="text-sm font-semibold text-[var(--ph-text)]">
                Facilities Registry
              </CardTitle>
              <Badge variant="outline" className="text-xs font-mono">
                {filteredData.length} facilities
              </Badge>
            </div>
            <div className="relative w-full sm:max-w-xs">
              <Search className="absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-[var(--ph-muted)] pointer-events-none" />
              <Input
                type="search"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Search locations..."
                className="pl-8 h-8 text-xs bg-[var(--ph-surface)] border-[var(--ph-border)]"
                aria-label="Search locations"
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
                  <TableHead className="font-semibold text-xs text-[var(--ph-text)]">Location / Facility</TableHead>
                  <TableHead className="font-semibold text-xs text-[var(--ph-text)]">Incharge</TableHead>
                  <TableHead className="font-semibold text-xs text-[var(--ph-text)]">Doctor / Vet</TableHead>
                  <TableHead className="font-semibold text-xs text-[var(--ph-text)]">Address / Rack</TableHead>
                  <TableHead className="text-right font-semibold text-xs text-[var(--ph-text)] pr-4">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filteredData.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={6} className="text-center py-12 text-sm text-[var(--ph-text-secondary)]">
                      {data.length === 0
                        ? 'No locations registered. Add your first facility above.'
                        : 'No facilities match your search query.'}
                    </TableCell>
                  </TableRow>
                ) : (
                  filteredData.map((location) => (
                    <TableRow key={location._id} className="hover:bg-[var(--ph-surface-2)]/60 transition-colors border-b border-[var(--ph-border)]">
                      <TableCell className="w-10 pl-4">
                        <input
                          type="checkbox"
                          checked={selectedRows.includes(location._id)}
                          onChange={() => toggleSelectRow(location._id)}
                          className="h-3.5 w-3.5 rounded border-gray-300"
                        />
                      </TableCell>
                      <TableCell className="font-medium text-sm text-[var(--ph-text)]">
                        <div className="flex items-center gap-2">
                          <MapPin className="h-4 w-4 text-[var(--ph-teal)] shrink-0" />
                          <span>{location.name}</span>
                        </div>
                      </TableCell>
                      <TableCell className="text-xs text-[var(--ph-text-secondary)]">
                        {location.trainerName ? (
                          <span className="inline-flex items-center gap-1">
                            <UserCheck className="h-3.5 w-3.5 text-[var(--ph-muted)]" />
                            {location.trainerName}
                          </span>
                        ) : '-'}
                      </TableCell>
                      <TableCell className="text-xs text-[var(--ph-text-secondary)]">
                        {location.doctorName ? (
                          <span className="inline-flex items-center gap-1 text-[var(--ph-navy)] font-medium">
                            <Stethoscope className="h-3.5 w-3.5" />
                            {location.doctorName}
                          </span>
                        ) : '-'}
                      </TableCell>
                      <TableCell className="text-xs text-[var(--ph-text-secondary)]">
                        {location.address || '-'}
                      </TableCell>
                      <TableCell className="text-right pr-4">
                        <div className="flex justify-end gap-1">
                          <Button
                            variant="ghost"
                            size="sm"
                            className="h-7 w-7 p-0 text-[var(--ph-text-secondary)] hover:text-[var(--ph-navy)]"
                            onClick={() => handleEdit(location)}
                          >
                            <Edit className="h-3.5 w-3.5" />
                          </Button>
                          <Button
                            variant="ghost"
                            size="sm"
                            className="h-7 w-7 p-0 text-[var(--ph-text-secondary)] hover:text-rose-600"
                            onClick={() => handleDelete(location._id)}
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

export default AddLocations;
