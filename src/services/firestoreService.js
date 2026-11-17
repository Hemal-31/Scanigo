/**
 * Scanigo Transit Network - Unified Structured Firestore Service
 * 
 * Provides clean, standardized schemas, data formatters, and query helpers
 * for easy reading and retrieving of data across all collections:
 * - Students
 * - Drivers
 * - Admins
 * - LiveBus
 * - Attendance
 * - ScanHistory
 */

import {
  doc,
  getDoc,
  setDoc,
  addDoc,
  collection,
  query,
  where,
  getDocs,
  serverTimestamp,
  onSnapshot,
} from "firebase/firestore";
import { db } from "../config/firebase.js";

// ==========================================
// 1. COLLECTION NAMES (Single Source of Truth)
// ==========================================
export const COLLECTIONS = {
  STUDENTS: "Students",
  DRIVERS: "Drivers",
  ADMINS: "Admins",
  LIVE_BUS: "LiveBus",
  ATTENDANCE: "Attendance",
  SCAN_HISTORY: "ScanHistory",
};

// Maximum age in milliseconds before a broadcasted GPS location is considered stale / offline
export const MAX_LIVE_STALENESS_MS = 120000; // 2 minutes (120 seconds)

/**
 * Safely parse any Firestore timestamp representation to epoch milliseconds
 */
export function parseFirestoreTimestamp(ts) {
  if (!ts) return null;
  if (typeof ts.toDate === "function") return ts.toDate().getTime();
  if (typeof ts.toMillis === "function") return ts.toMillis();
  if (typeof ts.seconds === "number") return ts.seconds * 1000;
  if (typeof ts === "string") {
    const parsed = new Date(ts).getTime();
    return isNaN(parsed) ? null : parsed;
  }
  if (typeof ts === "number") return ts;
  return null;
}

/**
 * Strict real-world evaluation of whether a bus is truly transmitting live GPS
 * Prevents phantom "live" buses when driver closed app days or weeks ago.
 */
export function isBusTelemetryLive(data, maxStalenessMs = MAX_LIVE_STALENESS_MS) {
  if (!data) return false;
  if (data.live !== true) return false;
  if (typeof data.lat !== "number" || typeof data.lng !== "number") return false;
  if (isNaN(data.lat) || isNaN(data.lng)) return false;

  const timeMs = parseFirestoreTimestamp(data.updatedAt);
  if (!timeMs) return false; // Stale or missing timestamp is treated as offline

  const ageMs = Date.now() - timeMs;
  return ageMs >= 0 && ageMs < maxStalenessMs;
}

// ==========================================
// 2. STRUCTURED DOCUMENT FORMATTERS
// ==========================================

/**
 * Standardize student profile structure
 */
export function formatStudentData(raw = {}) {
  const uid = raw.uid || "";
  const name = (raw.name || "Student").trim();
  const photo =
    raw.photo ||
    raw.studentPhoto ||
    `https://ui-avatars.com/api/?name=${encodeURIComponent(name)}&background=5B7C7D&color=fff&size=128&bold=true`;

  return {
    uid,
    name,
    email: (raw.email || "").trim().toLowerCase(),
    regNo: (raw.regNo || "").trim().toUpperCase(),
    dept: (raw.dept || "").trim(),
    route: (raw.route || "Route 1").trim(),
    busNo: (raw.busNo || "V11").trim().toUpperCase(),
    boarding: (raw.boarding || "Main Campus Gate").trim(),
    photo,
    studentPhoto: photo,
    qrToken: raw.qrToken || `SCANIGO-${raw.regNo || uid || "USER"}-${Date.now().toString(36)}`,
    role: "student",
    status: raw.status || "active",
    authProvider: raw.authProvider || "firebase",
    updatedAt: serverTimestamp(),
  };
}

/**
 * Standardize driver operator structure
 */
export function formatDriverData(raw = {}) {
  const uid = raw.uid || "";
  const name = (raw.name || "Driver").trim();
  const photo =
    raw.photo ||
    raw.driverPhoto ||
    `https://ui-avatars.com/api/?name=${encodeURIComponent(name)}&background=D97706&color=fff&size=128&bold=true`;

  return {
    uid,
    name,
    email: (raw.email || "").trim().toLowerCase(),
    phone: (raw.phone || "").trim(),
    busNo: (raw.busNo || "V11").trim().toUpperCase(),
    route: (raw.route || "Route 1 – Campus Express").trim(),
    photo,
    driverPhoto: photo,
    role: "driver",
    status: raw.status || "active",
    authProvider: raw.authProvider || "firebase",
    updatedAt: serverTimestamp(),
  };
}

/**
 * Standardize campus administrator structure
 */
export function formatAdminData(raw = {}) {
  const uid = raw.uid || "";
  const name = (raw.name || "Administrator").trim();
  const photo =
    raw.photo ||
    `https://ui-avatars.com/api/?name=${encodeURIComponent(name)}&background=1E3A8A&color=fff&size=128&bold=true`;

  return {
    uid,
    name,
    email: (raw.email || "").trim().toLowerCase(),
    phone: (raw.phone || "").trim(),
    photo,
    role: "admin",
    status: raw.status || "active",
    authProvider: raw.authProvider || "firebase",
    updatedAt: serverTimestamp(),
  };
}

/**
 * Standardize real-time LiveBus structure
 */
export function formatLiveBusData(raw = {}) {
  return {
    busNo: (raw.busNo || "V11").trim().toUpperCase(),
    driverUid: raw.driverUid || raw.uid || "",
    driverName: (raw.driverName || raw.name || "Assigned Driver").trim(),
    driverPhone: (raw.driverPhone || raw.phone || "").trim(),
    driverPhoto: raw.driverPhoto || raw.photo || "",
    route: (raw.route || "Route 1").trim(),
    lat: typeof raw.lat === "number" ? raw.lat : 12.975,
    lng: typeof raw.lng === "number" ? raw.lng : 80.215,
    speed: typeof raw.speed === "number" ? raw.speed : 0,
    heading: typeof raw.heading === "number" ? raw.heading : 0,
    live: Boolean(raw.live),
    status: raw.live ? "online" : "offline",
    updatedAt: serverTimestamp(),
  };
}

// ==========================================
// 3. STUDENT OPERATIONS
// ==========================================

export async function getStudentProfile(uid) {
  if (!uid) return null;
  try {
    const snap = await getDoc(doc(db, COLLECTIONS.STUDENTS, uid));
    if (snap.exists()) {
      return { id: snap.id, ...snap.data() };
    }
  } catch (err) {
    console.warn("Firestore getStudentProfile notice:", err);
  }
  return null;
}

export async function findStudentByEmail(email) {
  if (!email) return null;
  try {
    const q = query(
      collection(db, COLLECTIONS.STUDENTS),
      where("email", "==", email.trim().toLowerCase())
    );
    const snap = await getDocs(q);
    if (!snap.empty) {
      const d = snap.docs[0];
      return { id: d.id, ...d.data() };
    }
  } catch (err) {
    console.warn("Firestore findStudentByEmail notice:", err);
  }
  return null;
}

export async function saveStudentProfile(uid, data) {
  if (!uid) throw new Error("Student UID is required");
  const formatted = formatStudentData({ ...data, uid });
  try {
    await setDoc(doc(db, COLLECTIONS.STUDENTS, uid), formatted, { merge: true });
  } catch (err) {
    if (err.code === "permission-denied" || err.message?.includes("permissions") || err.message?.includes("permission")) {
      console.warn("[Firestore] Security Rules restricted Students write. Persisting locally.", err);
    } else {
      throw err;
    }
  }
  return formatted;
}

// ==========================================
// 4. DRIVER OPERATIONS
// ==========================================

export async function getDriverProfile(uid) {
  if (!uid) return null;
  try {
    const snap = await getDoc(doc(db, COLLECTIONS.DRIVERS, uid));
    if (snap.exists()) {
      return { id: snap.id, ...snap.data() };
    }
  } catch (err) {
    console.warn("Firestore getDriverProfile notice:", err);
  }
  return null;
}

export async function findDriverByEmail(email) {
  if (!email) return null;
  try {
    const q = query(
      collection(db, COLLECTIONS.DRIVERS),
      where("email", "==", email.trim().toLowerCase())
    );
    const snap = await getDocs(q);
    if (!snap.empty) {
      const d = snap.docs[0];
      return { id: d.id, ...d.data() };
    }
  } catch (err) {
    console.warn("Firestore findDriverByEmail notice:", err);
  }
  return null;
}

export async function saveDriverProfile(uid, data) {
  if (!uid) throw new Error("Driver UID is required");
  const formatted = formatDriverData({ ...data, uid });
  try {
    await setDoc(doc(db, COLLECTIONS.DRIVERS, uid), formatted, { merge: true });
  } catch (err) {
    if (err.code === "permission-denied" || err.message?.includes("permissions") || err.message?.includes("permission")) {
      console.warn("[Firestore] Security Rules restricted Drivers write. Persisting locally.", err);
    } else {
      throw err;
    }
  }
  return formatted;
}

// ==========================================
// 5. ADMIN OPERATIONS
// ==========================================

export async function getAdminProfile(uid) {
  if (!uid) return null;
  try {
    const snap = await getDoc(doc(db, COLLECTIONS.ADMINS, uid));
    if (snap.exists()) {
      return { id: snap.id, ...snap.data() };
    }
  } catch (err) {
    console.warn("Firestore getAdminProfile notice:", err);
  }
  return null;
}

export async function findAdminByEmail(email) {
  if (!email) return null;
  try {
    const q = query(
      collection(db, COLLECTIONS.ADMINS),
      where("email", "==", email.trim().toLowerCase())
    );
    const snap = await getDocs(q);
    if (!snap.empty) {
      const d = snap.docs[0];
      return { id: d.id, ...d.data() };
    }
  } catch (err) {
    console.warn("Firestore findAdminByEmail notice:", err);
  }
  return null;
}

export async function saveAdminProfile(uid, data) {
  if (!uid) throw new Error("Admin UID is required");
  const formatted = formatAdminData({ ...data, uid });
  try {
    await setDoc(doc(db, COLLECTIONS.ADMINS, uid), formatted, { merge: true });
  } catch (err) {
    if (err.code === "permission-denied" || err.message?.includes("permissions") || err.message?.includes("permission")) {
      console.warn("[Firestore] Security Rules restricted Admins write. Persisting locally.", err);
    } else {
      throw err;
    }
  }
  return formatted;
}

// ==========================================
// 6. LIVE BUS OPERATIONS
// ==========================================

export async function saveLiveBus(busNo, data) {
  if (!busNo) throw new Error("busNo is required");
  const formatted = formatLiveBusData({ ...data, busNo });
  try {
    await setDoc(doc(db, COLLECTIONS.LIVE_BUS, busNo.toUpperCase()), formatted, { merge: true });
  } catch (err) {
    if (err.code === "permission-denied" || err.message?.includes("permissions") || err.message?.includes("permission")) {
      console.warn("[Firestore] Security Rules restricted LiveBus write. Broadcasting locally.", err);
    } else {
      throw err;
    }
  }
  return formatted;
}

export function subscribeLiveBus(busNo, onUpdate, onError) {
  if (!busNo) return () => {};
  return onSnapshot(
    doc(db, COLLECTIONS.LIVE_BUS, busNo.toUpperCase()),
    (snap) => {
      if (snap.exists()) {
        onUpdate({ id: snap.id, ...snap.data() });
      } else {
        onUpdate(null);
      }
    },
    onError
  );
}

// ==========================================
// 7. ATTENDANCE & SCAN HISTORY
// ==========================================

export async function recordStudentAttendance(studentUid, record) {
  if (!studentUid) throw new Error("studentUid is required");
  const clean = {
    studentUid,
    studentName: (record.studentName || "Student").trim(),
    regNo: (record.regNo || "").trim(),
    dept: (record.dept || "").trim(),
    busNo: (record.busNo || "V11").trim(),
    route: (record.route || "Route 1").trim(),
    driverName: (record.driverName || "Driver").trim(),
    status: record.status || "Present",
    scannedAt: serverTimestamp(),
  };

  // 1. Add to Student subcollection
  await addDoc(collection(db, COLLECTIONS.ATTENDANCE, studentUid, "records"), clean);

  // 2. Add to Global ScanHistory for Driver & Admin analytics
  await addDoc(collection(db, COLLECTIONS.SCAN_HISTORY), {
    ...clean,
    driverUid: record.driverUid || "",
    scannedAt: serverTimestamp(),
  });

  return clean;
}
