import React from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import BusTrackingView from "../../components/maps/BusTrackingView";

export default function BusTrackingPage() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();

  const studentProfile = (() => {
    try {
      const stored = localStorage.getItem("scanigo_student_profile");
      return stored ? JSON.parse(stored) : null;
    } catch {
      return null;
    }
  })();

  const busNo = searchParams.get("bus") || studentProfile?.busNo || "V11";
  const studentId = searchParams.get("student") || studentProfile?.regNo || studentProfile?.uid || "STUDENT";


  return (
    <div className="scanigo-app-shell">
      <div className="scanigo-mobile-frame">
        {/* Live Bus Tracking Map */}
        <div style={{ flex: 1, position: "relative" }}>
          <BusTrackingView
            busNo={busNo}
            studentId={studentId}
          />
        </div>

        {/* Bottom Back / Switcher bar */}
        <div style={{ background: "#FFFFFF", padding: "12px 16px", borderTop: "1px solid #E2E8F0", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
          <button
            onClick={() => navigate("/student-dashboard")}
            style={{ border: "none", background: "none", color: "#3B82F6", fontWeight: 700, fontSize: "14px", cursor: "pointer" }}
          >
            ← Student Dashboard
          </button>
        </div>
      </div>
    </div>
  );
}
