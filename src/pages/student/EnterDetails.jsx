import React, { useState, useEffect } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import "../../assets/styles/EnterDetails.css";
import { auth } from "../../config/firebase";
import { setCookie } from "../../utils/cookieUtils";
import { saveStudentProfile } from "../../services/firestoreService";

function EnterDetails() {
  const location = useLocation();
  const navigate = useNavigate();

  // State hooks declared unconditionally at the top of the component
  const [route, setRoute] = useState("");
  const [busNo, setBusNo] = useState("");
  const [regNo, setRegNo] = useState("");
  const [dept, setDept] = useState("");
  const [boarding, setBoarding] = useState("");
  const [saving, setSaving] = useState(false);

  // Safety check: redirect to login if no state exists
  useEffect(() => {
    if (!location.state) {
      navigate("/student-login", { replace: true });
    }
  }, [location.state, navigate]);

  if (!location.state) {
    return null;
  }

  const { name = "", email = "", photo = "" } = location.state;

  const isFormComplete = Boolean(
    route &&
    busNo &&
    regNo.trim() &&
    dept.trim() &&
    boarding.trim()
  );

  const user = auth.currentUser;
  const targetUid = user?.uid || location.state.uid || `student_${Date.now()}`;
  const profilePhoto =
    photo ||
    user?.photoURL ||
    `https://ui-avatars.com/api/?name=${encodeURIComponent(
      name || "Student"
    )}&background=5B7C7D&color=fff&size=128&bold=true`;

  const generateQRToken = (uid) => {
    return `SCANIGO-${uid || "USER"}-${Date.now().toString(36)}`;
  };

  const handleContinue = async () => {
    if (!isFormComplete || saving) return;

    try {
      setSaving(true);
      const qrToken = generateQRToken(targetUid);

      const studentData = {
        uid: targetUid,
        name: (name || "Student").trim(),
        email: email || "",
        photo: profilePhoto,
        studentPhoto: profilePhoto,
        regNo: regNo.trim(),
        dept: dept.trim(),
        route,
        busNo,
        boarding: boarding.trim(),
        qrToken,
        role: "student",
      };

      // Save to Firestore via structured service
      const saved = await saveStudentProfile(targetUid, studentData);

      // Save to session, local storage & cookie
      sessionStorage.setItem("scanigo_current_role", "student");
      localStorage.setItem("scanigo_student_profile", JSON.stringify(saved));
      setCookie("scanigo_remember_student", saved, 30);

      // Go to dashboard
      navigate("/student-dashboard", {
        state: studentData,
      });
    } catch (err) {
      console.error("Error saving student data:", err);
      alert("Failed to save details. Please try again.");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="container">
      <h1 style={{ textAlign: "center", marginBottom: "25px" }}>Student Details</h1>

      {/* PROFILE PHOTO */}
      <div style={{ textAlign: "center", marginBottom: "30px" }}>
        <img
          src={profilePhoto}
          alt="profile"
          referrerPolicy="no-referrer"
          onError={(e) => {
            e.target.src = "/images/profile.png";
          }}
          style={{
            width: "120px",
            height: "120px",
            borderRadius: "50%",
            objectFit: "cover",
            border: "3px solid #5B7C7D",
          }}
        />
      </div>

      {/* NAME */}
      <div className="form-group">
        <label>Name</label>
        <input value={name} readOnly />
      </div>

      {/* EMAIL */}
      <div className="form-group">
        <label>Email</label>
        <input value={email} readOnly />
      </div>

      {/* REGISTER NUMBER */}
      <div className="form-group">
        <label>Register Number</label>
        <input value={regNo} onChange={(e) => setRegNo(e.target.value)} placeholder="e.g. 717822P128" />
      </div>

      {/* DEPARTMENT */}
      <div className="form-group">
        <label>Department</label>
        <input value={dept} onChange={(e) => setDept(e.target.value)} placeholder="e.g. Computer Science" />
      </div>

      {/* ROUTE */}
      <div className="form-group">
        <label>Route</label>
        <select value={route} onChange={(e) => setRoute(e.target.value)}>
          <option value="">-- Select Route --</option>
          <option value="Route 1">Route 1 – Campus Express</option>
          <option value="Route 2">Route 2 – Metro Link</option>
          <option value="Route 3">Route 3 – South Hub</option>
        </select>
      </div>

      {/* BUS NUMBER */}
      <div className="form-group">
        <label>Bus Number</label>
        <select value={busNo} onChange={(e) => setBusNo(e.target.value)}>
          <option value="">-- Select Bus --</option>
          <option value="V11">Bus V11</option>
          <option value="V14">Bus V14</option>
          <option value="V3">Bus V3</option>
        </select>
      </div>

      {/* BOARDING */}
      <div className="form-group">
        <label>Boarding Point</label>
        <input
          value={boarding}
          onChange={(e) => setBoarding(e.target.value)}
          placeholder="e.g. Main Campus Gate"
        />
      </div>

      <button
        className="login-btn"
        disabled={!isFormComplete || saving}
        onClick={handleContinue}
        style={{
          opacity: isFormComplete && !saving ? 1 : 0.5,
          cursor: isFormComplete && !saving ? "pointer" : "not-allowed",
        }}
      >
        {saving ? "Saving Details..." : "Continue to Dashboard"}
      </button>
    </div>
  );
}

export default EnterDetails;
