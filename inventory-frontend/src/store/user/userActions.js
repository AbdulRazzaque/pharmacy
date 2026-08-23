import axios from 'axios';
import { API_BASE_URL } from '../../config';

export const setUser = (user) => ({
  type: 'SET_USER',
  payload: user,
});

export const storeUserInfo = (info) => ({
  type: 'STORE_USERINFO',
  payload: info,
});

export const getUserInfo = (token) => {
  return async (dispatch) => {
    return await axios
      .get(`${API_BASE_URL}/api/user/single`, { headers: { token } })
      .then((res) => {
        dispatch(storeUserInfo(res.data.result));
      })
      .catch(() => {});
  };
};

export const storeMerchant = (merchant) => ({
  type: 'STORE_MERCHANT',
  payload: merchant,
});

export const deleteUser = () => ({
  type: 'DELETE_USER',
});

export const storeOrderId = (id) => ({
  type: 'STORE_ORDER_ID',
  payload: id,
});

export const storeEmi = (emi) => ({
  type: 'STORE_EMI',
  payload: emi,
});
