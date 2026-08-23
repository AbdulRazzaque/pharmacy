import React from 'react';
import InventoryNavbar from '../Navbar/InventoryNavbar';
import ComponentPlaceholder from '../ComponentPlaceholder';

const Stockoutsearch = () => {
  return (
    <div>
      <InventoryNavbar />
      <ComponentPlaceholder 
        componentName="Stock Out Search" 
        message="Search and view stock-out transactions by document number."
      />
    </div>
  );
};

export default Stockoutsearch;
