"""
Gemini Agentic RAG Service for ScaniGo Admin Panel
Orchestrates live Firebase Firestore retrieval, tool calling, and Google Gemini LLM generation.
"""

import os
import json
from typing import Dict, Any, List, Optional
from dotenv import load_dotenv

# Load local environment
load_dotenv()

from services.firestore_service import (
    get_fleet_context_summary,
    get_live_buses,
    get_students,
    get_drivers,
    get_scan_history
)

GEMINI_API_KEY = os.getenv("GEMINI_API_KEY") or os.getenv("GOOGLE_API_KEY")

def _build_system_context() -> str:
    """Generate high-density, real-time context from Firebase Firestore for the LLM prompt."""
    data = get_fleet_context_summary()
    
    buses_text = []
    for b in data["buses"]:
        status_icon = "🟢 LIVE" if b.get("isLive") else "⚪ STOPPED"
        buses_text.append(
            f"- Bus {b.get('busNo')}: {status_icon} | Status: {b.get('status')} | Speed: {b.get('speed', 0)} km/h | "
            f"Route: {b.get('route')} | Driver: {b.get('driverName') or b.get('driver')} (Phone: {b.get('phone') or b.get('driverPhone', 'N/A')}) | "
            f"Coords: ({b.get('lat', 'N/A')}, {b.get('lng', 'N/A')})"
        )

    students_text = []
    for s in data["students"]:
        students_text.append(
            f"- {s.get('name')} (Reg: {s.get('regNo') or 'N/A'}, Bus: {s.get('busNo')}, Route: {s.get('route')}, Stop: {s.get('boarding')}): {s.get('status').upper()}"
        )

    scans_text = []
    for sc in data["recent_scans"]:
        scans_text.append(
            f"- {sc.get('studentName')} scanned by {sc.get('driverName', 'Driver')} on Bus {sc.get('busNo')} at {sc.get('scannedAt', 'Unknown')}"
        )

    context = f"""=== LIVE SCANIGO TRANSIT SYSTEM TELEMETRY (FIREBASE FIRESTORE) ===
Summary:
- Total Fleet Buses: {data['total_buses_count']} (Active / Moving: {data['active_buses_count']})
- Total Students Enrolled: {data['total_students']} (Present: {data['present_students']}, Absent: {data['absent_students']})
- Registered Drivers: {len(data['drivers'])}

Active Buses & Fleet Telemetry:
{chr(10).join(buses_text)}

Student Attendance Roster (Live):
{chr(10).join(students_text)}

Recent QR Scan Activity:
{chr(10).join(scans_text[:10])}
"""
    return context

def _get_api_key() -> Optional[str]:
    raw_key = os.getenv("GEMINI_API_KEY") or os.getenv("GOOGLE_API_KEY")
    if not raw_key:
        return None
    cleaned = raw_key.strip().strip('"\'')
    return cleaned if cleaned and not cleaned.startswith("your_") else None

def _rule_based_fallback_answer(query: str, data: Dict[str, Any]) -> str:
    """Intelligent fallback in case Gemini API is temporarily busy or network drops."""
    q = query.lower()
    
    # 1. Bus specific query
    for b in data["buses"]:
        bus_no = str(b.get("busNo", "")).lower()
        if bus_no and bus_no in q:
            bus_students = [s for s in data["students"] if s.get("busNo", "").lower() == bus_no]
            present_c = sum(1 for s in bus_students if s["status"] == "Present")
            return (
                f"🚍 **Bus {b.get('busNo')} Telemetry Report (Firestore Live):**\n"
                f"• **Status:** {'🟢 On Route (Live GPS)' if b.get('isLive') else '⚪ ' + str(b.get('status'))}\n"
                f"• **Current Speed:** {b.get('speed', 0)} km/h\n"
                f"• **Assigned Route:** {b.get('route', 'Campus Transit')}\n"
                f"• **Driver:** {b.get('driverName') or b.get('driver', 'Unassigned')} (📞 {b.get('phone') or b.get('driverPhone', 'N/A')})\n"
                f"• **Passenger Manifest:** {present_c} Present / {len(bus_students) - present_c} Absent ({len(bus_students)} enrolled)"
            )

    # 2. Absent students query
    if "absent" in q or "missing" in q:
        absent_list = [s for s in data["students"] if s["status"] == "Absent"]
        if not absent_list:
            return "🎉 **Attendance Notice:** All registered students are marked Present across all campus buses!"
        
        sample = absent_list[:8]
        items = "\n".join([f"• **{s['name']}** (Reg: {s['regNo'] or 'N/A'}) — Bus {s['busNo']} ({s['boarding']})" for s in sample])
        return (
            f"⚠️ **Absent Passengers ({len(absent_list)} total):**\n{items}"
        )

    # 3. Overall fleet status
    return (
        f"🤖 **ScaniGo Fleet Intelligence Overview:**\n"
        f"• **Active Buses:** {data['active_buses_count']} of {data['total_buses_count']} currently broadcasting live GPS.\n"
        f"• **Student Attendance:** {data['present_students']} present / {data['absent_students']} absent out of {data['total_students']} students.\n"
        f"• **Recent Boarding:** {len(data['recent_scans'])} verified QR check-ins recorded today."
    )

async def ask_scani_agent(query: str, history: Optional[List[Dict[str, str]]] = None) -> Dict[str, Any]:
    """
    Main Agent Entrypoint:
    1. Fetches real-time Firestore transit data.
    2. Injects system context.
    3. Calls Google Gemini Model (or structured fallback).
    4. Returns formatted response to Admin Panel.
    """
    data = get_fleet_context_summary()
    api_key = _get_api_key()

    if not api_key:
        reply = _rule_based_fallback_answer(query, data)
        return {
            "reply": reply,
            "source": "firestore_direct_telemetry",
            "model": "offline-telemetry-engine",
            "fleet_metrics": {
                "activeBuses": data["active_buses_count"],
                "totalBuses": data["total_buses_count"],
                "presentStudents": data["present_students"],
                "totalStudents": data["total_students"]
            }
        }

    # Call Gemini via google-genai SDK
    try:
        from google import genai
        from google.genai import types

        client = genai.Client(api_key=api_key)
        system_context = _build_system_context()

        prompt = f"""You are the intelligent fleet management and transit safety AI for ScaniGo (Campus Transit Network).
You assist transit dispatchers and administrators with real-time bus telemetry, student attendance, driver routes, and safety analytics.

RULES:
1. Always base your answers strictly on the LIVE SCANIGO TRANSIT SYSTEM TELEMETRY provided below.
2. If the user asks about a specific bus (e.g. V11, V14, V3), report its live status, driver, speed, coordinates, and passenger boarding count.
3. If asked about student attendance or absentees, provide specific names, register numbers, and assigned buses.
4. Keep answers professional, concise, clearly formatted with markdown bullet points and emojis.
5. If data is unavailable, state clearly what is missing.

{system_context}

Admin Question:
{query}
"""
        # Supported Gemini models in order of priority
        models_to_try = [
            "gemini-3.5-flash-lite",
            "gemini-4-hydrogen",
            "gemini-3.1-flash-lite",
            "gemini-3.8-flash",
            "gemini-3.5-flash"
        ]
        response_text = None
        used_model = None

        for model_name in models_to_try:
            try:
                response = client.models.generate_content(
                    model=model_name,
                    contents=prompt,
                )
                if response and response.text:
                    response_text = response.text
                    used_model = model_name
                    break
            except Exception as model_err:
                print(f"[Gemini] Notice with {model_name}: {model_err}")
                continue

        if not response_text:
            response_text = _rule_based_fallback_answer(query, data)
            used_model = "fallback-telemetry"

        return {
            "reply": response_text,
            "source": "gemini_rag_firestore",
            "model": used_model,
            "fleet_metrics": {
                "activeBuses": data["active_buses_count"],
                "totalBuses": data["total_buses_count"],
                "presentStudents": data["present_students"],
                "totalStudents": data["total_students"]
            }
        }

    except Exception as e:
        print(f"[Gemini Agent Error] {e}")
        return {
            "reply": _rule_based_fallback_answer(query, data),
            "source": "firestore_fallback",
            "model": "error-fallback",
            "error": str(e)
        }
