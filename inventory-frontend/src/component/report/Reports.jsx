import React, { useState, useEffect, useMemo, useRef } from 'react';
import axios from 'axios';
import { getToken, getUserInfo } from '../../utils/auth';
import { FileText, ArrowDownToLine, ArrowUpFromLine, Calendar, PieChart } from 'lucide-react';
import moment from 'moment';
import * as XLSX from 'xlsx';
import { saveAs } from '../../utils/fileDownload';
import { jsPDF } from 'jspdf';
import { applyPlugin } from 'jspdf-autotable';
import StockInReport from './StockInReport';
import StockOutReport from './StockOutReport';
import MonthlyReport from './MonthlyReport';
import SummaryReport from './SummaryReport';
import StockAdjustmentHistoryReport from './StockAdjustmentHistoryReport';
import './Reports.css';

applyPlugin(jsPDF);

const TAB_STOCK_IN = 'stockin';
const TAB_STOCK_OUT = 'stockout';
const TAB_MONTHLY = 'monthly';
const TAB_SUMMARY = 'summary';
const TAB_STOCK_ADJUSTMENT_HISTORY = 'stock-adjustment-history';

const CHART_BAR = 'bar';
const CHART_LINE = 'line';

const getDatePresets = () => {
  const today = moment().format('YYYY-MM-DD');
  const yesterday = moment().subtract(1, 'days').format('YYYY-MM-DD');
  const startOfWeek = moment().startOf('week').format('YYYY-MM-DD');
  const startOfMonth = moment().startOf('month').format('YYYY-MM-DD');
  return [
    { label: 'Today', start: today, end: today },
    { label: 'Yesterday', start: yesterday, end: yesterday },
    { label: 'This Week', start: startOfWeek, end: today },
    { label: 'This Month', start: startOfMonth, end: today },
  ];
};

const isUserRole = () => (getUserInfo()?.role || '').toLowerCase() === 'user';

const Reports = () => {
  const [activeTab, setActiveTab] = useState(TAB_STOCK_IN);
  const isAdmin = useMemo(
    () => (getUserInfo()?.role || '').toLowerCase() === 'admin',
    []
  );
  const [alert, setAlert] = useState({ show: false, message: '', type: '' });
  const [loading, setLoading] = useState(false);

  const [suppliers, setSuppliers] = useState([]);
  const [locations, setLocations] = useState([]);
  const [products, setProducts] = useState([]);

  const [stockInData, setStockInData] = useState([]);
  const [stockInFilters, setStockInFilters] = useState({ startDate: '', endDate: '', supplierId: '', docNo: '', productIds: [] });
  const [stockInChartType, setStockInChartType] = useState(CHART_BAR);
  const [stockInSearch, setStockInSearch] = useState('');
  const [stockInPage, setStockInPage] = useState(1);
  const [stockInPageSize, setStockInPageSize] = useState(25);
  const [stockInProductSearch, setStockInProductSearch] = useState('');

  const [stockOutData, setStockOutData] = useState([]);
  const [stockOutFilters, setStockOutFilters] = useState({ startDate: '', endDate: '', locationId: '', doctorName: '', productIds: [], docNo: '' });
  const [stockOutChartType, setStockOutChartType] = useState(CHART_LINE);
  const [stockOutSearch, setStockOutSearch] = useState('');
  const [stockOutPage, setStockOutPage] = useState(1);
  const [stockOutPageSize, setStockOutPageSize] = useState(25);
  const [stockOutProductSearch, setStockOutProductSearch] = useState('');

  const [monthlyData, setMonthlyData] = useState([]);
  const [monthlyLocationIds, setMonthlyLocationIds] = useState([]);
  const [monthlyMonth, setMonthlyMonth] = useState('');
  const [monthlyYear, setMonthlyYear] = useState('');
  const [monthlyHasFetched, setMonthlyHasFetched] = useState(false);
  const [monthlySearch, setMonthlySearch] = useState('');
  const [monthlyPage, setMonthlyPage] = useState(1);
  const [monthlyPageSize, setMonthlyPageSize] = useState(25);

  const [summaryData, setSummaryData] = useState([]);
  const [summaryFilters, setSummaryFilters] = useState({ startDate: '', endDate: '', locationId: [] });
  const [summaryHasFetched, setSummaryHasFetched] = useState(false);
  const monthlyFetchRef = useRef(0);
  const summaryFetchRef = useRef(0);
  const [stockAdjustmentHistoryData, setStockAdjustmentHistoryData] = useState([]);
  const [stockAdjustmentHistoryFilters, setStockAdjustmentHistoryFilters] = useState({ date: '', docNo: '', productId: [] });
  const [stockAdjustmentHistoryPage, setStockAdjustmentHistoryPage] = useState(1);
  const [stockAdjustmentHistoryPageSize, setStockAdjustmentHistoryPageSize] = useState(25);
  const accessToken = getToken();
  const datePresets = getDatePresets();
  const yearOptions = useMemo(() => {
    const current = moment().year();
    return Array.from({ length: 11 }, (_, i) => current - 5 + i);
  }, []);

  useEffect(() => {
    if (isUserRole() && activeTab === TAB_STOCK_ADJUSTMENT_HISTORY) {
      setActiveTab(TAB_STOCK_IN);
    }
  }, [activeTab]);

  useEffect(() => {
    axios.get(`${process.env.REACT_APP_DEVELOPMENT}/api/supplier/getAllSuppliers`, { headers: { token: accessToken } })
      .then((res) => setSuppliers(res.data.result || []))
      .catch((err) => console.error(err));
    axios.get(`${process.env.REACT_APP_DEVELOPMENT}/api/location/getAllLocations`, { headers: { token: accessToken } })
      .then((res) => setLocations(res.data.result || []))
      .catch((err) => console.error(err));
    axios.get(`${process.env.REACT_APP_DEVELOPMENT}/api/product/getAllProducts`, { headers: { token: accessToken } })
      .then((res) => setProducts(res.data.result || []))
      .catch((err) => console.error(err));
  }, [accessToken]);

  const showAlert = (message, type) => {
    setAlert({ show: true, message, type });
    setTimeout(() => setAlert({ show: false, message: '', type: '' }), 3000);
  };

  const applyDatePreset = (preset, tab) => {
    if (tab === TAB_STOCK_IN) {
      setStockInFilters((f) => ({ ...f, startDate: preset.start, endDate: preset.end }));
    } else {
      setStockOutFilters((f) => ({ ...f, startDate: preset.start, endDate: preset.end }));
    }
  };

  const clearStockInFilters = () => {
    setStockInFilters({ startDate: '', endDate: '', supplierId: '', docNo: '', productIds: [] });
    setStockInSearch('');
    setStockInPage(1);
  };

  const clearStockOutFilters = () => {
    setStockOutFilters({ startDate: '', endDate: '', locationId: '', doctorName: '', productIds: [], docNo: '' });
    setStockOutSearch('');
    setStockOutPage(1);
  };

  const clearMonthlyFilters = () => {
    setMonthlyLocationIds([]);
    setMonthlyMonth('');
    setMonthlyYear('');
    setMonthlyData([]);
    setMonthlyHasFetched(false);
    setMonthlySearch('');
    setMonthlyPage(1);
  };

  const clearSummaryFilters = () => {
    setSummaryFilters({ startDate: '', endDate: '', locationId: [] });
    setSummaryData([]);
    setSummaryHasFetched(false);
  };

  const applyMonthlyReport = () => {
    if (monthlyLocationIds.length === 0 || !monthlyMonth || !monthlyYear) {
      showAlert('Please select month, year, and at least one location', 'error');
      return;
    }
    fetchMonthlyReport();
  };

  const applySummaryReport = () => {
    const hasLocation = summaryFilters.locationId && summaryFilters.locationId.length > 0;
    if (!summaryFilters.startDate || !summaryFilters.endDate || !hasLocation) {
      showAlert('Please select from date, to date, and location(s)', 'error');
      return;
    }
    fetchSummaryReport();
  };

  const toggleStockInProduct = (productId) => {
    setStockInFilters((f) => {
      const ids = f.productIds || [];
      const has = ids.includes(productId);
      return { ...f, productIds: has ? ids.filter((id) => id !== productId) : [...ids, productId] };
    });
  };

  const toggleStockOutProduct = (productId) => {
    setStockOutFilters((f) => {
      const ids = f.productIds || [];
      const has = ids.includes(productId);
      return { ...f, productIds: has ? ids.filter((id) => id !== productId) : [...ids, productId] };
    });
  };

  const getProductName = (p) => {
    if (!p) return '';
    const name = p.name || p.productName || '';
    if (p.companyName || p.unit) {
      return `${name} | ${p.companyName || 'N/A'} | ${p.unit || 'N/A'}`;
    }
    return name || p._id || '';
  };

  const stockInProductsFiltered = useMemo(() => {
    const q = (stockInProductSearch || '').trim().toLowerCase();
    if (!q) return products;
    return products.filter((p) => getProductName(p).toLowerCase().includes(q));
  }, [products, stockInProductSearch]);

  const stockOutProductsFiltered = useMemo(() => {
    const q = (stockOutProductSearch || '').trim().toLowerCase();
    if (!q) return products;
    return products.filter((p) => getProductName(p).toLowerCase().includes(q));
  }, [products, stockOutProductSearch]);

  const fetchStockInReport = () => {
    setLoading(true);
    axios.post(`${process.env.REACT_APP_DEVELOPMENT}/api/report/getStockInReport`, {
      startDate: stockInFilters.startDate || undefined,
      endDate: stockInFilters.endDate || undefined,
      supplierId: stockInFilters.supplierId || undefined,
      docNo: stockInFilters.docNo || undefined,
      productIds: (stockInFilters.productIds && stockInFilters.productIds.length > 0) ? stockInFilters.productIds : undefined,
    }, { headers: { token: accessToken } })
      .then((res) => {
        setStockInData(res.data.result || []);
        setStockInPage(1);
        setLoading(false);
        showAlert('Stock-In report loaded', 'success');
      })
      .catch((err) => {
        showAlert(err.response?.data?.result || 'Failed to load report', 'error');
        setLoading(false);
      });
  };

  const fetchStockOutReport = () => {
    setLoading(true);
    axios.post(`${process.env.REACT_APP_DEVELOPMENT}/api/report/getStockOutReport`, {
      startDate: stockOutFilters.startDate || undefined,
      endDate: stockOutFilters.endDate || undefined,
      locationId: stockOutFilters.locationId || undefined,
      doctorName: stockOutFilters.doctorName || undefined,
      productIds: (stockOutFilters.productIds && stockOutFilters.productIds.length > 0) ? stockOutFilters.productIds : undefined,
      docNo: stockOutFilters.docNo || undefined,
    }, { headers: { token: accessToken } })
      .then((res) => {
        setStockOutData(res.data.result || []);
        setStockOutPage(1);
        setLoading(false);
        showAlert('Stock-Out report loaded', 'success');
      })
      .catch((err) => {
        showAlert(err.response?.data?.result || 'Failed to load report', 'error');
        setLoading(false);
      });
  };

  const fetchMonthlyReport = () => {
    const fetchId = ++monthlyFetchRef.current;
    setLoading(true);
    axios.post(`${process.env.REACT_APP_DEVELOPMENT}/api/report/getMonthlyIssuedReport`, {
      month: parseInt(monthlyMonth, 10),
      year: parseInt(monthlyYear, 10),
      locationId: monthlyLocationIds,
    }, { headers: { token: accessToken } })
      .then((res) => {
        if (fetchId !== monthlyFetchRef.current) return;
        setMonthlyData(res.data.result || []);
        setMonthlyPage(1);
        setMonthlyHasFetched(true);
        setLoading(false);
        showAlert('Monthly report loaded', 'success');
      })
      .catch((err) => {
        if (fetchId !== monthlyFetchRef.current) return;
        showAlert(err.response?.data?.result || 'Failed to load monthly report', 'error');
        setMonthlyData([]);
        setMonthlyHasFetched(true);
        setLoading(false);
      });
  };

  const fetchSummaryReport = () => {
    const fetchId = ++summaryFetchRef.current;
    setLoading(true);
    axios.post(`${process.env.REACT_APP_DEVELOPMENT}/api/report/getSummaryReport`, {
      startDate: summaryFilters.startDate,
      endDate: summaryFilters.endDate,
      locationId: summaryFilters.locationId,
    }, { headers: { token: accessToken } })
      .then((res) => {
        if (fetchId !== summaryFetchRef.current) return;
        setSummaryData(res.data.result || []);
        setSummaryHasFetched(true);
        setLoading(false);
        showAlert('Summary report loaded', 'success');
      })
      .catch((err) => {
        if (fetchId !== summaryFetchRef.current) return;
        showAlert(err.response?.data?.result || 'Failed to load summary report', 'error');
        setSummaryData([]);
        setSummaryHasFetched(true);
        setLoading(false);
      });
  };

  const fetchStockAdjustmentHistory = () => {
    setLoading(true);
    axios.post(`${process.env.REACT_APP_DEVELOPMENT}/api/report/getStockAdjustmentHistory`, {
      date: stockAdjustmentHistoryFilters.date || undefined,
      docNo: stockAdjustmentHistoryFilters.docNo || undefined,
      productId: (stockAdjustmentHistoryFilters.productId && stockAdjustmentHistoryFilters.productId.length > 0) ? stockAdjustmentHistoryFilters.productId : undefined,
    }, { headers: { token: accessToken } })
      .then((res) => {
        setStockAdjustmentHistoryData(res.data.result || []);
        setStockAdjustmentHistoryPage(1);
        setLoading(false);
        showAlert('Stock Adjustment History loaded', 'success');
      })
      .catch((err) => {
        showAlert(err.response?.data?.result || 'Failed to load stock adjustment history', 'error');
        setLoading(false);
      });
  };

  const stockInKpis = useMemo(() => {
    const totalQty = stockInData.reduce((s, r) => s + (r.quantity ?? 0), 0);
    const totalVal = stockInData.reduce((s, r) => s + (r.quantity ?? 0) * (r.purchasingPrice ?? 0), 0);
    return { count: stockInData.length, totalQty, totalVal };
  }, [stockInData]);

  const stockOutKpis = useMemo(() => {
    const totalQty = stockOutData.reduce((s, r) => s + (r.quantity ?? 0), 0);
    const totalVal = stockOutData.reduce((s, r) => s + (r.quantity ?? 0) * (r.sellingPrice ?? 0), 0);
    return { count: stockOutData.length, totalQty, totalVal };
  }, [stockOutData]);

  const monthlyKpis = useMemo(() => {
    const totalQty = monthlyData.reduce((s, r) => s + (r.quantity ?? 0), 0);
    const totalVal = monthlyData.reduce((s, r) => s + (r.totalAmount ?? 0), 0);
    return { count: monthlyData.length, totalQty, totalVal };
  }, [monthlyData]);

  const summaryGrandTotal = useMemo(
    () => summaryData.reduce((s, r) => s + (r.grandTotal ?? 0), 0),
    [summaryData]
  );

  const filterRows = (rows, search, getSearchStr) => {
    if (!search.trim()) return rows;
    const q = search.trim().toLowerCase();
    return rows.filter((r) => getSearchStr(r).toLowerCase().includes(q));
  };

  const stockInFiltered = useMemo(() => {
    return filterRows(stockInData, stockInSearch, (r) =>
      [r.docNo, r.name, r.productId?.name, r.supplier?.name].filter(Boolean).join(' ')
    );
  }, [stockInData, stockInSearch]);

  const stockOutFiltered = useMemo(() => {
    return filterRows(stockOutData, stockOutSearch, (r) =>
      [r.docNo, r.productId?.name, r.location?.name, r.location?.doctorName].filter(Boolean).join(' ')
    );
  }, [stockOutData, stockOutSearch]);

  const monthlyFiltered = useMemo(() => {
    return filterRows(monthlyData, monthlySearch, (r) =>
      [r.productName, r.size, r.date ? moment(r.date).format('M/D/YYYY') : ''].filter(Boolean).join(' ')
    );
  }, [monthlyData, monthlySearch]);

  const stockAdjustmentHistoryFiltered = useMemo(() => stockAdjustmentHistoryData, [stockAdjustmentHistoryData]);

  const paginate = (arr, page, pageSize) => {
    const start = (page - 1) * pageSize;
    return arr.slice(start, start + pageSize);
  };

  const stockInPaginated = useMemo(() => paginate(stockInFiltered, stockInPage, stockInPageSize), [stockInFiltered, stockInPage, stockInPageSize]);
  const stockOutPaginated = useMemo(() => paginate(stockOutFiltered, stockOutPage, stockOutPageSize), [stockOutFiltered, stockOutPage, stockOutPageSize]);
  const monthlyPaginated = useMemo(() => paginate(monthlyFiltered, monthlyPage, monthlyPageSize), [monthlyFiltered, monthlyPage, monthlyPageSize]);
  const stockAdjustmentHistoryPaginated = useMemo(
    () => paginate(stockAdjustmentHistoryFiltered, stockAdjustmentHistoryPage, stockAdjustmentHistoryPageSize),
    [stockAdjustmentHistoryFiltered, stockAdjustmentHistoryPage, stockAdjustmentHistoryPageSize]
  );

  const stockInChartData = useMemo(() => {
    const byDate = {};
    stockInData.forEach((row) => {
      const d = row.createdAt ? moment(row.createdAt).format('MM/DD') : '';
      if (!byDate[d]) byDate[d] = { date: d, quantity: 0 };
      byDate[d].quantity += row.quantity ?? 0;
    });
    return Object.values(byDate).sort((a, b) => a.date.localeCompare(b.date)).slice(-14);
  }, [stockInData]);

  const stockOutChartData = useMemo(() => {
    const byDate = {};
    stockOutData.forEach((row) => {
      const d = row.date ? moment(row.date).format('MM/DD') : (row.createdAt ? moment(row.createdAt).format('MM/DD') : '');
      if (!byDate[d]) byDate[d] = { date: d, quantity: 0 };
      byDate[d].quantity += row.quantity ?? 0;
    });
    return Object.values(byDate).sort((a, b) => a.date.localeCompare(b.date)).slice(-14);
  }, [stockOutData]);

  const exportStockInExcel = () => {
    if (stockInData.length === 0) { showAlert('No data to export', 'error'); return; }
    const rows = stockInData.map((row, i) => {
      const dataRow = {
        'No': i + 1, 'Date': row.createdAt ? moment(row.createdAt).format('DD/MM/YYYY') : '', 'Doc No': row.docNo ?? '',
        'Product': row.name || row.productId?.name || '', 'Supplier': row.supplier?.name || '', 'Quantity': row.quantity ?? 0,
        'Unit': row.unit || row.productId?.unit || '',
      };
      if (isAdmin) {
        dataRow['Unit Price'] = (row.purchasingPrice ?? 0).toFixed(2);
        dataRow['Total'] = ((row.quantity ?? 0) * (row.purchasingPrice ?? 0)).toFixed(2);
      }
      return dataRow;
    });
    const ws = XLSX.utils.json_to_sheet(rows);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Stock-In Report');
    saveAs(new Blob([XLSX.write(wb, { bookType: 'xlsx', type: 'array' })], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' }), `stock-in-report-${moment().format('YYYY-MM-DD')}.xlsx`);
    showAlert('Excel exported', 'success');
  };

  const exportStockInPdf = () => {
    if (stockInData.length === 0) { showAlert('No data to export', 'error'); return; }
    const doc = new jsPDF({ orientation: 'landscape' });
    doc.setFontSize(14);
    doc.text('Stock-In Report', 14, 15);
    const tableData = stockInData.map((row, i) => {
      const dataRow = [
        i + 1, row.createdAt ? moment(row.createdAt).format('DD/MM/YYYY') : '', row.docNo ?? '',
        row.name || row.productId?.name || '', row.supplier?.name || '', row.quantity ?? 0,
      ];
      if (isAdmin) {
        dataRow.push((row.purchasingPrice ?? 0).toFixed(2));
        dataRow.push(((row.quantity ?? 0) * (row.purchasingPrice ?? 0)).toFixed(2));
      }
      return dataRow;
    });
    const headers = [['No', 'Date', 'Doc No', 'Product', 'Supplier', 'Qty']];
    if (isAdmin) {
      headers[0].push('Price');
      headers[0].push('Total');
    }
    doc.autoTable({ head: headers, body: tableData, startY: 22, styles: { fontSize: 8 } });
    doc.save(`stock-in-report-${moment().format('YYYY-MM-DD')}.pdf`);
    showAlert('PDF exported', 'success');
  };

  const exportStockOutExcel = () => {
    if (stockOutData.length === 0) { showAlert('No data to export', 'error'); return; }
    const rows = stockOutData.map((row, i) => {
      const dataRow = {
        'No': i + 1, 'Date': row.date ? moment(row.date).format('DD/MM/YYYY') : '', 'Doc No': row.docNo ?? '',
        'Product': row.productId?.name || '', 'Location': row.location?.name || '', 'Doctor': row.location?.doctorName || '',
        'Quantity': row.quantity ?? 0,
      };
      if (isAdmin) {
        dataRow['Unit Price'] = (row.sellingPrice ?? 0).toFixed(2);
        dataRow['Total'] = ((row.quantity ?? 0) * (row.sellingPrice ?? 0)).toFixed(2);
      }
      return dataRow;
    });
    const ws = XLSX.utils.json_to_sheet(rows);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Stock-Out Report');
    saveAs(new Blob([XLSX.write(wb, { bookType: 'xlsx', type: 'array' })], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' }), `stock-out-report-${moment().format('YYYY-MM-DD')}.xlsx`);
    showAlert('Excel exported', 'success');
  };

  const exportStockOutPdf = () => {
    if (stockOutData.length === 0) { showAlert('No data to export', 'error'); return; }
    const doc = new jsPDF({ orientation: 'landscape' });
    doc.setFontSize(14);
    doc.text('Stock-Out Report', 14, 15);
    const tableData = stockOutData.map((row, i) => {
      const dataRow = [
        i + 1, row.date ? moment(row.date).format('DD/MM/YYYY') : '', row.docNo ?? '', row.productId?.name || '',
        row.location?.name || '', row.location?.doctorName || '', row.quantity ?? 0,
      ];
      if (isAdmin) {
        dataRow.push(((row.quantity ?? 0) * (row.sellingPrice ?? 0)).toFixed(2));
      }
      return dataRow;
    });
    const headers = [['No', 'Date', 'Doc No', 'Product', 'Location', 'Doctor', 'Qty']];
    if (isAdmin) {
      headers[0].push('Total');
    }
    doc.autoTable({ head: headers, body: tableData, startY: 22, styles: { fontSize: 8 } });
    doc.save(`stock-out-report-${moment().format('YYYY-MM-DD')}.pdf`);
    showAlert('PDF exported', 'success');
  };

  const exportMonthlyExcel = () => {
    if (monthlyData.length === 0) { showAlert('No data to export', 'error'); return; }

    const XLSXStyle = require('xlsx-js-style');
    const wb = XLSXStyle.utils.book_new();

    // Group monthlyData by location
    const groups = {};
    monthlyData.forEach((row) => {
      const locKey = row.locationId || 'default';
      if (!groups[locKey]) {
        groups[locKey] = [];
      }
      groups[locKey].push(row);
    });

    const monthName = moment().month(parseInt(monthlyMonth, 10) - 1).format('MMMM');
    const lastDay = moment(`${monthlyYear}-${monthlyMonth}`, 'YYYY-MM').daysInMonth();
    const dateRangeStr = `from 1 ${monthName} ${monthlyYear} to ${lastDay} ${monthName} ${monthlyYear}`;

    Object.keys(groups).forEach((locKey) => {
      const locItems = groups[locKey];
      const sample = locItems[0];
      const locName = sample.locationName || 'Monthly Report';
      const trainerName = sample.trainerName || '';
      const doctorName = sample.doctorName || '';

      // Clean sheet name: max 31 chars, no invalid chars like: \ / ? * [ ] :
      let sheetName = locName.replace(/[\\/?*\[\]:]/g, '').substring(0, 31).trim();
      if (!sheetName) sheetName = 'Report';

      // If worksheet with this name already exists, append index
      let finalSheetName = sheetName;
      let sheetIdx = 1;
      while (wb.SheetNames.includes(finalSheetName)) {
        finalSheetName = `${sheetName.substring(0, 27)}_${sheetIdx++}`;
      }

      const ws = {};

      // Title Text
      const personInfo = (doctorName || trainerName || '').toUpperCase();
      const titleText = `MEDICINE DELIVERED TO ${(locName || '').toUpperCase()} ${personInfo ? `(MR. ${personInfo}) ` : ''}${dateRangeStr}`;

      // Styles
      const titleStyle = {
        font: { name: 'Calibri', sz: 11, bold: true, color: { rgb: "000000" } },
        alignment: { horizontal: 'center', vertical: 'center' },
        fill: { fgColor: { rgb: "FFFF00" } }, // Yellow
        border: {
          top: { style: 'thin', color: { rgb: '000000' } },
          bottom: { style: 'thin', color: { rgb: '000000' } },
          left: { style: 'thin', color: { rgb: '000000' } },
          right: { style: 'thin', color: { rgb: '000000' } }
        }
      };

      const headerStyle = {
        font: { name: 'Calibri', sz: 11, bold: true, color: { rgb: "000000" } },
        alignment: { horizontal: 'center', vertical: 'center' },
        fill: { fgColor: { rgb: "FFFFFF" } },
        border: {
          top: { style: 'thin', color: { rgb: '000000' } },
          bottom: { style: 'thin', color: { rgb: '000000' } },
          left: { style: 'thin', color: { rgb: '000000' } },
          right: { style: 'thin', color: { rgb: '000000' } }
        }
      };

      const borderStyle = {
        top: { style: 'thin', color: { rgb: '000000' } },
        bottom: { style: 'thin', color: { rgb: '000000' } },
        left: { style: 'thin', color: { rgb: '000000' } },
        right: { style: 'thin', color: { rgb: '000000' } }
      };

      const cellCenter = {
        font: { name: 'Calibri', sz: 11, color: { rgb: "000000" } },
        alignment: { horizontal: 'center', vertical: 'center' },
        border: borderStyle
      };

      const cellLeft = {
        font: { name: 'Calibri', sz: 11, color: { rgb: "000000" } },
        alignment: { horizontal: 'left', vertical: 'center' },
        border: borderStyle
      };

      const cellRight = {
        font: { name: 'Calibri', sz: 11, color: { rgb: "000000" } },
        alignment: { horizontal: 'right', vertical: 'center' },
        border: borderStyle
      };

      const totalStyle = {
        font: { name: 'Calibri', sz: 11, bold: true, color: { rgb: "000000" } },
        alignment: { horizontal: 'right', vertical: 'center' },
        border: borderStyle
      };

      const footerLabelStyle = {
        font: { name: 'Calibri', sz: 11, bold: true, color: { rgb: "000000" } },
        alignment: { horizontal: 'left', vertical: 'center' }
      };

      // Helper function to set cells
      const setCell = (cellRef, val, type, style) => {
        ws[cellRef] = { v: val, t: type, s: style };
      };

      // Merge Title across A1:E1
      setCell('A1', titleText, 's', titleStyle);
      ws['B1'] = { s: titleStyle };
      ws['C1'] = { s: titleStyle };
      ws['D1'] = { s: titleStyle };
      ws['E1'] = { s: titleStyle };

      // Headers (A2:E2)
      setCell('A2', 'Date', 's', headerStyle);
      setCell('B2', 'Description of Items', 's', headerStyle);
      setCell('C2', 'Qty', 's', headerStyle);
      setCell('D2', 'Unit Price', 's', headerStyle);
      setCell('E2', 'Total Price', 's', headerStyle);

      // Data Rows
      let curRow = 3;
      locItems.forEach((item) => {
        const formattedDate = item.date ? moment(item.date).format('DD-MM-YYYY') : '';
        const descText = item.productName || '';
        const qty = item.quantity ?? 0;
        const rate = item.rate ?? 0;
        const total = qty * rate;

        setCell(`A${curRow}`, formattedDate, 's', cellCenter);
        setCell(`B${curRow}`, descText, 's', cellLeft);
        setCell(`C${curRow}`, qty, 'n', cellCenter);
        setCell(`D${curRow}`, rate, 'n', cellRight);
        ws[`D${curRow}`].z = '#,##0.00';
        setCell(`E${curRow}`, total, 'n', cellRight);
        ws[`E${curRow}`].z = '#,##0.00';

        curRow++;
      });

      // Total Row
      setCell(`A${curRow}`, '', 's', totalStyle);
      setCell(`B${curRow}`, 'Total', 's', { ...totalStyle, alignment: { horizontal: 'left', vertical: 'center' } });
      setCell(`C${curRow}`, '', 's', totalStyle);
      setCell(`D${curRow}`, '', 's', totalStyle);

      const grandTotal = locItems.reduce((s, r) => s + (r.totalAmount ?? 0), 0);
      setCell(`E${curRow}`, grandTotal, 'n', totalStyle);
      ws[`E${curRow}`].z = '#,##0.00';

      curRow++; // Leave a blank row after Total
      curRow++;

      // Footer - Notes
      const uniqueNotes = Array.from(new Set(locItems.map(item => item.remarks).filter(Boolean))).join(', ');
      setCell(`A${curRow}`, `Note: ${uniqueNotes || ''}`, 's', footerLabelStyle);

      curRow++; // Leave blank row before signature labels
      curRow++;

      // Footer - Labels
      setCell(`A${curRow}`, `Trainer Name: ${trainerName}`, 's', footerLabelStyle);
      setCell(`D${curRow}`, `Veterinarian name: ${doctorName}`, 's', footerLabelStyle);

      curRow++; // Gap for signature
      curRow++;

      // Footer - Signatures
      setCell(`A${curRow}`, 'Signature :', 's', footerLabelStyle);
      setCell(`D${curRow}`, 'Signature :', 's', footerLabelStyle);

      // Columns Width
      ws['!cols'] = [
        { wch: 15 }, // Date
        { wch: 45 }, // Description of Items
        { wch: 10 }, // Qty
        { wch: 15 }, // Unit Price
        { wch: 18 }  // Total Price
      ];

      // Merges
      ws['!merges'] = [
        { s: { r: 0, c: 0 }, e: { r: 0, c: 4 } } // A1:E1
      ];

      // Range limits
      ws['!ref'] = `A1:E${curRow}`;

      // Row Heights
      const rowsHeight = [
        { hpt: 30 }, // Title
        { hpt: 25 }, // Header
        ...Array.from({ length: locItems.length }).map(() => ({ hpt: 20 })), // Data
        { hpt: 22 }  // Total
      ];
      ws['!rows'] = rowsHeight;

      XLSXStyle.utils.book_append_sheet(wb, ws, finalSheetName);
    });

    // Write workbook to file
    const wbout = XLSXStyle.write(wb, { bookType: 'xlsx', type: 'binary' });
    const s2ab = (s) => {
      const buf = new ArrayBuffer(s.length);
      const view = new Uint8Array(buf);
      for (let i = 0; i < s.length; i++) view[i] = s.charCodeAt(i) & 0xFF;
      return buf;
    };

    saveAs(
      new Blob([s2ab(wbout)], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' }),
      `monthly-report-${monthlyYear}-${monthlyMonth}.xlsx`
    );

    showAlert('Premium Excel report exported successfully! 📊', 'success');
  };

  const exportMonthlyPdf = () => {
    if (monthlyData.length === 0) { showAlert('No data to export', 'error'); return; }
    const doc = new jsPDF({ orientation: 'landscape' });
    doc.setFontSize(14);
    doc.text(`Monthly Report — ${monthlyMonth}/${monthlyYear}`, 14, 15);
    const tableData = monthlyData.map((row) => [
      row.date ? moment(row.date).format('M/D/YYYY') : '',
      row.productName || '',
      row.size || '',
      row.quantity ?? 0,
      row.rate ?? 0,
      (row.totalAmount ?? 0).toFixed(2),
    ]);
    doc.autoTable({ head: [['Date', 'Product Name', 'Size', 'Qty', 'Rate', 'Total']], body: tableData, startY: 22, styles: { fontSize: 8 } });
    doc.save(`monthly-report-${monthlyYear}-${monthlyMonth}.pdf`);
    showAlert('PDF exported', 'success');
  };

  const exportSummaryExcel = () => {
    if (summaryData.length === 0) { showAlert('No data to export', 'error'); return; }

    const XLSXStyle = require('xlsx-js-style');

    // Create the workbook
    const wb = XLSXStyle.utils.book_new();

    // Column widths
    const cols = [
      { wch: 10 }, // Sr. No.
      { wch: 45 }, // Name of Farm
      { wch: 20 }, // Amount
      { wch: 25 }  // Remark
    ];

    // Data structures for rows
    const ws = {};

    // Custom cell styles
    const titleStyle = {
      font: { name: 'Calibri', sz: 14, bold: true, color: { rgb: "1F4E79" } },
      alignment: { horizontal: 'center', vertical: 'center' }
    };

    const headerStyle = {
      font: { name: 'Calibri', sz: 11, bold: true, color: { rgb: "1F4E79" } },
      alignment: { horizontal: 'center', vertical: 'center' },
      fill: { fgColor: { rgb: "D9E1F2" } },
      border: {
        top: { style: 'thin', color: { rgb: '000000' } },
        bottom: { style: 'thin', color: { rgb: '000000' } },
        left: { style: 'thin', color: { rgb: '000000' } },
        right: { style: 'thin', color: { rgb: '000000' } }
      }
    };

    const dataStyle = {
      font: { name: 'Calibri', sz: 11, color: { rgb: "800000" } }, // Maroon
      alignment: { horizontal: 'center', vertical: 'center' },
      border: {
        top: { style: 'thin', color: { rgb: '000000' } },
        bottom: { style: 'thin', color: { rgb: '000000' } },
        left: { style: 'thin', color: { rgb: '000000' } },
        right: { style: 'thin', color: { rgb: '000000' } }
      }
    };

    const amountStyle = {
      font: { name: 'Calibri', sz: 11, color: { rgb: "000000" } }, // Black
      alignment: { horizontal: 'center', vertical: 'center' },
      border: {
        top: { style: 'thin', color: { rgb: '000000' } },
        bottom: { style: 'thin', color: { rgb: '000000' } },
        left: { style: 'thin', color: { rgb: '000000' } },
        right: { style: 'thin', color: { rgb: '000000' } }
      }
    };

    const srNoStyle = {
      font: { name: 'Calibri', sz: 11, color: { rgb: "000000" } }, // Black
      alignment: { horizontal: 'center', vertical: 'center' },
      border: {
        top: { style: 'thin', color: { rgb: '000000' } },
        bottom: { style: 'thin', color: { rgb: '000000' } },
        left: { style: 'thin', color: { rgb: '000000' } },
        right: { style: 'thin', color: { rgb: '000000' } }
      }
    };

    const totalRowStyle = {
      font: { name: 'Calibri', sz: 11, bold: true, color: { rgb: "800000" } }, // Maroon
      alignment: { horizontal: 'center', vertical: 'center' },
      fill: { fgColor: { rgb: "C2D69B" } }, // Light green/olive
      border: {
        top: { style: 'thin', color: { rgb: '000000' } },
        bottom: { style: 'thin', color: { rgb: '000000' } },
        left: { style: 'thin', color: { rgb: '000000' } },
        right: { style: 'thin', color: { rgb: '000000' } }
      }
    };

    // Helper helper to write cells
    const setCell = (cellRef, val, type, style) => {
      ws[cellRef] = { v: val, t: type, s: style };
    };

    // A1: Center Title
    const selectedLocationNames = (summaryFilters.locationId && summaryFilters.locationId.length === locations.length)
      ? 'All'
      : locations
        .filter(loc => summaryFilters.locationId.includes(loc._id))
        .map(loc => loc.name)
        .join(', ');
    const startDateStr = summaryFilters.startDate ? moment(summaryFilters.startDate).format('D MMMM YYYY') : '';
    const endDateStr = summaryFilters.endDate ? moment(summaryFilters.endDate).format('D MMMM YYYY') : '';
    const titleText = `Final Report of medicine consumed at ${selectedLocationNames} from ${startDateStr} to ${endDateStr}`;

    setCell('A1', titleText, 's', titleStyle);
    ws['B1'] = { s: titleStyle };
    ws['C1'] = { s: titleStyle };
    ws['D1'] = { s: titleStyle };

    // A2:D2 headers
    setCell('A2', 'Sr .No', 's', headerStyle);
    setCell('B2', 'Name of Farm', 's', headerStyle);
    setCell('C2', 'Amount', 's', headerStyle);
    setCell('D2', 'Remark', 's', headerStyle);

    // Data rows starting at row 3 (0-indexed: row 2)
    let curRow = 2; // index 2 represents Excel row 3
    summaryData.forEach((row, idx) => {
      setCell(`A${curRow + 1}`, idx + 1, 'n', srNoStyle);
      setCell(`B${curRow + 1}`, (row.locationName || '').toUpperCase(), 's', dataStyle);
      setCell(`C${curRow + 1}`, row.grandTotal ?? 0, 'n', amountStyle);
      ws[`C${curRow + 1}`].z = 'QR#,##0.00';
      setCell(`D${curRow + 1}`, '', 's', amountStyle); // Remark
      curRow++;
    });

    // Total Row
    setCell(`A${curRow + 1}`, 'Total', 's', totalRowStyle);
    ws[`B${curRow + 1}`] = { s: totalRowStyle };

    const grandTotal = summaryData.reduce((s, r) => s + (r.grandTotal ?? 0), 0);
    setCell(`C${curRow + 1}`, grandTotal, 'n', totalRowStyle);
    ws[`C${curRow + 1}`].z = 'QR#,##0.00';
    setCell(`D${curRow + 1}`, '', 's', totalRowStyle);

    // Merges
    ws['!merges'] = [
      { s: { r: 0, c: 0 }, e: { r: 0, c: 3 } }, // A1:D1
      { s: { r: curRow, c: 0 }, e: { r: curRow, c: 1 } } // A{Total}:B{Total}
    ];

    // Columns width definition
    ws['!cols'] = cols;

    // Rows height definition
    ws['!rows'] = [
      { hpt: 30 }, // Row 1: Title
      { hpt: 25 }, // Row 2: Header
      ...Array.from({ length: summaryData.length }).map(() => ({ hpt: 20 })), // Data rows
      { hpt: 22 }  // Total row
    ];

    // Range limits
    ws['!ref'] = `A1:D${curRow + 1}`;

    XLSXStyle.utils.book_append_sheet(wb, ws, 'Summary Report');

    // Write file out
    const wbout = XLSXStyle.write(wb, { bookType: 'xlsx', type: 'binary' });
    const s2ab = (s) => {
      const buf = new ArrayBuffer(s.length);
      const view = new Uint8Array(buf);
      for (let i = 0; i < s.length; i++) view[i] = s.charCodeAt(i) & 0xFF;
      return buf;
    };

    saveAs(
      new Blob([s2ab(wbout)], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' }),
      `summary-report-${moment().format('YYYY-MM-DD')}.xlsx`
    );

    showAlert('Excel exported with premium styles successfully! 📊', 'success');
  };

  const exportSummaryPdf = () => {
    if (summaryData.length === 0) { showAlert('No data to export', 'error'); return; }
    const doc = new jsPDF();
    doc.setFontSize(14);
    doc.text('Summary Report', 14, 15);
    doc.setFontSize(10);
    doc.text(`${summaryFilters.startDate} to ${summaryFilters.endDate}`, 14, 22);
    const tableData = summaryData.map((row) => [row.locationName || '', (row.grandTotal ?? 0).toFixed(2)]);
    doc.autoTable({ head: [['Location', 'Grand Total']], body: tableData, startY: 28 });
    doc.save(`summary-report-${moment().format('YYYY-MM-DD')}.pdf`);
    showAlert('PDF exported', 'success');
  };

  const monthlyPrintGroups = useMemo(() => {
    if (activeTab !== TAB_MONTHLY || monthlyData.length === 0) return {};
    const groups = {};
    monthlyData.forEach((row) => {
      const locKey = row.locationId || 'default';
      if (!groups[locKey]) {
        groups[locKey] = [];
      }
      groups[locKey].push(row);
    });
    return groups;
  }, [monthlyData, activeTab]);

  const monthName = useMemo(() => {
    if (!monthlyMonth) return '';
    return moment().month(parseInt(monthlyMonth, 10) - 1).format('MMMM');
  }, [monthlyMonth]);

  const lastDayInMonth = useMemo(() => {
    if (!monthlyYear || !monthlyMonth) return 30;
    return moment(`${monthlyYear}-${monthlyMonth}`, 'YYYY-MM').daysInMonth();
  }, [monthlyYear, monthlyMonth]);

  const handlePrint = () => {
    window.print();
  };

  const tabs = useMemo(() => {
    const allTabs = [
      { id: TAB_STOCK_IN, label: 'Stock-In Report', icon: <ArrowDownToLine className="h-4 w-4" /> },
      { id: TAB_STOCK_OUT, label: 'Stock-Out Report', icon: <ArrowUpFromLine className="h-4 w-4" /> },
      { id: TAB_MONTHLY, label: 'Monthly Report', icon: <Calendar className="h-4 w-4" /> },
      { id: TAB_SUMMARY, label: 'Summary Report', icon: <PieChart className="h-4 w-4" /> },
      { id: TAB_STOCK_ADJUSTMENT_HISTORY, label: 'Stock Adjustment History', icon: <FileText className="h-4 w-4" /> },
    ];
    if (isUserRole()) {
      return allTabs.filter((t) => t.id !== TAB_STOCK_ADJUSTMENT_HISTORY);
    }
    return allTabs;
  }, []);

  return (
    <div className="reports-page">
      <div className="container mx-auto p-6">
        <div className="reports-header">
          <h1><FileText /> Reports</h1>
        </div>

        {alert.show && (
          <div className={`reports-alert ${alert.type}`}>{alert.message}</div>
        )}

        <div className="reports-tabs">
          {tabs.map((tab) => (
            <button
              key={tab.id}
              type="button"
              className={`reports-tab ${activeTab === tab.id ? 'active' : ''}`}
              onClick={() => setActiveTab(tab.id)}
            >
              {tab.icon}
              {tab.label}
            </button>
          ))}
        </div>

        {activeTab === TAB_STOCK_IN && (
          <StockInReport
            suppliers={suppliers}
            datePresets={datePresets}
            applyDatePreset={(p) => applyDatePreset(p, TAB_STOCK_IN)}
            filters={stockInFilters}
            setFilters={setStockInFilters}
            productSearch={stockInProductSearch}
            setProductSearch={setStockInProductSearch}
            productsFiltered={stockInProductsFiltered}
            products={products}
            getProductName={getProductName}
            toggleProduct={toggleStockInProduct}
            loading={loading}
            onFetch={fetchStockInReport}
            onClearFilters={clearStockInFilters}
            data={stockInData}
            kpis={stockInKpis}
            chartData={stockInChartData}
            chartType={stockInChartType}
            setChartType={setStockInChartType}
            tableSearch={stockInSearch}
            setTableSearch={setStockInSearch}
            filtered={stockInFiltered}
            paginated={stockInPaginated}
            page={stockInPage}
            setPage={setStockInPage}
            pageSize={stockInPageSize}
            setPageSize={setStockInPageSize}
            onExportExcel={exportStockInExcel}
            onExportPdf={exportStockInPdf}
            onPrint={handlePrint}
            isAdmin={isAdmin}
          />
        )}

        {activeTab === TAB_STOCK_OUT && (
          <StockOutReport
            datePresets={datePresets}
            applyDatePreset={(p) => applyDatePreset(p, TAB_STOCK_OUT)}
            filters={stockOutFilters}
            setFilters={setStockOutFilters}
            productSearch={stockOutProductSearch}
            setProductSearch={setStockOutProductSearch}
            productsFiltered={stockOutProductsFiltered}
            products={products}
            getProductName={getProductName}
            toggleProduct={toggleStockOutProduct}
            locations={locations}
            loading={loading}
            onFetch={fetchStockOutReport}
            onClearFilters={clearStockOutFilters}
            data={stockOutData}
            kpis={stockOutKpis}
            chartData={stockOutChartData}
            chartType={stockOutChartType}
            setChartType={setStockOutChartType}
            tableSearch={stockOutSearch}
            setTableSearch={setStockOutSearch}
            filtered={stockOutFiltered}
            paginated={stockOutPaginated}
            page={stockOutPage}
            setPage={setStockOutPage}
            pageSize={stockOutPageSize}
            setPageSize={setStockOutPageSize}
            onExportExcel={exportStockOutExcel}
            onExportPdf={exportStockOutPdf}
            onPrint={handlePrint}
            isAdmin={isAdmin}
          />
        )}

        {activeTab === TAB_MONTHLY && (
          <MonthlyReport
            locations={locations}
            locationIds={monthlyLocationIds}
            setLocationIds={setMonthlyLocationIds}
            month={monthlyMonth}
            setMonth={setMonthlyMonth}
            year={monthlyYear}
            setYear={setMonthlyYear}
            yearOptions={yearOptions}
            loading={loading}
            hasFetched={monthlyHasFetched}
            data={monthlyData}
            kpis={monthlyKpis}
            tableSearch={monthlySearch}
            setTableSearch={setMonthlySearch}
            filtered={monthlyFiltered}
            paginated={monthlyPaginated}
            page={monthlyPage}
            setPage={setMonthlyPage}
            pageSize={monthlyPageSize}
            setPageSize={setMonthlyPageSize}
            onFetch={applyMonthlyReport}
            onClearFilters={clearMonthlyFilters}
            onExportExcel={exportMonthlyExcel}
            onExportPdf={exportMonthlyPdf}
            onPrint={handlePrint}
          />
        )}

        {activeTab === TAB_SUMMARY && (
          <SummaryReport
            locations={locations}
            filters={summaryFilters}
            setFilters={setSummaryFilters}
            loading={loading}
            hasFetched={summaryHasFetched}
            data={summaryData}
            grandTotalSum={summaryGrandTotal}
            onFetch={applySummaryReport}
            onClearFilters={clearSummaryFilters}
            onExportExcel={exportSummaryExcel}
            onExportPdf={exportSummaryPdf}
            onPrint={handlePrint}
          />
        )}

        {!isUserRole() && activeTab === TAB_STOCK_ADJUSTMENT_HISTORY && (
          <StockAdjustmentHistoryReport
            filters={stockAdjustmentHistoryFilters}
            setFilters={setStockAdjustmentHistoryFilters}
            products={products}
            loading={loading}
            onFetch={fetchStockAdjustmentHistory}
            onClearFilters={() => {
              setStockAdjustmentHistoryFilters({ date: '', docNo: '', productId: [] });
              setStockAdjustmentHistoryData([]);
              setStockAdjustmentHistoryPage(1);
            }}
            data={stockAdjustmentHistoryData}
            filtered={stockAdjustmentHistoryFiltered}
            paginated={stockAdjustmentHistoryPaginated}
            page={stockAdjustmentHistoryPage}
            setPage={setStockAdjustmentHistoryPage}
            pageSize={stockAdjustmentHistoryPageSize}
            setPageSize={setStockAdjustmentHistoryPageSize}
          />
        )}

        {!loading &&
          ((activeTab === TAB_STOCK_IN && stockInData.length === 0) ||
            (activeTab === TAB_STOCK_OUT && stockOutData.length === 0) ||
            (!isUserRole() && activeTab === TAB_STOCK_ADJUSTMENT_HISTORY && stockAdjustmentHistoryData.length === 0)) && (
            <div className="reports-card">
              <div className="reports-empty">
                <FileText />
                <p>Apply filters and load report to see data</p>
              </div>
            </div>
          )}
      </div>

      {/* Monthly Report Custom Print Area */}
      {activeTab === TAB_MONTHLY && monthlyData.length > 0 && (
        <div className="monthly-report-print-area">
          {Object.keys(monthlyPrintGroups).map((locKey) => {
            const locItems = monthlyPrintGroups[locKey];
            const sample = locItems[0];
            const locName = sample.locationName || 'Monthly Report';
            const trainerName = sample.trainerName || '';
            const doctorName = sample.doctorName || '';
            const personInfo = (doctorName || trainerName || '').toUpperCase();

            const titleText = `MEDICINE DELIVERED TO ${(locName || '').toUpperCase()} ${personInfo ? `(MR. ${personInfo}) ` : ''}from 1 ${monthName} ${monthlyYear} to ${lastDayInMonth} ${monthName} ${monthlyYear}`;

            const uniqueRemarks = Array.from(new Set(locItems.map(item => item.remarks).filter(Boolean))).join(', ');

            const grandTotal = locItems.reduce((s, r) => s + (r.totalAmount ?? 0), 0);

            return (
              <div key={locKey} className="print-location-page">
                <div className="print-report-title">{titleText}</div>
                <table className="print-report-table">
                  <thead>
                    <tr>
                      <th style={{ width: '15%' }}>Date</th>
                      <th style={{ width: '45%' }}>Description of Items</th>
                      <th style={{ width: '10%' }}>Qty</th>
                      <th style={{ width: '15%' }}>Unit Price</th>
                      <th style={{ width: '15%' }}>Total Price</th>
                    </tr>
                  </thead>
                  <tbody>
                    {locItems.map((item, idx) => (
                      <tr key={item._id || idx}>
                        <td className="col-center">{item.date ? moment(item.date).format('DD-MM-YYYY') : ''}</td>
                        <td className="col-left">{item.productName || ''}</td>
                        <td className="col-center">{item.quantity ?? 0}</td>
                        <td className="col-right">{(item.rate ?? 0).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</td>
                        <td className="col-right">{(item.totalAmount ?? 0).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</td>
                      </tr>
                    ))}
                    <tr className="print-total-row">
                      <td className="col-center"></td>
                      <td className="col-left">Total</td>
                      <td className="col-center"></td>
                      <td className="col-right"></td>
                      <td className="col-right">{grandTotal.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</td>
                    </tr>
                  </tbody>
                </table>
                <div className="print-report-footer">
                  <div className="print-note-line">Note: {uniqueRemarks}</div>
                  <div className="print-signatures-grid">
                    <div className="print-sig-col">
                      <div className="print-sig-label">Trainer Name: {trainerName}</div>
                      <div className="print-sig-line">Signature :</div>
                    </div>
                    <div className="print-sig-col">
                      <div className="print-sig-label">Veterinarian name: {doctorName}</div>
                      <div className="print-sig-line">Signature :</div>
                    </div>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
};

export default Reports;
