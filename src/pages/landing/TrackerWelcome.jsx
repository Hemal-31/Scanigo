import React from "react";
import { useNavigate } from "react-router-dom";
import { getCookie } from "../../utils/cookieUtils";
import "../../assets/styles/TrackerWelcome.css";

export default function TrackerWelcome() {
  const navigate = useNavigate();

  const handleStartTracking = () => {
    try {
      const cookie = getCookie("scanigo_remember_student");
      const raw = localStorage.getItem("scanigo_student_profile");
      const student = raw ? JSON.parse(raw) : cookie;
      if (student && student.email !== "hemal@scanigo.transit" && student.qrToken !== "SCANIGO-DEMO-717822P128" && (student.uid || student.email || student.regNo)) {
        navigate("/student-dashboard");
        return;
      } else if (raw) {
        localStorage.removeItem("scanigo_student_profile");
      }
    } catch {
      /* ignore */
    }

    alert("Please login first to start tracking your bus.");
    navigate("/student-login");
  };

  return (
    <div className="welcome-screen-shell">
      <div className="welcome-screen-container">
        {/* Full-bleed Campus Backdrop */}
        <div className="welcome-hero-backdrop">
          <img
            src="/images/scanigo_entry_bg.jpg"
            alt="Scanigo Campus Transit"
            className="welcome-fullbleed-img"
          />
          <div className="welcome-hero-overlay" />
        </div>

        {/* Scrollable / Positioned Content */}
        <div className="welcome-content-layer">
          {/* Top Status Bar */}
          <div className="welcome-top-status-row">
            <div className="welcome-live-badge">
              <span className="live-green-dot"></span>
              <span>Live Transit Network</span>
            </div>
          </div>

          {/* Main Title & Brand Header */}
          <div className="welcome-brand-section">
            <div className="welcome-brand-logo-row">
              <span className="welcome-brand-name">Scanigo</span>
              <div className="welcome-brand-pin">
                <span className="welcome-pin-s">S</span>
              </div>
            </div>

            <h1 className="welcome-main-title">Campus & Transit Tracker</h1>

            <p className="welcome-main-subtext">
              Real-time GPS tracking, instant QR boarding passes, and smart assistance for a safer and smarter campus commute.
            </p>

            <div className="welcome-handwritten-tag">
              <div className="handwritten-text-group">
                <span className="handwritten-line">Your Campus</span>
                <span className="handwritten-line">
                  Ride, Simplified
                  <svg className="handwritten-rays" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round">
                    <line x1="4" y1="6" x2="10" y2="2"></line>
                    <line x1="6" y1="12" x2="14" y2="9"></line>
                    <line x1="4" y1="18" x2="11" y2="19"></line>
                  </svg>
                </span>
              </div>
            </div>
          </div>

          {/* Floating Next Bus Arriving Glass Widget */}
          <div
            className="welcome-next-bus-widget"
            onClick={handleStartTracking}
            role="button"
            tabIndex={0}
          >
            <div className="widget-transit-route-col">
              <div className="widget-route-dot"></div>
              <div className="widget-route-line"></div>
              <div className="widget-route-bus-icon">🚌</div>
            </div>

            <div className="widget-bus-info-col">
              <div className="widget-live-label">
                <span className="widget-green-dot"></span>
                <span>LIVE TRACKING</span>
              </div>
              <div className="widget-arrival-title">Campus Transit Network</div>
              <div className="widget-arrival-time">Live Fleet Tracking</div>

            </div>

            <div className="widget-arrow-btn">
              <span>➔</span>
            </div>
          </div>

          {/* Spacer to push actions down */}
          <div className="welcome-spacer"></div>

          {/* Primary CTA Button */}
          <button
            type="button"
            className="welcome-hero-cta-btn"
            onClick={handleStartTracking}
          >
            <div className="cta-left-content">
              <span className="cta-rocket-icon">🚀</span>
              <span className="cta-btn-text">Start Live Bus Tracking</span>
            </div>
            <div className="cta-arrow-circle">
              <span>➔</span>
            </div>
          </button>

          {/* 3 White Role Cards */}
          <div className="welcome-roles-cards-grid">
            {/* Student Card */}
            <div
              className="welcome-white-role-card role-student"
              onClick={() => navigate("/student-login")}
            >
              <div className="role-icon-circle bg-blue-circle">
                <span>🎓</span>
              </div>
              <div className="role-card-title">Student</div>
              <div className="role-card-subtitle">Track Buses & Get QR Passes</div>
              <div className="role-card-arrow-btn arrow-blue">
                <span>➔</span>
              </div>
            </div>

            {/* Driver Card */}
            <div
              className="welcome-white-role-card role-driver"
              onClick={() => navigate("/driver-login")}
            >
              <div className="role-icon-circle bg-green-circle">
                <span>🚌</span>
              </div>
              <div className="role-card-title">Driver</div>
              <div className="role-card-subtitle">Scan QR & Navigate Routes</div>
              <div className="role-card-arrow-btn arrow-green">
                <span>➔</span>
              </div>
            </div>

            {/* Admin Card */}
            <div
              className="welcome-white-role-card role-admin"
              onClick={() => navigate("/admin-login")}
            >
              <div className="role-icon-circle bg-purple-circle">
                <span>👤</span>
              </div>
              <div className="role-card-title">Admin</div>
              <div className="role-card-subtitle">Manage Fleet & View Insights</div>
              <div className="role-card-arrow-btn arrow-purple">
                <span>➔</span>
              </div>
            </div>
          </div>

          {/* Social Proof Footer */}
          <div className="welcome-social-proof-footer">
            <div className="footer-avatar-stack">
              <img src="https://images.unsplash.com/photo-1534528741775-53994a69daeb?w=64&h=64&fit=crop&crop=faces" alt="Student" className="stack-avatar" />
              <img src="https://images.unsplash.com/photo-1507003211169-0a1dd7228f2d?w=64&h=64&fit=crop&crop=faces" alt="Student" className="stack-avatar" />
              <img src="https://images.unsplash.com/photo-1494790108377-be9c29b29330?w=64&h=64&fit=crop&crop=faces" alt="Student" className="stack-avatar" />
              <img src="https://images.unsplash.com/photo-1500648767791-00dcc994a43e?w=64&h=64&fit=crop&crop=faces" alt="Student" className="stack-avatar" />
            </div>
            <span className="footer-proof-text">Trusted by thousands of students</span>
          </div>
        </div>
      </div>
    </div>
  );
}


