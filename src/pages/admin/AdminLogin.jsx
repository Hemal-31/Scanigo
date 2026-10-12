import React, { useState, useEffect } from "react";
import { signInWithPopup, signOut } from "firebase/auth";
import { auth, googleProvider } from "../../config/firebase";
import { useNavigate } from "react-router-dom";
import MovingBusRoad from "../../components/common/MovingBusRoad";
import { setCookie, getCookie, deleteCookie } from "../../utils/cookieUtils";
import {
  registerUserAccount,
  loginUserAccount,
  dispatchPasswordReset,
  configurePersistence,
} from "../../services/authService";
import { saveAdminProfile } from "../../services/firestoreService";
import "../../assets/styles/AdminLogin.css";

function AdminLogin() {
  const navigate = useNavigate();

  // Mode: 'login' | 'register'
  const [authMode, setAuthMode] = useState("login");

  // Form Fields
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [rememberMe, setRememberMe] = useState(true);

  // Status & Feedback
  const [errorMsg, setErrorMsg] = useState("");
  const [successMsg, setSuccessMsg] = useState("");
  const [loading, setLoading] = useState(false);

  // Forgot Password Modal
  const [showForgotModal, setShowForgotModal] = useState(false);
  const [forgotEmail, setForgotEmail] = useState("");
  const [forgotLoading, setForgotLoading] = useState(false);
  const [forgotFeedback, setForgotFeedback] = useState({ error: "", success: "" });

  // 1. Isolation & Session Restoration Check on Mount
  useEffect(() => {
    const initAuth = async () => {
      // If previous session belonged to student or driver, cleanly sign out
      const activeRole = sessionStorage.getItem("scanigo_current_role");
      if (activeRole && activeRole !== "admin") {
        try {
          await signOut(auth);
          sessionStorage.removeItem("scanigo_current_role");
        } catch {
          /* ignore */
        }
      }

      // Check persistent "Remember Me" admin cookie or stored profile
      const remembered = getCookie("scanigo_remember_admin");
      const storedProfile = localStorage.getItem("scanigo_admin_profile");

      if (remembered || storedProfile) {
        try {
          const profile = storedProfile ? JSON.parse(storedProfile) : remembered;
          if (profile && (profile.email || profile.uid) && (profile.role === "admin" || !profile.role)) {
            sessionStorage.setItem("scanigo_current_role", "admin");
            navigate("/admin-dashboard", { state: profile });
          }
        } catch {
          /* ignore */
        }
      }
    };

    initAuth();
  }, [navigate]);

  // 2. Google Single Sign-On for Admins
  const handleGoogleLogin = async () => {
    setErrorMsg("");
    setSuccessMsg("");
    setLoading(true);

    try {
      await configurePersistence(rememberMe);
      const result = await signInWithPopup(auth, googleProvider);
      const user = result.user;

      const profile = await saveAdminProfile(user.uid, {
        name: user.displayName || "Admin Officer",
        email: user.email,
        photo: user.photoURL,
        role: "admin",
      });

      const adminSession = {
        name: profile.name,
        email: profile.email,
        photo: profile.photo,
        uid: user.uid,
        role: "admin",
      };

      sessionStorage.setItem("scanigo_current_role", "admin");
      localStorage.setItem("scanigo_admin_profile", JSON.stringify(adminSession));
      if (rememberMe) {
        setCookie("scanigo_remember_admin", adminSession, 30);
      } else {
        deleteCookie("scanigo_remember_admin");
      }

      navigate("/admin-dashboard", { state: adminSession });
    } catch (err) {
      if (err.code === "auth/popup-closed-by-user") {
        setErrorMsg("Google Sign-In was cancelled.");
      } else {
        setErrorMsg(err.message || "Failed to sign in with Google. Please try again.");
      }
    } finally {
      setLoading(false);
    }
  };

  // 3. Email & Password Submission (Login / Register) with Resilient Firestore Fallback
  const handleSubmit = async (e) => {
    e.preventDefault();
    setErrorMsg("");
    setSuccessMsg("");

    const trimmedEmail = email.trim();
    const trimmedPass = password.trim();

    if (!trimmedEmail) {
      setErrorMsg("Please enter your administrator email address.");
      return;
    }
    if (!trimmedPass) {
      setErrorMsg("Please enter your password.");
      return;
    }

    setLoading(true);

    try {
      await configurePersistence(rememberMe);

      if (authMode === "register") {
        /* ================= REGISTER ADMIN ================= */
        const trimmedName = name.trim();
        if (!trimmedName) {
          setErrorMsg("Please enter your full name.");
          setLoading(false);
          return;
        }
        if (trimmedPass.length < 6) {
          setErrorMsg("Admin password must be at least 6 characters long.");
          setLoading(false);
          return;
        }
        if (trimmedPass !== confirmPassword.trim()) {
          setErrorMsg("Passwords do not match. Please re-enter.");
          setLoading(false);
          return;
        }

        const { user, profile } = await registerUserAccount("admin", {
          name: trimmedName,
          email: trimmedEmail,
          password: trimmedPass,
        });

        const adminSession = {
          uid: user.uid,
          name: profile?.name || trimmedName,
          email: user.email || trimmedEmail,
          photo: profile?.photo,
          role: "admin",
        };

        sessionStorage.setItem("scanigo_current_role", "admin");
        localStorage.setItem("scanigo_admin_profile", JSON.stringify(adminSession));
        if (rememberMe) {
          setCookie("scanigo_remember_admin", adminSession, 30);
        }

        navigate("/admin-dashboard", { state: adminSession });
      } else {
        /* ================= LOGIN ADMIN ================= */
        const { user, profile } = await loginUserAccount("admin", {
          email: trimmedEmail,
          password: trimmedPass,
        });

        const adminSession = {
          uid: user.uid,
          name: profile?.name || user.displayName || trimmedEmail.split("@")[0].toUpperCase(),
          email: user.email || trimmedEmail,
          photo: profile?.photo,
          role: "admin",
        };

        sessionStorage.setItem("scanigo_current_role", "admin");
        localStorage.setItem("scanigo_admin_profile", JSON.stringify(adminSession));
        if (rememberMe) {
          setCookie("scanigo_remember_admin", adminSession, 30);
        } else {
          deleteCookie("scanigo_remember_admin");
        }

        navigate("/admin-dashboard", { state: adminSession });
      }
    } catch (err) {
      if (err.code === "auth/email-already-in-use") {
        setErrorMsg("This email is already registered. Please switch to 'Sign In' mode.");
      } else if (err.code === "auth/user-not-found" || err.code === "auth/invalid-credential") {
        setErrorMsg("Invalid credentials or account not found. If new, please switch to 'Register'.");
      } else if (err.code === "auth/wrong-password") {
        setErrorMsg("Incorrect password. Please verify or use 'Forgot Password?'.");
      } else if (err.code === "auth/weak-password") {
        setErrorMsg("Password is too weak. Please choose a password with 6+ characters.");
      } else if (err.code === "auth/invalid-email") {
        setErrorMsg("Please enter a valid email address.");
      } else {
        setErrorMsg(err.message || "Authentication error. Please try again.");
      }
    } finally {
      setLoading(false);
    }
  };

  // 4. Real Firebase Forgot Password Dispatch with Graceful Fallback
  const handleForgotPasswordSubmit = async (e) => {
    e.preventDefault();
    setForgotFeedback({ error: "", success: "" });

    const trimmed = forgotEmail.trim();
    if (!trimmed) {
      setForgotFeedback({ error: "Please enter your administrator email address.", success: "" });
      return;
    }

    setForgotLoading(true);
    try {
      const res = await dispatchPasswordReset(trimmed);
      setForgotFeedback({
        error: "",
        success: res.message,
      });
    } catch (err) {
      if (err.code === "auth/user-not-found") {
        setForgotFeedback({ error: "No administrator account found with this email address.", success: "" });
      } else if (err.code === "auth/invalid-email") {
        setForgotFeedback({ error: "Please provide a valid email format.", success: "" });
      } else {
        setForgotFeedback({ error: err.message || "Failed to dispatch reset email. Please try again.", success: "" });
      }
    } finally {
      setForgotLoading(false);
    }
  };

  return (
    <div className="container">
      {/* LOGO + TITLE */}
      <div className="logo-container">
        <div className="logo"></div>
        <h1>Fleet Administration</h1>
        <p style={{ color: "#64748B", fontSize: "13.5px", marginTop: "4px" }}>
          {authMode === "login" ? "Secure access to dispatch, tracking & student rosters" : "Register authorized campus transport officer"}
        </p>
      </div>

      {/* LOGIN / REGISTER CARD */}
      <div className="login-card">
        {/* SEGMENTED SWITCHER */}
        <div className="auth-tabs">
          <button
            type="button"
            className={`auth-tab-btn ${authMode === "login" ? "active" : ""}`}
            onClick={() => {
              setAuthMode("login");
              setErrorMsg("");
              setSuccessMsg("");
            }}
          >
            Sign In
          </button>
          <button
            type="button"
            className={`auth-tab-btn ${authMode === "register" ? "active" : ""}`}
            onClick={() => {
              setAuthMode("register");
              setErrorMsg("");
              setSuccessMsg("");
            }}
          >
            Register Officer
          </button>
        </div>

        {/* FEEDBACK BANNERS */}
        {errorMsg && (
          <div
            style={{
              background: "#FEF2F2",
              border: "1px solid #FCA5A5",
              color: "#DC2626",
              padding: "10px 14px",
              borderRadius: "10px",
              fontSize: "13px",
              fontWeight: 500,
            }}
          >
            ⚠️ {errorMsg}
          </div>
        )}

        {successMsg && (
          <div
            style={{
              background: "#F0FDF4",
              border: "1px solid #86EFAC",
              color: "#16A34A",
              padding: "10px 14px",
              borderRadius: "10px",
              fontSize: "13px",
              fontWeight: 500,
            }}
          >
            ✓ {successMsg}
          </div>
        )}

        <form onSubmit={handleSubmit}>
          {authMode === "register" && (
            <div className="form-group">
              <label>Administrator Full Name</label>
              <input
                type="text"
                placeholder="e.g. Dean of Transport / Ops Lead"
                value={name}
                onChange={(e) => {
                  setName(e.target.value);
                  if (errorMsg) setErrorMsg("");
                }}
                required
              />
            </div>
          )}

          <div className="form-group">
            <label>Admin Email</label>
            <input
              type="email"
              placeholder="admin@school.edu / admin@scanigo.com"
              value={email}
              onChange={(e) => {
                setEmail(e.target.value);
                if (errorMsg) setErrorMsg("");
              }}
              required
            />
          </div>

          <div className="form-group">
            <label>Password</label>
            <input
              type="password"
              placeholder="Enter password (min 6 characters)"
              value={password}
              onChange={(e) => {
                setPassword(e.target.value);
                if (errorMsg) setErrorMsg("");
              }}
              required
            />
          </div>

          {authMode === "register" && (
            <div className="form-group">
              <label>Confirm Password</label>
              <input
                type="password"
                placeholder="Re-enter password"
                value={confirmPassword}
                onChange={(e) => {
                  setConfirmPassword(e.target.value);
                  if (errorMsg) setErrorMsg("");
                }}
                required
              />
            </div>
          )}

          {/* REMEMBER ME + FORGOT PASSWORD */}
          <div className="remember-row">
            <label className="remember-label">
              <input
                type="checkbox"
                className="remember-checkbox"
                checked={rememberMe}
                onChange={(e) => setRememberMe(e.target.checked)}
              />
              Remember me
            </label>

            {authMode === "login" && (
              <span
                style={{ color: "#3B82F6", fontWeight: 600, cursor: "pointer", fontSize: "13px" }}
                onClick={() => {
                  setForgotEmail(email);
                  setForgotFeedback({ error: "", success: "" });
                  setShowForgotModal(true);
                }}
              >
                Forgot Password?
              </span>
            )}
          </div>

          <button type="submit" className="login-btn" disabled={loading}>
            {loading ? "Authenticating..." : authMode === "login" ? "Login to Admin Panel" : "Register Administrator"}
          </button>
        </form>

        <div style={{ display: "flex", alignItems: "center", margin: "4px 0" }}>
          <div style={{ flex: 1, height: "1px", background: "#E2E8F0" }}></div>
          <span style={{ padding: "0 10px", color: "#94A3B8", fontSize: "12px", textTransform: "uppercase", fontWeight: 600 }}>OR</span>
          <div style={{ flex: 1, height: "1px", background: "#E2E8F0" }}></div>
        </div>

        <button type="button" className="google-btn" onClick={handleGoogleLogin} disabled={loading}>
          🔐 Sign in with Google
        </button>
      </div>

      {/* FORGOT PASSWORD MODAL */}
      {showForgotModal && (
        <div className="auth-modal-overlay" onClick={() => setShowForgotModal(false)}>
          <div className="auth-modal-card" onClick={(e) => e.stopPropagation()}>
            <div className="auth-modal-header">
              <h2 className="auth-modal-title">Reset Admin Password</h2>
              <button
                type="button"
                className="auth-modal-close"
                onClick={() => setShowForgotModal(false)}
              >
                ✕
              </button>
            </div>

            <div className="auth-modal-body">
              <p>
                Enter your registered administrator email address. We will dispatch a secure link to reset your password.
              </p>

              {forgotFeedback.error && (
                <div
                  style={{
                    background: "#FEF2F2",
                    border: "1px solid #FCA5A5",
                    color: "#DC2626",
                    padding: "10px 14px",
                    borderRadius: "10px",
                    fontSize: "13px",
                    marginBottom: "14px",
                    fontWeight: 500,
                  }}
                >
                  ⚠️ {forgotFeedback.error}
                </div>
              )}

              {forgotFeedback.success && (
                <div
                  style={{
                    background: "#F0FDF4",
                    border: "1px solid #86EFAC",
                    color: "#16A34A",
                    padding: "10px 14px",
                    borderRadius: "10px",
                    fontSize: "13px",
                    marginBottom: "14px",
                    fontWeight: 500,
                  }}
                >
                  ✓ {forgotFeedback.success}
                </div>
              )}

              <form onSubmit={handleForgotPasswordSubmit}>
                <div className="form-group" style={{ marginBottom: "16px" }}>
                  <label>Administrator Email</label>
                  <input
                    type="email"
                    placeholder="admin@school.edu"
                    value={forgotEmail}
                    onChange={(e) => setForgotEmail(e.target.value)}
                    required
                  />
                </div>

                <div style={{ display: "flex", gap: "10px" }}>
                  <button
                    type="button"
                    style={{
                      flex: 1,
                      padding: "12px",
                      background: "#F1F5F9",
                      border: "none",
                      borderRadius: "9999px",
                      color: "#475569",
                      fontWeight: 600,
                      cursor: "pointer",
                    }}
                    onClick={() => setShowForgotModal(false)}
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    className="login-btn"
                    style={{ flex: 1, margin: 0 }}
                    disabled={forgotLoading}
                  >
                    {forgotLoading ? "Dispatching..." : "Send Reset Link"}
                  </button>
                </div>
              </form>
            </div>
          </div>
        </div>
      )}

      {/* MOVING BUS ROAD */}
      <MovingBusRoad busColor="#3B82F6" />
    </div>
  );
}

export default AdminLogin;
