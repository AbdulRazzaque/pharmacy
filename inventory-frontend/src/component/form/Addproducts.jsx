import React, { useState, useEffect, useMemo, useCallback, useRef } from 'react';
import axios from 'axios';
import { useForm } from 'react-hook-form';
import { Button } from '../../components/ui/button';
import { Input } from '../../components/ui/input';
import { Label } from '../../components/ui/label';
import { Card, CardContent, CardHeader, CardTitle } from '../../components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '../../components/ui/table';
import { Alert, AlertDescription } from '../../components/ui/alert';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
  DialogClose,
} from '../../components/ui/dialog';
import { Trash2, Edit, Plus, Download, Search, Upload, FileSpreadsheet, Loader2 } from 'lucide-react';
import * as XLSX from 'xlsx';
import { saveAs } from '../../utils/fileDownload';
import { getToken, getUserInfo } from '../../utils/auth';
import { PageHeader } from '../../components/ui/page-header';
import { Badge } from '../../components/ui/badge';

const IMPORT_COLUMNS = ['name', 'companyName', 'type', 'unit'];
const ROW_HEIGHT = 49;
const VIRTUAL_OVERSCAN = 8;

const normalizeHeader = (key) =>
  String(key || '')
    .trim()
    .toLowerCase()
    .replace(/\s+/g, '');

const matchesProductSearch = (product, query) => {
  const q = query.trim().toLowerCase();
  if (!q) return true;
  return (
    (product.name || '').toLowerCase().includes(q) ||
    (product.companyName || '').toLowerCase().includes(q) ||
    (product.type || '').toLowerCase().includes(q) ||
    (product.unit || '').toLowerCase().includes(q)
  );
};

const Addproducts = () => {
  const [data, setData] = useState([]);
  const [searchQuery, setSearchQuery] = useState('');
  const [alert, setAlert] = useState({ show: false, message: '', type: '' });
  const [editingId, setEditingId] = useState(null);
  const [selectedRows, setSelectedRows] = useState([]);

  const [importOpen, setImportOpen] = useState(false);
  const [importFile, setImportFile] = useState(null);
  const [importing, setImporting] = useState(false);
  const [importResult, setImportResult] = useState(null);
  const [scrollTop, setScrollTop] = useState(0);
  const [listHeight, setListHeight] = useState(480);

  const fileInputRef = useRef(null);
  const scrollRef = useRef(null);

  const accessToken = getToken();
  const isAdmin = (getUserInfo()?.role || '').toLowerCase() === 'admin';

  const { register, handleSubmit, reset, setValue, formState: { errors } } = useForm({
    defaultValues: {
      requiresExpiry: true
    }
  });

  const fetchProducts = useCallback(() => {
    return axios
      .get(`${process.env.REACT_APP_DEVELOPMENT}/api/product/getAllProducts`, {
        headers: { token: accessToken },
      })
      .then((res) => {
        setData(res.data.result || []);
      })
      .catch((err) => {
        console.error('Error fetching products:', err);
        showAlert('Failed to fetch products', 'error');
      });
  }, [accessToken]);

  useEffect(() => {
    fetchProducts();
  }, [fetchProducts]);

  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return undefined;
    const ro = new ResizeObserver(() => {
      setListHeight(el.clientHeight || 480);
    });
    ro.observe(el);
    setListHeight(el.clientHeight || 480);
    return () => ro.disconnect();
  }, [data.length, searchQuery]);

  const showAlert = (message, type) => {
    setAlert({ show: true, message, type });
    setTimeout(() => setAlert({ show: false, message: '', type: '' }), 4000);
  };

  const filteredData = useMemo(() => {
    if (!searchQuery.trim()) return data;
    return data.filter((p) => matchesProductSearch(p, searchQuery));
  }, [data, searchQuery]);

  const visibleRange = useMemo(() => {
    const total = filteredData.length;
    if (total === 0) return { start: 0, end: 0, topPad: 0, bottomPad: 0 };
    const visibleCount = Math.ceil(listHeight / ROW_HEIGHT) + VIRTUAL_OVERSCAN;
    const start = Math.max(0, Math.floor(scrollTop / ROW_HEIGHT) - Math.floor(VIRTUAL_OVERSCAN / 2));
    const end = Math.min(total, start + visibleCount);
    return {
      start,
      end,
      topPad: start * ROW_HEIGHT,
      bottomPad: Math.max(0, (total - end) * ROW_HEIGHT),
    };
  }, [filteredData.length, listHeight, scrollTop]);

  const visibleRows = useMemo(
    () => filteredData.slice(visibleRange.start, visibleRange.end),
    [filteredData, visibleRange.start, visibleRange.end]
  );

  const onSubmit = (formData) => {
    if (editingId) {
      axios
        .put(
          `${process.env.REACT_APP_DEVELOPMENT}/api/product/updateProduct/${editingId}`,
          formData,
          { headers: { token: accessToken } }
        )
        .then(() => {
          showAlert('Product updated successfully!', 'success');
          fetchProducts();
          reset();
          setEditingId(null);
        })
        .catch((err) => {
          showAlert(err.response?.data || 'Failed to update product', 'error');
          console.error(err);
        });
    } else {
      axios
        .post(`${process.env.REACT_APP_DEVELOPMENT}/api/product/createProduct`, formData, {
          headers: { token: accessToken },
        })
        .then(() => {
          showAlert('Product added successfully!', 'success');
          fetchProducts();
          reset();
        })
        .catch((err) => {
          showAlert(err.response?.data || 'Failed to add product', 'error');
          console.error(err);
        });
    }
  };

  const handleEdit = (product) => {
    setEditingId(product._id);
    setValue('name', product.name);
    setValue('unit', product.unit || '');
    setValue('type', product.type || '');
    setValue('companyName', product.companyName || '');
    setValue('requiresExpiry', product.requiresExpiry !== false);
  };

  const handleDelete = (id) => {
    if (window.confirm('Are you sure you want to delete this product?')) {
      axios
        .delete(`${process.env.REACT_APP_DEVELOPMENT}/api/product/deleteProduct/${id}`, {
          headers: { token: accessToken },
        })
        .then(() => {
          showAlert('Product deleted successfully!', 'success');
          fetchProducts();
        })
        .catch((err) => {
          showAlert('Failed to delete product', 'error');
          console.error(err);
        });
    }
  };

  const handleBulkDelete = () => {
    if (selectedRows.length === 0) {
      showAlert('Please select products to delete', 'error');
      return;
    }

    if (window.confirm(`Are you sure you want to delete ${selectedRows.length} product(s)?`)) {
      Promise.all(
        selectedRows.map((id) =>
          axios.delete(`${process.env.REACT_APP_DEVELOPMENT}/api/product/deleteProduct/${id}`, {
            headers: { token: accessToken },
          })
        )
      )
        .then(() => {
          showAlert(`${selectedRows.length} product(s) deleted successfully!`, 'success');
          setSelectedRows([]);
          fetchProducts();
        })
        .catch((err) => {
          showAlert('Failed to delete products', 'error');
          console.error(err);
        });
    }
  };

  const toggleSelectRow = (id) => {
    setSelectedRows((prev) =>
      prev.includes(id) ? prev.filter((rowId) => rowId !== id) : [...prev, id]
    );
  };

  const toggleSelectAll = () => {
    const ids = filteredData.map((item) => item._id);
    const allSelected = ids.length > 0 && ids.every((id) => selectedRows.includes(id));
    if (allSelected) {
      setSelectedRows((prev) => prev.filter((id) => !ids.includes(id)));
    } else {
      setSelectedRows((prev) => [...new Set([...prev, ...ids])]);
    }
  };

  const exportToExcel = () => {
    const exportData = data.map((item) => ({
      name: item.name,
      companyName: item.companyName || '',
      type: item.type || '',
      unit: item.unit || '',
    }));

    const ws = XLSX.utils.json_to_sheet(exportData);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Products');
    const excelBuffer = XLSX.write(wb, { bookType: 'xlsx', type: 'array' });
    const dataBlob = new Blob([excelBuffer], {
      type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    });
    saveAs(dataBlob, 'products.xlsx');
  };

  const downloadImportTemplate = () => {
    const ws = XLSX.utils.aoa_to_sheet([
      IMPORT_COLUMNS,
      ['Paracetamol 500mg', 'ABC Pharma', 'Medicine', 'Box'],
    ]);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Products');
    const excelBuffer = XLSX.write(wb, { bookType: 'xlsx', type: 'array' });
    const blob = new Blob([excelBuffer], {
      type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    });
    saveAs(blob, 'product-import-template.xlsx');
  };

  const parseImportFile = (file) =>
    new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = (e) => {
        try {
          const workbook = XLSX.read(e.target.result, { type: 'array' });
          const sheet = workbook.Sheets[workbook.SheetNames[0]];
          const rawRows = XLSX.utils.sheet_to_json(sheet, { defval: '' });
          if (!rawRows.length) {
            reject(new Error('The file has no data rows'));
            return;
          }

          const firstKeys = Object.keys(rawRows[0] || {});
          const headerMap = {};
          firstKeys.forEach((key) => {
            const norm = normalizeHeader(key);
            const target = IMPORT_COLUMNS.find((col) => normalizeHeader(col) === norm);
            if (target) headerMap[key] = target;
          });

          const mappedKeys = Object.values(headerMap);
          const missing = IMPORT_COLUMNS.filter((col) => !mappedKeys.includes(col));
          if (missing.length) {
            reject(
              new Error(
                `Missing required columns: ${missing.join(', ')}. Use: ${IMPORT_COLUMNS.join(', ')}`
              )
            );
            return;
          }

          const rows = rawRows.map((row) => {
            const out = {};
            Object.entries(row).forEach(([key, value]) => {
              const field = headerMap[key];
              if (field) out[field] = value;
            });
            return out;
          });

          resolve(rows);
        } catch (err) {
          reject(err);
        }
      };
      reader.onerror = () => reject(new Error('Failed to read file'));
      reader.readAsArrayBuffer(file);
    });

  const resetImportState = () => {
    setImportFile(null);
    setImportResult(null);
    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  const openImportDialog = () => {
    resetImportState();
    setImportOpen(true);
  };

  const handleImportSubmit = async () => {
    if (!importFile) {
      showAlert('Please select an Excel file', 'error');
      return;
    }

    setImporting(true);
    setImportResult(null);

    try {
      const rows = await parseImportFile(importFile);
      const res = await axios.post(
        `${process.env.REACT_APP_DEVELOPMENT}/api/product/bulkImport`,
        { rows },
        { headers: { token: accessToken } }
      );

      const result = res.data;
      setImportResult(result);

      if (result.successCount > 0 && (!result.failed || result.failed.length === 0) && (!result.duplicateErrors || result.duplicateErrors.length === 0)) {
        await fetchProducts();
        showAlert(
          `Imported ${result.successCount} of ${result.totalRows} row(s) successfully`,
          'success'
        );
        resetImportState();
        setImportOpen(false);
      } else if (result.duplicateErrors?.length) {
        showAlert('Import failed: Duplicate records were found', 'error');
      } else if (result.failed?.length) {
        showAlert('Import finished with validation errors', 'error');
      } else if (result.duplicateSkipped > 0) {
        showAlert('All rows were duplicates — nothing new was imported', 'error');
      }
    } catch (err) {
      const message =
        err.response?.data?.error ||
        err.response?.data ||
        err.message ||
        'Import failed';
      showAlert(typeof message === 'string' ? message : 'Import failed', 'error');
      console.error(err);
    } finally {
      setImporting(false);
    }
  };

  const fixNullCreatedBy = () => {
    if (
      window.confirm(
        'This will update all products with missing creator information to your account. Continue?'
      )
    ) {
      axios
        .post(`${process.env.REACT_APP_DEVELOPMENT}/api/product/fixNullCreatedBy`, {}, {
          headers: { token: accessToken },
        })
        .then((res) => {
          showAlert(res.data.result || 'Products updated successfully!', 'success');
          fetchProducts();
        })
        .catch((err) => {
          showAlert('Failed to update products', 'error');
          console.error(err);
        });
    }
  };

  const allFilteredSelected =
    filteredData.length > 0 &&
    filteredData.every((item) => selectedRows.includes(item._id));

  return (
    <div className="ph-page space-y-6">
      <PageHeader
        title="Products Directory"
        subtitle="Manage pharmacy medications, catalog categorization, and inventory master records"
        badge={
          <Badge variant="teal" className="ml-2">
            {data.length} Total Records
          </Badge>
        }
      >
        {selectedRows.length > 0 && (
          <Button variant="destructive" size="sm" onClick={handleBulkDelete}>
            <Trash2 className="mr-1.5 h-4 w-4" />
            Delete ({selectedRows.length})
          </Button>
        )}

        {data.some((p) => !p.createdBy) && (
          <Button variant="secondary" size="sm" onClick={fixNullCreatedBy}>
            Fix Missing Creators
          </Button>
        )}
        {isAdmin && (
          <>
            <Button variant="outline" size="sm" onClick={downloadImportTemplate}>
              <FileSpreadsheet className="mr-1.5 h-4 w-4 text-[var(--ph-teal)]" />
              Sample Template
            </Button>
            <Button variant="outline" size="sm" onClick={openImportDialog}>
              <Upload className="mr-1.5 h-4 w-4 text-[var(--ph-navy)]" />
              Import Excel
            </Button>
          </>
        )}
        <Button variant="outline" size="sm" onClick={exportToExcel}>
          <Download className="mr-1.5 h-4 w-4 text-emerald-600" />
          Export
        </Button>
      </PageHeader>

      {alert.show && (
        <Alert variant={alert.type === 'error' ? 'destructive' : 'default'} className="animate-in fade-in">
          <AlertDescription>{alert.message}</AlertDescription>
        </Alert>
      )}

      {/* Product Form Card */}
      <Card className="ph-card shadow-sm border border-[var(--ph-border)]">
        <CardHeader className="border-b border-[var(--ph-border)] pb-4">
          <div className="flex items-center justify-between">
            <div>
              <CardTitle className="text-base font-semibold text-[var(--ph-text)]">
                {editingId ? 'Edit Product Details' : 'Add New Product'}
              </CardTitle>
              <p className="text-xs text-[var(--ph-text-secondary)] mt-0.5">
                {editingId ? 'Modify existing medication specifications' : 'Register a new medication or healthcare item in the catalog'}
              </p>
            </div>
            {editingId && (
              <Badge variant="warning">Editing Mode</Badge>
            )}
          </div>
        </CardHeader>
        <CardContent className="pt-5">
          <form onSubmit={handleSubmit(onSubmit)} className="space-y-5">
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
              <div className="space-y-1.5">
                <Label htmlFor="name" className="text-xs font-semibold text-[var(--ph-text)]">Product Name *</Label>
                <Input
                  id="name"
                  {...register('name', { required: 'Product name is required' })}
                  placeholder="e.g. Paracetamol 500mg"
                  className="h-9.5 text-sm"
                />
                {errors.name && (
                  <p className="text-xs text-rose-600 font-medium">{errors.name.message}</p>
                )}
              </div>

              <div className="space-y-1.5">
                <Label htmlFor="unit" className="text-xs font-semibold text-[var(--ph-text)]">Unit *</Label>
                <select
                  id="unit"
                  {...register('unit', { required: 'Unit is required' })}
                  className="flex h-9.5 w-full rounded-lg border border-[var(--ph-border)] bg-[var(--ph-surface)] px-3 py-1.5 text-sm text-[var(--ph-text)] focus:outline-none focus:ring-2 focus:ring-[var(--ph-navy)]"
                >
                  <option value="">Select unit</option>
                  <option value="Kg">Kg</option>
                  <option value="Liter">Liter</option>
                  <option value="Pieces">Pieces</option>
                  <option value="Box">Box</option>
                  <option value="Bottle">Bottle</option>
                  <option value="Packet">Packet</option>
                </select>
                {errors.unit && (
                  <p className="text-xs text-rose-600 font-medium">{errors.unit.message}</p>
                )}
              </div>

              <div className="space-y-1.5">
                <Label htmlFor="type" className="text-xs font-semibold text-[var(--ph-text)]">Type / Group *</Label>
                <Input
                  id="type"
                  {...register('type', { required: 'Type is required' })}
                  placeholder="e.g. Tablet, Syrup, Injection"
                  className="h-9.5 text-sm"
                />
                {errors.type && (
                  <p className="text-xs text-rose-600 font-medium">{errors.type.message}</p>
                )}
              </div>

              <div className="space-y-1.5">
                <Label htmlFor="companyName" className="text-xs font-semibold text-[var(--ph-text)]">Company / Manufacturer *</Label>
                <Input
                  id="companyName"
                  {...register('companyName', { required: 'Company is required' })}
                  placeholder="e.g. Pfizer, GSK, Novartis"
                  className="h-9.5 text-sm"
                />
                {errors.companyName && (
                  <p className="text-xs text-rose-600 font-medium">{errors.companyName.message}</p>
                )}
              </div>
            </div>

            <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 pt-2 border-t border-[var(--ph-border)]">
              <label htmlFor="requiresExpiry" className="flex items-center gap-2.5 cursor-pointer text-xs font-medium text-[var(--ph-text)]">
                <input
                  type="checkbox"
                  id="requiresExpiry"
                  {...register('requiresExpiry')}
                  className="h-4 w-4 rounded border-gray-300 text-[var(--ph-teal)] focus:ring-[var(--ph-teal)]"
                />
                <span>Requires Expiry Date Tracking (Mandatory for perishables)</span>
              </label>

              <div className="flex items-center gap-2">
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
                  {editingId ? 'Save Changes' : 'Add to Catalog'}
                </Button>
              </div>
            </div>
          </form>
        </CardContent>
      </Card>

      {/* Products Directory Table */}
      <Card className="ph-card shadow-sm border border-[var(--ph-border)] overflow-hidden">
        <CardHeader className="border-b border-[var(--ph-border)] py-3 px-4">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div className="flex items-center gap-2">
              <CardTitle className="text-sm font-semibold text-[var(--ph-text)]">
                Catalog Registry
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
                onChange={(e) => {
                  setSearchQuery(e.target.value);
                  setScrollTop(0);
                  if (scrollRef.current) scrollRef.current.scrollTop = 0;
                }}
                placeholder="Search catalog..."
                className="pl-8 h-8 text-xs bg-[var(--ph-surface)] border-[var(--ph-border)]"
                aria-label="Search products"
              />
            </div>
          </div>
        </CardHeader>
        <CardContent className="p-0">
          <div
            ref={scrollRef}
            className="overflow-auto"
            style={{ maxHeight: 'min(65vh, 560px)' }}
            onScroll={(e) => setScrollTop(e.target.scrollTop)}
          >
            <Table>
              <TableHeader className="sticky top-0 z-10 bg-[var(--ph-surface-2)] border-b border-[var(--ph-border)] shadow-xs">
                <TableRow>
                  <TableHead className="w-10 pl-4">
                    <input
                      type="checkbox"
                      checked={allFilteredSelected}
                      onChange={toggleSelectAll}
                      className="h-3.5 w-3.5 rounded border-gray-300"
                    />
                  </TableHead>
                  <TableHead className="font-semibold text-xs text-[var(--ph-text)]">Product Name</TableHead>
                  <TableHead className="font-semibold text-xs text-[var(--ph-text)]">Unit</TableHead>
                  <TableHead className="font-semibold text-xs text-[var(--ph-text)]">Type / Group</TableHead>
                  <TableHead className="font-semibold text-xs text-[var(--ph-text)]">Manufacturer</TableHead>
                  <TableHead className="font-semibold text-xs text-[var(--ph-text)]">Registered By</TableHead>
                  <TableHead className="font-semibold text-xs text-[var(--ph-text)]">Role</TableHead>
                  <TableHead className="text-right font-semibold text-xs text-[var(--ph-text)] pr-4">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filteredData.length === 0 ? (
                  <TableRow>
                    <TableCell
                      colSpan={8}
                      className="text-center py-12 text-sm text-[var(--ph-text-secondary)]"
                    >
                      {data.length === 0
                        ? 'No products found. Register your first product above.'
                        : 'No products match your search query.'}
                    </TableCell>
                  </TableRow>
                ) : (
                  <>
                    {visibleRange.topPad > 0 && (
                      <TableRow aria-hidden>
                        <TableCell
                          colSpan={8}
                          style={{ height: visibleRange.topPad, padding: 0, border: 0 }}
                        />
                      </TableRow>
                    )}
                    {visibleRows.map((product) => (
                      <TableRow key={product._id} style={{ height: ROW_HEIGHT }} className="hover:bg-[var(--ph-surface-2)]/60 transition-colors border-b border-[var(--ph-border)]">
                        <TableCell className="w-10 pl-4">
                          <input
                            type="checkbox"
                            checked={selectedRows.includes(product._id)}
                            onChange={() => toggleSelectRow(product._id)}
                            className="h-3.5 w-3.5 rounded border-gray-300"
                          />
                        </TableCell>
                        <TableCell className="font-medium text-sm text-[var(--ph-text)]">
                          {product.name}
                        </TableCell>
                        <TableCell>
                          <Badge variant="outline" className="text-[11px] font-medium py-0">
                            {product.unit || '-'}
                          </Badge>
                        </TableCell>
                        <TableCell className="text-xs text-[var(--ph-text-secondary)]">
                          {product.type || '-'}
                        </TableCell>
                        <TableCell className="text-xs font-medium text-[var(--ph-text)]">
                          {product.companyName || '-'}
                        </TableCell>
                        <TableCell className="text-xs text-[var(--ph-text-secondary)]">
                          <span className={!product.createdBy ? 'text-[var(--ph-muted)] italic' : ''}>
                            {product.createdBy?.userName || 'System/Legacy'}
                          </span>
                        </TableCell>
                        <TableCell>
                          <Badge variant={product.createdByRole?.toLowerCase() === 'admin' ? 'teal' : 'default'} className="text-[10px] py-0 uppercase">
                            {product.createdByRole || '-'}
                          </Badge>
                        </TableCell>
                        <TableCell className="text-right pr-4">
                          <div className="flex justify-end gap-1">
                            <Button
                              variant="ghost"
                              size="sm"
                              className="h-7 w-7 p-0 text-[var(--ph-text-secondary)] hover:text-[var(--ph-navy)]"
                              onClick={() => handleEdit(product)}
                            >
                              <Edit className="h-3.5 w-3.5" />
                            </Button>
                            <Button
                              variant="ghost"
                              size="sm"
                              className="h-7 w-7 p-0 text-[var(--ph-text-secondary)] hover:text-rose-600"
                              onClick={() => handleDelete(product._id)}
                            >
                              <Trash2 className="h-3.5 w-3.5 text-rose-500" />
                            </Button>
                          </div>
                        </TableCell>
                      </TableRow>
                    ))}
                    {visibleRange.bottomPad > 0 && (
                      <TableRow aria-hidden>
                        <TableCell
                          colSpan={8}
                          style={{
                            height: visibleRange.bottomPad,
                            padding: 0,
                            border: 0,
                          }}
                        />
                      </TableRow>
                    )}
                  </>
                )}
              </TableBody>
            </Table>
          </div>
        </CardContent>
      </Card>

      <Dialog
        open={importOpen}
        panelClassName="max-w-2xl"
        onOpenChange={(open) => {
          setImportOpen(open);
          if (!open) resetImportState();
        }}
      >
        <DialogClose onClose={() => setImportOpen(false)} />
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Import Products from Excel</DialogTitle>
            <DialogDescription>
              Upload a file with columns:{' '}
              <span className="font-mono text-xs">{IMPORT_COLUMNS.join(', ')}</span>.
              Duplicates are skipped only when name, company, type, and unit all match an existing product.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4">
            <div className="flex flex-wrap gap-2">
              <Button type="button" variant="outline" size="sm" onClick={downloadImportTemplate}>
                <FileSpreadsheet className="mr-2 h-4 w-4" />
                Download sample template
              </Button>
            </div>

            <div className="space-y-2">
              <Label htmlFor="import-file">Excel file (.xlsx, .xls)</Label>
              <Input
                id="import-file"
                ref={fileInputRef}
                type="file"
                accept=".xlsx,.xls,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet,application/vnd.ms-excel"
                onChange={(e) => {
                  setImportFile(e.target.files?.[0] || null);
                  setImportResult(null);
                }}
                disabled={importing}
              />
              {importFile && (
                <p className="text-sm text-muted-foreground">Selected: {importFile.name}</p>
              )}
            </div>

            {importResult && (
              <div className="rounded-md border bg-muted/30 p-4 space-y-3 text-sm">
                <p className="font-semibold">Import results</p>
                <ul className="grid grid-cols-2 gap-2 sm:grid-cols-4">
                  <li>
                    <span className="text-muted-foreground">Total rows</span>
                    <p className="text-lg font-medium">{importResult.totalRows}</p>
                  </li>
                  <li>
                    <span className="text-muted-foreground">Imported</span>
                    <p className="text-lg font-medium text-green-700">
                      {importResult.successCount}
                    </p>
                  </li>
                  <li>
                    <span className="text-muted-foreground">Duplicates skipped</span>
                    <p className="text-lg font-medium text-amber-700">
                      {importResult.duplicateSkipped}
                    </p>
                  </li>
                  <li>
                    <span className="text-muted-foreground">Failed</span>
                    <p className="text-lg font-medium text-red-700">
                      {importResult.failed?.length || 0}
                    </p>
                  </li>
                </ul>

                {importResult.failed?.length > 0 && (
                  <div>
                    <p className="font-medium text-red-700 mb-1">Failed rows</p>
                    <ul className="max-h-40 overflow-y-auto space-y-1 text-red-600 font-mono text-xs bg-red-50/30 p-2 rounded border border-red-100">
                      {importResult.failed.map((item, idx) => (
                        <li key={`f-${idx}`}>
                          {item.row != null ? `Row ${item.row}: ` : ''}
                          {item.message}
                        </li>
                      ))}
                    </ul>
                  </div>
                )}

                {importResult.duplicateErrors?.length > 0 && (
                  <div className="mt-3 pt-3 border-t border-red-100">
                    <p className="font-semibold text-red-700 mb-2">Excel upload failed. The following duplicate products already exist:</p>
                    <ul className="max-h-40 overflow-y-auto space-y-1 text-red-600 font-mono text-xs bg-red-50/30 p-2 rounded border border-red-100">
                      {importResult.duplicateErrors.map((item, idx) => (
                        <li key={`de-${idx}`}>
                          Row {item.row}: {item.message}
                        </li>
                      ))}
                    </ul>
                    <p className="mt-2 text-red-700 font-medium">No products were imported because duplicate records were found.</p>
                  </div>
                )}

                {importResult.duplicateDetails?.length > 0 && (
                  <div>
                    <p className="font-medium text-amber-700 mb-1">Duplicate rows (sample)</p>
                    <ul className="max-h-32 overflow-y-auto space-y-1 text-amber-800 font-mono text-xs bg-amber-50/30 p-2 rounded border border-amber-100">
                      {importResult.duplicateDetails.slice(0, 50).map((item, idx) => (
                        <li key={`d-${idx}`}>
                          Row {item.row}: {item.message}
                        </li>
                      ))}
                      {importResult.duplicateDetails.length > 50 && (
                        <li className="text-muted-foreground">
                          …and {importResult.duplicateDetails.length - 50} more
                        </li>
                      )}
                    </ul>
                  </div>
                )}
              </div>
            )}
          </div>

          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              onClick={() => setImportOpen(false)}
              disabled={importing}
            >
              Close
            </Button>
            <Button type="button" onClick={handleImportSubmit} disabled={importing || !importFile}>
              {importing ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Importing…
                </>
              ) : (
                <>
                  <Upload className="mr-2 h-4 w-4" />
                  Import
                </>
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default Addproducts;
