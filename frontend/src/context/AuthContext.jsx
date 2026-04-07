import { createContext, useContext, useEffect, useMemo, useState } from "react";

import api from "../services/api";

const AuthContext = createContext(null);

const decodeUserFromToken = (token) => {
  try {
    const payload = token.split(".")[1];
    if (!payload) {
      return null;
    }

    const normalized = payload.replace(/-/g, "+").replace(/_/g, "/");
    const padded = normalized.padEnd(
      normalized.length + ((4 - (normalized.length % 4)) % 4),
      "=",
    );
    const json = atob(padded);

    return JSON.parse(json);
  } catch {
    return null;
  }
};

export const AuthProvider = ({ children }) => {
  const [token, setToken] = useState(
    () => localStorage.getItem("token") || null,
  );
  const [username, setUsername] = useState("");
  const [user, setUser] = useState(() => {
    const storedToken = localStorage.getItem("token");

    try {
      const u = localStorage.getItem("user");
      if (u) {
        return JSON.parse(u);
      }

      return storedToken ? decodeUserFromToken(storedToken) : null;
    } catch {
      return storedToken ? decodeUserFromToken(storedToken) : null;
    }
  });

  const login = (
    receivedToken,
    userData = decodeUserFromToken(receivedToken),
  ) => {
    localStorage.setItem("token", receivedToken);
    sessionStorage.removeItem("portsense_account_cache");
    localStorage.setItem("user", JSON.stringify(userData));
    setToken(receivedToken);
    setUser(userData);
  };

  const logout = () => {
    localStorage.removeItem("token");
    sessionStorage.removeItem("portsense_account_cache");
    localStorage.removeItem("user");
    setUsername("");
    setToken(null);
    setUser(null);
  };

  const decodedToken = useMemo(
    () => user || decodeUserFromToken(token),
    [user, token],
  );

  const tokenExpiryMs = useMemo(() => {
    const exp = Number(decodedToken?.exp);
    if (!Number.isFinite(exp)) {
      return null;
    }

    return exp * 1000;
  }, [decodedToken]);

  const isTokenExpired = useMemo(() => {
    if (!token) {
      return true;
    }

    if (tokenExpiryMs === null) {
      return false;
    }

    return Date.now() >= tokenExpiryMs;
  }, [token, tokenExpiryMs]);

  const isDemo = useMemo(() => Boolean(decodedToken?.is_demo), [decodedToken]);

  useEffect(() => {
    const storedToken = localStorage.getItem("token");

    if (!storedToken || isTokenExpired) {
      setUsername("");
      return;
    }

    let cancelled = false;

    const fetchUsername = async () => {
      try {
        const res = await api.get("/api/auth/me");
        if (!cancelled) {
          setUsername(res.data?.username || "");
        }
      } catch {
        if (!cancelled) {
          setUsername("");
        }
      }
    };

    fetchUsername();

    return () => {
      cancelled = true;
    };
  }, [token, isTokenExpired]);

  const value = useMemo(
    () => ({
      user,
      username,
      token,
      login,
      logout,
      decodedToken,
      tokenExpiryMs,
      isTokenExpired,
      isDemo,
    }),
    [
      user,
      username,
      token,
      decodedToken,
      tokenExpiryMs,
      isTokenExpired,
      isDemo,
    ],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
};

export const useAuth = () => {
  const context = useContext(AuthContext);

  if (!context) {
    throw new Error("useAuth must be used within an AuthProvider");
  }

  return context;
};
