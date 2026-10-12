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
import { getDriverProfile, getStudentProfile } from "../../services/firestoreService";
import "../../assets/styles/DriverLogin.css";

function DriverLogin() {
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
      // If previous session belonged to student or admin, cleanly sign out
      const activeRole = sessionStorage.getItem("scanigo_current_role");
      if (activeRole && activeRole !== "driver") {
        try {
          await signOut(auth);
          sessionStorage.removeItem("scanigo_current_role");
        } catch {
          /* ignore */
        }
      }

      // Check persistent "Remember Me" driver cookie or stored profile
      const remembered = getCookie("scanigo_remember_driver");
      const storedProfile = localStorage.getItem("scanigo_driver_profile") || localStorage.getItem("scanigo_driver");

      if (remembered || storedProfile) {
        try {
          const profile = storedProfile ? JSON.parse(storedProfile) : remembered;
          if (profile && profile.uid && profile.busNo && (profile.role === "driver" || !profile.role)) {
            sessionStorage.setItem("scanigo_current_role", "driver");
            navigate("/driver-dashboard", { state: profile });
          }
        } catch {
          /* ignore */
        }
      }
    };

    initAuth();
  }, [navigate]);

  // 2. Google Single Sign-On for Drivers
  const handleGoogleLogin = async () => {
    setErrorMsg("");
    setSuccessMsg("");
    setLoading(true);

    try {
      await configurePersistence(rememberMe);
      const result = await signInWithPopup(auth, googleProvider);
      const user = result.user;

      const driverPhoto =
        user.photoURL ||
        `https://ui-avatars.com/api/?name=${encodeURIComponent(user.displayName || "Driver")}&background=D97706&color=fff&size=128&bold=true`;

      // Check if driver profile exists
      const existingDriver = await getDriverProfile(user.uid);
      if (existingDriver && existingDriver.busNo) {
        const completeDriver = {
          ...existingDriver,
          photo: existingDriver.photo || driverPhoto,
          driverPhoto: existingDriver.driverPhoto || driverPhoto,
          role: "driver",
        };
        sessionStorage.setItem("scanigo_current_role", "driver");
        localStorage.setItem("scanigo_driver", JSON.stringify(completeDriver));
        localStorage.setItem("scanigo_driver_profile", JSON.stringify(completeDriver));
        if (rememberMe) setCookie("scanigo_remember_driver", completeDriver, 30);
        navigate("/driver-dashboard", { state: completeDriver });
        return;
      }

      // Check if account is actually registered as a student
      const studentProfile = await getStudentProfile(user.uid);
      if (studentProfile && !existingDriver) {
        setErrorMsg("This account is registered as a Student. Please use the Student Login portal.");
        await signOut(auth);
        setLoading(false);
        return;
      }

      const driverSession = {
        name: user.displayName || "Transit Driver",
        email: user.email,
        photo: driverPhoto,
        driverPhoto: driverPhoto,
        uid: user.uid,
        role: "driver",
      };

      sessionStorage.setItem("scanigo_current_role", "driver");
      localStorage.setItem("scanigo_driver_profile", JSON.stringify(driverSession));
      if (rememberMe) setCookie("scanigo_remember_driver", driverSession, 30);
      navigate("/driver-details", { state: driverSession });
    } catch (err) {
      if (err.code === "auth/popup-closed-by-user") {
        setErrorMsg("Google Sign-In was cancelled.");
      } else {
        setErrorMsg(err.message || "Failed to authenticate with Google. Please try again.");
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
      setErrorMsg("Please enter your operator email address.");
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
        /* ================= REGISTER DRIVER ================= */
        const trimmedName = name.trim();
        if (!trimmedName) {
          setErrorMsg("Please enter your full name.");
          setLoading(false);
          return;
        }
        if (trimmedPass.length < 6) {
          setErrorMsg("Password must be at least 6 characters long.");
          setLoading(false);
          return;
        }
        if (trimmedPass !== confirmPassword.trim()) {
          setErrorMsg("Passwords do not match. Please re-enter.");
          setLoading(false);
          return;
        }

        const { user, profile } = await registerUserAccount("driver", {
          name: trimmedName,
          email: trimmedEmail,
          password: trimmedPass,
        });

        const initialDriverData = {
          uid: user.uid,
          name: profile?.name || trimmedName,
          email: user.email || trimmedEmail,
          photo: profile?.photo,
          driverPhoto: profile?.photo,
          role: "driver",
        };

        sessionStorage.setItem("scanigo_current_role", "driver");
        localStorage.setItem("scanigo_driver_profile", JSON.stringify(initialDriverData));
        if (rememberMe) {
          setCookie("scanigo_remember_driver", initialDriverData, 30);
        }

        navigate("/driver-details", { state: initialDriverData });
      } else {
        /* ================= LOGIN DRIVER ================= */
        const { user, profile } = await loginUserAccount("driver", {
          email: trimmedEmail,
          password: trimmedPass,
        });

        // Verify if account is actually registered as a student
        if (!profile || !profile.busNo) {
          const studentDoc = await getStudentProfile(user.uid);
          if (studentDoc && (!profile || !profile.busNo)) {
            setErrorMsg("This account is registered as a Student. Please use the Student Login portal.");
            await signOut(auth);
            setLoading(false);
            return;
          }
        }

        const driverSession = {
          uid: user.uid,
          name: profile?.name || user.displayName || trimmedEmail.split("@")[0],
          email: user.email || trimmedEmail,
          photo: profile?.photo,
          driverPhoto: profile?.driverPhoto || profile?.photo,
          busNo: profile?.busNo,
          route: profile?.route,
          role: "driver",
        };

        sessionStorage.setItem("scanigo_current_role", "driver");

        if (profile && profile.busNo) {
          localStorage.setItem("scanigo_driver", JSON.stringify(driverSession));
          localStorage.setItem("scanigo_driver_profile", JSON.stringify(driverSession));
          if (rememberMe) {
            setCookie("scanigo_remember_driver", driverSession, 30);
          } else {
            deleteCookie("scanigo_remember_driver");
          }
          navigate("/driver-dashboard", { state: driverSession });
        } else {
          // If first-time driver without assigned bus:
          localStorage.setItem("scanigo_driver_profile", JSON.stringify(driverSession));
          if (rememberMe) {
            setCookie("scanigo_remember_driver", driverSession, 30);
          }
          navigate("/driver-details", { state: driverSession });
        }
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
        setErrorMsg(err.message || "Authentication failed. Please try again.");
      }
    } finally {
      setLoading(false);
    }
  };

  // 4. Real Firebase Forgot Password Dispatch with Resilient Fallback
  const handleForgotPasswordSubmit = async (e) => {
    e.preventDefault();
    setForgotFeedback({ error: "", success: "" });

    const trimmed = forgotEmail.trim();
    if (!trimmed) {
      setForgotFeedback({ error: "Please enter your registered email address.", success: "" });
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
        setForgotFeedback({ error: "No operator account found with this email address.", success: "" });
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
        <h1>Driver Console</h1>
        <p style={{ color: "#64748B", fontSize: "13.5px", marginTop: "4px" }}>
          {authMode === "login" ? "Sign in to broadcast live transit & scan passes" : "Register new transit operator credentials"}
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
            Register Driver
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
              <label>Operator Full Name</label>
              <input
                type="text"
                placeholder="e.g. Rahul Sharma"
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
            <label>Operator Email</label>
            <input
              type="email"
              placeholder="driver@scanigo.com"
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
                style={{ color: "#D97706", fontWeight: 600, cursor: "pointer", fontSize: "13px" }}
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
            {loading ? "Verifying..." : authMode === "login" ? "Sign In as Driver" : "Create Driver Account"}
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
              <h2 className="auth-modal-title">Reset Driver Password</h2>
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
                Enter your registered operator email address. We will dispatch a secure link to reset your password.
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
                  <label>Operator Email</label>
                  <input
                    type="email"
                    placeholder="driver@scanigo.com"
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

      {/* MOVING BUS TRANSIT ROAD */}
      <MovingBusRoad busColor="#F59E0B" />
    </div>
  );
}

export default DriverLogin;
