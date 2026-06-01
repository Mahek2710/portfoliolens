import { useState, useEffect } from "react";
import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import Landing   from "./Landing";
import Auth      from "./Auth";
import Dashboard from "./Dashboard";
import api       from "./api";

export default function App() {
  const [user, setUser]       = useState(null);
  const [checking, setChecking] = useState(true);

  // On first load, check if there's a valid token in localStorage
  // If yes, verify it with /auth/me and restore the session
  useEffect(() => {
    const stored = localStorage.getItem("pl_user");
    const token  = localStorage.getItem("pl_token");

    if (stored && token) {
      // Verify token is still valid with the backend
      api.get("/auth/me")
        .then(res => {
          setUser(res.data);
        })
        .catch(() => {
          // Token expired or invalid — clear it
          localStorage.removeItem("pl_token");
          localStorage.removeItem("pl_user");
        })
        .finally(() => setChecking(false));
    } else {
      setChecking(false);
    }
  }, []);

  const handleAuth = (userData) => setUser(userData);

  const handleLogout = () => {
    localStorage.removeItem("pl_token");
    localStorage.removeItem("pl_user");
    setUser(null);
  };

  // Don't flash the login page while checking token
  if (checking) {
    return (
      <div style={{
        minHeight: "100vh", display: "flex",
        alignItems: "center", justifyContent: "center",
        background: "var(--bg)", color: "var(--text3)",
        fontSize: 13, fontFamily: "DM Sans, sans-serif"
      }}>
        Loading...
      </div>
    );
  }

  return (
    <BrowserRouter>
      <Routes>
        <Route path="/"          element={<Landing />} />
        <Route path="/login"     element={
          user ? <Navigate to="/dashboard" replace /> : <Auth mode="login"  onAuth={handleAuth} />
        } />
        <Route path="/signup"    element={
          user ? <Navigate to="/dashboard" replace /> : <Auth mode="signup" onAuth={handleAuth} />
        } />
        <Route path="/dashboard" element={
          user
            ? <Dashboard user={user} onLogout={handleLogout} />
            : <Navigate to="/login" replace />
        } />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </BrowserRouter>
  );
}