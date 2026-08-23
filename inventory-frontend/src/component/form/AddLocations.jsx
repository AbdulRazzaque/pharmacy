import React, { useState, useEffect } from 'react';
import axios from 'axios';
import { useForm } from 'react-hook-form';
import { Button } from '../../components/ui/button';
import { Input } from '../../components/ui/input';
import { Label } from '../../components/ui/label';
import { Card, CardContent, CardHeader, CardTitle } from '../../components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '../../components/ui/table';
import { Alert, AlertDescription } from '../../components/ui/alert';
import { Trash2, Edit, Plus, Download, MapPin } from 'lucide-react';
import * as XLSX from 'xlsx';
import { saveAs } from '../../utils/fileDownload';
import { getToken } from '../../utils/auth';

const AddLocations = () => {
  const [data, setData] = useState([]);
  const [alert, setAlert] = useState({ show: false, message: '', type: '' });
  const [editingId, setEditingId] = useState(null);
  const [selectedRows, setSelectedRows] = useState([]);

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

  return (
    <div className="container mx-auto p-6 space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-3xl font-bold"><MapPin className="inline mr-2" />Locations / Farms Management</h1>
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
          <CardTitle>{editingId ? 'Edit Location' : 'Add New Location'}</CardTitle>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="name">Location/Farm Name *</Label>
                <Input
                  id="name"
                  {...register('name', { required: 'Location name is required' })}
                  placeholder="Enter location or farm name"
                />
                {errors.name && (
                  <p className="text-sm text-red-500">{errors.name.message}</p>
                )}
              </div>

              <div className="space-y-2">
                <Label htmlFor="trainerName">Trainer Name</Label>
                <Input
                  id="trainerName"
                  {...register('trainerName')}
                  placeholder="Enter trainer name"
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="doctorName">Doctor Name</Label>
                <Input
                  id="doctorName"
                  {...register('doctorName')}
                  placeholder="Enter doctor name"
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
                {editingId ? 'Update Location' : 'Add Location'}
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
          <CardTitle>Locations List ({data.length})</CardTitle>
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
                  <TableHead>Location/Farm Name</TableHead>
                  <TableHead>Trainer Name</TableHead>
                  <TableHead>Doctor Name</TableHead>
                  <TableHead>Address</TableHead>
                  <TableHead className="text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {data.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={6} className="text-center py-8 text-muted-foreground">
                      No locations found. Add your first location above.
                    </TableCell>
                  </TableRow>
                ) : (
                  data.map((location) => (
                    <TableRow key={location._id}>
                      <TableCell>
                        <input
                          type="checkbox"
                          checked={selectedRows.includes(location._id)}
                          onChange={() => toggleSelectRow(location._id)}
                          className="h-4 w-4 rounded border-gray-300"
                        />
                      </TableCell>
                      <TableCell className="font-medium">{location.name}</TableCell>
                      <TableCell>{location.trainerName || '-'}</TableCell>
                      <TableCell>{location.doctorName || '-'}</TableCell>
                      <TableCell>{location.address || '-'}</TableCell>
                      <TableCell className="text-right">
                        <div className="flex justify-end gap-2">
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => handleEdit(location)}
                          >
                            <Edit className="h-4 w-4" />
                          </Button>
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => handleDelete(location._id)}
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

export default AddLocations;
