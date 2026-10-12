import React, { useEffect, useRef, useState, useCallback } from "react";
import L from "leaflet";
import "leaflet/dist/leaflet.css";
import { Html5Qrcode } from "html5-qrcode";
import { auth, db } from "../../config/firebase";
import { doc, getDoc, setDoc, serverTimestamp, collection, query, where, orderBy, addDoc, onSnapshot, getDocs } from "firebase/firestore";
import { useNavigate, useLocation } from "react-router-dom";
import { addStyledTileLayer } from "../../utils/mapTiles";
import { deleteCookie } from "../../utils/cookieUtils";
import "../../assets/styles/DriverDashboard.css";

// Helper: Smoothly glide Leaflet marker between coordinates for Uber/Rapido like live tracking
function smoothMoveMarker(marker, targetPos, durationMs = 1200, map = null) {
  if (!marker || !targetPos) return;
  const startLatLng = marker.getLatLng();
  const startLat = startLatLng.lat;
  const startLng = startLatLng.lng;
  const targetLat = targetPos[0];
  const targetLng = targetPos[1];

  if (Math.abs(startLat - targetLat) < 0.000001 && Math.abs(startLng - targetLng) < 0.000001) return;

  const startTime = performance.now();

  const step = (currentTime) => {
    const elapsed = currentTime - startTime;
    const progress = Math.min(elapsed / durationMs, 1);
    const ease = progress < 0.5 ? 2 * progress * progress : 1 - Math.pow(-2 * progress + 2, 2) / 2;

    const curLat = startLat + (targetLat - startLat) * ease;
    const curLng = startLng + (targetLng - startLng) * ease;
    marker.setLatLng([curLat, curLng]);

    if (progress < 1) {
      requestAnimationFrame(step);
    } else {
      marker.setLatLng([targetLat, targetLng]);
    }
  };

  requestAnimationFrame(step);

  if (map) {
    map.panTo(targetPos, { animate: true, duration: durationMs / 1000 });
  }
}

// Micro-waypoints along Campus Transit Corridor for continuous Uber/Rapido smooth movement
const SIMULATED_POINTS = [
  { lat: 12.975, lng: 80.215 },
  { lat: 12.978, lng: 80.217 },
  { lat: 12.981, lng: 80.220 },
  { lat: 12.986, lng: 80.224 },
  { lat: 12.990, lng: 80.225 },
  { lat: 12.994, lng: 80.226 },
  { lat: 13.000, lng: 80.227 },
  { lat: 13.005, lng: 80.228 },
  { lat: 13.009, lng: 80.230 },
  { lat: 13.012, lng: 80.231 },
  { lat: 13.015, lng: 80.233 },
  { lat: 13.018, lng: 80.235 },
];

export default function DriverDashboard() {
  const navigate = useNavigate();
  const location = useLocation();

  const [activeTab, setActiveTab] = useState("navigation"); // 'navigation', 'scanner', 'history'
  const [driver, setDriver] = useState(() => {
    if (location?.state?.busNo) return location.state;
    try {
      const stored = localStorage.getItem("scanigo_driver");
      if (stored) return JSON.parse(stored);
    } catch {
      /* ignore */
    }
    return null;
  });
  const [liveOn, setLiveOn] = useState(false);
  const [isSimulating, setIsSimulating] = useState(false);
  const [isScanning, setIsScanning] = useState(false);
  const [history, setHistory] = useState([]);
  const [historyLoading, setHistoryLoading] = useState(true);
  const [lastScannedStudent, setLastScannedStudent] = useState(null);
  const [currentCoords, setCurrentCoords] = useState({ lat: 12.975, lng: 80.215 });

  const qrRef = useRef(null);
  const watchIdRef = useRef(null);
  const simulationTimerRef = useRef(null);
  const lastUpdateRef = useRef(0);

  // Map refs for driver navigation
  const driverMapContainerRef = useRef(null);
  const driverMapInstanceRef = useRef(null);
  const driverMarkerRef = useRef(null);

  /* ---------------- AUTH + DRIVER DATA ---------------- */
  useEffect(() => {
    const unsubscribe = auth.onAuthStateChanged(async (user) => {
      // Check location state first
      if (location?.state?.busNo) {
        setDriver(location.state);
        return;
      }

      if (!user) {
        try {
          const stored = localStorage.getItem("scanigo_driver") || localStorage.getItem("scanigo_driver_profile");
          if (stored) {
            const parsed = JSON.parse(stored);
            if (parsed && (parsed.busNo || parsed.name || parsed.uid)) {
              setDriver(parsed);
              return;
            }
          }
        } catch {
          /* ignore */
        }

        navigate("/driver-login");
        return;
      }

      try {
        const snap = await getDoc(doc(db, "Drivers", user.uid));
        if (snap.exists()) {
          const data = snap.data();
          const cleanPhoto = (data.photo && !data.photo.includes("driver_rahul")) ? data.photo : null;
          setDriver({
            ...data,
            photo: user.photoURL || cleanPhoto || `https://ui-avatars.com/api/?name=${encodeURIComponent(data.name || user.displayName || "Driver")}&background=1A73E8&color=fff&size=128&bold=true`,
          });
        } else {
          setDriver({
            name: user.displayName || "Driver",
            email: user.email,
            busNo: "V11",
            route: "Route 1 – Campus Express",
            phone: "+91 98401 12570",
            photo: user.photoURL || `https://ui-avatars.com/api/?name=${encodeURIComponent(user.displayName || "Driver")}&background=1A73E8&color=fff&size=128&bold=true`,
          });
        }
      } catch (err) {
        console.warn("Driver fetch error:", err);
      }
    });

    return () => unsubscribe();
  }, [navigate, location]);

  /* ---------------- SCAN HANDLER ---------------- */
  const handleScan = useCallback(async (scannedRaw) => {
    if (!driver || isScanning || !scannedRaw) return;

    setIsScanning(true);
    try {
      const scannedText = typeof scannedRaw === "string" ? scannedRaw.trim() : String(scannedRaw);
      let targetUid = scannedText;
      let studentName = "Student Passenger";
      let regNo = "REG-" + (scannedText.length > 6 ? scannedText.substring(0, 6) : scannedText);
      let studentDept = "Department";
      let studentBusNo = driver.busNo;

      // 1. Check if structured JSON QR code was scanned
      if (scannedText.startsWith("{") && scannedText.endsWith("}")) {
        try {
          const parsed = JSON.parse(scannedText);
          if (parsed.uid) targetUid = parsed.uid;
          if (parsed.name) studentName = parsed.name;
          if (parsed.regNo) regNo = parsed.regNo;
          if (parsed.dept) studentDept = parsed.dept;
          if (parsed.busNo) studentBusNo = parsed.busNo;
        } catch {
          /* Fallback plain text QR */
        }
      }

      // 2. Query Firestore by UID, qrToken, or regNo
      try {
        let snap = await getDoc(doc(db, "Students", targetUid));
        if (!snap.exists()) {
          // Fallback query by qrToken
          const qToken = query(collection(db, "Students"), where("qrToken", "==", scannedText));
          const snapToken = await getDocs(qToken);
          if (!snapToken.empty) {
            snap = snapToken.docs[0];
            targetUid = snap.id;
          } else if (regNo && regNo !== "REG-PASSENGER") {
            // Fallback query by regNo
            const qReg = query(collection(db, "Students"), where("regNo", "==", regNo));
            const snapReg = await getDocs(qReg);
            if (!snapReg.empty) {
              snap = snapReg.docs[0];
              targetUid = snap.id;
            }
          }
        }

        if (snap && snap.exists?.()) {
          const sdata = snap.data();
          studentName = sdata.name || studentName;
          regNo = sdata.regNo || regNo;
          studentDept = sdata.dept || studentDept;
          studentBusNo = sdata.busNo || studentBusNo;
          targetUid = snap.id;
        }
      } catch (err) {
        console.warn("Student doc lookup notice:", err);
      }

      const now = new Date();
      setLastScannedStudent({ name: studentName, regNo, time: now.toLocaleTimeString() });

      // 3. Save to Student's Attendance records so Student Dashboard receives it
      await addDoc(collection(db, "Attendance", targetUid, "records"), {
        status: "Present",
        busNo: driver.busNo,
        studentBusNo: studentBusNo,
        route: driver.route,
        driverName: driver.name,
        studentName: studentName,
        regNo: regNo,
        dept: studentDept,
        scannedAt: serverTimestamp(),
        minuteKey: `${now.getHours()}-${now.getMinutes()}`,
      });

      // 4. Save to ScanHistory for driver & admin
      await addDoc(collection(db, "ScanHistory"), {
        driverId: auth.currentUser?.uid || "driver-uid",
        studentId: targetUid,
        studentName: studentName,
        regNo: regNo,
        dept: studentDept,
        busNo: driver.busNo,
        studentBusNo: studentBusNo,
        route: driver.route,
        driverName: driver.name,
        scannedAt: serverTimestamp(),
      });

      alert(`✅ Scanned: ${studentName} (${regNo})`);
    } catch (err) {
      console.error("Scan error:", err);
      alert("Error saving scan record");
    } finally {
      setTimeout(() => setIsScanning(false), 2000);
    }
  }, [driver, isScanning]);

  /* ---------------- HISTORY LISTENER ---------------- */
  useEffect(() => {
    if (!driver) return;
    setHistoryLoading(true);

    const q = query(
      collection(db, "ScanHistory"),
      where("busNo", "==", driver.busNo),
      orderBy("scannedAt", "desc")
    );

    const unsub = onSnapshot(
      q,
      (snap) => {
        const list = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
        setHistory(list);
        setHistoryLoading(false);
      },
      (error) => {
        console.warn("History snapshot notice:", error);
        setHistoryLoading(false);
      }
    );

    return () => unsub();
  }, [driver]);

  /* ---------------- QR SCANNER LIFECYCLE ---------------- */
  useEffect(() => {
    if (activeTab !== "scanner" || !driver) return;

    let html5QrCode = null;
    let started = false;

    const startScanner = async () => {
      const element = document.getElementById("scanner-view");
      if (!element) return;

      html5QrCode = new Html5Qrcode("scanner-view");
      qrRef.current = html5QrCode;

      try {
        await html5QrCode.start(
          { facingMode: "environment" },
          { fps: 10, qrbox: { width: 240, height: 240 } },
          (decodedText) => handleScan(decodedText)
        );
        started = true;
      } catch (err) {
        if (err?.name !== "AbortError") {
          console.warn("Scanner camera start info:", err);
        }
      }
    };

    startScanner();

    return () => {
      const scanner = qrRef.current;
      if (scanner && started) {
        scanner.stop().then(() => {
          try { scanner.clear(); } catch { /* ignore */ }
          qrRef.current = null;
        }).catch(() => {
          qrRef.current = null;
        });
      }
    };
  }, [activeTab, driver, handleScan]);

  /* ---------------- GPS LIVE LOCATION SHARING ---------------- */
  const startLive = () => {
    if (!driver) {
      alert("Driver data not ready");
      return;
    }
    if (!navigator.geolocation) {
      alert("GPS not supported on this device. Use Simulate route instead.");
      return;
    }

    setLiveOn(true);
    setActiveTab("navigation");

    watchIdRef.current = navigator.geolocation.watchPosition(
      async (pos) => {
        setCurrentCoords({ lat: pos.coords.latitude, lng: pos.coords.longitude });

        const now = Date.now();
        if (now - lastUpdateRef.current < 2000) return;
        lastUpdateRef.current = now;

        try {
          await setDoc(
            doc(db, "LiveBus", driver.busNo),
            {
              driver: driver.name,
              driverName: driver.name,
              driverPhone: driver.phone || "",
              phone: driver.phone || "",
              driverPhoto: driver.photo || auth.currentUser?.photoURL || `https://ui-avatars.com/api/?name=${encodeURIComponent(driver.name || "Driver")}&background=1A73E8&color=fff&size=128&bold=true`,
              photo: driver.photo || auth.currentUser?.photoURL || `https://ui-avatars.com/api/?name=${encodeURIComponent(driver.name || "Driver")}&background=1A73E8&color=fff&size=128&bold=true`,
              busNo: driver.busNo,
              route: driver.route,
              lat: pos.coords.latitude,
              lng: pos.coords.longitude,
              heading: pos.coords.heading || 0,
              status: "Moving",
              live: true,
              updatedAt: serverTimestamp(),
            },
            { merge: true }
          );
        } catch (err) {
          console.error("Location update error:", err);
        }
      },
      (err) => {
        console.warn("GPS error:", err);
        alert("GPS unavailable or permission denied. Starting route simulation mode.");
        setLiveOn(false);
        startSimulation();
      },
      { enableHighAccuracy: true, maximumAge: 0 }
    );
  };

  const stopLive = async () => {
    if (watchIdRef.current !== null) {
      navigator.geolocation.clearWatch(watchIdRef.current);
      watchIdRef.current = null;
    }

    stopSimulation();

    if (driver) {
      try {
        await setDoc(
          doc(db, "LiveBus", driver.busNo),
          { live: false, status: "Stopped", updatedAt: serverTimestamp() },
          { merge: true }
        );
      } catch (err) {
        console.error("Stop live error:", err);
      }
    }

    setLiveOn(false);
  };

  /* ---------------- ROUTE SIMULATION (FOR INDOOR & LAPTOP TESTING) ---------------- */
  const startSimulation = () => {
    if (!driver) return;
    setIsSimulating(true);
    setLiveOn(true);
    setActiveTab("navigation");

    let idx = 0;
    simulationTimerRef.current = setInterval(async () => {
      const pt = SIMULATED_POINTS[idx];
      idx = (idx + 1) % SIMULATED_POINTS.length;

      setCurrentCoords({ lat: pt.lat, lng: pt.lng });

      try {
        await setDoc(
          doc(db, "LiveBus", driver.busNo),
          {
            driver: driver.name,
            driverName: driver.name,
            driverPhone: driver.phone || "",
            phone: driver.phone || "",
            driverPhoto: driver.photo || auth.currentUser?.photoURL || `https://ui-avatars.com/api/?name=${encodeURIComponent(driver.name || "Driver")}&background=1A73E8&color=fff&size=128&bold=true`,
            photo: driver.photo || auth.currentUser?.photoURL || `https://ui-avatars.com/api/?name=${encodeURIComponent(driver.name || "Driver")}&background=1A73E8&color=fff&size=128&bold=true`,
            busNo: driver.busNo,
            route: driver.route,
            lat: pt.lat,
            lng: pt.lng,
            status: "Moving",
            live: true,
            updatedAt: serverTimestamp(),
          },
          { merge: true }
        );
      } catch (err) {
        console.warn("Sim update notice:", err);
      }
    }, 2000);
  };

  const stopSimulation = () => {
    if (simulationTimerRef.current) {
      clearInterval(simulationTimerRef.current);
      simulationTimerRef.current = null;
    }
    setIsSimulating(false);
  };

  // Initialize Driver Live Navigation Map
  useEffect(() => {
    if (activeTab !== "navigation") return;

    const timer = setTimeout(() => {
      if (!driverMapContainerRef.current) return;

      if (!driverMapInstanceRef.current) {
        const map = L.map(driverMapContainerRef.current, {
          zoomControl: false,
          attributionControl: false,
        }).setView([currentCoords.lat, currentCoords.lng], 15);

        // Free styled pastel transit tiles
        addStyledTileLayer(map, "pastel");

        // Route corridor polyline
        const latlngs = SIMULATED_POINTS.map((p) => [p.lat, p.lng]);
        L.polyline(latlngs, {
          color: "#3B82F6",
          weight: 6,
          opacity: 0.85,
          lineCap: "round",
          lineJoin: "round",
        }).addTo(map);

        // Driver Bus Icon with smooth transition
        const busIcon = L.icon({
          iconUrl: "/images/school_bus_marker.png",
          iconSize: [52, 52],
          iconAnchor: [26, 26],
          className: "bus-marker-icon",
        });

        driverMarkerRef.current = L.marker([currentCoords.lat, currentCoords.lng], {
          icon: busIcon,
        }).addTo(map);

        driverMapInstanceRef.current = map;

        setTimeout(() => {
          if (driverMapInstanceRef.current) driverMapInstanceRef.current.invalidateSize();
        }, 200);
      } else {
        driverMapInstanceRef.current.invalidateSize();
      }
    }, 120);

    const handleResize = () => {
      if (driverMapInstanceRef.current) driverMapInstanceRef.current.invalidateSize();
    };
    window.addEventListener("resize", handleResize);

    return () => {
      clearTimeout(timer);
      window.removeEventListener("resize", handleResize);
    };
  }, [activeTab]);

  // Sync Bus Marker position on navigation map with Uber/Rapido style smooth gliding
  useEffect(() => {
    if (driverMarkerRef.current && currentCoords) {
      const pos = [currentCoords.lat, currentCoords.lng];
      smoothMoveMarker(driverMarkerRef.current, pos, 1400, driverMapInstanceRef.current);
    }
  }, [currentCoords.lat, currentCoords.lng]);

  const driverRef = useRef(driver);
  const liveOnRef = useRef(liveOn);
  useEffect(() => {
    driverRef.current = driver;
  }, [driver]);
  useEffect(() => {
    liveOnRef.current = liveOn;
  }, [liveOn]);

  useEffect(() => {
    return () => {
      if (watchIdRef.current) navigator.geolocation.clearWatch(watchIdRef.current);
      if (simulationTimerRef.current) clearInterval(simulationTimerRef.current);
      if (driverRef.current?.busNo && liveOnRef.current) {
        setDoc(
          doc(db, "LiveBus", driverRef.current.busNo),
          { live: false, status: "Stopped", updatedAt: serverTimestamp() },
          { merge: true }
        ).catch(() => {});
      }
    };
  }, []);

  return (
    <div className="driver-dashboard-shell">
      <div className="driver-mobile-viewport">
        <div className="driver-scroll-container">
          {/* Header */}
          <div className="driver-header-bar">
          <h1 className="driver-brand-title">Driver <span>Transit</span></h1>
          <button
            onClick={async () => {
              await stopLive();
              deleteCookie("scanigo_remember_driver");
              sessionStorage.removeItem("scanigo_current_role");
              localStorage.removeItem("scanigo_driver");
              localStorage.removeItem("scanigo_driver_profile");
              auth.signOut();
              navigate("/driver-login");
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

        {/* Profile Card */}
        <div className="driver-profile-card">
          <img
            src={driver?.photo || auth.currentUser?.photoURL || `https://ui-avatars.com/api/?name=${encodeURIComponent(driver?.name || "Driver")}&background=1A73E8&color=fff&size=128&bold=true`}
            alt="Driver"
            className="driver-profile-img"
            referrerPolicy="no-referrer"
            onError={(e) => { e.target.src = `https://ui-avatars.com/api/?name=${encodeURIComponent(driver?.name || "Driver")}&background=1A73E8&color=fff&size=128&bold=true`; }}
          />
          <div className="driver-profile-info">
            <h2 className="driver-name-lg">{driver?.name || "Driver"}</h2>
            {driver?.email && (
              <p style={{ color: "#2563EB", fontSize: "13px", fontWeight: 500, margin: "2px 0 4px", display: "flex", alignItems: "center", gap: "6px" }}>
                <span>✉️</span> {driver.email}
              </p>
            )}
            <p style={{ color: "#64748B", fontSize: "13px" }}>{driver?.route || "Campus Route"}</p>
            <div style={{ display: "flex", gap: "8px", marginTop: "6px", flexWrap: "wrap" }}>
              <span className="driver-bus-badge">Bus: {driver?.busNo || "V11"}</span>
              {driver?.phone && (
                <span className="driver-bus-badge" style={{ background: "#EFF6FF", color: "#1D4ED8" }}>
                  📞 {driver.phone}
                </span>
              )}
            </div>
          </div>
        </div>

        {/* Live GPS Broadcast Section */}
        <div className="driver-gps-card">
          <div className="gps-status-header">
            <h3>Live GPS Broadcasting</h3>
            {liveOn ? (
              <span className="status-pill status-live">
                ● BROADCASTING {isSimulating ? "(SIMULATED)" : "(GPS)"}
              </span>
            ) : (
              <span style={{ fontSize: "12px", color: "#64748B", fontWeight: 600 }}>OFFLINE</span>
            )}
          </div>

          <p style={{ fontSize: "13px", color: "#64748B", marginBottom: "16px" }}>
            {liveOn
              ? "Your real-time GPS location is being broadcasted to all students and the admin map."
              : "Start sharing location so students can track your arrival in real-time."}
          </p>

          <div className="driver-gps-actions">
            {!liveOn ? (
              <>
                <button
                  type="button"
                  className="pill-btn pill-btn-green"
                  onClick={startLive}
                >
                  📡 Start GPS Sharing (Real Device)
                </button>
                <button
                  type="button"
                  className="pill-btn pill-btn-blue"
                  onClick={startSimulation}
                >
                  🚀 Simulate Route Movement (Testing)
                </button>
              </>
            ) : (
              <button
                type="button"
                className="pill-btn pill-btn-red"
                onClick={stopLive}
              >
                🛑 Stop Sharing Location
              </button>
            )}
          </div>
        </div>

        {/* Tab 0: Live Real-Time Navigation Map */}
        {activeTab === "navigation" && (
          <div className="driver-navigation-card">
            {/* Live Navigation Transit HUD (Speedometer and speculative next stop removed) */}
            <div className="driver-nav-hud">
              <div className="driver-nav-left">
                <div className="driver-bus-avatar-badge">🚌</div>
                <div>
                  <div className="driver-nav-bus-id">{driver?.busNo || "KL 07 AB 1257"}</div>
                  <div className="driver-nav-route-sub">{driver?.route || "Campus Express Corridor"}</div>
                </div>
              </div>

              <div className="driver-nav-status-badge">
                <span className={`status-pill ${liveOn ? "status-live" : ""}`}>
                  {liveOn ? "● LIVE BROADCAST" : "⚪ STANDBY"}
                </span>
                <span style={{ fontSize: "11px", color: liveOn ? "#16A34A" : "#64748B", fontWeight: 600 }}>
                  {liveOn ? "Active GPS Tracking" : "Depot / Waiting"}
                </span>
              </div>
            </div>

            {/* Interactive Leaflet Map */}
            <div className="driver-nav-map-wrapper">
              <div ref={driverMapContainerRef} style={{ width: "100%", height: "380px", borderRadius: "18px" }} />
              
              {/* Floating Quick Action Overlay */}
              <div className="driver-nav-floating-actions">
                <button
                  type="button"
                  className="driver-quick-scan-btn"
                  onClick={() => setActiveTab("scanner")}
                  title="Open Camera to Scan Boarding Passes"
                >
                  📷 Scan Student Pass
                </button>
                <button
                  type="button"
                  className="driver-recenter-btn"
                  onClick={() => {
                    if (driverMapInstanceRef.current && driverMarkerRef.current) {
                      driverMapInstanceRef.current.setView(driverMarkerRef.current.getLatLng(), 16, { animate: true });
                    }
                  }}
                  title="Recenter on My Bus"
                >
                  🎯
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Tab 1: QR Scanner */}
        {activeTab === "scanner" && (
          <div className="driver-scanner-card">
            <h3 style={{ fontSize: "16px", fontWeight: 700, marginBottom: "8px" }}>
              Scan Student Pass
            </h3>
            <p style={{ fontSize: "13px", color: "#64748B", marginBottom: "14px" }}>
              Hold camera over the student's QR code to record attendance
            </p>

            <div className="scanner-view-container">
              <div id="scanner-view" style={{ width: "100%", height: "100%" }} />
            </div>

            {lastScannedStudent && (
              <div style={{ marginTop: "14px", background: "#F0FDF4", padding: "12px", borderRadius: "12px" }}>
                <p style={{ color: "#166534", fontWeight: 700, fontSize: "14px" }}>
                  ✅ Last Scanned: {lastScannedStudent.name}
                </p>
                <p style={{ color: "#15803D", fontSize: "12px" }}>
                  {lastScannedStudent.regNo} at {lastScannedStudent.time}
                </p>
              </div>
            )}
          </div>
        )}

        {/* Tab 2: Scan Records */}
        {activeTab === "history" && (
          <div>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "12px" }}>
              <h3 style={{ fontSize: "16px", fontWeight: 700 }}>Scanned Passengers</h3>
              <span className="status-pill status-present">{history.length} Students</span>
            </div>

            {historyLoading ? (
              <p style={{ textAlign: "center", color: "#64748B" }}>Loading scan history...</p>
            ) : history.length === 0 ? (
              <div className="driver-gps-card" style={{ padding: "30px 20px" }}>
                <p style={{ fontSize: "24px", marginBottom: "8px" }}>📋</p>
                <p style={{ fontWeight: 600 }}>No scans recorded today</p>
                <p style={{ fontSize: "13px", color: "#64748B" }}>Switch to the Scanner tab to scan student boarding passes.</p>
              </div>
            ) : (
              <div className="driver-history-list">
                {history.map((item) => {
                  const dObj = item.scannedAt?.toDate ? item.scannedAt.toDate() : new Date();
                  return (
                    <div key={item.id} className="driver-history-item">
                      <div>
                        <strong style={{ fontSize: "14px", color: "#0F172A", display: "block" }}>
                          {item.studentName || "Student Passenger"}
                        </strong>
                        <span style={{ fontSize: "12px", color: "#64748B" }}>
                          {item.regNo || "Student"} • {dObj.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                        </span>
                      </div>
                      <span className="status-pill status-present">Boarded</span>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        )}
      </div>

      {/* Driver Bottom Nav */}
      <nav className="driver-bottom-navbar">
        <div
          className={`driver-nav-tab ${activeTab === "navigation" ? "active" : ""}`}
          onClick={() => setActiveTab("navigation")}
        >
          <span className="nav-icon">🗺️</span>
          <span>Navigation</span>
        </div>

        <div
          className={`driver-nav-tab ${activeTab === "scanner" ? "active" : ""}`}
          onClick={() => setActiveTab("scanner")}
        >
          <span className="nav-icon">📷</span>
          <span>QR Scanner</span>
        </div>

        <div
          className={`driver-nav-tab ${activeTab === "history" ? "active" : ""}`}
          onClick={() => setActiveTab("history")}
        >
          <span className="nav-icon">📋</span>
          <span>Passengers</span>
        </div>
      </nav>
      </div>
    </div>
  );
}