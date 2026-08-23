import React, { useState } from 'react';
import { Outlet, useNavigate } from 'react-router-dom';
import Sidebar from './Sidebar';
import ThemeToggle from '../../components/ThemeToggle';
import './dashboard.css';
import { removeToken, removeUserInfo, getUserInfo } from '../../utils/auth';

const DashboardLayout = () => {
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const navigate = useNavigate();
  const userInfo = getUserInfo();

  const handleLogout = () => {
    // Clear any auth tokens/session data
    removeToken();
    removeUserInfo();
    navigate('/');
  };

  return (
    <div className="dashboard-container">
      <Sidebar isOpen={sidebarOpen} setIsOpen={setSidebarOpen} />
      
      <div className={`main-content ${sidebarOpen ? 'sidebar-open' : 'sidebar-closed'}`}>
        <header className="dashboard-header">
          <button 
            className="menu-toggle"
            onClick={() => setSidebarOpen(!sidebarOpen)}
          >
            <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 12h16M4 18h16" />
            </svg>
          </button>
          
          <div className="header-right">
            <ThemeToggle />
            <div className="user-info">
              <span className="user-name">
                {userInfo?.userName ? userInfo.userName.charAt(0).toUpperCase() + userInfo.userName.slice(1) : 'User'}
              </span>
              <button className="logout-btn" onClick={handleLogout}>
                Logout
              </button>
            </div>
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
