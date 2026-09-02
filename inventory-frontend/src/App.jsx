import Login from "./component/Login";
import { Routes, Route } from "react-router-dom";

import AdminLogin from "./component/auth/AdminLogin";
import AdminPanel from "./component/auth/AdminPanel";
import Addproducts from "./component/form/Addproducts";
import Addsuppliers from "./component/form/Addsuppliers";
import Locations from "./component/form/AddLocations";
import UserLogin from "./component/users/UserLogin";

import Stockout from "./component/stockout/Stockout";

import Stockin from "./component/stockin/Stockin";
import StockList from "./component/stock/StockList";
import SellingPriceUpdate from "./component/stock/SellingPriceUpdate";
import Stockinprint from "./component/stockin/Stockinprint";
import Stockoutprint from "./component/stockout/Stockoutprint";
import Transactionlist from "./component/stock/Transactionlist";
import StockDetails from "./component/stock/StockDetails";
import StockInDetails from "./component/stockin/StockInDetails";
import StockOutDetails from "./component/stockout/StockOutDetails";
import Reports from "./component/report/Reports";
import Stockoutsearch from "./component/stockout/Stockoutsearch";
import StockAdjustment from "./component/stock/StockAdjustment";

import Stockoutpdf from "./component/stockout/Stockoutpdf";
import StockInDocsList from "./component/stockin/StockInDocsList";
import StockInDocExcelEdit from "./component/stockin/StockInDocExcelEdit";
import StockOutDocsList from "./component/stockout/StockOutDocsList";
import StockOutDocExcelEdit from "./component/stockout/StockOutDocExcelEdit";

// Dashboard Components
import DashboardLayout from "./component/Dashboard/DashboardLayout";
import DashboardHome from "./component/Dashboard/DashboardHome";
import DashboardUsers from "./component/Dashboard/DashboardUsers";


function App() {
  return (
    <div className="App min-h-screen bg-background text-foreground">
      <Routes>
        {/* Login Routes */}
        <Route path="/" element={<Login />} /> 
        <Route path="/adminlogin" element={<AdminLogin />}/>
        <Route path="/userlogin" element={<UserLogin/>} />

        <Route path="/dashboard" element={<DashboardLayout />}>
          <Route index element={<DashboardHome />} />
          <Route path="users" element={<DashboardUsers />} />
          <Route path="products" element={<Addproducts />} />
          <Route path="suppliers" element={<Addsuppliers />} />
          <Route path="locations" element={<Locations />} />
          <Route path="stockin" element={<Stockin />} />
          <Route path="stockout" element={<Stockout />} />
          <Route path="StockList" element={<StockList />} />
          <Route path="selling-price-update" element={<SellingPriceUpdate />} />
          <Route path="stock-details" element={<StockDetails />} />
          <Route path="stock-adjustment" element={<StockAdjustment />} />
          <Route path="reports" element={<Reports />} />
          <Route path="stockin-docs" element={<StockInDocsList />} />
          <Route path="stockin-docs/:docNo" element={<StockInDocExcelEdit />} />
          <Route path="stockout-docs" element={<StockOutDocsList />} />
          <Route path="stockout-docs/:docNo" element={<StockOutDocExcelEdit />} />

          <Route path="stockoutsearch" element={<Stockoutsearch />} />
          <Route path="transactionlist/:slug" element={<Transactionlist />} />
          <Route path="StockInDetails/:docNo" element={<StockInDetails />} />
          <Route path="StockOutDetails/:docNo" element={<StockOutDetails />} />
          <Route path="StockInDetails/:id" element={<StockInDetails />} />
        </Route>

        {/* Legacy Routes (for backward compatibility) */}
        <Route path="/adminpanel" element={<AdminPanel />}/>
        <Route path="/addproducts" element={<Addproducts />} />
        <Route path="/Addsuppliers" element={<Addsuppliers />} />
        <Route path="/Addloactaion" element={<Locations />} />
        <Route path="/StockList" element={<StockList />} />
        <Route path="/selling-price-update" element={<SellingPriceUpdate />} />
        <Route path="/stockin" element={<Stockin />} />
        <Route path="/stockout" element={<Stockout />} />
        <Route path="/stockinprint" element={<Stockinprint />} />
        <Route path="/transactionlist/:slug" element={<Transactionlist />} />
        <Route path="/stockoutprint" element={<Stockoutprint />} />
        <Route path="/StockInDetails/:docNo" element={<StockInDetails />} />
        <Route path="/StockOutDetails/:docNo" element={<StockOutDetails />} />
        <Route path="/stockoutsearch" element={<Stockoutsearch />} />
        <Route path="/StockInDetails/:id" element={<StockInDetails />} />
        
        {/* PDF and Print Routes */}
        <Route path="/stockoutpdf/:id" element={<Stockoutpdf />} />
        <Route path="/stockinprint" element={<Stockinprint />} />
        <Route path="/stockoutprint" element={<Stockoutprint />} />
        
     
      </Routes>
    </div>
  );
}

export default App;
