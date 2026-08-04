import { create, type StoreApi, type UseBoundStore } from 'zustand';
import {
  bindConversationStoreToUser,
  resetConversationStoreInMemory,
} from './conversation.store';
import {
  clearAuthStorage,
  readAuthToken,
  readAuthUser,
  writeAuthToken,
  writeAuthUser,
} from '../utils/auth-storage';
import { isRecord } from '../utils/type-guards';

export type SessionUser = {
  id: string;
  name: string;
  role: string;
  email?: string | null;
};

type SessionState = {
  token: string | null;
  user: SessionUser | null;
  setSession: (token: string, user: SessionUser) => void;
  updateUser: (user: SessionUser) => void;
  clearSession: () => void;
};

function persistUser(user: SessionUser): void {
  writeAuthUser(user);
}

function readToken(): string | null {
  return readAuthToken();
}

function isSessionUser(value: unknown): value is SessionUser {
  if (!isRecord(value)) return false;
  const record = value;
  const email = record.email;
  return (
    typeof record.id === 'string'
    && typeof record.name === 'string'
    && typeof record.role === 'string'
    && (email === undefined || email === null || typeof email === 'string')
  );
}

function readUser(): SessionUser | null {
  return readAuthUser(isSessionUser);
}

export function getAuthToken(): string | null {
  return readToken();
}

const initialSessionUser = readUser();

export const useSessionStore: UseBoundStore<StoreApi<SessionState>> = create<SessionState>((set) => ({
  token: readToken(),
  user: initialSessionUser,
  setSession: (token, user) => {
    writeAuthToken(token);
    persistUser(user);
    bindConversationStoreToUser(user.id);
    set({ token, user });
  },
  updateUser: (user) => {
    persistUser(user);
    set({ user });
  },
  clearSession: () => {
    clearAuthStorage();
    resetConversationStoreInMemory();
    set({ token: null, user: null });
  },
}));

if (initialSessionUser) {
  bindConversationStoreToUser(initialSessionUser.id);
}
