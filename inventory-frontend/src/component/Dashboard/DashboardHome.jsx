import React, { useEffect, useState, useCallback } from 'react';
import axios from 'axios';
import { Link } from 'react-router-dom';
import { getToken } from '../../utils/auth';
import moment from 'moment';

/* ─── Activity type config ─────────────────────────────────────── */
const ACTIVITY_CONFIG = {
  stock_in: {
    label: 'Stock IN',
    icon: '📥',
    color: '#16a34a',
    bg: '#dcfce7',
    badge: '#16a34a',
  },
  stock_out: {
    label: 'Stock OUT',
    icon: '📤',
    color: '#dc2626',
    bg: '#fee2e2',
    badge: '#dc2626',
  },
  adj_in: {
    label: 'Adjustment IN',
    icon: '🔧',
    color: '#2563eb',
    bg: '#dbeafe',
    badge: '#2563eb',
  },
  adj_out: {
    label: 'Adjustment OUT',
    icon: '⚙️',
    color: '#d97706',
    bg: '#fef3c7',
    badge: '#d97706',
  },
};

/* ─── Relative-time helper ──────────────────────────────────────── */
const relativeTime = (ts) => {
  if (!ts) return '';
  const m = moment(ts);
  const diffMins = moment().diff(m, 'minutes');
  if (diffMins < 1) return 'Just now';
  if (diffMins < 60) return `${diffMins}m ago`;
  const diffHrs = moment().diff(m, 'hours');
  if (diffHrs < 24) return `${diffHrs}h ago`;
  const diffDays = moment().diff(m, 'days');
  if (diffDays === 1) return 'Yesterday';
  if (diffDays < 7) return `${diffDays}d ago`;
  return m.format('DD MMM YYYY');
};

const DashboardHome = () => {
  const [stats, setStats] = useState({
    totalProducts: 0,
    totalUsers: 0,
    lowStock: 0,
    recentTransactions: 0,
  });
  const [activities, setActivities] = useState([]);
  const [activityLoading, setActivityLoading] = useState(true);
  const [activityError, setActivityError] = useState('');
  const accessToken = getToken();

  /* ─── Fetch dashboard stats ──────────────────────────────────── */
  const fetchDashboardData = useCallback(async () => {
    try {
      const [usersRes, productsRes] = await Promise.all([
        axios.get(`${process.env.REACT_APP_DEVELOPMENT}/api/user`, {
          headers: { token: accessToken },
        }),
        axios.get(`${process.env.REACT_APP_DEVELOPMENT}/api/product/getAllProducts`, {
          headers: { token: accessToken },
        }),
      ]);
      setStats((prev) => ({
        ...prev,
        totalUsers: usersRes.data.result?.length || 0,
        totalProducts: productsRes.data.result?.length || 0,
      }));
    } catch (error) {
      console.error('Error fetching dashboard data:', error);
    }
  }, [accessToken]);

  /* ─── Fetch recent activities ────────────────────────────────── */
  const fetchActivities = useCallback(async () => {
    setActivityLoading(true);
    setActivityError('');
    try {
      const res = await axios.get(
        `${process.env.REACT_APP_DEVELOPMENT}/api/recentActivity?limit=20`,
        { headers: { token: accessToken } }
      );
      setActivities(res.data.result || []);
      setStats((prev) => ({
        ...prev,
        recentTransactions: res.data.result?.length || 0,
      }));
    } catch (err) {
      console.error('Error fetching recent activity:', err);
      setActivityError('Failed to load recent activity.');
    } finally {
      setActivityLoading(false);
    }
  }, [accessToken]);

  useEffect(() => {
    fetchDashboardData();
    fetchActivities();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const quickActions = [
    { title: 'Add Product', description: 'Add new product to inventory', icon: '📦', link: '/dashboard/products', color: '#4CAF50' },
    { title: 'Stock In', description: 'Record incoming stock', icon: '📥', link: '/dashboard/stockin', color: '#2196F3' },
    { title: 'Stock Out', description: 'Record outgoing stock', icon: '📤', link: '/dashboard/stockout', color: '#FF9800' },
    { title: 'Reports', description: 'Stock-In, Stock-Out & reports', icon: '📊', link: '/dashboard/reports', color: '#9C27B0' },
  ];

  return (
    <div className="dashboard-home">
      {/* ─── Header ──────────────────────────────────────────────── */}
      <div className="dashboard-header-section">
        <h1 className="page-title">Dashboard Overview</h1>
        <p className="page-subtitle">Welcome to your pharmacy inventory management system</p>
      </div>

      {/* ─── Stats ───────────────────────────────────────────────── */}
      <div className="stats-grid">
        <div className="stat-card" style={{ borderLeftColor: '#4CAF50' }}>
          <div className="stat-icon" style={{ backgroundColor: '#4CAF5020' }}>
            <span style={{ fontSize: '2rem' }}>📦</span>
          </div>
          <div className="stat-content">
            <h3 className="stat-label">Total Products</h3>
            <p className="stat-value">{stats.totalProducts}</p>
          </div>
        </div>

        <div className="stat-card" style={{ borderLeftColor: '#2196F3' }}>
          <div className="stat-icon" style={{ backgroundColor: '#2196F320' }}>
            <span style={{ fontSize: '2rem' }}>👥</span>
          </div>
          <div className="stat-content">
            <h3 className="stat-label">Total Users</h3>
            <p className="stat-value">{stats.totalUsers}</p>
          </div>
        </div>

        <div className="stat-card" style={{ borderLeftColor: '#FF9800' }}>
          <div className="stat-icon" style={{ backgroundColor: '#FF980020' }}>
            <span style={{ fontSize: '2rem' }}>⚠️</span>
          </div>
          <div className="stat-content">
            <h3 className="stat-label">Low Stock Items</h3>
            <p className="stat-value">{stats.lowStock}</p>
          </div>
        </div>

        <div className="stat-card" style={{ borderLeftColor: '#9C27B0' }}>
          <div className="stat-icon" style={{ backgroundColor: '#9C27B020' }}>
            <span style={{ fontSize: '2rem' }}>📊</span>
          </div>
          <div className="stat-content">
            <h3 className="stat-label">Recent Activities</h3>
            <p className="stat-value">{stats.recentTransactions}</p>
          </div>
        </div>
      </div>

      {/* ─── Quick Actions ───────────────────────────────────────── */}
      <div className="section">
        <h2 className="section-title">Quick Actions</h2>
        <div className="quick-actions-grid">
          {quickActions.map((action, index) => (
            <Link to={action.link} key={index} className="action-card">
              <div className="action-icon" style={{ backgroundColor: action.color + '20' }}>
                <span style={{ fontSize: '2rem' }}>{action.icon}</span>
              </div>
              <h3 className="action-title">{action.title}</h3>
              <p className="action-description">{action.description}</p>
            </Link>
          ))}
        </div>
      </div>

      {/* ─── Recent Activity ─────────────────────────────────────── */}
      <div className="section">
        <div className="ra-header">
          <h2 className="section-title" style={{ margin: 0 }}>Recent Activity</h2>
          <button
            className="ra-refresh-btn"
            onClick={fetchActivities}
            disabled={activityLoading}
            title="Refresh"
          >
            <span className={activityLoading ? 'ra-spin' : ''}>↻</span>
            {activityLoading ? 'Loading…' : 'Refresh'}
          </button>
        </div>

        <div className="activity-card ra-card">
          {activityLoading ? (
            /* skeleton rows */
            <ul className="activity-list">
              {[...Array(6)].map((_, i) => (
                <li key={i} className="ra-item ra-skeleton">
                  <div className="ra-skeleton-icon" />
                  <div className="ra-skeleton-body">
                    <div className="ra-skeleton-line ra-skeleton-title" />
                    <div className="ra-skeleton-line ra-skeleton-sub" />
                  </div>
                </li>
              ))}
            </ul>
          ) : activityError ? (
            <div className="ra-error">
              <span>⚠️</span>
              <span>{activityError}</span>
              <button className="ra-retry-btn" onClick={fetchActivities}>Retry</button>
            </div>
          ) : activities.length === 0 ? (
            <div className="empty-state">
              <span style={{ fontSize: '3rem', display: 'block', marginBottom: '0.5rem' }}>📋</span>
              <p>No recent activities found</p>
            </div>
          ) : (
            <>
              <ul className="activity-list">
                {activities.map((act, i) => {
                  const cfg = ACTIVITY_CONFIG[act.typeCode] || ACTIVITY_CONFIG.stock_in;
                  return (
                    <li key={act._id || i} className="ra-item">
                      {/* Icon badge */}
                      <div
                        className="ra-icon-wrap"
                        style={{ background: cfg.bg, color: cfg.color }}
                      >
                        <span className="ra-icon-emoji">{cfg.icon}</span>
                      </div>

                      {/* Main content */}
                      <div className="ra-content">
                        <div className="ra-top-row">
                          <span
                            className="ra-type-badge"
                            style={{ background: cfg.bg, color: cfg.color }}
                          >
                            {act.type}
                          </span>
                          {act.docNo && (
                            <span className="ra-docno">Doc #{act.docNo}</span>
                          )}
                        </div>

                        <p className="ra-product-name">
                          {act.productName}
                          {act.companyName ? (
                            <span className="ra-company"> ({act.companyName})</span>
                          ) : null}
                        </p>

                        <div className="ra-meta-row">
                          {act.quantity != null && (
                            <span className="ra-meta-chip">
                              <span>📦</span> Qty: {act.quantity}{act.unit ? ` ${act.unit}` : ''}
                            </span>
                          )}
                          {act.location && (
                            <span className="ra-meta-chip">
                              <span>📍</span> {act.location}
                            </span>
                          )}
                          <span className="ra-meta-chip">
                            <span>👤</span> {act.userName}
                          </span>
                        </div>
                      </div>

                      {/* Timestamp */}
                      <div className="ra-time-col">
                        <span className="ra-relative-time">{relativeTime(act.createdAt)}</span>
                        <span className="ra-abs-time">
                          {act.createdAt ? moment(act.createdAt).format('DD MMM, HH:mm') : ''}
                        </span>
                      </div>
                    </li>
                  );
                })}
              </ul>

              <div className="ra-footer">
                <Link to="/dashboard/reports" className="ra-view-all-btn">
                  View All Reports →
                </Link>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
};

export default DashboardHome;
