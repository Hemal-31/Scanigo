import React, { useState, useEffect, useRef } from "react";
import { useNavigate } from "react-router-dom";
import L from "leaflet";
import "leaflet/dist/leaflet.css";
import { auth, db } from "../../config/firebase";
import { collection, onSnapshot, query, orderBy } from "firebase/firestore";
import { signOut } from "firebase/auth";
import { jsPDF } from "jspdf";
import autoTable from "jspdf-autotable";
import * as XLSX from "xlsx";
import { addStyledTileLayer } from "../../utils/mapTiles";
import { deleteCookie } from "../../utils/cookieUtils";
import { isBusTelemetryLive } from "../../services/firestoreService";
import AdminChatBot from "../../components/admin/AdminChatBot";
import "../../assets/styles/AdminMobile.css";

// Default Campus Transit Fleet
const DEFAULT_CAMPUS_BUSES = [
  {
    id: "V11",
    busNo: "V11",
    status: "Offline",
    route: "Route 1 – Campus Express",
    location: "Depot",
    speed: "0 km/h",
    lat: 12.975,
    lng: 80.215,
    driver: "Driver V11",
    phone: "",
    isLive: false,
  },
  {
    id: "V14",
    busNo: "V14",
    status: "Offline",
    route: "Route 2 – Metro Link",
    location: "Depot",
    speed: "0 km/h",
    lat: 12.986,
    lng: 80.224,
    driver: "Driver V14",
    phone: "",
    isLive: false,
  },
  {
    id: "V3",
    busNo: "V3",
    status: "Offline",
    route: "Route 3 – South Hub",
    location: "Depot",
    speed: "0 km/h",
    lat: 13.005,
    lng: 80.228,
    driver: "Driver V3",
    phone: "",
    isLive: false,
  },
];

export default function AdminDashboard() {
  const navigate = useNavigate();

  // Navigation tab state: 'home', 'buses', 'students', 'chatbot'
  const [activeTab, setActiveTab] = useState("home");
  
  // Data states (Zero fake data)
  const [buses, setBuses] = useState(DEFAULT_CAMPUS_BUSES);
  const [students, setStudents] = useState([]);
  const [loadingRecords, setLoadingRecords] = useState(true);
  
  // Filters
  const [selectedBusFilter, setSelectedBusFilter] = useState("all");
  const [studentStatusFilter, setStudentStatusFilter] = useState("all");
  const [busSearchQuery, setBusSearchQuery] = useState("");
  const [studentSearchQuery, setStudentSearchQuery] = useState("");

  const [menuOpen, setMenuOpen] = useState(false);
  const [adminProfile, setAdminProfile] = useState(() => {
    try {
      const stored = localStorage.getItem("scanigo_admin_profile");
      return stored ? JSON.parse(stored) : null;
    } catch {
      return null;
    }
  });

  // Verify Admin Authentication
  useEffect(() => {
    const unsub = auth.onAuthStateChanged((user) => {
      const stored = localStorage.getItem("scanigo_admin_profile");
      if (!user && !stored) {
        navigate("/admin-login");
      } else if (stored && !adminProfile) {
        try {
          setAdminProfile(JSON.parse(stored));
        } catch {}
      }
    });
    return () => unsub();
  }, [navigate]);

  // Map Refs for Home preview
  const homeMapRef = useRef(null);
  const homeMapInstanceRef = useRef(null);

  // 1. Sync Live Buses from Firestore (LiveBus collection)
  useEffect(() => {
    const unsub = onSnapshot(
      collection(db, "LiveBus"),
      (snap) => {
        const liveMap = {};
        snap.docs.forEach((d) => {
          const data = d.data();
          const busId = d.id;
          const isLiveNow = isBusTelemetryLive(data);
          liveMap[busId] = {
            id: busId,
            busNo: busId,
            status: isLiveNow ? "On Route" : (data.status === "Moving" ? "Offline (GPS Stale)" : (data.status || "Offline")),
            route: data.route || "Campus Transit Corridor",
            location: data.location || (isLiveNow ? "Broadcasting Real GPS" : "Depot"),
            speed: isLiveNow && data.speed ? `${data.speed} km/h` : "0 km/h",
            lat: data.lat || 12.975,
            lng: data.lng || 80.215,
            driver: data.driverName || data.driver || "Driver",
            phone: data.driverPhone || data.phone || "",
            driverPhoto: data.driverPhoto || data.photo || "",
            isLive: isLiveNow,
            updatedAt: data.updatedAt,
          };
        });

        // Merge defaults with live database buses
        const merged = DEFAULT_CAMPUS_BUSES.map((def) => {
          return liveMap[def.id] ? { ...def, ...liveMap[def.id] } : def;
        });

        // Add any other buses found in Firestore
        Object.keys(liveMap).forEach((id) => {
          if (!merged.some((m) => m.id === id)) {
            merged.push(liveMap[id]);
          }
        });

        setBuses(merged);
      },
      (err) => {
        console.warn("Admin LiveBus sync notice:", err);
      }
    );

    return () => unsub();
  }, []);

  // 2. Sync Real Student Attendance Records from Firestore (ScanHistory & Students)
  useEffect(() => {
    let scanRecords = [];
    let registeredStudents = [];

    const updateCombinedRecords = () => {
      const recordsMap = new Map();

      // First add real scanned passenger records (status = Present)
      scanRecords.forEach((s) => {
        recordsMap.set(s.key, s);
      });

      // Then add registered students from Students collection
      registeredStudents.forEach((st) => {
        const key = st.regNo || st.uid;
        if (!recordsMap.has(key)) {
          recordsMap.set(key, {
            id: st.uid || st.regNo,
            key: key,
            name: st.name || "Student",
            classGrade: st.dept || "Department",
            regNo: st.regNo || "-",
            status: "Absent",
            time: "-",
            busNo: st.busNo || "V11",
            route: st.route || "Campus Route",
            initial: (st.name || "S").charAt(0).toUpperCase(),
            color: "red",
          });
        }
      });

      const list = Array.from(recordsMap.values());
      setStudents(list);
      setLoadingRecords(false);
    };

    // A. Listen to ScanHistory (live scans done by drivers)
    const qScans = query(collection(db, "ScanHistory"), orderBy("scannedAt", "desc"));
    const unsubScans = onSnapshot(qScans, (snap) => {
      scanRecords = snap.docs.map((d) => {
        const data = d.data();
        const dTime = data.scannedAt?.toDate ? data.scannedAt.toDate() : new Date();
        const name = data.studentName || "Student Passenger";
        const reg = data.regNo || data.studentId || d.id.substring(0, 6);
        return {
          id: data.studentId || d.id,
          key: reg,
          name: name,
          classGrade: data.dept || "B.Tech IT",
          regNo: reg,
          status: "Present",
          time: dTime.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
          busNo: data.busNo || "V11",
          route: data.route || "Campus Corridor",
          driverName: data.driverName || "",
          initial: name.charAt(0).toUpperCase() || "S",
          color: "blue",
        };
      });
      updateCombinedRecords();
    }, (err) => {
      console.warn("ScanHistory sync notice:", err);
      setLoadingRecords(false);
    });

    // B. Listen to Students collection (all enrolled transit students)
    const unsubStudents = onSnapshot(collection(db, "Students"), (snap) => {
      registeredStudents = snap.docs.map((d) => ({
        uid: d.id,
        ...d.data(),
      }));
      updateCombinedRecords();
    }, (err) => {
      console.warn("Students collection sync notice:", err);
      setLoadingRecords(false);
    });

    return () => {
      unsubScans();
      unsubStudents();
    };
  }, []);

  // 3. Leaflet Map setup function (Clean live vehicle tracking, NO fake waypoints)
  const setupMap = (containerElement, instanceRef) => {
    if (!containerElement) return;

    if (instanceRef.current) {
      try {
        instanceRef.current.remove();
      } catch {
        // Ignored
      }
      instanceRef.current = null;
    }
    if (containerElement._leaflet_id) {
      delete containerElement._leaflet_id;
    }

    // Default map center
    const movingBuses = buses.filter((b) => b.isLive && b.lat && b.lng);
    const centerPos = movingBuses.length > 0
      ? [movingBuses[0].lat, movingBuses[0].lng]
      : [12.990, 80.223];

    const map = L.map(containerElement, {
      zoomControl: false,
      attributionControl: false,
    }).setView(centerPos, 14);

    // Free, styled Pastel Transit tiles
    addStyledTileLayer(map, "pastel");

    instanceRef.current = map;

    setTimeout(() => {
      if (instanceRef.current) instanceRef.current.invalidateSize();
    }, 200);

    // Render markers exclusively for active / moving buses
    buses.forEach((bus) => {
      if (!bus.lat || !bus.lng) return;

      const isLiveOnRoute = bus.isLive || bus.status === "On Route";
      const tagBg = isLiveOnRoute ? "#10B981" : "#64748B";

      const busIcon = L.divIcon({
        className: "",
        html: `
          <div style="display:flex;flex-direction:column;align-items:center;cursor:pointer;">
            <span style="font-size:11px;font-weight:700;background:#FFFFFF;color:#0F172A;padding:3px 8px;border-radius:12px;box-shadow:0 4px 10px rgba(0,0,0,0.18);border:2px solid ${tagBg};white-space:nowrap;margin-bottom:3px;display:flex;align-items:center;gap:4px;">
              <span style="color:${tagBg};font-size:8px;">●</span> Bus ${bus.id}
            </span>
            <div style="position:relative;">
              <img src="/images/school_bus_marker.png" style="width:42px;height:42px;object-fit:contain;filter:drop-shadow(0 4px 8px rgba(0,0,0,0.25));" />
              ${isLiveOnRoute ? '<span style="position:absolute;top:0;right:0;width:10px;height:10px;background:#10B981;border:2px solid #fff;border-radius:50%;"></span>' : ''}
            </div>
          </div>
        `,
        iconSize: [100, 56],
        iconAnchor: [50, 50],
      });

      L.marker([bus.lat, bus.lng], { icon: busIcon })
        .addTo(map)
        .on("click", () => {
          setSelectedBusFilter(bus.id);
          setActiveTab("students");
        });
    });
  };

  useEffect(() => {
    if (activeTab === "home" && homeMapRef.current) {
      setTimeout(() => setupMap(homeMapRef.current, homeMapInstanceRef), 150);
    }
  }, [activeTab, buses]);

  // 4. Single-Click Bus Selection handler
  const handleSelectBusCard = (busId) => {
    setSelectedBusFilter(busId);
    setActiveTab("students");
  };

  // 5. PDF Export Feature (Reliable jspdf + autoTable)
  const handleDownloadPDF = () => {
    try {
      const doc = new jsPDF();

      // Vibrant Blue Top Banner
      doc.setFillColor(37, 99, 235);
      doc.rect(0, 0, 210, 26, "F");

      doc.setFont("helvetica", "bold");
      doc.setFontSize(16);
      doc.setTextColor(255, 255, 255);
      doc.text("ScaniGo - Student Attendance & Transport Records", 14, 17);

      // Meta details
      doc.setFont("helvetica", "normal");
      doc.setFontSize(10);
      doc.setTextColor(71, 85, 105);
      const busLabel = selectedBusFilter === "all" ? "All Fleet Buses" : `Bus ${selectedBusFilter}`;
      const presentRecs = filteredStudents.filter(s => s.status === "Present").length;
      const absentRecs = filteredStudents.filter(s => s.status !== "Present").length;
      
      doc.text(`Selected Bus: ${busLabel}`, 14, 35);
      doc.text(`Report Generated: ${new Date().toLocaleString()}`, 14, 41);
      doc.text(`Total Records: ${filteredStudents.length} (Present: ${presentRecs} | Absent / Pending: ${absentRecs})`, 14, 47);

      // Table data
      const tableData = filteredStudents.map((s, idx) => [
        idx + 1,
        s.name || "Student",
        s.regNo || s.id || "-",
        s.classGrade || "Department",
        s.busNo || "-",
        s.time !== "-" ? s.time : "Absent / Pending",
        s.status || "Present",
      ]);

      autoTable(doc, {
        startY: 53,
        head: [["#", "Student Name", "Register No", "Class / Dept", "Bus No", "Board Time", "Status"]],
        body: tableData.length > 0 ? tableData : [["-", "No attendance records found for this bus filter", "-", "-", "-", "-", "-"]],
        theme: "striped",
        headStyles: { fillColor: [37, 99, 235], fontStyle: "bold" },
        styles: { fontSize: 9, cellPadding: 3.5 },
        alternateRowStyles: { fillColor: [248, 250, 252] },
      });

      const fileSuffix = selectedBusFilter === "all" ? "All_Buses" : selectedBusFilter.replace(/\s+/g, "_");
      doc.save(`ScaniGo_Attendance_${fileSuffix}_${new Date().toISOString().slice(0, 10)}.pdf`);
    } catch (err) {
      console.error("PDF download error:", err);
      alert("Could not generate PDF: " + err.message);
    }
  };

  // 5b. Excel Export Feature (Reliable XLSX workbook generation)
  const handleDownloadExcel = () => {
    try {
      const exportData = filteredStudents.map((s, idx) => ({
        "S.No": idx + 1,
        "Student Name": s.name || "Student",
        "Register No": s.regNo || s.id || "-",
        "Department / Class": s.classGrade || "Department",
        "Bus No": s.busNo || "-",
        "Boarding Time": s.time !== "-" ? s.time : "Absent / Pending",
        "Attendance Status": s.status || "Present",
      }));

      const worksheet = XLSX.utils.json_to_sheet(exportData.length > 0 ? exportData : [
        { "Notice": "No attendance records found for this bus filter" }
      ]);
      const workbook = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(workbook, worksheet, "Attendance");
      const fileSuffix = selectedBusFilter === "all" ? "All_Buses" : selectedBusFilter.replace(/\s+/g, "_");
      XLSX.writeFile(workbook, `ScaniGo_Attendance_${fileSuffix}_${new Date().toISOString().slice(0, 10)}.xlsx`);
    } catch (err) {
      console.error("Excel download error:", err);
      alert("Could not generate Excel file: " + err.message);
    }
  };

  // Dynamic Metrics
  const activeBusesCount = buses.filter((b) => b.isLive || b.status === "On Route").length;
  const presentCount = students.filter((s) => s.status === "Present").length;
  const absentCount = students.filter((s) => s.status !== "Present").length;
  const attendanceRate = students.length > 0 ? ((presentCount / students.length) * 100).toFixed(1) : "100.0";

  // Dynamic list of unique available bus numbers
  const busOptions = Array.from(
    new Set([...buses.map((b) => b.id), "V11", "V14", "V3", ...students.map((s) => s.busNo)])
  ).filter(Boolean);

  // Filter Buses for Screen 2
  const filteredBuses = buses.filter((b) => {
    return (
      b.id.toLowerCase().includes(busSearchQuery.toLowerCase()) ||
      b.route.toLowerCase().includes(busSearchQuery.toLowerCase()) ||
      b.location.toLowerCase().includes(busSearchQuery.toLowerCase())
    );
  });

  // Filter Students for Screen 3
  const filteredStudents = students.filter((s) => {
    const matchBus = selectedBusFilter === "all" || s.busNo === selectedBusFilter;
    const matchStatus =
      studentStatusFilter === "all" ||
      s.status.toLowerCase() === studentStatusFilter.toLowerCase();
    const matchSearch =
      s.name.toLowerCase().includes(studentSearchQuery.toLowerCase()) ||
      (s.regNo && s.regNo.toLowerCase().includes(studentSearchQuery.toLowerCase())) ||
      (s.classGrade && s.classGrade.toLowerCase().includes(studentSearchQuery.toLowerCase()));
    return matchBus && matchStatus && matchSearch;
  });

  /* ---------------- SCREEN 1 RENDER: HOME OVERVIEW ---------------- */
  const renderHomeScreen = () => (
    <div style={{ flex: 1, display: "flex", flexDirection: "column" }}>
      {/* Top Navy Hero Banner */}
      <div className="admin-hero-banner">
        <div className="admin-hero-top-row">
          <div style={{ display: "flex", alignItems: "center", gap: "12px" }}>
            <button
              onClick={() => setMenuOpen(!menuOpen)}
              style={{ background: "none", border: "none", color: "#FFFFFF", fontSize: "20px", cursor: "pointer" }}
            >
              ☰
            </button>
            <div className="admin-brand-group">
              <span className="admin-brand-icon">🚌</span>
              <div>
                <div className="admin-brand-name">Scanigo</div>
                <div className="admin-brand-sub">Smart Campus Transport</div>
              </div>
            </div>
          </div>

          <div className="admin-profile-pill" onClick={() => setMenuOpen(!menuOpen)}>
            <div className="admin-avatar-circle">A</div>
            <span className="admin-profile-name">Admin ⌄</span>
          </div>
        </div>

        <div className="admin-welcome-text">
          <h1>Welcome Back, Admin 👋</h1>
          <p>Monitor live moving buses, student attendance and fleet operations in real time.</p>
        </div>
      </div>

      {menuOpen && (
        <div
          style={{
            background: "#FFFFFF",
            borderRadius: "16px",
            margin: "8px 16px",
            padding: "12px",
            boxShadow: "0 10px 25px rgba(0,0,0,0.1)",
            border: "1px solid #E2E8F0",
            zIndex: 200,
          }}
        >
          <button
            onClick={() => {
              deleteCookie("scanigo_remember_admin");
              sessionStorage.removeItem("scanigo_current_role");
              localStorage.removeItem("scanigo_admin_profile");
              signOut(auth);
              navigate("/admin-login");
            }}
            style={{
              width: "100%",
              padding: "10px",
              background: "#FEF2F2",
              color: "#DC2626",
              border: "none",
              borderRadius: "10px",
              fontWeight: 700,
              cursor: "pointer",
            }}
          >
            🚪 Sign Out from Admin Panel
          </button>
        </div>
      )}

      {/* 2x2 Dynamic Stat Cards Grid */}
      <div className="admin-stats-2x2">
        <div className="admin-stat-card-clean" onClick={() => setActiveTab("buses")} style={{ cursor: "pointer" }}>
          <div className="admin-stat-icon-wrap admin-stat-icon-blue">🚌</div>
          <div className="admin-stat-number">{buses.length}</div>
          <div className="admin-stat-label-text">Campus Fleet</div>
          <div className="admin-stat-sub-green">↑ {activeBusesCount} active on route</div>
        </div>

        <div
          className="admin-stat-card-clean"
          onClick={() => {
            setSelectedBusFilter("all");
            setActiveTab("students");
          }}
          style={{ cursor: "pointer" }}
        >
          <div className="admin-stat-icon-wrap admin-stat-icon-green">👥</div>
          <div className="admin-stat-number">{students.length}</div>
          <div className="admin-stat-label-text">Total Records</div>
          <div className="admin-stat-sub-green">{attendanceRate}% present</div>
        </div>

        <div className="admin-stat-card-clean" onClick={() => { setStudentStatusFilter("present"); setActiveTab("students"); }} style={{ cursor: "pointer" }}>
          <div className="admin-stat-icon-wrap admin-stat-icon-green">✓</div>
          <div className="admin-stat-number">{presentCount}</div>
          <div className="admin-stat-label-text">Present Scanned</div>
          <div className="admin-stat-sub-muted">{attendanceRate}% attendance</div>
        </div>

        <div className="admin-stat-card-clean" onClick={() => { setStudentStatusFilter("absent"); setActiveTab("students"); }} style={{ cursor: "pointer" }}>
          <div className="admin-stat-icon-wrap admin-stat-icon-red">👤</div>
          <div className="admin-stat-number">{absentCount}</div>
          <div className="admin-stat-label-text">Absent / Pending</div>
          <div className="admin-stat-sub-muted">{students.length > 0 ? ((absentCount / students.length) * 100).toFixed(1) : "0"}% of records</div>
        </div>
      </div>

      {/* Live Tracking Card */}
      <div className="admin-live-map-card">
        <div className="admin-card-header-row">
          <h3>Live Moving Buses</h3>
          <span className="admin-view-all-link" onClick={() => setActiveTab("buses")}>
            View Fleet →
          </span>
        </div>

        <div className="admin-map-preview-frame">
          <div ref={homeMapRef} style={{ width: "100%", height: "100%" }} />
        </div>

        <div className="admin-map-legend">
          <div className="admin-legend-item">
            <span className="legend-dot green" />
            <span>On Route ({activeBusesCount})</span>
          </div>
          <div className="admin-legend-item">
            <span className="legend-dot grey" />
            <span>Depot / Offline ({buses.length - activeBusesCount})</span>
          </div>
        </div>
      </div>
    </div>
  );

  /* ---------------- SCREEN 2 RENDER: BUSES LIST ---------------- */
  const renderBusesScreen = () => (
    <div style={{ flex: 1, display: "flex", flexDirection: "column" }}>
      <div className="admin-screen-header">
        <button className="admin-back-btn" onClick={() => setActiveTab("home")}>
          ‹
        </button>
        <h2 className="admin-screen-title">Campus Buses</h2>
        <div style={{ width: "24px" }} />
      </div>

      <div className="admin-search-filter-row">
        <div className="admin-pill-search">
          <span style={{ color: "#94A3B8" }}>🔍</span>
          <input
            type="text"
            placeholder="Search bus number or route..."
            value={busSearchQuery}
            onChange={(e) => setBusSearchQuery(e.target.value)}
          />
        </div>
        <button className="admin-filter-icon-btn" onClick={() => setBusSearchQuery("")}>
          ⫪
        </button>
      </div>

      <div className="admin-buses-list-scroll">
        {filteredBuses.map((bus) => {
          const isOnRoute = bus.isLive || bus.status === "On Route";

          return (
            <div
              key={bus.id}
              className="admin-bus-item-card"
              onClick={() => handleSelectBusCard(bus.id)}
              title="Click to view student attendance for this bus"
            >
              <div className="admin-bus-thumb-box">
                <img
                  src="/images/school_bus_marker.png"
                  alt="Bus"
                  className="admin-bus-thumb-img"
                />
              </div>

              <div className="admin-bus-details-col">
                <div className="admin-bus-title-row">
                  <span className="admin-bus-code">Bus {bus.id}</span>
                  <span
                    className={
                      isOnRoute
                        ? "admin-badge-onroute"
                        : "admin-badge-offline"
                    }
                  >
                    ● {isOnRoute ? "On Route" : "Depot"}
                  </span>
                </div>

                <div className="admin-bus-route-text">{bus.route}</div>

                <div className="admin-bus-meta-line">
                  <span>📍 {bus.location}</span>
                  <span>⏲️ {bus.speed}</span>
                  {bus.driver && <span>👤 {bus.driver}</span>}
                </div>
              </div>

              <span className="admin-bus-chevron">›</span>
            </div>
          );
        })}
      </div>
    </div>
  );

  /* ---------------- SCREEN 3 RENDER: STUDENT RECORDS & ATTENDANCE ---------------- */
  const renderStudentsScreen = () => (
    <div style={{ flex: 1, display: "flex", flexDirection: "column" }}>
      <div className="admin-screen-header">
        <button className="admin-back-btn" onClick={() => setActiveTab("buses")}>
          ‹
        </button>
        <h2 className="admin-screen-title">
          Attendance Records
        </h2>
        <div style={{ width: "24px" }} />
      </div>

      {/* Prominent Bus Filter Dropdown */}
      <div style={{ padding: "0 16px 10px" }}>
        <div style={{ display: "flex", alignItems: "center", gap: "8px", background: "#F1F5F9", padding: "6px 12px", borderRadius: "12px" }}>
          <span style={{ fontSize: "12px", fontWeight: 700, color: "#475569", whiteSpace: "nowrap" }}>
            Select Bus:
          </span>
          <select
            value={selectedBusFilter}
            onChange={(e) => setSelectedBusFilter(e.target.value)}
            style={{
              flex: 1,
              padding: "6px 10px",
              borderRadius: "8px",
              border: "1px solid #CBD5E1",
              background: "#FFFFFF",
              fontSize: "13px",
              fontWeight: 600,
              color: "#0F172A",
              cursor: "pointer",
              outline: "none",
            }}
          >
            <option value="all">🚌 All Fleet Buses ({students.length} Records)</option>
            {busOptions.map((bId) => {
              const count = students.filter((s) => s.busNo === bId).length;
              return (
                <option key={bId} value={bId}>
                  Bus {bId} ({count} record{count !== 1 ? "s" : ""})
                </option>
              );
            })}
          </select>
        </div>
      </div>

      {/* Segmented Status Tabs */}
      <div className="admin-segmented-tabs">
        <button
          className={`admin-tab-pill ${studentStatusFilter === "all" ? "active" : ""}`}
          onClick={() => setStudentStatusFilter("all")}
        >
          All ({filteredStudents.length})
        </button>
        <button
          className={`admin-tab-pill ${studentStatusFilter === "present" ? "active" : ""}`}
          onClick={() => setStudentStatusFilter("present")}
        >
          Present ({students.filter(s => (selectedBusFilter === "all" || s.busNo === selectedBusFilter) && s.status === "Present").length})
        </button>
        <button
          className={`admin-tab-pill ${studentStatusFilter === "absent" ? "active" : ""}`}
          onClick={() => setStudentStatusFilter("absent")}
        >
          Absent ({students.filter(s => (selectedBusFilter === "all" || s.busNo === selectedBusFilter) && s.status !== "Present").length})
        </button>
      </div>

      {/* Search Bar */}
      <div className="admin-search-filter-row">
        <div className="admin-pill-search">
          <span style={{ color: "#94A3B8" }}>🔍</span>
          <input
            type="text"
            placeholder="Search student name, register no..."
            value={studentSearchQuery}
            onChange={(e) => setStudentSearchQuery(e.target.value)}
          />
        </div>
        <button
          className="admin-filter-icon-btn"
          onClick={() => {
            setSelectedBusFilter("all");
            setStudentStatusFilter("all");
            setStudentSearchQuery("");
          }}
          title="Reset filters"
        >
          ⫪
        </button>
      </div>

      {/* Students / Attendance List */}
      <div className="admin-students-list-scroll">
        {loadingRecords ? (
          <div style={{ textAlign: "center", padding: "40px 20px", color: "#64748B" }}>
            <p style={{ fontWeight: 600 }}>Loading attendance records from Firestore...</p>
          </div>
        ) : filteredStudents.length === 0 ? (
          <div style={{ textAlign: "center", padding: "40px 20px", color: "#64748B" }}>
            <p style={{ fontSize: "28px", marginBottom: "8px" }}>📋</p>
            <p style={{ fontWeight: 600, color: "#0F172A", marginBottom: "4px" }}>
              {selectedBusFilter !== "all" ? `No records found for Bus ${selectedBusFilter}` : "No attendance records found"}
            </p>
            <p style={{ fontSize: "13px", color: "#64748B", marginBottom: "12px" }}>
              Passenger boarding records will appear here as soon as the driver scans QR passes.
            </p>
            <button
              onClick={() => {
                setSelectedBusFilter("all");
                setStudentStatusFilter("all");
              }}
              style={{
                background: "#EFF6FF",
                color: "#2563EB",
                border: "none",
                padding: "8px 16px",
                borderRadius: "9999px",
                fontWeight: 600,
                cursor: "pointer",
              }}
            >
              Show All Buses
            </button>
          </div>
        ) : (
          filteredStudents.map((s) => (
            <div key={s.id + (s.time || "")} className="admin-student-item-row">
              <div className={`admin-student-initial-circle ${s.color || "blue"}`}>
                {s.initial}
              </div>

              <div className="admin-student-info-col">
                <div className="admin-student-name">{s.name}</div>
                <div className="admin-student-sub">
                  {s.regNo || s.id} • Bus {s.busNo} • {s.classGrade}
                </div>
              </div>

              <div className="admin-student-status-col">
                <span
                  className={`admin-status-tag ${
                    s.status === "Present" ? "present" : "absent"
                  }`}
                >
                  {s.status}
                </span>
                <span className="admin-status-time">{s.time}</span>
              </div>
            </div>
          ))
        )}
      </div>

      {/* Export Action Box (PDF & Excel) */}
      <div className="admin-pdf-action-box" style={{ display: "flex", flexDirection: "column", gap: "8px" }}>
        <div style={{ display: "flex", gap: "10px", width: "100%" }}>
          <button
            type="button"
            className="admin-download-pdf-btn"
            onClick={handleDownloadPDF}
            style={{ flex: 1 }}
          >
            <span style={{ fontSize: "16px" }}>📄</span>
            <span>PDF ({selectedBusFilter === "all" ? "All" : selectedBusFilter})</span>
          </button>
          <button
            type="button"
            className="admin-download-pdf-btn"
            onClick={handleDownloadExcel}
            style={{ flex: 1, background: "#059669", borderColor: "#047857" }}
          >
            <span style={{ fontSize: "16px" }}>📊</span>
            <span>Excel (.xlsx)</span>
          </button>
        </div>
        <div className="admin-pdf-caption">Export official ScaniGo attendance & boarding spreadsheets</div>
      </div>
    </div>
  );

  /* ---------------- BOTTOM NAVBAR ---------------- */
  const renderBottomNavbar = (currentTab, onTabSelect) => (
    <nav className="admin-bottom-navbar">
      <div
        className={`admin-nav-item-tab ${currentTab === "home" ? "active" : ""}`}
        onClick={() => onTabSelect("home")}
      >
        <span className="admin-nav-tab-icon">🏠</span>
        <span>Home</span>
      </div>

      <div
        className={`admin-nav-item-tab ${currentTab === "buses" ? "active" : ""}`}
        onClick={() => onTabSelect("buses")}
      >
        <span className="admin-nav-tab-icon">🚌</span>
        <span>Buses</span>
      </div>

      <div
        className={`admin-nav-item-tab ${currentTab === "students" ? "active" : ""}`}
        onClick={() => onTabSelect("students")}
      >
        <span className="admin-nav-tab-icon">👥</span>
        <span>Attendance</span>
      </div>

      <div
        className={`admin-nav-item-tab ${currentTab === "chatbot" ? "active" : ""}`}
        onClick={() => onTabSelect("chatbot")}
      >
        <span className="admin-nav-tab-icon">🤖</span>
        <span>Chat-Bot</span>
      </div>
    </nav>
  );

  return (
    <div className="admin-mobile-shell">
      <div className="admin-mobile-viewport">
        {activeTab === "home" && renderHomeScreen()}
        {activeTab === "buses" && renderBusesScreen()}
        {activeTab === "students" && renderStudentsScreen()}
        {activeTab === "chatbot" && (
          <AdminChatBot buses={buses} students={students} />
        )}

        {renderBottomNavbar(activeTab, setActiveTab)}
      </div>
    </div>
  );
}