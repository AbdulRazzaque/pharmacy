import React, { useEffect, useState, useCallback } from 'react';
import axios from 'axios';
import { Link } from 'react-router-dom';
import { getToken } from '../../utils/auth';
import moment from 'moment';
import {
  Package, Users, AlertTriangle, Activity,
  PackagePlus, PackageMinus, BarChart3, RefreshCw,
  MapPin, User, ArrowRight
} from 'lucide-react';

/* ─── Activity type config ─────────────────────────────────────── */
const ACTIVITY_CONFIG = {
  stock_in: {
    label: 'Stock IN',
    icon: '📥',
    color: '#059669',
    bg: '#d1fae5',
    badge: '#059669',
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
    color: '#0e7490',
    bg: '#e0f2f9',
    badge: '#0e7490',
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
    { title: 'Add Product', description: 'Register new product', icon: <Package size={20} />, link: '/dashboard/products', color: 'var(--ph-success)', bg: 'var(--ph-success-light)' },
    { title: 'Stock In', description: 'Record incoming stock', icon: <PackagePlus size={20} />, link: '/dashboard/stockin', color: 'var(--ph-navy)', bg: 'var(--ph-navy-light)' },
    { title: 'Stock Out', description: 'Record outgoing stock', icon: <PackageMinus size={20} />, link: '/dashboard/stockout', color: 'var(--ph-warning)', bg: 'var(--ph-warning-light)' },
    { title: 'Reports', description: 'Analytics & reporting', icon: <BarChart3 size={20} />, link: '/dashboard/reports', color: 'var(--ph-teal)', bg: 'var(--ph-teal-light)' },
  ];

  return (
    <div className="dashboard-home">
      {/* ─── Header ──────────────────────────────────────────────── */}
      <div className="dashboard-header-section">
        <h1 className="page-title">Dashboard Overview</h1>
        <p className="page-subtitle">Welcome to PharmaCare — your pharmacy management system</p>
      </div>

      {/* ─── KPI Stats ───────────────────────────────────────────── */}
      <div className="stats-grid">
        <div className="ph-stat-card">
          <div className="ph-stat-icon" style={{ background: 'var(--ph-navy-light)', color: 'var(--ph-navy)' }}>
            <Package size={20} />
          </div>
          <div>
            <p className="ph-stat-label">Total Products</p>
            <p className="ph-stat-value">{stats.totalProducts}</p>
            <p className="ph-stat-sub">In the catalogue</p>
          </div>
        </div>

        <div className="ph-stat-card">
          <div className="ph-stat-icon" style={{ background: 'var(--ph-teal-light)', color: 'var(--ph-teal)' }}>
            <Users size={20} />
          </div>
          <div>
            <p className="ph-stat-label">System Users</p>
            <p className="ph-stat-value">{stats.totalUsers}</p>
            <p className="ph-stat-sub">Active accounts</p>
          </div>
        </div>

        <div className="ph-stat-card">
          <div className="ph-stat-icon" style={{ background: 'var(--ph-warning-light)', color: 'var(--ph-warning)' }}>
            <AlertTriangle size={20} />
          </div>
          <div>
            <p className="ph-stat-label">Low Stock</p>
            <p className="ph-stat-value">{stats.lowStock}</p>
            <p className="ph-stat-sub">Items to reorder</p>
          </div>
        </div>

        <div className="ph-stat-card">
          <div className="ph-stat-icon" style={{ background: 'var(--ph-success-light)', color: 'var(--ph-success)' }}>
            <Activity size={20} />
          </div>
          <div>
            <p className="ph-stat-label">Recent Activities</p>
            <p className="ph-stat-value">{stats.recentTransactions}</p>
            <p className="ph-stat-sub">Today's transactions</p>
          </div>
        </div>
      </div>

      {/* ─── Quick Actions ───────────────────────────────────────── */}
      <div className="section">
        <h2 className="section-title">Quick Actions</h2>
        <div className="quick-actions-grid">
          {quickActions.map((action, index) => (
            <Link to={action.link} key={index} className="action-card">
              <div className="action-icon" style={{ background: action.bg, color: action.color }}>
                {action.icon}
              </div>
              <div>
                <h3 className="action-title">{action.title}</h3>
                <p className="action-description">{action.description}</p>
              </div>
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
            <RefreshCw size={13} className={activityLoading ? 'ra-spin' : ''} />
            {activityLoading ? 'Loading…' : 'Refresh'}
          </button>
        </div>

        <div className="activity-card ra-card">
          {activityLoading ? (
            <ul className="activity-list">
              {[...Array(6)].map((_, i) => (
                <li key={i} className="ra-item">
                  <div className="ra-skeleton-icon ph-skeleton" />
                  <div className="ra-skeleton-body">
                    <div className="ra-skeleton-line ra-skeleton-title ph-skeleton" />
                    <div className="ra-skeleton-line ra-skeleton-sub ph-skeleton" />
                  </div>
                </li>
              ))}
            </ul>
          ) : activityError ? (
            <div className="ra-error">
              <AlertTriangle size={16} />
              <span>{activityError}</span>
              <button className="ra-retry-btn" onClick={fetchActivities}>Retry</button>
            </div>
          ) : activities.length === 0 ? (
            <div className="empty-state">
              <div className="ph-empty-icon" style={{ margin: '0 auto 12px' }}>
                <Activity size={22} />
              </div>
              <p className="ph-empty-title">No recent activities</p>
              <p className="ph-empty-desc">Start recording stock transactions to see activity here</p>
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
                              <Package size={11} /> Qty: {act.quantity}{act.unit ? ` ${act.unit}` : ''}
                            </span>
                          )}
                          {act.location && (
                            <span className="ra-meta-chip">
                              <MapPin size={11} /> {act.location}
                            </span>
                          )}
                          <span className="ra-meta-chip">
                            <User size={11} /> {act.userName}
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
                  View All Reports <ArrowRight size={13} style={{ display: 'inline', verticalAlign: 'middle' }} />
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

