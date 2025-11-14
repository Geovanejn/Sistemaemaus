import { createContext, useContext, useState, useEffect, ReactNode } from "react";
import { User } from "@shared/schema";

interface AuthContextType {
  user: Omit<User, "password"> | null;
  token: string | null;
  login: (user: Omit<User, "password">, token: string) => void;
  logout: () => void;
  isAuthenticated: boolean;
  isAdmin: boolean;
  isMember: boolean;
  isLoading: boolean;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

const SESSION_DURATION = 2 * 60 * 60 * 1000;

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<Omit<User, "password"> | null>(null);
  const [token, setToken] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    const storedToken = localStorage.getItem("token");
    const storedUser = localStorage.getItem("user");
    const loginTimestamp = localStorage.getItem("loginTimestamp");
    
    if (storedToken && storedUser && loginTimestamp) {
      const timeElapsed = Date.now() - parseInt(loginTimestamp);
      
      if (timeElapsed < SESSION_DURATION) {
        setToken(storedToken);
        setUser(JSON.parse(storedUser));
      } else {
        localStorage.removeItem("token");
        localStorage.removeItem("user");
        localStorage.removeItem("loginTimestamp");
      }
    }
    
    setIsLoading(false);
  }, []);

  useEffect(() => {
    if (!token) return;

    const loginTimestamp = localStorage.getItem("loginTimestamp");
    if (!loginTimestamp) return;

    const timeElapsed = Date.now() - parseInt(loginTimestamp);
    const timeRemaining = SESSION_DURATION - timeElapsed;

    if (timeRemaining <= 0) {
      handleSessionExpired();
      return;
    }

    const timeoutId = setTimeout(() => {
      handleSessionExpired();
    }, timeRemaining);

    return () => clearTimeout(timeoutId);
  }, [token]);

  const handleSessionExpired = () => {
    setUser(null);
    setToken(null);
    localStorage.removeItem("token");
    localStorage.removeItem("user");
    localStorage.removeItem("loginTimestamp");
    localStorage.setItem("sessionExpired", "true");
    window.location.reload();
  };

  const login = (userData: Omit<User, "password">, authToken: string) => {
    const timestamp = Date.now().toString();
    setUser(userData);
    setToken(authToken);
    localStorage.setItem("token", authToken);
    localStorage.setItem("user", JSON.stringify(userData));
    localStorage.setItem("loginTimestamp", timestamp);
    localStorage.removeItem("sessionExpired");
  };

  const logout = () => {
    setUser(null);
    setToken(null);
    localStorage.removeItem("token");
    localStorage.removeItem("user");
    localStorage.removeItem("loginTimestamp");
  };

  const value = {
    user,
    token,
    login,
    logout,
    isAuthenticated: !!token,
    isAdmin: user?.isAdmin ?? false,
    isMember: user?.isMember ?? false,
    isLoading,
  };

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (context === undefined) {
    throw new Error("useAuth must be used within an AuthProvider");
  }
  return context;
}
