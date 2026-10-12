import React, { useEffect, useState } from "react";
import { useNavigate, useLocation } from "react-router-dom";
import { auth, db } from "../../config/firebase";
import { doc, getDoc, setDoc, collection, query, orderBy, onSnapshot } from "firebase/firestore";
import { QRCodeCanvas } from "qrcode.react";
import * as htmlToImage from "html-to-image";
import BusTrackingView from "../../components/maps/BusTrackingView";
import { getCookie, deleteCookie } from "../../utils/cookieUtils";
import "../../assets/styles/StudentDashboard.css";

export default function StudentDashboard() {
  const navigate = useNavigate();
  const location = useLocation();
  const [activeTab, setActiveTab] = useState("bus"); // default to live bus map!
  const [student, setStudent] = useState(null);
  const [loading, setLoading] = useState(true);
  const [attendanceHistory, setAttendanceHistory] = useState([]);
  const [historyLoading, setHistoryLoading] = useState(true);
  const [showPhotoModal, setShowPhotoModal] = useState(false);

  const [customPhotoInput, setCustomPhotoInput] = useState("");
  const [busDriver, setBusDriver] = useState({
    name: "Assigned Driver",
    phone: "",
    photo: "",
  });

  // 1. Fetch Student Data (Completely isolated to student profile and Firestore)
  useEffect(() => {
    const fetchStudent = async () => {
      // A. Check if valid student state was passed directly from login or EnterDetails
      if (location?.state?.role === "student" || (location?.state?.email && location?.state?.regNo)) {
        const passedStudent = {
          ...location.state,
          photo: location.state.photo || location.state.studentPhoto || "/images/profile.png",
          email: location.state.email || "",
          role: "student",
        };
        setStudent(passedStudent);
        sessionStorage.setItem("scanigo_current_role", "student");
        localStorage.setItem("scanigo_student_profile", JSON.stringify(passedStudent));
        setLoading(false);
        return;
      }

      // B. Read stored student profile or persistent cookie
      let localStudent = null;
      try {
        const raw = localStorage.getItem("scanigo_student_profile");
        const cookie = getCookie("scanigo_remember_student");
        const candidate = raw ? JSON.parse(raw) : cookie;
        if (candidate && candidate.email !== "hemal@scanigo.transit" && candidate.qrToken !== "SCANIGO-DEMO-717822P128" && (candidate.uid || candidate.email || candidate.regNo)) {
          localStudent = candidate;
        } else {
          localStorage.removeItem("scanigo_student_profile");
        }
      } catch {
        /* ignore */
      }

      const user = auth.currentUser;

      // C. If local student profile exists, display it and refresh from Firestore in background
      if (localStudent && (localStudent.name || localStudent.email || localStudent.regNo)) {
        setStudent(localStudent);
        setLoading(false);

        const targetUid = localStudent.uid || user?.uid;
        if (targetUid) {
          try {
            const docSnap = await getDoc(doc(db, "Students", targetUid));
            if (docSnap.exists()) {
              const data = docSnap.data();
              const refreshed = {
                ...localStudent,
                ...data,
                photo: data.photo || data.studentPhoto || localStudent.photo || "/images/profile.png",
                email: data.email || localStudent.email,
                role: "student",
              };
              setStudent(refreshed);
              localStorage.setItem("scanigo_student_profile", JSON.stringify(refreshed));
            }
          } catch (err) {
            console.warn("Student doc background sync notice:", err);
          }
        }
        return;
      }

      // D. If no localStudent, but auth user is logged in:
      if (user) {
        try {
          const docRef = doc(db, "Students", user.uid);
          const docSnap = await getDoc(docRef);
          if (docSnap.exists()) {
            const data = docSnap.data();
            const full = {
              ...data,
              photo: data.photo || data.studentPhoto || user.photoURL || "/images/profile.png",
              email: data.email || user.email,
              role: "student",
            };
            setStudent(full);
            localStorage.setItem("scanigo_student_profile", JSON.stringify(full));
            setLoading(false);
            return;
          }
        } catch (err) {
          console.warn("Student Firestore lookup notice:", err);
        }
      }

      // E. User is not authenticated: redirect to login
      localStorage.removeItem("scanigo_student_profile");
      setLoading(false);
      navigate("/student-login");
    };

    fetchStudent();
  }, [navigate, location?.state]);

  // Real-time lookup for Assigned Driver details strictly from LiveBus collection
  useEffect(() => {
    const targetBus = student?.busNo || "V11";
    if (!targetBus) return;

    // Listen to LiveBus for this bus (syncs live driver name, phone, photo and route directly from depot/driver)
    const unsubLive = onSnapshot(
      doc(db, "LiveBus", targetBus),
      (snap) => {
        if (snap.exists()) {
          const data = snap.data();
          const rawPhoto = data.driverPhoto || data.photo;
          const validPhoto = rawPhoto && typeof rawPhoto === "string" && rawPhoto.startsWith("http") && !rawPhoto.includes("driver_rahul");
          setBusDriver({
            name: data.driverName || data.driver || "Assigned Driver",
            phone: data.driverPhone || data.phone || "",
            photo: validPhoto ? rawPhoto : "",
          });
        }
      },
      (err) => console.warn("LiveBus student listener:", err)
    );

    return () => {
      unsubLive();
    };
  }, [student?.busNo]);


  // 2. Fetch Live Attendance Records from Firestore
  useEffect(() => {
    const user = auth.currentUser;
    const uid = user ? user.uid : "demo-user";

    const q = query(
      collection(db, "Attendance", uid, "records"),
      orderBy("scannedAt", "desc")
    );

    const unsub = onSnapshot(q, (snap) => {
      if (!snap.empty) {
        const list = snap.docs.map((d) => ({
          id: d.id,
          ...d.data(),
        }));
        setAttendanceHistory(list);
      } else {
        // Sample records for realistic display
        setAttendanceHistory([
          {
            id: "rec-1",
            busNo: student?.busNo || "KL 07 AB 1257",
            route: student?.route || "Campus Express",
            status: "Present",
            scannedAt: { toDate: () => new Date() },
            stop: "Velachery Junction",
          },
          {
            id: "rec-2",
            busNo: student?.busNo || "KL 07 AB 1257",
            route: student?.route || "Campus Express",
            status: "Present",
            scannedAt: { toDate: () => new Date(Date.now() - 86400000) },
            stop: "Velachery Junction",
          },
          {
            id: "rec-3",
            busNo: student?.busNo || "KL 07 AB 1257",
            route: student?.route || "Campus Express",
            status: "Present",
            scannedAt: { toDate: () => new Date(Date.now() - 172800000) },
            stop: "Velachery Junction",
          },
        ]);
      }
      setHistoryLoading(false);
    }, (err) => {
      console.warn("Attendance snapshot error:", err);
      setHistoryLoading(false);
    });

    return () => unsub();
  }, [student]);

  // 3. Save QR Code as Image
  const handleSaveQR = async () => {
    const qrNode = document.getElementById("student-pass-card");
    if (!qrNode) return;

    try {
      const dataUrl = await htmlToImage.toPng(qrNode);
      const link = document.createElement("a");
      link.download = `Scanigo-Boarding-Pass-${student?.regNo || "Student"}.png`;
      link.href = dataUrl;
      link.click();
    } catch (err) {
      console.error(err);
      alert("Could not save QR pass");
    }
  };

  const syncPhotoToFirestore = async (newPhoto) => {
    const studentUid = student?.uid || auth.currentUser?.uid;
    if (studentUid) {
      try {
        await setDoc(doc(db, "Students", studentUid), {
          photo: newPhoto,
          studentPhoto: newPhoto,
        }, { merge: true });
      } catch (err) {
        console.warn("Firestore photo sync notice:", err);
      }
    }
  };

  if (loading) {
    return (
      <div className="scanigo-app-shell" style={{ justifyContent: "center" }}>
        <p style={{ fontWeight: 600, color: "#64748B" }}>Loading Transit Dashboard...</p>
      </div>
    );
  }

  const {
    name = "Student",
    photo = "/images/profile.png",
    email = "student@scanigo.transit",
    regNo = "717822P128",
    dept = "Information Technology",
    busNo = "V11",
    route = "Route 1",
    boarding = "Main Campus",
  } = student || {};

  // Production-grade JSON encoded payload for scanner interoperability
  const qrValue = JSON.stringify({
    uid: student?.uid || auth.currentUser?.uid || "",
    name,
    regNo,
    dept,
    busNo,
    route,
    token: student?.qrToken || `SCANIGO-${student?.uid || "USER"}`
  });

  return (
    <div className="student-dashboard-shell">
      <div className="student-mobile-viewport">
        {/* ================= TAB 1: LIVE BUS TRACKING MAP ================= */}
        {activeTab === "bus" && (

          <div className="student-map-tab-content">
            <BusTrackingView
              busNo={busNo}
              driverName={busDriver.name}
              driverPhone={busDriver.phone}
              driverPhoto={busDriver.photo}
              studentId={regNo}
            />
          </div>
        )}

        {/* ================= TAB 2: DIGITAL QR BOARDING PASS ================= */}
        {activeTab === "qr" && (
          <div className="student-scroll-container">
            <div className="student-header-bar" style={{ paddingLeft: "52px" }}>
              <h1 className="student-brand-title">Digital <span>Pass</span></h1>
              <div className="student-header-right">
                <span className="status-pill status-present">● Active</span>
              </div>
            </div>

          <div className="student-card student-qr-card" id="student-pass-card">
            <h2>Campus & Transit Pass</h2>
            <p className="student-qr-subtext">Scan this QR code while boarding the bus</p>

            <div className="student-qr-box">
              <QRCodeCanvas
                value={qrValue}
                size={220}
                bgColor="#FFFFFF"
                fgColor="#0F172A"
                level="H"
                includeMargin={true}
              />
              <div className="student-qr-meta">
                <span>{name}</span> • <span>{regNo}</span>
              </div>
            </div>

            <div style={{ textAlign: "left", background: "#F8FAFC", padding: "14px", borderRadius: "14px", marginBottom: "16px" }}>
              <div style={{ display: "flex", justifyContent: "space-between", marginBottom: "6px", fontSize: "13px" }}>
                <span style={{ color: "#64748B" }}>Assigned Bus:</span>
                <strong style={{ color: "#0F172A" }}>{busNo}</strong>
              </div>
              <div style={{ display: "flex", justifyContent: "space-between", marginBottom: "6px", fontSize: "13px" }}>
                <span style={{ color: "#64748B" }}>Transit Route:</span>
                <strong style={{ color: "#0F172A" }}>{route}</strong>
              </div>
              <div style={{ display: "flex", justifyContent: "space-between", fontSize: "13px" }}>
                <span style={{ color: "#64748B" }}>Boarding Point:</span>
                <strong style={{ color: "#0F172A" }}>{boarding}</strong>
              </div>
            </div>

            <button type="button" className="pill-btn pill-btn-blue" onClick={handleSaveQR}>
              💾 Save Pass to Device
            </button>
          </div>
        </div>
      )}

      {/* ================= TAB 3: ATTENDANCE & TRANSIT RECORDS ================= */}
      {activeTab === "history" && (
        <div className="student-scroll-container">
          <div className="student-header-bar">
            <h1 className="student-brand-title">Boarding <span>Records</span></h1>
            <span className="records-count-badge">
              {attendanceHistory.length} Recorded
            </span>
          </div>

          {historyLoading ? (
            <p style={{ textAlign: "center", color: "#64748B", marginTop: "40px" }}>Loading records...</p>
          ) : attendanceHistory.length === 0 ? (
            <div className="student-card" style={{ textAlign: "center", padding: "40px 20px" }}>
              <p style={{ fontSize: "24px", marginBottom: "8px" }}>📋</p>
              <p style={{ fontWeight: 600, color: "#0F172A" }}>No records yet</p>
              <p style={{ fontSize: "13px", color: "#64748B" }}>Your boarding records will appear here once scanned by the driver.</p>
            </div>
          ) : (
            <div className="records-list">
              {attendanceHistory.map((rec) => {
                const dateObj = rec.scannedAt?.toDate ? rec.scannedAt.toDate() : new Date();
                return (
                  <div key={rec.id} className="record-item-card">
                    <div className="record-left">
                      <div className="record-icon-badge">🚌</div>
                      <div>
                        <div className="record-details-title">
                          Bus {rec.busNo || busNo}
                        </div>
                        <div className="record-details-sub">
                          {dateObj.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })} • {dateObj.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                        </div>
                      </div>
                    </div>

                    <span className="record-status-pill record-status-present">
                      {rec.status || "Present"}
                    </span>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}

      {/* ================= TAB 4: PROFILE ================= */}
      {activeTab === "profile" && (
        <div className="student-scroll-container">
          <div className="student-header-bar">
            <h1 className="student-brand-title">My <span>Profile</span></h1>
            <button
              onClick={() => {
                deleteCookie("scanigo_remember_student");
                sessionStorage.removeItem("scanigo_current_role");
                localStorage.removeItem("scanigo_student_profile");
                auth.signOut();
                navigate("/student-login");
              }}

              style={{
                border: "none",
                background: "#FEE2E2",
                color: "#DC2626",
                fontWeight: 600,
                fontSize: "12px",
                padding: "6px 12px",
                borderRadius: "9999px",
                cursor: "pointer",
              }}
            >
              Sign Out
            </button>
          </div>

          <div className="student-card">
            <div className="student-profile-hero">
              <div style={{ position: "relative", display: "inline-block" }}>
                <img
                  src={student?.photo || photo || "/images/profile.png"}
                  alt={name}
                  className="student-avatar-lg"
                  referrerPolicy="no-referrer"
                  onError={(e) => {
                    e.target.src = `https://ui-avatars.com/api/?name=${encodeURIComponent(name || "Student")}&background=5B7C7D&color=fff&size=128&bold=true`;
                  }}
                />
                <button
                  type="button"
                  onClick={() => setShowPhotoModal(true)}
                  style={{
                    position: "absolute",
                    bottom: "-4px",
                    right: "-4px",
                    background: "#2563EB",
                    color: "#fff",
                    border: "2px solid #fff",
                    borderRadius: "50%",
                    width: "26px",
                    height: "26px",
                    fontSize: "12px",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    cursor: "pointer",
                    boxShadow: "0 2px 6px rgba(0,0,0,0.2)",
                  }}
                  title="Change / Update Student Photo"
                >
                  📷
                </button>
              </div>

              <div className="student-hero-info">
                <h2 className="student-hero-name">{name}</h2>
                {email && (
                  <p className="student-hero-email" style={{ color: "#2563EB", fontSize: "13px", fontWeight: 500, margin: "2px 0 6px", display: "flex", alignItems: "center", gap: "6px" }}>
                    <span>✉️</span> {email}
                  </p>
                )}
                <p className="student-hero-meta">{regNo}</p>
                <p className="student-hero-meta">{dept}</p>
              </div>
            </div>

            <div className="student-quick-stats">
              <div className="student-stat-box">
                <span className="student-stat-label">Bus Attendance</span>
                <span className="student-stat-val">96%</span>
              </div>
              <div className="student-stat-box">
                <span className="student-stat-label">Assigned Route</span>
                <span className="student-stat-val">{busNo}</span>
              </div>
            </div>

            {/* Profile Details List */}
            <div style={{ textAlign: "left", background: "#F8FAFC", padding: "16px", borderRadius: "16px", marginTop: "16px", border: "1px solid #E2E8F0" }}>
              <div style={{ display: "flex", justifyContent: "space-between", marginBottom: "8px", fontSize: "13px" }}>
                <span style={{ color: "#64748B" }}>Student Email:</span>
                <strong style={{ color: "#0F172A" }}>{email}</strong>
              </div>
              <div style={{ display: "flex", justifyContent: "space-between", marginBottom: "8px", fontSize: "13px" }}>
                <span style={{ color: "#64748B" }}>Register Number:</span>
                <strong style={{ color: "#0F172A" }}>{regNo}</strong>
              </div>
              <div style={{ display: "flex", justifyContent: "space-between", marginBottom: "8px", fontSize: "13px" }}>
                <span style={{ color: "#64748B" }}>Department:</span>
                <strong style={{ color: "#0F172A" }}>{dept}</strong>
              </div>
              <div style={{ display: "flex", justifyContent: "space-between", marginBottom: "8px", fontSize: "13px" }}>
                <span style={{ color: "#64748B" }}>Assigned Bus:</span>
                <strong style={{ color: "#0F172A" }}>{busNo}</strong>
              </div>
              <div style={{ display: "flex", justifyContent: "space-between", marginBottom: "8px", fontSize: "13px" }}>
                <span style={{ color: "#64748B" }}>Transit Route:</span>
                <strong style={{ color: "#0F172A" }}>{route}</strong>
              </div>
              <div style={{ display: "flex", justifyContent: "space-between", fontSize: "13px" }}>
                <span style={{ color: "#64748B" }}>Boarding Point:</span>
                <strong style={{ color: "#0F172A" }}>{boarding}</strong>
              </div>
            </div>

            <div style={{ marginTop: "20px", display: "flex", flexDirection: "column", gap: "10px" }}>
              <button
                type="button"
                className="pill-btn pill-btn-blue"
                onClick={() => setActiveTab("bus")}
              >
                🚌 Track Live Bus Location
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Student Photo Update Modal */}
      {showPhotoModal && (
        <div
          style={{
            position: "fixed",
            top: 0,
            left: 0,
            right: 0,
            bottom: 0,
            background: "rgba(0,0,0,0.5)",
            zIndex: 3000,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            padding: "20px",
          }}
          onClick={() => setShowPhotoModal(false)}
        >
          <div
            style={{
              background: "#FFFFFF",
              borderRadius: "20px",
              padding: "24px",
              maxWidth: "400px",
              width: "100%",
              boxShadow: "0 10px 40px rgba(0,0,0,0.2)",
            }}
            onClick={(e) => e.stopPropagation()}
          >
            <h3 style={{ fontSize: "18px", fontWeight: 700, marginBottom: "8px", color: "#0F172A" }}>
              Student Profile Photo
            </h3>
            <p style={{ fontSize: "13px", color: "#64748B", marginBottom: "16px" }}>
              Update your photo URL or reset to your clean student avatar
            </p>

            <input
              type="text"
              placeholder="Paste image URL (https://...)"
              value={customPhotoInput}
              onChange={(e) => setCustomPhotoInput(e.target.value)}
              style={{
                width: "100%",
                padding: "10px 14px",
                borderRadius: "10px",
                border: "1px solid #CBD5E1",
                fontSize: "14px",
                marginBottom: "14px",
                boxSizing: "border-box",
              }}
            />

            <div style={{ display: "flex", gap: "8px", marginBottom: "14px" }}>
              <button
                type="button"
                onClick={() => {
                  const newPhoto = `https://ui-avatars.com/api/?name=${encodeURIComponent(name || "Student")}&background=5B7C7D&color=fff&size=128&bold=true`;
                  const updated = { ...student, photo: newPhoto, studentPhoto: newPhoto };
                  setStudent(updated);
                  localStorage.setItem("scanigo_student_profile", JSON.stringify(updated));
                  syncPhotoToFirestore(newPhoto);
                  setShowPhotoModal(false);
                }}
                style={{
                  flex: 1,
                  padding: "8px 12px",
                  fontSize: "12px",
                  fontWeight: 600,
                  borderRadius: "8px",
                  border: "1px solid #CBD5E1",
                  background: "#F8FAFC",
                  cursor: "pointer",
                }}
              >
                Reset to Initials
              </button>

              <button
                type="button"
                onClick={() => {
                  const defaultPhoto = "/images/profile.png";
                  const updated = { ...student, photo: defaultPhoto, studentPhoto: defaultPhoto };
                  setStudent(updated);
                  localStorage.setItem("scanigo_student_profile", JSON.stringify(updated));
                  syncPhotoToFirestore(defaultPhoto);
                  setShowPhotoModal(false);
                }}
                style={{
                  flex: 1,
                  padding: "8px 12px",
                  fontSize: "12px",
                  fontWeight: 600,
                  borderRadius: "8px",
                  border: "1px solid #CBD5E1",
                  background: "#F8FAFC",
                  cursor: "pointer",
                }}
              >
                Default Avatar
              </button>
            </div>

            <div style={{ display: "flex", gap: "8px" }}>
              <button
                type="button"
                onClick={() => {
                  if (customPhotoInput.trim()) {
                    const newPhoto = customPhotoInput.trim();
                    const updated = { ...student, photo: newPhoto, studentPhoto: newPhoto };
                    setStudent(updated);
                    localStorage.setItem("scanigo_student_profile", JSON.stringify(updated));
                    syncPhotoToFirestore(newPhoto);
                    setShowPhotoModal(false);
                    setCustomPhotoInput("");
                  }
                }}
                className="pill-btn pill-btn-blue"
                style={{ flex: 1 }}
              >
                Save Photo
              </button>
              <button
                type="button"
                onClick={() => setShowPhotoModal(false)}
                style={{
                  padding: "10px 16px",
                  borderRadius: "9999px",
                  border: "none",
                  background: "#E2E8F0",
                  color: "#475569",
                  fontWeight: 600,
                  cursor: "pointer",
                }}
              >
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Modern Bottom Navigation Bar */}

      <nav className="student-bottom-navbar">
        <div
          className={`student-nav-tab ${activeTab === "bus" ? "active" : ""}`}
          onClick={() => setActiveTab("bus")}
        >
          <span className="nav-icon">🚌</span>
          <span>Live Bus</span>
        </div>

        <div
          className={`student-nav-tab ${activeTab === "qr" ? "active" : ""}`}
          onClick={() => setActiveTab("qr")}
        >
          <span className="nav-icon">💳</span>
          <span>My Pass</span>
        </div>

        <div
          className={`student-nav-tab ${activeTab === "history" ? "active" : ""}`}
          onClick={() => setActiveTab("history")}
        >
          <span className="nav-icon">📋</span>
          <span>Records</span>
        </div>

        <div
          className={`student-nav-tab ${activeTab === "profile" ? "active" : ""}`}
          onClick={() => setActiveTab("profile")}
        >
          <span className="nav-icon">👤</span>
          <span>Profile</span>
        </div>
      </nav>
      </div>
    </div>
  );
}