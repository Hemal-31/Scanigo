import React, { useEffect, useState } from "react";
import { auth, db } from "../../config/firebase";
import { doc, getDoc } from "firebase/firestore";
import { useNavigate, useLocation } from "react-router-dom";
import { setCookie } from "../../utils/cookieUtils";
import { saveDriverProfile, saveLiveBus } from "../../services/firestoreService";
import "../../assets/styles/DriverDetails.css";

function DriverDetails() {
  const navigate = useNavigate();
  const location = useLocation();

  const user = auth.currentUser;

  const [name, setName] = useState(
    location?.state?.name || user?.displayName || ""
  );
  const [phone, setPhone] = useState(
    location?.state?.phone || user?.phoneNumber || ""
  );
  const [busNo, setBusNo] = useState(location?.state?.busNo || "V11");
  const [route, setRoute] = useState(location?.state?.route || "Route 1");
  const [loading, setLoading] = useState(false);

  const photo =
    user?.photoURL ||
    location?.state?.photo ||
    `https://ui-avatars.com/api/?name=${encodeURIComponent(name || user?.displayName || "Driver")}&background=1A73E8&color=fff&size=128&bold=true`;
  const email = user?.email || location?.state?.email || "";

  useEffect(() => {
    // If user is already logged in, check if they have existing saved details
    const loadExisting = async () => {
      if (user?.uid) {
        try {
          const snap = await getDoc(doc(db, "Drivers", user.uid));
          if (snap.exists()) {
            const data = snap.data();
            if (data.name) setName((prev) => prev || data.name);
            if (data.phone) setPhone((prev) => prev || data.phone);
            if (data.busNo) setBusNo((prev) => prev || data.busNo);
            if (data.route) setRoute((prev) => prev || data.route);
          }
        } catch (err) {
          console.warn("Driver existing details lookup:", err);
        }
      }
    };
    loadExisting();
  }, [user]);

  const isFormComplete = name.trim() && phone.trim() && busNo && route;

  const handleSave = async (e) => {
    if (e) e.preventDefault();
    if (!isFormComplete) return;

    try {
      setLoading(true);

      const driverUid = user?.uid || location?.state?.uid || `driver_${Date.now()}`;
      const driverData = {
        uid: driverUid,
        name: name.trim(),
        phone: phone.trim(),
        email: email,
        photo: photo,
        driverPhoto: photo,
        busNo,
        route,
        role: "driver",
      };

      // 1. Structured Save to Drivers collection
      const savedDriver = await saveDriverProfile(driverUid, driverData);

      // 2. Structured Sync to LiveBus
      await saveLiveBus(busNo, {
        busNo,
        driverUid,
        driverName: name.trim(),
        driverPhone: phone.trim(),
        driverPhoto: photo,
        route,
      });

      // 3. Save to localStorage and cookie
      sessionStorage.setItem("scanigo_current_role", "driver");
      localStorage.setItem("scanigo_driver", JSON.stringify(savedDriver));
      localStorage.setItem("scanigo_driver_profile", JSON.stringify(savedDriver));
      setCookie("scanigo_remember_driver", savedDriver, 30);

      // 4. Navigate to Driver Dashboard
      navigate("/driver-dashboard", { state: savedDriver });
    } catch (err) {
      console.error(err);
      alert("Failed to save driver details. Please try again.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="container">
      <h1 style={{ textAlign: "center", marginBottom: "6px" }}>Driver Details</h1>
      <p style={{ textAlign: "center", color: "#94A3B8", fontSize: "14px", marginBottom: "20px" }}>
        Enter your operator information for student bus tracking
      </p>

      {/* PROFILE PHOTO FROM GMAIL/GOOGLE */}
      <div style={{ textAlign: "center", margin: "16px 0 24px" }}>
        <div style={{ position: "relative", display: "inline-block" }}>
          <img
            src={photo}
            alt="Driver Profile"
            referrerPolicy="no-referrer"
            onError={(e) => {
              e.target.src = `https://ui-avatars.com/api/?name=${encodeURIComponent(name || "Driver")}&background=1A73E8&color=fff&size=128&bold=true`;
            }}
            style={{
              width: "110px",
              height: "110px",
              borderRadius: "50%",
              border: "3px solid #10B981",
              objectFit: "cover",
              boxShadow: "0 8px 24px rgba(16, 185, 129, 0.25)",
            }}
          />
          <span
            style={{
              position: "absolute",
              bottom: "4px",
              right: "4px",
              background: "#10B981",
              borderRadius: "50%",
              width: "24px",
              height: "24px",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              fontSize: "12px",
              border: "2px solid #000",
            }}
            title="Google Account Photo"
          >
            ✓
          </span>
        </div>
        {email && (
          <p style={{ color: "#94A3B8", fontSize: "13px", marginTop: "8px" }}>
            {email}
          </p>
        )}
      </div>

      <form onSubmit={handleSave}>
        {/* DRIVER NAME */}
        <div className="form-group">
          <label>Driver Full Name</label>
          <input
            type="text"
            placeholder="Enter driver name"
            value={name}
            onChange={(e) => setName(e.target.value)}
            required
          />
        </div>

        {/* PHONE NUMBER */}
        <div className="form-group">
          <label>Phone Number (for Student Calls)</label>
          <input
            type="tel"
            placeholder="e.g. +91 98401 12345"
            value={phone}
            onChange={(e) => setPhone(e.target.value)}
            required
          />
        </div>

        {/* BUS NUMBER */}
        <div className="form-group form-group-select">
          <label>Assigned Bus Number</label>
          <select value={busNo} onChange={(e) => setBusNo(e.target.value)} required>
            <option value="">-- Select Bus --</option>
            <option value="V11">V11</option>
            <option value="V14">V14</option>
            <option value="V3">V3</option>
          </select>
        </div>

        {/* ROUTE */}
        <div className="form-group form-group-select">
          <label>Assigned Route</label>
          <select value={route} onChange={(e) => setRoute(e.target.value)} required>
            <option value="">-- Select Route --</option>
            <option value="Route 1">Route 1</option>
            <option value="Route 2">Route 2</option>
            <option value="Route 3">Route 3</option>
          </select>
        </div>

        {/* SAVE */}
        <button
          type="submit"
          className="login-btn"
          disabled={!isFormComplete || loading}
          style={{
            marginTop: "16px",
            opacity: isFormComplete ? 1 : 0.5,
            cursor: isFormComplete ? "pointer" : "not-allowed",
          }}
        >
          {loading ? "Saving Profile..." : "Continue to Dashboard"}
        </button>
      </form>
    </div>
  );
}

export default DriverDetails;
