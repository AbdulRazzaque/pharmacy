import { createStore, applyMiddleware } from 'redux';
import logger from 'redux-logger';
import thunk from 'redux-thunk';
import { persistStore, persistReducer } from 'redux-persist';
import storage from 'redux-persist/lib/storage';
import rootReducer from './rootReducer';

const persistConfig = {
  key: 'root',
  storage,
  blacklist: ['loading'],
};

const persistedReducer = persistReducer(persistConfig, rootReducer);
const middlewares = [logger, thunk];

export const store = createStore(persistedReducer, applyMiddleware(...middlewares));
export const persister = persistStore(store);
export { persister as Persister };
