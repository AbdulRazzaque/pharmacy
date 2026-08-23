import { Link } from 'react-router-dom';
import { Button } from '../../components/ui/button';
import { Menu, X } from 'lucide-react';
import { useState } from 'react';
import ThemeToggle from '../../components/ThemeToggle';
import '../../app.css';
import './navbar.css';
import logo from '../../images/logo.jpeg';

const FirstpageNavbar = () => {
  const [isOpen, setIsOpen] = useState(false);

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

              <div className="hidden md:flex items-center space-x-4">
                <Link to="/adminlogin">
                  <Button variant="outline">Admin Login</Button>
                </Link>
                <Link to="/userlogin">
                  <Button>User Login</Button>
                </Link>
              </div>
            </div>
          </div>

          {isOpen && (
            <div className="md:hidden pb-4 space-y-2">
              <Link to="/adminlogin" className="block">
                <Button variant="outline" className="w-full">Admin Login</Button>
              </Link>
              <Link to="/userlogin" className="block">
                <Button className="w-full">User Login</Button>
              </Link>
            </div>
          )}
        </div>
      </nav>
    </div>
  );
};

export default FirstpageNavbar;
