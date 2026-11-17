"""
Firestore Service for ScaniGo Transit Network
Fetches real-time transit telemetry, attendance logs, and student/driver profiles
directly from Firebase Firestore via REST API (scanigo-a9302).
"""

import os
import requests
from typing import Dict, Any, List, Optional
from datetime import datetime

PROJECT_ID = os.getenv("FIREBASE_PROJECT_ID", "scanigo-a9302")
BASE_URL = f"https://firestore.googleapis.com/v1/projects/{PROJECT_ID}/databases/(default)/documents"

def _unpack_firestore_value(field_dict: Dict[str, Any]) -> Any:
    """Unpack Firestore typed dictionary into a standard Python primitive."""
    if not isinstance(field_dict, dict):
        return field_dict
    
    if "stringValue" in field_dict:
        return field_dict["stringValue"]
    if "integerValue" in field_dict:
        return int(field_dict["integerValue"])
    if "doubleValue" in field_dict:
        return float(field_dict["doubleValue"])
    if "booleanValue" in field_dict:
        return bool(field_dict["booleanValue"])
    if "timestampValue" in field_dict:
        return field_dict["timestampValue"]
    if "nullValue" in field_dict:
        return None
    if "mapValue" in field_dict:
        fields = field_dict.get("mapValue", {}).get("fields", {})
        return {k: _unpack_firestore_value(v) for k, v in fields.items()}
    if "arrayValue" in field_dict:
        values = field_dict.get("arrayValue", {}).get("values", [])
        return [_unpack_firestore_value(v) for v in values]
    
    return field_dict

def _clean_doc(doc: Dict[str, Any]) -> Dict[str, Any]:
    """Parse a single Firestore document into a Python dictionary."""
    name = doc.get("name", "")
    doc_id = name.split("/")[-1] if "/" in name else ""
    fields = doc.get("fields", {})
    cleaned = {k: _unpack_firestore_value(v) for k, v in fields.items()}
    cleaned["id"] = doc_id
    cleaned["_createTime"] = doc.get("createTime")
    cleaned["_updateTime"] = doc.get("updateTime")
    return cleaned

def fetch_collection(collection_name: str, page_size: int = 100) -> List[Dict[str, Any]]:
    """Fetch all documents from a Firestore collection via REST API."""
    url = f"{BASE_URL}/{collection_name}?pageSize={page_size}"
    try:
        resp = requests.get(url, timeout=10)
        if resp.status_code != 200:
            print(f"[Firestore] Warning fetching {collection_name}: {resp.status_code} {resp.text}")
            return []
        data = resp.json()
        docs = data.get("documents", [])
        return [_clean_doc(d) for d in docs]
    except Exception as e:
        print(f"[Firestore] Error querying {collection_name}: {e}")
        return []

from datetime import datetime, timezone

MAX_LIVE_STALENESS_SECONDS = 120  # 2 minutes

def is_telemetry_fresh(updated_at_str: Optional[str], max_age_seconds: int = MAX_LIVE_STALENESS_SECONDS) -> bool:
    """Check if the GPS timestamp was transmitted within the last max_age_seconds."""
    if not updated_at_str:
        return False
    try:
        # ISO timestamp from Firestore REST API
        clean_str = updated_at_str.replace("Z", "+00:00")
        dt = datetime.fromisoformat(clean_str)
        now = datetime.now(timezone.utc)
        age = (now - dt).total_seconds()
        return age >= 0 and age < max_age_seconds
    except Exception:
        return False

def mark_bus_offline_in_firestore(bus_no: str):
    """Auto-repair stale Firestore LiveBus documents left in 'live: true' state."""
    url = f"{BASE_URL}/LiveBus/{bus_no}?updateMask.fieldPaths=live&updateMask.fieldPaths=status"
    body = {
        "fields": {
            "live": {"booleanValue": False},
            "status": {"stringValue": "Stopped"}
        }
    }
    try:
        requests.patch(url, json=body, timeout=5)
    except Exception as e:
        pass

def get_live_buses() -> List[Dict[str, Any]]:
    """
    Get all buses from LiveBus collection with real-world staleness check.
    If driver closed app or hasn't pinged in 2 minutes, bus is marked offline.
    """
    buses = fetch_collection("LiveBus")
    for b in buses:
        bus_no = (b.get("busNo") or b.get("id") or "Unknown").upper()
        b["busNo"] = bus_no
        
        updated_at = b.get("updatedAt") or b.get("_updateTime")
        is_fresh = is_telemetry_fresh(updated_at)
        is_live_flag = bool(b.get("live", False))
        
        # Real-world condition: must have live flag AND fresh timestamp (<120s)
        is_truly_live = is_live_flag and is_fresh
        b["isLive"] = is_truly_live
        
        if is_truly_live:
            b["status"] = b.get("status") or "Moving"
        else:
            b["status"] = "Stopped"
            # Auto-cleanup stale 'live: true' documents if they were abandoned
            if is_live_flag and not is_fresh:
                mark_bus_offline_in_firestore(bus_no)
    return buses

def get_students() -> List[Dict[str, Any]]:
    """Get all registered students."""
    return fetch_collection("Students")

def get_drivers() -> List[Dict[str, Any]]:
    """Get all transit drivers."""
    return fetch_collection("Drivers")

def get_scan_history(limit: int = 50) -> List[Dict[str, Any]]:
    """Get recent QR scan events."""
    scans = fetch_collection("ScanHistory", page_size=limit)
    # Sort descending by scannedAt or createTime
    scans.sort(key=lambda s: s.get("scannedAt") or s.get("_createTime") or "", reverse=True)
    return scans

def get_fleet_context_summary() -> Dict[str, Any]:
    """Compute consolidated fleet telemetry for the RAG engine."""
    buses = get_live_buses()
    students = get_students()
    drivers = get_drivers()
    scans = get_scan_history(30)
    
    # Calculate presence
    scanned_student_ids = {s.get("studentId") for s in scans if s.get("studentId")}
    scanned_student_names = {str(s.get("studentName", "")).lower().strip() for s in scans if s.get("studentName")}
    
    present_count = 0
    student_roster = []
    for st in students:
        s_id = st.get("id") or st.get("uid")
        s_name = str(st.get("name", "")).strip()
        is_present = (s_id in scanned_student_ids) or (s_name.lower() in scanned_student_names)
        if is_present:
            present_count += 1
        student_roster.append({
            "id": s_id,
            "name": s_name,
            "regNo": st.get("regNo", ""),
            "busNo": st.get("busNo", "").upper(),
            "route": st.get("route", ""),
            "dept": st.get("dept", ""),
            "boarding": st.get("boarding", ""),
            "status": "Present" if is_present else "Absent"
        })

    active_buses = [b for b in buses if b.get("isLive")]
    
    return {
        "buses": buses,
        "active_buses_count": len(active_buses),
        "total_buses_count": len(buses),
        "students": student_roster,
        "total_students": len(students),
        "present_students": present_count,
        "absent_students": max(0, len(students) - present_count),
        "drivers": drivers,
        "recent_scans": scans[:15]
    }

if __name__ == "__main__":
    summary = get_fleet_context_summary()
    print("=== LIVE FIRESTORE TELEMETRY ===")
    print(f"Total Buses: {summary['total_buses_count']} (Active: {summary['active_buses_count']})")
    print(f"Students: {summary['total_students']} (Present: {summary['present_students']}, Absent: {summary['absent_students']})")
    print(f"Drivers registered: {len(summary['drivers'])}")
    print(f"Recent Scans: {len(summary['recent_scans'])}")
