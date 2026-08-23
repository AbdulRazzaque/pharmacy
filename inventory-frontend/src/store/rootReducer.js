import { combineReducers } from 'redux';
import { persistReducer } from 'redux-persist';
import storage from 'redux-persist/lib/storage';
import userReducer from './user/userReducer';

const userPersistConfig = {
  key: 'socket',
  storage,
  blacklist: ['state'],
};

export default combineReducers({
  inventoryUser: persistReducer(userPersistConfig, userReducer),
});
