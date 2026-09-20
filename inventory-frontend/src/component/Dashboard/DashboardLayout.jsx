import React, { useState } from 'react';
import { Outlet, useNavigate, useLocation } from 'react-router-dom';
import Sidebar from './Sidebar';
import ThemeToggle from '../../components/ThemeToggle';
import './dashboard.css';
import { removeToken, removeUserInfo, getUserInfo } from '../../utils/auth';
import { LogOut, ChevronRight } from 'lucide-react';

/* Map route segments to readable breadcrumb labels */
const ROUTE_LABELS = {
  dashboard:             'Dashboard',
  users:                 'User Management',
  products:              'Products',
  suppliers:             'Suppliers',
  locations:             'Locations',
  stockin:               'Stock In',
  'stockin-docs':        'Stock In Documents',
  stockout:              'Stock Out',
  'stockout-docs':       'Stock Out Documents',
  StockList:             'Stock List',
  'selling-price-update':'Selling Price Update',
  'stock-details':       'Stock Details',
  'stock-adjustment':    'Stock Adjustment',
  reports:               'Reports',
};

const DashboardLayout = () => {
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const navigate = useNavigate();
  const location = useLocation();
  const userInfo = getUserInfo();

  const handleLogout = () => {
    removeToken();
    removeUserInfo();
    navigate('/');
  };

  /* Derive breadcrumb from current path */
  const segments = location.pathname.split('/').filter(Boolean);
  const currentLabel = segments.length > 1
    ? (ROUTE_LABELS[segments[segments.length - 1]] || segments[segments.length - 1])
    : 'Dashboard';

  const userName = userInfo?.userName
    ? userInfo.userName.charAt(0).toUpperCase() + userInfo.userName.slice(1)
    : 'User';
  const userInitials = userInfo?.userName
    ? userInfo.userName.slice(0, 2).toUpperCase()
    : 'U';
  const userRole = userInfo?.role || 'user';

  return (
    <div className="dashboard-container">
      <Sidebar isOpen={sidebarOpen} setIsOpen={setSidebarOpen} />

      <div className="main-content">
        <header className="dashboard-header">
          <div className="header-left">
            <button
              className="menu-toggle"
              onClick={() => setSidebarOpen(!sidebarOpen)}
              title="Toggle sidebar"
            >
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <line x1="3" y1="6" x2="21" y2="6" />
                <line x1="3" y1="12" x2="21" y2="12" />
                <line x1="3" y1="18" x2="21" y2="18" />
              </svg>
            </button>

            {/* Breadcrumb */}
            <div className="header-breadcrumb">
              <span>PharmaCare</span>
              <span className="header-breadcrumb-sep">
                <ChevronRight size={13} />
              </span>
              <span className="header-breadcrumb-current">{currentLabel}</span>
            </div>
          </div>

          <div className="header-right">
            <ThemeToggle />

            {/* User profile */}
            <div className="header-user">
              <div className="header-avatar">{userInitials}</div>
              <div className="header-user-info">
                <span className="header-user-name">{userName}</span>
                <span className="header-user-role">{userRole}</span>
              </div>
            </div>

            {/* Logout */}
            <button className="logout-btn" onClick={handleLogout} title="Sign out">
              <LogOut size={14} />
              <span>Logout</span>
            </button>
          </div>
        </header>

        <main className="dashboard-main">
          <Outlet />
        </main>
      </div>
    </div>
  );
};

export default DashboardLayout;
