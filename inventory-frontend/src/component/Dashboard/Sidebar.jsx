import React, { useMemo } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { getUserInfo } from '../../utils/auth';
import {
  LayoutDashboard, Package, Users, Truck, MapPin,
  PackagePlus, FileText, PackageMinus, FileX,
  Archive, Sliders, ClipboardList,
  TrendingUp, PieChart, ShieldCheck
} from 'lucide-react';

const isAdminRole = () => (getUserInfo()?.role || '').toLowerCase() === 'admin';

const NAV_GROUPS = [
  {
    label: 'OVERVIEW',
    items: [
      { title: 'Dashboard', path: '/dashboard', icon: <LayoutDashboard size={17} />, exact: true },
    ]
  },
  {
    label: 'MASTER DATA',
    items: [
      { title: 'Products',  path: '/dashboard/products',   icon: <Package   size={17} /> },
      { title: 'Suppliers', path: '/dashboard/suppliers',  icon: <Truck     size={17} /> },
      { title: 'Locations', path: '/dashboard/locations',  icon: <MapPin    size={17} /> },
    ]
  },
  {
    label: 'INVENTORY',
    items: [
      { title: 'Stock In',       path: '/dashboard/stockin',         icon: <PackagePlus  size={17} /> },
      { title: 'Stock In Docs',  path: '/dashboard/stockin-docs',    icon: <FileText     size={17} /> },
      { title: 'Stock Out',      path: '/dashboard/stockout',        icon: <PackageMinus size={17} /> },
      { title: 'Stock Out Docs', path: '/dashboard/stockout-docs',   icon: <FileX        size={17} /> },
      { title: 'Stock List',     path: '/dashboard/StockList',       icon: <Archive      size={17} /> },
      { title: 'Stock Details',  path: '/dashboard/stock-details',   icon: <ClipboardList size={17} /> },
      { title: 'Adjustment',     path: '/dashboard/stock-adjustment', icon: <Sliders     size={17} />, adminOnly: true },
    ]
  },
  {
    label: 'PRICING',
    adminOnly: true,
    items: [
      { title: 'Selling Price',  path: '/dashboard/selling-price-update', icon: <TrendingUp size={17} />, adminOnly: true },
    ]
  },
  {
    label: 'REPORTING',
    items: [
      { title: 'Reports', path: '/dashboard/reports', icon: <PieChart size={17} /> },
    ]
  },
  {
    label: 'ADMINISTRATION',
    adminOnly: true,
    items: [
      { title: 'User Management', path: '/dashboard/users', icon: <Users size={17} />, adminOnly: true },
    ]
  },
];

const Sidebar = ({ isOpen, setIsOpen }) => {
  const location = useLocation();
  const userInfo = getUserInfo();
  const userIsAdmin = isAdminRole();

  const filteredGroups = useMemo(() => {
    return NAV_GROUPS
      .filter(g => !g.adminOnly || userIsAdmin)
      .map(g => ({
        ...g,
        items: g.items.filter(item => !item.adminOnly || userIsAdmin)
      }))
      .filter(g => g.items.length > 0);
  }, [userIsAdmin]);

  const isActive = (path, exact) => {
    if (exact) return location.pathname === path;
    return location.pathname === path || location.pathname.startsWith(path + '/');
  };

  const userName = userInfo?.userName
    ? userInfo.userName.charAt(0).toUpperCase() + userInfo.userName.slice(1)
    : 'User';
  const userInitials = userInfo?.userName
    ? userInfo.userName.slice(0, 2).toUpperCase()
    : 'U';
  const userRole = userInfo?.role || 'user';

  return (
    <aside className={`sidebar ${isOpen ? 'open' : 'closed'}`}>
      {/* Brand */}
      <div className="sidebar-brand">
        <div className="sidebar-brand-icon">
          <ShieldCheck size={18} />
        </div>
        <div className="sidebar-brand-text">
          <p className="sidebar-brand-name">PharmaCare</p>
          <p className="sidebar-brand-tagline">Management System</p>
        </div>
      </div>

      {/* Navigation */}
      <nav className="sidebar-nav">
        {filteredGroups.map((group, gi) => (
          <div key={gi}>
            {gi > 0 && <div className="nav-section-divider" />}
            <div className="nav-section-label">{group.label}</div>
            {group.items.map((item, ii) => (
              <Link
                key={ii}
                to={item.path}
                className={`nav-item ${isActive(item.path, item.exact) ? 'active' : ''}`}
                title={!isOpen ? item.title : undefined}
              >
                <span className="nav-icon">{item.icon}</span>
                <span className="nav-text">{item.title}</span>
              </Link>
            ))}
          </div>
        ))}
      </nav>

      {/* User Footer */}
      <div className="sidebar-footer">
        <div className="sidebar-user-mini">
          <div className="sidebar-avatar">{userInitials}</div>
          <div className="sidebar-user-info">
            <p className="sidebar-user-name">{userName}</p>
            <p className="sidebar-user-role">{userRole}</p>
          </div>
        </div>
      </div>
    </aside>
  );
};

export default Sidebar;
