import React, { useState, useEffect } from 'react';
import axios from 'axios';
import { useNavigate } from 'react-router-dom';
import { Card, CardContent } from '../../components/ui/card';
import { Button } from '../../components/ui/button';
import { Input } from '../../components/ui/input';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '../../components/ui/table';
import { Search, FileText, Calendar, User, Package, Hash, Eye } from 'lucide-react';
import moment from 'moment';
import { getToken } from '../../utils/auth';

const StockInDocsList = () => {
  const navigate = useNavigate();
  const [docs, setDocs] = useState([]);
  const [filteredDocs, setFilteredDocs] = useState([]);
  const [searchQuery, setSearchQuery] = useState('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    fetchDocs();
  }, []);

  const fetchDocs = async () => {
    try {
      setLoading(true);
      const token = getToken();
      const res = await axios.get(
        `${process.env.REACT_APP_DEVELOPMENT}/api/stockIn/getStockInDocs`,
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
            Stock In Documents
          </h1>
          <p className="text-sm text-gray-500 mt-1">Manage and edit your Stock In entries by document number.</p>
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
                <p className="text-xs text-gray-500 uppercase tracking-wider font-semibold mt-1">Total Quantity In</p>
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
                    <TableHead className="text-center font-semibold">Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filteredDocs.map((doc) => (
                    <TableRow key={doc.docNo} className="hover:bg-slate-50/50">
                      <TableCell className="font-medium text-blue-600">
                        Doc #{doc.docNo}
                      </TableCell>
                      <TableCell>
                        <div className="flex items-center gap-1.5 text-gray-600">
                          <Calendar className="h-4 w-4 text-gray-400" />
                          {moment(doc.createdAt).format('DD/MM/YYYY hh:mm A')}
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
                      <TableCell className="text-right font-semibold text-emerald-600">
                        {doc.totalQuantity}
                      </TableCell>
                      <TableCell className="text-center">
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => navigate(`/dashboard/stockin-docs/${doc.docNo}`)}
                          className="hover:bg-blue-50 hover:text-blue-600 transition-colors"
                        >
                          <Eye className="mr-1 h-3.5 w-3.5" />
                          Excel Edit
                        </Button>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
};

export default StockInDocsList;
