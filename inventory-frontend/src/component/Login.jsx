import React from 'react';
import FirstpageNavbar from './Navbar/FirstpageNavbar';
import inventory from '../images/inventory.jpg';

const Login = () => {
  return (
    <div className="min-h-screen bg-background text-foreground">
      <FirstpageNavbar />

      <div className="flex justify-center items-center p-4">
        <img src={inventory} alt="" className="max-h-[calc(100vh-12rem)] w-auto object-contain" />
      </div>
    </div>
  );
};

export default Login;
