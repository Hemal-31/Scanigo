import React from "react";
import { Navigate, useLocation } from "react-router-dom";
import { auth } from "../config/firebase";
import { getCookie } from "../utils/cookieUtils";

/**
 * Route guard component to enforce authentication and role-based access.
 * Checks Firebase Auth currentUser, session/local storage, and persistent cookies.
 */
export default function ProtectedRoute({ children, allowedRole, redirectPath }) {
  const location = useLocation();

  const isRoleValid = () => {
    const currentRole = sessionStorage.getItem("scanigo_current_role");
    const currentUser = auth.currentUser;
    const cookie = getCookie("scanigo_remember_" + allowedRole);

    if (allowedRole === "student") {
      const studentProfile = localStorage.getItem("scanigo_student_profile");
      if (studentProfile) {
        try {
          const parsed = JSON.parse(studentProfile);
          if (parsed && (parsed.uid || parsed.email || parsed.regNo)) {
            return true;
          }
        } catch {
          /* ignore */
        }
      }
      if (cookie && (cookie.uid || cookie.email)) {
        return true;
      }
      return Boolean(currentUser && currentRole === "student");
    }

    if (allowedRole === "driver") {
      const driverProfile = localStorage.getItem("scanigo_driver_profile") || localStorage.getItem("scanigo_driver");
      if (driverProfile) {
        try {
          const parsed = JSON.parse(driverProfile);
          if (parsed && (parsed.uid || parsed.email || parsed.busNo)) {
            return true;
          }
        } catch {
          /* ignore */
        }
      }
      if (cookie && (cookie.uid || cookie.email || cookie.busNo)) {
        return true;
      }
      return Boolean(currentUser && currentRole === "driver");
    }

    if (allowedRole === "admin") {
      const adminProfile = localStorage.getItem("scanigo_admin_profile");
      if (adminProfile) {
        try {
          const parsed = JSON.parse(adminProfile);
          if (parsed && (parsed.email || parsed.uid || parsed.role === "admin")) {
            return true;
          }
        } catch {
          /* ignore */
        }
      }
      if (cookie && (cookie.email || cookie.uid)) {
        return true;
      }
      return Boolean(currentUser && currentRole === "admin");
    }

    return false;
  };


  if (!isRoleValid()) {
    const fallbackPath = redirectPath || (
      allowedRole === "admin"
        ? "/admin-login"
        : allowedRole === "driver"
        ? "/driver-login"
        : "/student-login"
    );

    return <Navigate to={fallbackPath} state={{ from: location }} replace />;
  }

  return children;
}
