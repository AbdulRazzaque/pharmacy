# Frontend Project Structure

## Centralized

- **`config/`** – App configuration
  - `index.js` – `API_BASE_URL`, `ROUTES`, `API_ENDPOINTS` (use for links and API calls)

- **`api/`** – API client
  - `client.js` – Axios instance with base URL and auth token (use instead of raw axios for authenticated requests)

- **`store/`** – Redux state
  - `index.js` – Store and persister
  - `rootReducer.js` – Combined reducers
  - `user/` – User reducer and actions

- **`utils/`** – Shared utilities
  - `auth.js` – getToken, setToken, removeToken, getUserInfo, setUserInfo, removeUserInfo
  - `fileDownload.js` – saveAs (blob download)

- **`lib/`** – Helpers
  - `utils.js` – cn() and other helpers

## Components

- **`components/ui/`** – Reusable UI (Button, Input, Card, Table, Alert, etc.)

- **`component/`** – Feature components
  - **`admin/`** – Dashboard: Layout, Sidebar, Home, Users, Products, Suppliers, **Locations**, AdminPanel, Demo
  - **`Pharmacy/`** – Stock: StockIn, StockOut, StockList, StockInDetails, StockOutDetails, StockOutSearch, TransactionList, Reports; Print/PDF views
  - **`users/`** – UserLogin
  - **`Navbar/`** – InventoryNavbar, FirstpageNavbar

## Naming

- **Locations** (was Addloactaion) – locations management
- Routes: use `ROUTES` from `config` where possible

## Usage

```js
import apiClient from '../api/client';
import { API_BASE_URL, ROUTES, API_ENDPOINTS } from '../config';

// API call with auth
const res = await apiClient.get(API_ENDPOINTS.locations);

// Navigation
navigate(ROUTES.reports);
```
