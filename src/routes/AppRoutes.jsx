import React from "react";
import { Routes, Route } from "react-router-dom";
import ProtectedRoute from "./ProtectedRoute";
import {
  TrackerWelcome,
  TrackerShowcase,
  RoleSelect,
  StudentLogin,
  EnterDetails,
  StudentDashboard,
  BusTrackingPage,
  DriverLogin,
  DriverDetails,
  DriverDashboard,
  AdminLogin,
  AdminDashboard,
} from "../pages";

export default function AppRoutes() {
  return (
    <Routes>
      {/* LANDING & ONBOARDING */}
      <Route path="/" element={<TrackerWelcome />} />
      <Route path="/showcase" element={<TrackerShowcase />} />
      <Route path="/roles" element={<RoleSelect />} />

      {/* STUDENT PORTAL */}
      <Route path="/student-login" element={<StudentLogin />} />
      <Route
        path="/enter-details"
        element={
          <ProtectedRoute allowedRole="student">
            <EnterDetails />
          </ProtectedRoute>
        }
      />
      <Route
        path="/student-dashboard"
        element={
          <ProtectedRoute allowedRole="student">
            <StudentDashboard />
          </ProtectedRoute>
        }
      />
      <Route
        path="/bus-tracking"
        element={
          <ProtectedRoute allowedRole="student">
            <BusTrackingPage />
          </ProtectedRoute>
        }
      />

      {/* DRIVER PORTAL */}
      <Route path="/driver-login" element={<DriverLogin />} />
      <Route
        path="/driver-details"
        element={
          <ProtectedRoute allowedRole="driver">
            <DriverDetails />
          </ProtectedRoute>
        }
      />
      <Route
        path="/driver-dashboard"
        element={
          <ProtectedRoute allowedRole="driver">
            <DriverDashboard />
          </ProtectedRoute>
        }
      />
      <Route
        path="/driver"
        element={
          <ProtectedRoute allowedRole="driver">
            <DriverDashboard />
          </ProtectedRoute>
        }
      />

      {/* ADMIN PORTAL */}
      <Route path="/admin-login" element={<AdminLogin />} />
      <Route
        path="/admin-dashboard"
        element={
          <ProtectedRoute allowedRole="admin">
            <AdminDashboard />
          </ProtectedRoute>
        }
      />
      <Route
        path="/admin"
        element={
          <ProtectedRoute allowedRole="admin">
            <AdminDashboard />
          </ProtectedRoute>
        }
      />

      {/* 404 NOT FOUND FALLBACK */}
      <Route
        path="*"
        element={
          <div style={{ textAlign: "center", padding: "60px 20px" }}>
            <h1 style={{ color: "#0F172A", marginBottom: "16px" }}>Page Not Found</h1>
            <a href="/" style={{ color: "#3B82F6", fontWeight: 700, textDecoration: "none" }}>
              ← Return Home
            </a>
          </div>
        }
      />
    </Routes>
  );
}

