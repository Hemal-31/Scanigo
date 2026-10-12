import React from "react";
import { useNavigate } from "react-router-dom";
import BusTrackingView from "../../components/maps/BusTrackingView";
import "../../assets/styles/TrackerShowcase.css";

export default function TrackerShowcase() {
  const navigate = useNavigate();

  const handleStudentAccess = () => {
    try {
      const raw = localStorage.getItem("scanigo_student_profile");
      if (raw) {
        const student = JSON.parse(raw);
        if (student && student.email !== "hemal@scanigo.transit" && student.qrToken !== "SCANIGO-DEMO-717822P128" && (student.uid || student.email || student.regNo)) {
          navigate("/student-dashboard");
          return;
        } else {
          localStorage.removeItem("scanigo_student_profile");
        }
      }
    } catch {
      /* ignore */
    }

    alert("Please login first to start tracking your bus.");
    navigate("/student-login");
  };

  return (
    <div className="showcase-wrapper">
      {/* Top Controls & Navigation Bar */}
      <div className="showcase-top-bar">
        <div className="showcase-title-block">
          <h1>Scanigo Transit Design System</h1>
          <p>Exact 3-Screen Recreation for College & Corporate Shuttles</p>
        </div>

        <div className="showcase-nav-links">
          <button className="showcase-btn-link" onClick={() => navigate("/")}>
            🏠 Welcome Screen
          </button>
          <button className="showcase-btn-link" onClick={() => navigate("/bus-tracking")}>
            🚌 Live Bus Map
          </button>
          <button className="showcase-btn-link" onClick={handleStudentAccess}>
            🎓 Student Portal
          </button>
          <button className="showcase-btn-link" onClick={() => navigate("/driver-dashboard")}>
            📷 Driver Scanner & GPS
          </button>
          <button className="showcase-btn-link" onClick={() => navigate("/admin-dashboard")}>
            🛡️ Admin Dashboard (PDF)
          </button>
        </div>
      </div>

      {/* 3 Mobile Mockups Side-by-Side (Recreating user's exact attached image) */}
      <div className="showcase-phones-grid">
        
        {/* ================= PHONE 1: WELCOME SCREEN ================= */}
        <div className="mockup-iphone-frame">
          <div className="mockup-phone-content" style={{ background: "linear-gradient(180deg, #60A5FA 0%, #93C5FD 30%, #DBEAFE 55%, #F8FAFC 85%)" }}>
            <div style={{ padding: "24px 20px 8px", textAlign: "center" }}>
              <h2 style={{ fontFamily: "var(--font-heading)", fontSize: "24px", fontWeight: 800, color: "#FFFFFF", marginBottom: "4px" }}>
                School Bus Tracker
              </h2>
              <p style={{ fontSize: "13px", color: "rgba(255,255,255,0.95)" }}>
                Track your child's school bus in real time
              </p>
            </div>

            <div style={{ flex: 1, display: "flex", alignItems: "center", justifyContent: "center", overflow: "hidden" }}>
              <img
                src="/images/school_bus_welcome.jpg"
                alt="Bus Tracker"
                style={{ width: "100%", height: "100%", objectFit: "cover", objectPosition: "center bottom" }}
              />
            </div>

            <div style={{ padding: "16px 20px 20px", background: "#FFFFFF", display: "flex", flexDirection: "column", gap: "10px" }}>
              <button
                className="pill-btn pill-btn-blue"
                onClick={handleStudentAccess}
              >
                Start Tracking
              </button>
            </div>
          </div>
        </div>

        {/* ================= PHONE 2: REAL-TIME MAP & ROUTE VIEW ================= */}
        <div className="mockup-iphone-frame">
          <div className="mockup-phone-content">
            <div style={{ flex: 1, position: "relative" }}>
              <BusTrackingView
                busNo="V11"
                studentId="Enter Student ID"
              />
            </div>
          </div>
        </div>

        {/* ================= PHONE 3: JOURNEY STATUS & NOTIFICATIONS ================= */}
        <div className="mockup-iphone-frame">
          <div className="mockup-phone-content status-screen-content">
            {/* Header */}
            <div className="status-screen-header">
              <span style={{ fontSize: "16px", cursor: "pointer", color: "#64748B" }} onClick={() => navigate("/student-dashboard")}>
                ‹
              </span>
              <h2>Student Journey Status</h2>
            </div>

            {/* Card 1: Journey Timeline Progress */}
            <div className="timeline-tracker-card">
              {/* Step 1 */}
              <div className="timeline-step">
                <div className="timeline-step-icon-col">
                  <div className="timeline-circle circle-completed">✓</div>
                  <div className="timeline-line active" />
                </div>
                <div className="timeline-step-label">Bus Started</div>
              </div>

              {/* Step 2 */}
              <div className="timeline-step">
                <div className="timeline-step-icon-col">
                  <div className="timeline-circle circle-completed">✓</div>
                  <div className="timeline-line active" />
                </div>
                <div className="timeline-step-label">Student Picked Up</div>
              </div>

              {/* Step 3 */}
              <div className="timeline-step">
                <div className="timeline-step-icon-col">
                  <div className="timeline-circle circle-active">○</div>
                  <div className="timeline-line" />
                </div>
                <div className="timeline-step-label" style={{ color: "var(--primary-blue)" }}>
                  Bus is on the way to school
                </div>
              </div>

              {/* Step 4 */}
              <div className="timeline-step">
                <div className="timeline-step-icon-col">
                  <div className="timeline-circle circle-upcoming">•</div>
                </div>
                <div className="timeline-step-label" style={{ color: "#94A3B8" }}>
                  Greenfield Tech Campus
                </div>
              </div>
            </div>

            {/* Card 2: Notifications */}
            <div className="notifications-box-card">
              <div className="notifications-box-title">Notification</div>

              <div className="notif-pill-item">
                <div className="notif-pill-badge">✓</div>
                <div>
                  <div className="notif-pill-text">Student boarded</div>
                  <div className="notif-pill-sub">2 minute ago</div>
                </div>
              </div>

              <div className="notif-pill-item">
                <div className="notif-pill-badge">✓</div>
                <div>
                  <div className="notif-pill-text">Bus is arriving in 5 min</div>
                  <div className="notif-pill-sub">5 minute ago</div>
                </div>
              </div>

              <div className="notif-pill-item">
                <div className="notif-pill-badge">✓</div>
                <div>
                  <div className="notif-pill-text">Student Reached home</div>
                  <div className="notif-pill-sub">Completed</div>
                </div>
              </div>

              {/* Red Emergency Contact Action */}
              <a
                href="tel:+919840112345"
                className="pill-btn pill-btn-red"
                style={{ marginTop: "6px", textDecoration: "none" }}
              >
                <span>📞</span>
                <span>Emergency Contact</span>
              </a>
            </div>
          </div>
        </div>

      </div>
    </div>
  );
}
