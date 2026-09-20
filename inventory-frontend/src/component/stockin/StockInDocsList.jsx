import React, { useState, useEffect } from 'react';
import axios from 'axios';
import { useNavigate } from 'react-router-dom';
import { Card, CardContent, CardHeader, CardTitle } from '../../components/ui/card';
import { Button } from '../../components/ui/button';
import { Input } from '../../components/ui/input';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '../../components/ui/table';
import { Search, FileText, Calendar, User, Package, Hash, Eye, Building2, Plus, ArrowRight } from 'lucide-react';
import moment from 'moment';
import { getToken } from '../../utils/auth';
import { PageHeader } from '../../components/ui/page-header';
import { StatCard } from '../../components/ui/stat-card';
import { Badge } from '../../components/ui/badge';
import { EmptyState } from '../../components/ui/empty-state';

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
        d => {
          const suppName = d.supplier?.name || (typeof d.supplier === 'string' ? d.supplier : '') || d.items?.[0]?.supplier?.name || '';
          return (
            d.docNo.toString().includes(q) ||
            (d.createdBy?.userName || '').toLowerCase().includes(q) ||
            suppName.toLowerCase().includes(q)
          );
        }
      );
      setFilteredDocs(filtered);
    }
  }, [searchQuery, docs]);

  // Aggregate stats
  const totalDocs = docs.length;
  const totalProducts = docs.reduce((sum, d) => sum + (d.totalProducts || 0), 0);
  const totalQty = docs.reduce((sum, d) => sum + (d.totalQuantity || 0), 0);

  return (
    <div className="ph-page space-y-6">
      <PageHeader
        title="Stock In Documents"
        subtitle="Manage and audit historical supplier receipt documents, lot logs, and invoice entries"
        badge={
          <Badge variant="teal" className="ml-2">
            {totalDocs} Documents
          </Badge>
        }
      >
        <Button
          size="sm"
          className="bg-[var(--ph-navy)] hover:bg-[var(--ph-navy-hover)] text-white"
          onClick={() => navigate('/dashboard/stockin')}
        >
          <Plus className="mr-1.5 h-4 w-4" />
          New Stock In Receipt
        </Button>
      </PageHeader>

      {/* KPI Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <StatCard
          icon={Hash}
          label="Total Receipts"
          value={totalDocs}
          subtitle="All recorded inbound documents"
          color="primary"
        />
        <StatCard
          icon={Package}
          label="Distinct Line Items"
          value={totalProducts}
          subtitle="Individual medicine types logged"
          color="secondary"
        />
        <StatCard
          icon={Eye}
          label="Total Units Received"
          value={totalQty.toLocaleString()}
          subtitle="Cumulative inventory received"
          color="success"
        />
      </div>

      {/* Documents Table Card */}
      <Card className="ph-card shadow-sm border border-[var(--ph-border)] overflow-hidden">
        <CardHeader className="border-b border-[var(--ph-border)] py-3 px-4">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div className="flex items-center gap-2">
              <CardTitle className="text-sm font-semibold text-[var(--ph-text)]">
                Inbound Document Registry
              </CardTitle>
              <Badge variant="outline" className="text-xs font-mono">
                {filteredDocs.length} records
              </Badge>
            </div>
            <div className="relative w-full sm:max-w-xs">
              <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-[var(--ph-muted)] pointer-events-none" />
              <Input
                placeholder="Search Doc #, Supplier, Creator..."
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
            <div className="text-center py-16 text-sm text-[var(--ph-muted)]">
              Loading document registry...
            </div>
          ) : error ? (
            <div className="text-center py-12 text-sm text-rose-600">{error}</div>
          ) : filteredDocs.length === 0 ? (
            <EmptyState
              icon={FileText}
              title="No documents found"
              description="No stock-in delivery records matched your search criteria."
              action={
                searchQuery && (
                  <Button variant="outline" size="sm" onClick={() => setSearchQuery('')}>
                    Clear Filter
                  </Button>
                )
              }
            />
          ) : (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader className="bg-[var(--ph-surface-2)] border-b border-[var(--ph-border)]">
                  <TableRow>
                    <TableHead className="font-semibold text-xs text-[var(--ph-text)] pl-4">Document #</TableHead>
                    <TableHead className="font-semibold text-xs text-[var(--ph-text)]">Supplier / Distributor</TableHead>
                    <TableHead className="font-semibold text-xs text-[var(--ph-text)]">Date & Time</TableHead>
                    <TableHead className="font-semibold text-xs text-[var(--ph-text)]">Received By</TableHead>
                    <TableHead className="font-semibold text-xs text-[var(--ph-text)] text-right">Items Count</TableHead>
                    <TableHead className="font-semibold text-xs text-[var(--ph-text)] text-right">Total Qty</TableHead>
                    <TableHead className="text-right font-semibold text-xs text-[var(--ph-text)] pr-4">Action</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filteredDocs.map((doc) => {
                    const suppName = doc.supplier?.name || (typeof doc.supplier === 'string' ? doc.supplier : '') || doc.items?.[0]?.supplier?.name || '-';
                    return (
                      <TableRow key={doc.docNo} className="hover:bg-[var(--ph-surface-2)]/60 transition-colors border-b border-[var(--ph-border)]">
                        <TableCell className="pl-4">
                          <Badge variant="teal" className="font-mono text-xs">
                            Doc #{doc.docNo}
                          </Badge>
                        </TableCell>
                        <TableCell>
                          <div className="flex items-center gap-1.5 text-xs font-medium text-[var(--ph-text)]">
                            <Building2 className="h-3.5 w-3.5 text-[var(--ph-teal)] shrink-0" />
                            <span>{suppName}</span>
                          </div>
                        </TableCell>
                        <TableCell className="text-xs text-[var(--ph-text-secondary)]">
                          <div className="flex items-center gap-1.5">
                            <Calendar className="h-3 w-3 text-[var(--ph-muted)]" />
                            {moment(doc.createdAt).format('DD/MM/YYYY hh:mm A')}
                          </div>
                        </TableCell>
                        <TableCell className="text-xs text-[var(--ph-text-secondary)]">
                          <div className="flex items-center gap-1.5">
                            <User className="h-3 w-3 text-[var(--ph-muted)]" />
                            {doc.createdBy?.userName || 'System'}
                          </div>
                        </TableCell>
                        <TableCell className="text-right font-medium text-xs text-[var(--ph-text)]">
                          {doc.totalProducts}
                        </TableCell>
                        <TableCell className="text-right font-bold text-xs text-emerald-600 dark:text-emerald-400">
                          {doc.totalQuantity}
                        </TableCell>
                        <TableCell className="text-right pr-4">
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={() => navigate(`/dashboard/stockin-docs/${doc.docNo}`)}
                            className="h-7 text-xs border-[var(--ph-border)] hover:bg-[var(--ph-navy-light)] hover:text-[var(--ph-navy)]"
                          >
                            <Eye className="mr-1 h-3.5 w-3.5 text-[var(--ph-teal)]" />
                            Excel Edit
                            <ArrowRight className="ml-1 h-3 w-3 text-[var(--ph-muted)]" />
                          </Button>
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
    </div>
  );
};

export default StockInDocsList;
