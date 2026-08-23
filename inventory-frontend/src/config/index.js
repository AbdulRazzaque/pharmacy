/**
 * Centralized app configuration
 */

export const API_BASE_URL = process.env.REACT_APP_DEVELOPMENT || '';

/** Route paths - use these for Links and navigation */
export const ROUTES = {
  home: '/',
  adminLogin: '/adminlogin',
  userLogin: '/userlogin',
  dashboard: '/dashboard',
  dashboardUsers: '/dashboard/users',
  dashboardProducts: '/dashboard/products',
  dashboardSuppliers: '/dashboard/suppliers',
  dashboardLocations: '/dashboard/locations',
  stockIn: '/dashboard/stockin',
  stockOut: '/dashboard/stockout',
  stockList: '/dashboard/StockList',
  reports: '/dashboard/reports',
  stockOutSearch: '/dashboard/stockoutsearch',
  transactionList: (slug) => `/dashboard/transactionlist/${slug}`,
  stockInDetails: (docNo) => `/dashboard/StockInDetails/${docNo}`,
  stockOutDetails: (docNo) => `/dashboard/StockOutDetails/${docNo}`,
};

/** API endpoint paths (relative to API_BASE_URL) */
export const API_ENDPOINTS = {
  user: '/api/user',
  suppliers: '/api/supplier/getAllSuppliers',
  locations: '/api/location/getAllLocations',
  products: '/api/product/getAllProducts',
  stocks: '/api/stock/getAllStocks',
  stockDocuments: '/api/stock/getStockDocuments',
  report: {
    stockIn: '/api/report/getStockInReport',
    stockOut: '/api/report/getStockOutReport',
    monthlySummarized: '/api/report/getMonthlySummarizedReport',
    monthlyIssued: '/api/report/getMonthlyIssuedReport',
    summary: '/api/report/getSummaryReport',
  },
  stockIn: {
    byDocNo: '/api/stockIn/getStockInByDocNo',
    docNo: '/api/stockIn/getStockInDocNo',
    create: '/api/stockIn/stockIn',
  },
  stockOut: {
    byDocNo: '/api/stockOut/getStockOutByDocNo',
    docNo: '/api/stockOut/getStockOutDocNo',
    create: '/api/stockOut/stockOuts',
  },
};
