import React from 'react';
import { Link } from 'react-router-dom';
import ThemeToggle from '../components/ThemeToggle';
import { ShieldCheck, Users, ChevronRight } from 'lucide-react';
import imstharbLogo from '../images/imstharb.png';

const Login = () => {
  return (
    <div className="ph-brand-screen">
      {/* Top right theme toggle */}
      <div className="ph-brand-topbar">
        <ThemeToggle className="ph-brand-theme-btn" />
      </div>

      <main className="ph-brand-container">
        {/* Dominant THARB Brand Hero */}
        <div className="ph-brand-hero">
          <img
            src={imstharbLogo}
            alt="Tharb Pharmacy & Inventory Management System"
            className="ph-brand-logo-img"
          />
        </div>

        {/* Account Selection Cards Directly Below Image */}
        <section className="ph-brand-accounts" aria-label="Select Account Type">
          <Link
            to="/adminlogin"
            className="ph-brand-card ph-brand-card-admin"
            aria-label="Administrator - Full system access and user management"
          >
            <div className="ph-brand-card-icon admin">
              <ShieldCheck size={24} />
            </div>
            <div className="ph-brand-card-body">
              <span className="ph-brand-card-title">Administrator</span>
              <span className="ph-brand-card-desc">
                Full system access &amp; user management
              </span>
            </div>
            <div className="ph-brand-card-arrow" aria-hidden="true">
              <ChevronRight size={20} />
            </div>
          </Link>

          <Link
            to="/userlogin"
            className="ph-brand-card ph-brand-card-staff"
            aria-label="Staff User - Inventory and stock operations access"
          >
            <div className="ph-brand-card-icon staff">
              <Users size={24} />
            </div>
            <div className="ph-brand-card-body">
              <span className="ph-brand-card-title">Staff User</span>
              <span className="ph-brand-card-desc">
                Inventory &amp; stock operations access
              </span>
            </div>
            <div className="ph-brand-card-arrow" aria-hidden="true">
              <ChevronRight size={20} />
            </div>
          </Link>
        </section>

        {/* Subtle, secondary copyright footer */}
        <footer className="ph-brand-footer">
          &copy; 2025 PharmaCare ERP. Secure healthcare data platform.
        </footer>
      </main>
    </div>
  );
};

export default Login;

