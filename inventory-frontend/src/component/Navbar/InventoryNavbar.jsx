import { Link } from 'react-router-dom';
import { Button } from '../../components/ui/button';
import { Menu, X, LogOut, ChevronDown } from 'lucide-react';
import { useState } from 'react';
import { connect } from 'react-redux'
import '../../app.css'
import './navbar.css'
import logo from '../../images/logo.jpeg';
import ThemeToggle from '../../components/ThemeToggle';

const InventoryNavbar = (props) => {
  const [isOpen, setIsOpen] = useState(false);
  const [openDropdown, setOpenDropdown] = useState('');

  const toggleDropdown = (dropdown) => {
    setOpenDropdown(openDropdown === dropdown ? '' : dropdown);
  };

  return (
    <div className="w-full bg-background text-foreground">
      <h1 className="text-center text-3xl font-bold py-4">Inventory Management System</h1>
      
      <nav className="bg-card border-b border-border shadow-md">
        <div className="container mx-auto px-4">
          <div className="flex items-center justify-between h-16">
            <Link to="/" className="flex items-center">
              <img src={logo} className="h-12 w-auto" alt="Logo" />
            </Link>

            <div className="flex items-center gap-2 md:gap-4">
              <ThemeToggle />

              <button
                type="button"
                onClick={() => setIsOpen(!isOpen)}
                className="md:hidden p-2 rounded-md hover:bg-accent"
                aria-label="Toggle menu"
              >
                {isOpen ? <X size={24} /> : <Menu size={24} />}
              </button>

            <div className="hidden md:flex items-center space-x-6">
              {props.userInfo.role === "admin" && (
                <div className="relative group">
                  <button className="flex items-center space-x-1 font-semibold hover:text-primary">
                    <span>Selection</span>
                    <ChevronDown size={16} />
                  </button>
                  <div className="absolute left-0 mt-2 w-48 bg-card border border-border rounded-md shadow-lg hidden group-hover:block z-10">
                    <Link to="/dashboard/users" className="block px-4 py-2 hover:bg-gray-100">Add User</Link>
                    <Link to="/dashboard/products" className="block px-4 py-2 hover:bg-gray-100">Add Product</Link>
                    <Link to="/dashboard/suppliers" className="block px-4 py-2 hover:bg-gray-100">Add Supplier</Link>
                    <Link to="/dashboard/locations" className="block px-4 py-2 hover:bg-gray-100">Add Farm</Link>
                  </div>
                </div>
              )}

              <div className="relative group">
                <button className="flex items-center space-x-1 font-semibold hover:text-primary">
                  <span>Transaction</span>
                  <ChevronDown size={16} />
                </button>
                <div className="absolute left-0 mt-2 w-48 bg-card border border-border rounded-md shadow-lg hidden group-hover:block z-10">
                  <Link to="/dashboard/stockin" className="block px-4 py-2 hover:bg-gray-100">Stock In</Link>
                  <Link to="/dashboard/stockout" className="block px-4 py-2 hover:bg-gray-100">Stock Out</Link>
                  <Link to="/dashboard/stockoutsearch" className="block px-4 py-2 hover:bg-gray-100">Stockout Search</Link>
                  <Link to="/dashboard/StockList" className="block px-4 py-2 hover:bg-gray-100">Stock List</Link>
                  <Link to="/dashboard/reports" className="block px-4 py-2 hover:bg-gray-100">Reports</Link>
                </div>
              </div>

              <Link to="/">
                <Button variant="destructive" size="sm">
                  <LogOut className="mr-2 h-4 w-4" />
                  Log Out
                </Button>
              </Link>
            </div>
            </div>
          </div>

          {/* Mobile menu */}
          {isOpen && (
            <div className="md:hidden pb-4 space-y-2">
              {props.userInfo.role === "admin" && (
                <>
                  <button
                    onClick={() => toggleDropdown('selection')}
                    className="w-full text-left font-semibold py-2 flex items-center justify-between"
                  >
                    Selection
                    <ChevronDown size={16} />
                  </button>
                  {openDropdown === 'selection' && (
                    <div className="pl-4 space-y-2">
                      <Link to="/dashboard/users" className="block py-1 hover:text-primary">Add User</Link>
                      <Link to="/dashboard/products" className="block py-1 hover:text-primary">Add Product</Link>
                      <Link to="/dashboard/suppliers" className="block py-1 hover:text-primary">Add Supplier</Link>
                      <Link to="/dashboard/locations" className="block py-1 hover:text-primary">Add Farm</Link>
                    </div>
                  )}
                </>
              )}

              <button
                onClick={() => toggleDropdown('transaction')}
                className="w-full text-left font-semibold py-2 flex items-center justify-between"
              >
                Transaction
                <ChevronDown size={16} />
              </button>
              {openDropdown === 'transaction' && (
                <div className="pl-4 space-y-2">
                  <Link to="/dashboard/stockin" className="block py-1 hover:text-primary">Stock In</Link>
                  <Link to="/dashboard/stockout" className="block py-1 hover:text-primary">Stock Out</Link>
                  <Link to="/dashboard/stockoutsearch" className="block py-1 hover:text-primary">Stockout Search</Link>
                  <Link to="/dashboard/StockList" className="block py-1 hover:text-primary">Stock List</Link>
                  <Link to="/dashboard/reports" className="block py-1 hover:text-primary">Reports</Link>
                </div>
              )}

              <Link to="/" className="block pt-4">
                <Button variant="destructive" className="w-full">
                  <LogOut className="mr-2 h-4 w-4" />
                  Log Out
                </Button>
              </Link>
            </div>
          )}
        </div>
      </nav>
    </div>
  );
}

const mapStateToProps = ({inventoryUser})=>{
  return {
    userInfo:inventoryUser.userInfo
  }
}

export default connect(mapStateToProps)(InventoryNavbar)