import React, { useEffect, useRef } from "react";
import { animate } from "animejs";
import "../../assets/styles/MovingBusRoad.css";

export default function MovingBusRoad({ busColor = "#F59E0B" }) {
  const busRef = useRef(null);
  const frontWheelRef = useRef(null);
  const backWheelRef = useRef(null);
  const roadStripesRef = useRef(null);
  const chassisRef = useRef(null);

  useEffect(() => {
    if (!busRef.current) return;

    // 1. Bus driving across the entire road from left to right
    const busAnim = animate(busRef.current, {
      translateX: ["-100px", "460px"],
      duration: 5200,
      ease: "linear",
      loop: true,
    });

    // 2. Wheels rotating continuously
    const wheelsAnim = animate([frontWheelRef.current, backWheelRef.current], {
      rotate: ["0deg", "360deg"],
      duration: 380,
      ease: "linear",
      loop: true,
    });

    // 3. Chassis natural suspension bounce
    const bounceAnim = animate(chassisRef.current, {
      translateY: [-1.5, 1],
      duration: 220,
      alternate: true,
      ease: "inOutSine",
      loop: true,
    });

    // 4. Road dashed center markings speed
    const roadAnim = animate(roadStripesRef.current, {
      translateX: ["0px", "-40px"],
      duration: 800,
      ease: "linear",
      loop: true,
    });

    return () => {
      busAnim?.pause?.();
      wheelsAnim?.pause?.();
      bounceAnim?.pause?.();
      roadAnim?.pause?.();
    };
  }, []);

  const gradId = `busBodyGrad_${busColor.replace(/[^a-zA-Z0-9]/g, "")}`;

  return (
    <div className="anime-transit-road-container">
      {/* Top Curb Line */}
      <div className="anime-road-curb top-curb"></div>

      {/* Asphalt Surface */}
      <div className="anime-road-surface">
        {/* Moving Road Dashes */}
        <div ref={roadStripesRef} className="anime-road-dashes"></div>

        {/* Moving Bus Assembly */}
        <div ref={busRef} className="anime-moving-bus-unit">
          {/* Headlight beam */}
          <div className="anime-headlight-cone"></div>

          {/* Bus SVG Vector */}
          <div ref={chassisRef} className="anime-bus-chassis">
            <svg
              viewBox="0 0 140 62"
              className="anime-bus-svg"
              xmlns="http://www.w3.org/2000/svg"
            >
              {/* Bus Body Gradients */}
              <defs>
                <linearGradient id={gradId} x1="0%" y1="0%" x2="100%" y2="100%">
                  <stop offset="0%" stopColor={busColor} stopOpacity="0.95" />
                  <stop offset="60%" stopColor={busColor} stopOpacity="1" />
                  <stop offset="100%" stopColor="#0F172A" stopOpacity="0.25" />
                </linearGradient>
                <linearGradient id="windowGrad" x1="0%" y1="0%" x2="0%" y2="100%">
                  <stop offset="0%" stopColor="#E0F2FE" />
                  <stop offset="100%" stopColor="#BAE6FD" />
                </linearGradient>
                <filter id="shadowFilter" x="-10%" y="-10%" width="120%" height="130%">
                  <feDropShadow dx="0" dy="3" stdDeviation="2" floodOpacity="0.35" />
                </filter>
              </defs>

              {/* Chassis Ground Shadow */}
              <ellipse cx="68" cy="54" rx="56" ry="4" fill="#000000" opacity="0.45" />

              {/* Main Bus Shell */}
              <rect x="12" y="8" width="114" height="38" rx="7" fill={`url(#${gradId})`} />
              {/* Roof AC / Vent Unit */}
              <rect x="36" y="5" width="56" height="4" rx="2" fill={busColor} opacity="0.85" />

              
              {/* Front Windshield */}
              <path d="M 104 12 L 122 15 L 120 32 L 104 32 Z" fill="url(#windowGrad)" />
              
              {/* Side Passenger Windows */}
              <rect x="18" y="13" width="18" height="17" rx="3" fill="url(#windowGrad)" />
              <rect x="40" y="13" width="18" height="17" rx="3" fill="url(#windowGrad)" />
              <rect x="62" y="13" width="18" height="17" rx="3" fill="url(#windowGrad)" />
              <rect x="84" y="13" width="16" height="17" rx="3" fill="url(#windowGrad)" />

              {/* Passenger Silhouettes */}
              <circle cx="27" cy="20" r="3.5" fill="#1E3A8A" opacity="0.55" />
              <circle cx="49" cy="20" r="3.5" fill="#1E3A8A" opacity="0.55" />
              <circle cx="71" cy="20" r="3.5" fill="#1E3A8A" opacity="0.55" />
              <circle cx="92" cy="20" r="3.5" fill="#1E3A8A" opacity="0.65" />

              {/* Sleek Golden Accent Stripe */}
              <rect x="12" y="34" width="114" height="3" fill="#FACC15" />
              <rect x="12" y="38" width="114" height="1.5" fill="#38BDF8" opacity="0.8" />

              {/* Headlights & Tail Lights */}
              <rect x="122" y="33" width="4" height="5" rx="1.5" fill="#FEF08A" />
              <rect x="12" y="33" width="3" height="5" rx="1" fill="#EF4444" />

              {/* Front Wheel Arch */}
              <path d="M 94 46 A 9 9 0 0 0 114 46" fill="#0F172A" />
              {/* Back Wheel Arch */}
              <path d="M 26 46 A 9 9 0 0 0 46 46" fill="#0F172A" />

              {/* Back Wheel */}
              <g ref={backWheelRef} style={{ transformOrigin: "36px 46px" }}>
                <circle cx="36" cy="46" r="8" fill="#1E293B" stroke="#475569" strokeWidth="1.5" />
                <circle cx="36" cy="46" r="3.5" fill="#94A3B8" />
                <line x1="36" y1="39" x2="36" y2="53" stroke="#64748B" strokeWidth="1.2" />
                <line x1="29" y1="46" x2="43" y2="46" stroke="#64748B" strokeWidth="1.2" />
              </g>

              {/* Front Wheel */}
              <g ref={frontWheelRef} style={{ transformOrigin: "104px 46px" }}>
                <circle cx="104" cy="46" r="8" fill="#1E293B" stroke="#475569" strokeWidth="1.5" />
                <circle cx="104" cy="46" r="3.5" fill="#94A3B8" />
                <line x1="104" y1="39" x2="104" y2="53" stroke="#64748B" strokeWidth="1.2" />
                <line x1="97" y1="46" x2="111" y2="46" stroke="#64748B" strokeWidth="1.2" />
              </g>
            </svg>
          </div>
        </div>
      </div>

      {/* Bottom Curb Line */}
      <div className="anime-road-curb bottom-curb"></div>
    </div>
  );
}
