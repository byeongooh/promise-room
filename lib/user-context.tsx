"use client";

import { createContext, useContext, useState, useEffect, type ReactNode } from "react";

interface UserContextType {
  currentUser: string | null;
  setCurrentUser: (name: string) => void;
  logout: () => void;
}

const UserContext = createContext<UserContextType | undefined>(undefined);

export function UserProvider({ children }: { children: ReactNode }) {
  const [currentUser, setCurrentUserState] = useState<string | null>(null);

  useEffect(() => {
    const savedUser = sessionStorage.getItem("currentUser");
    if (savedUser) {
      setCurrentUserState(savedUser);
    }
  }, []);

  const setCurrentUser = (name: string) => {
    setCurrentUserState(name);
    sessionStorage.setItem("currentUser", name);
  };

  const logout = () => {
    setCurrentUserState(null);
    sessionStorage.removeItem("currentUser");
  };

  return (
    <UserContext.Provider value={{ currentUser, setCurrentUser, logout }}>
      {children}
    </UserContext.Provider>
  );
}

// ✅ 이 부분이 핵심: useUser 훅 export
export function useUser() {
  const context = useContext(UserContext);
  if (context === undefined) {
    throw new Error("useUser must be used within a UserProvider");
  }
  return context;
}
