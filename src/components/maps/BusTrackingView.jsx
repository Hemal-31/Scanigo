import React, { useEffect, useRef, useState, useCallback } from "react";
import L from "leaflet";
import "leaflet/dist/leaflet.css";
import { db } from "../../config/firebase";
import { doc, onSnapshot, getDoc } from "firebase/firestore";
import { addStyledTileLayer } from "../../utils/mapTiles";
import { isBusTelemetryLive } from "../../services/firestoreService";
import "../../assets/styles/BusTrackingView.css";

// Helper to ensure valid driver photos or fallback to a nice avatar
function getValidGmailPhoto(photoCandidate, fallbackName = "Driver") {
  if (
    photoCandidate &&
    typeof photoCandidate === "string" &&
    photoCandidate.startsWith("http") &&
    !photoCandidate.includes("driver_rahul")
  ) {
    return photoCandidate;
  }
  return `https://ui-avatars.com/api/?name=${encodeURIComponent(fallbackName || "Driver")}&background=1A73E8&color=fff&size=128&bold=true`;
}

// Available campus fleet buses for switching
const FLEET_BUSES = [
  { id: "V11", label: "Bus V11", route: "Route 1 – Campus Express" },
  { id: "V14", label: "Bus V14", route: "Route 2 – Metro Link" },
  { id: "V3", label: "Bus V3", route: "Route 3 – South Hub" },
];

export default function BusTrackingView({ 
  busNo = "V11",
  driverName = "",
  driverPhone = "",
  driverPhoto = "",
}) {
  const mapContainerRef = useRef(null);
  const mapInstanceRef = useRef(null);
  const tileLayerRef = useRef(null);
  const busMarkerRef = useRef(null);
  const hasInitiallyPositionedRef = useRef(false);

  const [currentBusNo, setCurrentBusNo] = useState(busNo || "V11");
  const [currentDriverName, setCurrentDriverName] = useState(driverName || "Assigned Driver");
  const [currentDriverPhone, setCurrentDriverPhone] = useState(driverPhone || "");
  const [currentRoute, setCurrentRoute] = useState("Route 1 – Campus Express");
  const [currentDriverPhoto, setCurrentDriverPhoto] = useState(() =>
    getValidGmailPhoto(driverPhoto, driverName)
  );

  const [liveData, setLiveData] = useState(null);
  const [isLive, setIsLive] = useState(false);
  const [isSimulating, setIsSimulating] = useState(false);
  const [checkingPulse, setCheckingPulse] = useState(false);
  const [lastCheckedTime, setLastCheckedTime] = useState(new Date());

  // Sync props to state if provided
  useEffect(() => {
    if (busNo) setCurrentBusNo(busNo);
  }, [busNo]);

  useEffect(() => {
    if (driverName) setCurrentDriverName(driverName);
  }, [driverName]);

  useEffect(() => {
    if (driverPhone) setCurrentDriverPhone(driverPhone);
  }, [driverPhone]);

  useEffect(() => {
    const valid = getValidGmailPhoto(driverPhoto, currentDriverName);
    if (valid) setCurrentDriverPhoto(valid);
  }, [driverPhoto, currentDriverName]);

  // 1. Listen to Real-time LiveBus in Firestore (STRICT LIVE CHECK)
  useEffect(() => {
    if (!currentBusNo) return;

    // Reset initial positioning on bus switch
    hasInitiallyPositionedRef.current = false;

    const unsub = onSnapshot(doc(db, "LiveBus", currentBusNo), (snap) => {
      setLastCheckedTime(new Date());
      if (snap.exists()) {
        const data = snap.data();
        if (data.driverName || data.driver) {
          setCurrentDriverName(data.driverName || data.driver);
        }
        if (data.driverPhone || data.phone) {
          setCurrentDriverPhone(data.driverPhone || data.phone);
        }
        if (data.route) {
          setCurrentRoute(data.route);
        }
        const rawPhoto = data.driverPhoto || data.photo;
        const validPhoto = getValidGmailPhoto(rawPhoto, data.driverName || data.driver || currentDriverName);
        if (validPhoto) {
          setCurrentDriverPhoto(validPhoto);
        }

        // STRICT CONDITION: Only if the driver is genuinely transmitting live GPS
        // (Must be live: true, valid coordinates, and updated within the last 2 minutes)
        const isDriverSharingLocation = isBusTelemetryLive(data);

        if (isDriverSharingLocation) {
          setLiveData(data);
          setIsLive(true);
          return;
        }
      }
      
      // Driver has not turned on location, doc has live: false, or GPS ping is stale (>2m)
      setLiveData(null);
      setIsLive(false);
    }, (err) => {
      console.warn("LiveBus sync notice:", err);
      setLiveData(null);
      setIsLive(false);
    });

    return () => unsub();
  }, [currentBusNo, currentDriverName]);

  // Periodic heartbeat watchdog: If driver loses signal or phone locks, auto-transition to offline
  useEffect(() => {
    if (!isLive || !liveData) return;
    const interval = setInterval(() => {
      if (!isBusTelemetryLive(liveData)) {
        setIsLive(false);
        setLiveData(null);
      }
    }, 10000);
    return () => clearInterval(interval);
  }, [isLive, liveData]);

  // Helper: Smoothly glide Leaflet marker from current position to targetPos
  const smoothMoveMarker = useCallback((marker, targetPos, durationMs = 1200, map = null) => {
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
  }, []);

  // 3. Initialize Leaflet Map
  useEffect(() => {
    if (!mapContainerRef.current) return;

    if (!mapInstanceRef.current) {
      const defaultCampusPos = [12.975, 80.215];

      const map = L.map(mapContainerRef.current, {
        zoomControl: false,
        attributionControl: false,
      }).setView(defaultCampusPos, 15);

      tileLayerRef.current = addStyledTileLayer(map, "pastel");
      mapInstanceRef.current = map;

      setTimeout(() => map.invalidateSize(), 200);
      setTimeout(() => map.invalidateSize(), 600);
    }

    const handleResize = () => {
      if (mapInstanceRef.current) {
        mapInstanceRef.current.invalidateSize();
      }
    };
    window.addEventListener("resize", handleResize);

    return () => {
      window.removeEventListener("resize", handleResize);
    };
  }, []);

  // 4. Update Bus Marker position when Live Firestore updates or remove if offline
  useEffect(() => {
    if (!mapInstanceRef.current) return;

    const shouldShowLive = (isLive && liveData && liveData.lat && liveData.lng) || isSimulating;

    if (shouldShowLive && liveData && liveData.lat && liveData.lng) {
      const newPos = [liveData.lat, liveData.lng];

      // Create marker if it does not exist
      if (!busMarkerRef.current) {
        const busIcon = L.icon({
          iconUrl: "/images/school_bus_marker.png",
          iconSize: [56, 56],
          iconAnchor: [28, 28],
          className: "bus-marker-icon",
        });
        busMarkerRef.current = L.marker(newPos, { icon: busIcon }).addTo(mapInstanceRef.current);
        busMarkerRef.current.bindPopup(
          `<div style="font-weight:700;font-size:13px;text-align:center;">🚌 Bus ${currentBusNo}<br/><span style="color:#22C55E;font-size:11px;">● LIVE GPS STREAM</span></div>`
        );
        mapInstanceRef.current.setView(newPos, 15, { animate: true });
        hasInitiallyPositionedRef.current = true;
      } else {
        smoothMoveMarker(busMarkerRef.current, newPos, 1200, mapInstanceRef.current);
      }
    } else if (!shouldShowLive) {
      // Driver has not started or went offline: remove bus marker from map
      if (busMarkerRef.current) {
        mapInstanceRef.current.removeLayer(busMarkerRef.current);
        busMarkerRef.current = null;
        hasInitiallyPositionedRef.current = false;
      }
    }
  }, [liveData, isLive, isSimulating, currentBusNo, smoothMoveMarker]);

  // 5. Route Simulation for testing
  useEffect(() => {
    if (!isSimulating || !mapInstanceRef.current) return;

    let step = 0;
    const waypoints = [
      [12.975, 80.215],
      [12.980, 80.219],
      [12.986, 80.224],
      [12.994, 80.226],
      [13.005, 80.228],
      [13.012, 80.231],
      [13.018, 80.235],
    ];

    if (!busMarkerRef.current) {
      const busIcon = L.icon({
        iconUrl: "/images/school_bus_marker.png",
        iconSize: [56, 56],
        iconAnchor: [28, 28],
        className: "bus-marker-icon",
      });
      busMarkerRef.current = L.marker(waypoints[0], { icon: busIcon }).addTo(mapInstanceRef.current);
      mapInstanceRef.current.setView(waypoints[0], 15);
    }

    const interval = setInterval(() => {
      step = (step + 1) % waypoints.length;
      const target = waypoints[step];
      if (busMarkerRef.current) {
        smoothMoveMarker(busMarkerRef.current, target, 1400, mapInstanceRef.current);
      }
    }, 2200);

    return () => clearInterval(interval);
  }, [isSimulating, smoothMoveMarker]);

  // Handle Call Driver click - directly opens the phone dialer / caller
  const handleCallDriver = (e) => {
    if (!currentDriverPhone) {
      e.preventDefault();
      alert(`Driver phone number for Bus ${currentBusNo} is not registered yet.`);
      return;
    }
    const cleanPhone = currentDriverPhone.replace(/[\s\-()]/g, "");
    window.location.href = `tel:${cleanPhone}`;
  };

  // Manual Pulse Refresh to check Firestore again
  const handleManualCheck = async () => {
    setCheckingPulse(true);
    try {
      const snap = await getDoc(doc(db, "LiveBus", currentBusNo));
      setLastCheckedTime(new Date());
      if (snap.exists()) {
        const data = snap.data();
        if (isBusTelemetryLive(data)) {
          setLiveData(data);
          setIsLive(true);
        } else {
          setIsLive(false);
          setLiveData(null);
        }
      } else {
        setIsLive(false);
        setLiveData(null);
      }
    } catch (err) {
      console.warn("Manual check error:", err);
    } finally {
      setTimeout(() => setCheckingPulse(false), 600);
    }
  };

  const isBusOnline = (isLive && liveData && liveData.lat && liveData.lng) || isSimulating;

  return (
    <div className="bus-tracking-container">
      {/* Background Interactive Leaflet Map */}
      <div ref={mapContainerRef} className="bus-tracking-map" />

      {/* ==============================================================
          COMIC BUS & SPEECH BUBBLE WHEN DRIVER HAS NOT TURNED ON LOCATION
          ============================================================== */}
      {!isBusOnline && (
        <div className="comic-offline-overlay">
          <div className="comic-offline-modal">
            {/* Top Comic Sound Effect Badge */}
            <div className="comic-sound-fx-badge">
              <span className="comic-star-icon">🗯️</span>
              <span className="comic-sound-word">HONK! HONK!</span>
            </div>

            {/* Comic Speech Bubble from the Bus */}
            <div className="comic-speech-bubble">
              <div className="comic-speech-header">
                <span className="comic-speech-badge">⛔ NO LOCATION IS LIVE</span>
                <span className="comic-speech-bus-tag">Bus #{currentBusNo}</span>
              </div>
              <h2 className="comic-speech-title">
                Hey there! Your bus location is NOT live right now!
              </h2>
              <p className="comic-speech-body">
                My driver hasn't turned <strong>ON</strong> live GPS tracking yet.
                Hold tight! The moment the driver starts their route and switches on location, I'll pop right onto your map in real time! 🚌💨
              </p>
              {/* Pointy Speech Bubble Pointer Tail directed at the bus character */}
              <div className="comic-speech-tail" />
            </div>

            {/* Expressive Comic Bus Character Stage */}
            <div className="comic-bus-stage">
              <div className="comic-bus-character-wrapper">
                {/* Comic Smoke / Speed Puffs */}
                <span className="comic-smoke-puff comic-smoke-1">💨</span>
                <span className="comic-smoke-puff comic-smoke-2">💭</span>

                {/* Illustrated Animated Comic Bus */}
                <div className="comic-bus-body">
                  <div className="comic-bus-roof">
                    <span className="comic-bus-roof-light" />
                    <span className="comic-bus-sign">SCANIGO TRANSIT</span>
                  </div>
                  <div className="comic-bus-windows">
                    <div className="comic-bus-windshield">
                      <div className="comic-bus-eyes">
                        <span className="comic-eye left-eye">👀</span>
                      </div>
                    </div>
                    <div className="comic-passenger-window">🎓</div>
                    <div className="comic-passenger-window">🎒</div>
                  </div>
                  <div className="comic-bus-grill">
                    <div className="comic-bus-headlight headlight-l" />
                    <div className="comic-bus-plate">{currentBusNo}</div>
                    <div className="comic-bus-headlight headlight-r" />
                  </div>
                  <div className="comic-bus-bumper">
                    <span className="comic-bus-smile">︶</span>
                  </div>
                  <div className="comic-bus-wheels">
                    <div className="comic-bus-wheel wheel-l">
                      <div className="comic-wheel-hub" />
                    </div>
                    <div className="comic-bus-wheel wheel-r">
                      <div className="comic-wheel-hub" />
                    </div>
                  </div>
                </div>

                <div className="comic-bus-shadow" />
              </div>
            </div>

            {/* Fleet Bus Switcher */}
            <div className="comic-fleet-switcher">
              <span className="comic-fleet-label">Switch Fleet Bus:</span>
              <div className="comic-fleet-pills">
                {FLEET_BUSES.map((b) => (
                  <button
                    key={b.id}
                    type="button"
                    className={`comic-fleet-btn ${currentBusNo === b.id ? "active" : ""}`}
                    onClick={() => setCurrentBusNo(b.id)}
                  >
                    🚌 {b.id}
                  </button>
                ))}
              </div>
            </div>

            {/* Driver Standby Meta Box */}
            <div className="comic-driver-meta-box">
              <div className="comic-driver-avatar-col">
                <img
                  src={currentDriverPhoto}
                  alt={currentDriverName}
                  className="comic-driver-avatar"
                  onError={(e) => {
                    e.target.src = `https://ui-avatars.com/api/?name=${encodeURIComponent(currentDriverName || "Driver")}&background=1A73E8&color=fff&size=128&bold=true`;
                  }}
                />
                <span className="comic-offline-dot" title="GPS is currently turned off" />
              </div>

              <div className="comic-driver-text-col">
                <div className="comic-driver-title-row">
                  <span className="comic-driver-name">{currentDriverName}</span>
                  <span className="comic-driver-status-chip">GPS Standby</span>
                </div>
                <div className="comic-driver-sub">{currentRoute}</div>
                <div className="comic-last-check-text">
                  Checked at {lastCheckedTime.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", second: "2-digit" })}
                </div>
              </div>
            </div>

            {/* Action Buttons Row */}
            <div className="comic-actions-row">
              <a
                href={currentDriverPhone ? `tel:${currentDriverPhone.replace(/[\s\-()]/g, "")}` : "#"}
                className="comic-action-btn comic-call-btn"
                onClick={handleCallDriver}
              >
                <span>📞 Call Driver</span>
              </a>

              <button
                type="button"
                className={`comic-action-btn comic-refresh-btn ${checkingPulse ? "checking" : ""}`}
                onClick={handleManualCheck}
                disabled={checkingPulse}
              >
                <span>{checkingPulse ? "📡 Checking..." : "🔄 Refresh Status"}</span>
              </button>
            </div>

            {/* Discreet Simulation Demo Toggle */}
            <div className="comic-simulation-toggle-row">
              <button
                type="button"
                className="comic-sim-btn"
                onClick={() => setIsSimulating(!isSimulating)}
                title="Test how live bus tracking looks when driver starts broadcasting"
              >
                ⚡ {isSimulating ? "Stop Test Live Mode" : "Test Demo Live Mode"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ==============================================================
          LIVE STATE CONTROLS & HUD (Visible when Driver Turns On GPS)
          ============================================================== */}
      {isBusOnline && (
        <>
          {/* Top Floating Live Status Pill */}
          <div className="map-status-pill map-status-pill-live">
            <span className="status-live-pulse-dot" />
            <span className="status-live-text">● LIVE BUS TRACKING</span>
            <span className="status-live-bus-badge">Bus {currentBusNo}</span>
            {isSimulating && (
              <span className="status-sim-badge">[DEMO SIMULATION]</span>
            )}
            <button
              type="button"
              onClick={() => setIsSimulating(false)}
              className="status-sim-close-btn"
              title="Close simulation and view real live status"
            >
              ✕
            </button>
          </div>

          {/* Floating Map Navigation Controls */}
          <div className="map-floating-controls">
            <button
              type="button"
              className="map-ctrl-btn"
              title="Recenter on Live Bus"
              onClick={() => {
                if (mapInstanceRef.current && busMarkerRef.current) {
                  mapInstanceRef.current.setView(busMarkerRef.current.getLatLng(), 16, { animate: true });
                }
              }}
            >
              🎯
            </button>
            <button
              type="button"
              className="map-ctrl-btn"
              title="Zoom In"
              onClick={() => {
                if (mapInstanceRef.current) mapInstanceRef.current.zoomIn();
              }}
            >
              ➕
            </button>
            <button
              type="button"
              className="map-ctrl-btn"
              title="Zoom Out"
              onClick={() => {
                if (mapInstanceRef.current) mapInstanceRef.current.zoomOut();
              }}
            >
              ➖
            </button>
          </div>

          {/* Floating Bottom Driver Live Card */}
          <div className="map-driver-card">
            <div className="driver-card-top">
              <div className="driver-avatar-wrapper">
                <img
                  src={currentDriverPhoto}
                  alt={currentDriverName}
                  className="driver-avatar-img"
                  referrerPolicy="no-referrer"
                  onError={(e) => {
                    e.target.src = `https://ui-avatars.com/api/?name=${encodeURIComponent(currentDriverName || "Driver")}&background=1A73E8&color=fff&size=128&bold=true`;
                  }}
                />
                <div className="driver-live-dot" />
              </div>

              <div className="driver-info-meta">
                <div className="driver-bus-title">
                  <span>Bus Number:</span>
                  <span style={{ color: "var(--primary-blue)", fontWeight: 800 }}>{currentBusNo}</span>
                  <span className="live-pill-inline">LIVE ON ROAD</span>
                </div>
                <div className="driver-name-text">
                  Driver: <span style={{ color: "var(--text-main)", fontWeight: 700 }}>{currentDriverName}</span>
                </div>
                <div className="driver-route-text" style={{ fontSize: "12px", color: "#64748B", marginTop: "2px" }}>
                  📍 {currentRoute}
                </div>
              </div>
            </div>

            {/* Call Driver Action Button -> Directly triggers phone caller */}
            <a
              href={currentDriverPhone ? `tel:${currentDriverPhone.replace(/[\s\-()]/g, "")}` : "#"}
              className="driver-call-btn"
              onClick={handleCallDriver}
              title={currentDriverPhone ? `Call ${currentDriverPhone}` : "Call Driver"}
            >
              <span>📞</span>
              <span>Call Driver (Check ETA)</span>
            </a>
          </div>
        </>
      )}
    </div>
  );
}
