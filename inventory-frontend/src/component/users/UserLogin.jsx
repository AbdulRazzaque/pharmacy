import React, { useState } from 'react';
import axios from 'axios';
import { useNavigate, Link } from 'react-router-dom';
import { useForm } from 'react-hook-form';
import { storeUserInfo } from '../../store/user/userActions';
import { connect } from 'react-redux';
import { setToken, setUserInfo } from '../../utils/auth';
import ThemeToggle from '../../components/ThemeToggle';
import { 
  Users, 
  Package, 
  ShoppingBag, 
  LineChart, 
  Activity, 
  Eye, 
  EyeOff, 
  AlertCircle 
} from 'lucide-react';
import imstharbLogo from '../../images/imstharb.png';

const UserLogin = (props) => {
  const [isValid, setIsValid] = useState(false);
  const [showPwd, setShowPwd] = useState(false);
  const [loading, setLoading] = useState(false);
  const navigate = useNavigate();
  const { register, handleSubmit } = useForm();

  const onSubmit = async (data) => {
    setLoading(true);
    try {
      await axios.post(`${process.env.REACT_APP_DEVELOPMENT}/api/user/loginUser`, data)
        .then(response => {
          setToken(response.data.result.token);
          setUserInfo(response.data.result.userInfo);
          navigate('/dashboard/StockList');
          props.storeUserInfo(response.data.result.userInfo);
        });
    } catch (error) {
      setIsValid(true);
      setTimeout(() => { setIsValid(false); }, 3000);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="ph-auth-screen">
      {/* Top right theme toggle */}
      <div className="ph-auth-topbar">
        <ThemeToggle className="ph-brand-theme-btn" />
      </div>

      <main className="ph-auth-container">
        {/* 1. Prominent Central imstharb.png Branding */}
        <div className="ph-auth-brand-hero">
          <img
            src={imstharbLogo}
            alt="Tharb Pharmacy & Inventory Management System"
            className="ph-auth-brand-logo"
          />
        </div>

        {/* 2. Staff User Heading & Subtitle */}
        <div className="ph-auth-header">
          <div className="ph-auth-badge staff">
            <Users size={16} />
            <span>Staff Portal</span>
          </div>
          <h1 className="ph-auth-title">Staff User</h1>
          <p className="ph-auth-subtitle">Inventory &amp; Stock Operations Access</p>
        </div>

        {/* 3. Four Feature Highlights */}
        <div className="ph-auth-features staff-grid">
          <div className="ph-auth-feature-pill">
            <Package size={15} className="ph-auth-pill-icon" />
            <span>Manage Stock</span>
          </div>
          <div className="ph-auth-feature-pill">
            <ShoppingBag size={15} className="ph-auth-pill-icon" />
            <span>Process Orders</span>
          </div>
          <div className="ph-auth-feature-pill">
            <LineChart size={15} className="ph-auth-pill-icon" />
            <span>Stock Tracking</span>
          </div>
          <div className="ph-auth-feature-pill">
            <Activity size={15} className="ph-auth-pill-icon" />
            <span>Daily Operations</span>
          </div>
        </div>

        {/* 4. Enterprise Login Card */}
        <div className="ph-auth-card">
          {isValid && (
            <div className="ph-alert ph-alert-error" style={{ marginBottom: 18, width: '100%' }}>
              <AlertCircle size={16} style={{ flexShrink: 0 }} />
              <span>Invalid username or password. Please check your credentials.</span>
            </div>
          )}

          <form className="ph-auth-form" onSubmit={handleSubmit(onSubmit)}>
            <div className="ph-field">
              <label className="ph-label" htmlFor="user-username">Username</label>
              <input
                id="user-username"
                type="text"
                className="ph-input"
                placeholder="Enter your username"
                {...register("userName", { required: true })}
                required
                autoComplete="username"
              />
            </div>

            <div className="ph-field">
              <label className="ph-label" htmlFor="user-password">Password</label>
              <div style={{ position: 'relative' }}>
                <input
                  id="user-password"
                  type={showPwd ? 'text' : 'password'}
                  className="ph-input"
                  placeholder="••••••••"
                  style={{ paddingRight: 42 }}
                  {...register("password", { required: true })}
                  required
                  autoComplete="current-password"
                />
                <button
                  type="button"
                  onClick={() => setShowPwd(!showPwd)}
                  aria-label={showPwd ? "Hide password" : "Show password"}
                  className="ph-auth-eye-btn"
                >
                  {showPwd ? <EyeOff size={16} /> : <Eye size={16} />}
                </button>
              </div>
            </div>

            <button
              type="submit"
              className="ph-auth-submit-btn staff"
              disabled={loading}
            >
              {loading ? (
                <span style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8 }}>
                  <span className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                  Signing in…
                </span>
              ) : (
                'Sign In'
              )}
            </button>
          </form>

          <div className="ph-auth-links">
            <Link to="/" className="ph-auth-back-link">
              &larr; Back to Login Options
            </Link>
          </div>
        </div>

        {/* 5. Small Secondary Copyright */}
        <footer className="ph-auth-footer">
          &copy; 2025 PharmaCare ERP. Secure healthcare data platform.
        </footer>
      </main>
    </div>
  );
};

const mapDispatchToProps = (dispatch) => {
  return {
    storeUserInfo: value => dispatch(storeUserInfo(value))
  };
};

export default connect(null, mapDispatchToProps)(UserLogin);

