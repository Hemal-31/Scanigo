import React, { useState, useEffect, useRef } from "react";
import "../../assets/styles/AdminChatBot.css";

/**
 * AGENTIC AI MODEL HANDLER
 * -------------------------------------------------------------
 * Connects directly to the ScaniGo Python Gemini Agentic RAG Backend
 * (http://localhost:8000/api/chat).
 * 
 * If the backend is running, it harnesses Google Gemini + live Firestore
 * telemetry with multi-step reasoning.
 * If the backend is offline, it seamlessly falls back to the client-side
 * Firestore fleet state so the admin console never goes down.
 */
const BACKEND_API_URL = "http://localhost:8000/api/chat";

const AGENT_STAGES = [
  { id: 0, text: "Connecting to ScaniGo Fleet Gateway...", icon: "⚡" },
  { id: 1, text: "Querying live Firestore telemetry & GPS...", icon: "📡" },
  { id: 2, text: "Cross-referencing manifests & attendance...", icon: "🔍" },
  { id: 3, text: "Synthesizing fleet intelligence with Gemini AI...", icon: "✨" },
];

async function callAgenticAIModel({ prompt, messages, buses = [], students = [] }) {
  // 1. Try querying the Gemini Agentic RAG backend
  try {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 12000);

    const historyPayload = messages.slice(-6).map((m) => ({
      role: m.sender === "user" ? "user" : "model",
      text: m.text,
    }));

    const response = await fetch(BACKEND_API_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        message: prompt,
        history: historyPayload,
      }),
      signal: controller.signal,
    });

    clearTimeout(timeoutId);

    if (response.ok) {
      const data = await response.json();
      if (data && data.reply) {
        return {
          reply: data.reply,
          source: data.source || "gemini_rag_firestore",
          model: data.model || "gemini-3.5-flash-lite",
          badge: "✨ Gemini 3.5 Flash • Live Sync"
        };
      }
    } else {
      const errorText = await response.text();
      console.warn("[AdminChatBot] Backend responded with error:", response.status, errorText);
    }
  } catch (err) {
    console.info("[AdminChatBot] Backend not reachable, falling back to client-side Firestore state:", err);
  }

  // 2. Client-side Real-Time Fallback Engine
  await new Promise((resolve) => setTimeout(resolve, 600));

  const lower = prompt.toLowerCase().trim();

  // Calculate live statistics
  const activeBuses = buses.filter((b) => b.isLive || b.status === "On Route");
  const totalBuses = buses.length;
  const presentStudents = students.filter((s) => s.status === "Present");
  const absentStudents = students.filter((s) => s.status !== "Present");
  const totalStudents = students.length;
  const attendanceRate = totalStudents > 0 
    ? Math.round((presentStudents.length / totalStudents) * 100) 
    : 0;

  let replyText = "";

  // 1. Bus status / location query
  const busMatch = lower.match(/bus\s*([a-z0-9]+)/i);
  if (busMatch) {
    const targetBusId = busMatch[1].toUpperCase();
    const foundBus = buses.find(
      (b) => b.id.toUpperCase() === targetBusId || b.busNo.toUpperCase() === targetBusId
    );
    if (foundBus) {
      const busStudents = students.filter((s) => s.busNo?.toUpperCase() === targetBusId);
      const busPresent = busStudents.filter((s) => s.status === "Present").length;
      const busAbsent = busStudents.filter((s) => s.status !== "Present").length;

      replyText = `🚍 **Bus ${foundBus.id} Status Report:**
• **Operational Status:** ${foundBus.isLive ? "🟢 On Route (Live GPS)" : "⚪ " + foundBus.status}
• **Assigned Route:** ${foundBus.route || "Campus Transit Corridor"}
• **Current Location:** ${foundBus.location || "Depot"}
• **Current Speed:** ${foundBus.speed || "0 km/h"}
• **Assigned Driver:** ${foundBus.driver || "Not Assigned"} ${foundBus.phone ? `(${foundBus.phone})` : ""}
• **Student Attendance:** ${busPresent} Present / ${busAbsent} Absent (${busStudents.length} total enrolled).`;
    }
  }

  // 2. Active buses list
  if (!replyText && (lower.includes("active bus") || lower.includes("which bus") || lower.includes("moving") || lower.includes("buses"))) {
    if (activeBuses.length === 0) {
      replyText = `📡 **Active Fleet Overview:**
Currently, **0 out of ${totalBuses}** buses are broadcasting live coordinates.
All fleet buses (${buses.map((b) => b.id).join(", ")}) are currently resting at the Campus Depot.`;
    } else {
      replyText = `📡 **Active Fleet Overview (${activeBuses.length}/${totalBuses} On Route):**
${activeBuses.map((b) => `• **Bus ${b.id}** — 🟢 *${b.status}* | Speed: ${b.speed} | Loc: ${b.location} | Driver: ${b.driver}`).join("\n")}`;
    }
  }

  // 3. Absent students query
  if (!replyText && (lower.includes("absent") || lower.includes("missing"))) {
    if (absentStudents.length === 0) {
      replyText = `🎉 **Attendance Update:**
All **${totalStudents}** registered students are marked **Present** on their respective buses!`;
    } else {
      const sampleAbsent = absentStudents.slice(0, 8);
      replyText = `⚠️ **Absent Passengers (${absentStudents.length} Students):**
${sampleAbsent.map((s) => `• **${s.name}** (${s.regNo || s.id}) — Bus ${s.busNo} • ${s.classGrade}`).join("\n")}
${absentStudents.length > 8 ? `\n*...and ${absentStudents.length - 8} more students. View full list in the Attendance tab.*` : ""}`;
    }
  }

  // 4. Attendance / Present overview
  if (!replyText && (lower.includes("attendance") || lower.includes("present") || lower.includes("scan") || lower.includes("stats") || lower.includes("summary"))) {
    replyText = `📊 **Campus Transit Attendance Intelligence:**
• **Total Enrolled Passengers:** ${totalStudents} students
• **Present (Scanned):** ${presentStudents.length} students (${attendanceRate}%)
• **Absent / Pending:** ${absentStudents.length} students
• **Fleet Deployment:** ${activeBuses.length} active / ${totalBuses} total buses

💡 *Tip: You can ask me about specific buses like "Tell me about Bus V11" or "Who is absent?".*`;
  }

  // 5. Driver / Contact query
  if (!replyText && (lower.includes("driver") || lower.includes("phone") || lower.includes("call") || lower.includes("contact"))) {
    const driversList = buses
      .filter((b) => b.driver)
      .map((b) => `• **Bus ${b.id}:** ${b.driver} ${b.phone ? `(📞 ${b.phone})` : ""}`)
      .join("\n");
    replyText = `👨‍✈️ **Assigned Bus Drivers:**
${driversList || "No drivers assigned yet."}`;
  }

  // 6. Generic intelligent fallback
  if (!replyText) {
    replyText = `🤖 **ScaniGo Fleet AI:**
I analyzed the live transit system. Here is what I know:
• **Active Buses:** ${activeBuses.length} of ${totalBuses} on route
• **Today's Attendance:** ${presentStudents.length}/${totalStudents} students scanned (${attendanceRate}%)

You can ask me questions like:
1. *"Which buses are currently moving?"*
2. *"Give me status of Bus V11"*
3. *"Show absent students list"*
4. *"Who is the driver of Bus V14?"*`;
  }

  return {
    reply: replyText,
    source: "local_firestore_cache",
    model: "client-telemetry-engine",
    badge: "📡 Local Firestore Synchronized"
  };
}

export default function AdminChatBot({ buses = [], students = [] }) {
  const [messages, setMessages] = useState([
    {
      id: "welcome",
      sender: "ai",
      text: `👋 **Hello Admin!** I am your **ScaniGo Fleet AI Agent**.\n\nI have real-time access to live GPS broadcasts, student QR attendance scans, and driver details. How can I assist you today?`,
      timestamp: new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }),
    },
  ]);
  const [inputPrompt, setInputPrompt] = useState("");
  const [isTyping, setIsTyping] = useState(false);
  const [thinkingStep, setThinkingStep] = useState(0);
  const thinkingTimersRef = useRef([]);
  const messagesEndRef = useRef(null);

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  };

  useEffect(() => {
    scrollToBottom();
  }, [messages, isTyping, thinkingStep]);

  useEffect(() => {
    return () => {
      thinkingTimersRef.current.forEach(clearTimeout);
    };
  }, []);

  const handleSend = async (customPrompt) => {
    const queryText = (typeof customPrompt === "string" ? customPrompt : inputPrompt).trim();
    if (!queryText || isTyping) return;

    const userMessage = {
      id: "user_" + Date.now(),
      sender: "user",
      text: queryText,
      timestamp: new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }),
    };

    setMessages((prev) => [...prev, userMessage]);
    setInputPrompt("");
    setIsTyping(true);
    setThinkingStep(0);

    // Staged Agentic Thinking Animation Timers
    thinkingTimersRef.current.forEach(clearTimeout);
    thinkingTimersRef.current = [
      setTimeout(() => setThinkingStep(1), 750),
      setTimeout(() => setThinkingStep(2), 2100),
      setTimeout(() => setThinkingStep(3), 3600),
    ];

    try {
      const aiResult = await callAgenticAIModel({
        prompt: queryText,
        messages: [...messages, userMessage],
        buses,
        students,
      });

      const aiMessage = {
        id: "ai_" + Date.now(),
        sender: "ai",
        text: aiResult.reply || aiResult,
        badge: aiResult.badge || "✨ Fleet Agent AI",
        timestamp: new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }),
      };

      setMessages((prev) => [...prev, aiMessage]);
    } catch (err) {
      console.error("AI response error:", err);
      setMessages((prev) => [
        ...prev,
        {
          id: "err_" + Date.now(),
          sender: "ai",
          isError: true,
          errorTitle: "Fleet Gateway Communication Issue",
          errorMessage: err.message || "Could not complete query through transit engine. Please check backend status.",
          failedPrompt: queryText,
          timestamp: new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }),
        },
      ]);
    } finally {
      thinkingTimersRef.current.forEach(clearTimeout);
      setIsTyping(false);
    }
  };

  const handleClearChat = () => {
    setMessages([
      {
        id: "welcome_" + Date.now(),
        sender: "ai",
        text: `🔄 Chat reset. I'm ready to assist with real-time transit and student attendance queries.`,
        timestamp: new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }),
      },
    ]);
  };

  const quickPrompts = [
    "🚍 Active Buses",
    "📊 Fleet Attendance",
    "⚠️ Absent Students",
    "📍 Status of Bus V11",
    "👨‍✈️ Driver Contacts",
  ];

  // Helper to format basic markdown (bold, bullet points)
  const formatText = (text) => {
    return text.split("\n").map((line, idx) => {
      let formatted = line;
      // Bold **text**
      const parts = formatted.split(/(\*\*.*?\*\*)/g);
      return (
        <div key={idx} style={{ minHeight: line.trim() === "" ? "8px" : "auto", lineHeight: "1.5" }}>
          {parts.map((part, pIdx) => {
            if (part.startsWith("**") && part.endsWith("**")) {
              return <strong key={pIdx}>{part.slice(2, -2)}</strong>;
            }
            if (part.startsWith("*") && part.endsWith("*")) {
              return <em key={pIdx}>{part.slice(1, -1)}</em>;
            }
            return part;
          })}
        </div>
      );
    });
  };

  return (
    <div className="admin-chatbot-container">
      {/* Agentic Header */}
      <div className="admin-chatbot-header">
        <div className="admin-chatbot-header-left">
          <div className="admin-ai-avatar">🤖</div>
          <div className="admin-ai-header-titles">
            <div className="admin-ai-name-row">
              <span className="admin-ai-title">Fleet Agent AI</span>
              <span className="admin-ai-badge">● Live</span>
            </div>
            <span className="admin-ai-sub">Context-Aware Transit Intelligence</span>
          </div>
        </div>
        <button
          className="admin-clear-chat-btn"
          onClick={handleClearChat}
          title="Clear Conversation"
        >
          🗑️
        </button>
      </div>

      {/* Suggestion Chips */}
      <div className="admin-ai-chips-scroll">
        {quickPrompts.map((prompt, idx) => (
          <button
            key={idx}
            className="admin-ai-chip"
            onClick={() => handleSend(prompt.replace(/^[^\w\s]+\s*/, ""))}
          >
            {prompt}
          </button>
        ))}
      </div>

      {/* Messages Scroll Area */}
      <div className="admin-chatbot-messages">
        {messages.map((m) => (
          <div
            key={m.id}
            className={`admin-chat-row ${m.sender === "user" ? "user-row" : "ai-row"}`}
          >
            {m.sender === "ai" && <div className="admin-bubble-avatar">🤖</div>}
            
            {m.isError ? (
              <div className="admin-chat-bubble ai-bubble admin-error-card">
                <div className="admin-error-header">
                  <div className="admin-error-title-row">
                    <span>⚠️</span>
                    <span>{m.errorTitle || "Fleet Engine Alert"}</span>
                  </div>
                  <span className="admin-error-badge">Diagnostic</span>
                </div>
                <div className="admin-error-body">
                  {m.errorMessage}
                </div>
                {m.failedPrompt && (
                  <div className="admin-error-actions">
                    <button
                      type="button"
                      className="admin-error-retry-btn"
                      onClick={() => handleSend(m.failedPrompt)}
                    >
                      <span>🔄 Retry Question</span>
                    </button>
                  </div>
                )}
                <div className="admin-bubble-time">{m.timestamp}</div>
              </div>
            ) : (
              <div className={`admin-chat-bubble ${m.sender === "user" ? "user-bubble" : "ai-bubble"}`}>
                <div className="admin-bubble-text">{formatText(m.text)}</div>
                {m.badge && <div className="admin-source-badge">{m.badge}</div>}
                <div className="admin-bubble-time">{m.timestamp}</div>
              </div>
            )}
          </div>
        ))}

        {isTyping && (
          <div className="admin-chat-row ai-row">
            <div className="admin-bubble-avatar">🤖</div>
            <div className="admin-agent-thinking-card">
              <div className="admin-thinking-header">
                <div className="admin-thinking-title-group">
                  <span className="admin-thinking-radar"></span>
                  <span className="admin-thinking-title">Fleet Agent Reasoning...</span>
                </div>
                <span className="admin-thinking-step-badge">
                  Step {thinkingStep + 1} of 4
                </span>
              </div>

              <div className="admin-thinking-progress-track">
                <div
                  className="admin-thinking-progress-bar"
                  style={{ width: `${((thinkingStep + 1) / 4) * 100}%` }}
                />
              </div>

              <div className="admin-thinking-steps-list">
                {AGENT_STAGES.map((stg, sIdx) => {
                  const isDone = sIdx < thinkingStep;
                  const isActive = sIdx === thinkingStep;
                  const statusClass = isDone ? "completed" : isActive ? "active" : "pending";

                  return (
                    <div key={stg.id} className={`admin-thinking-step-row ${statusClass}`}>
                      <span className="admin-step-icon">
                        {isDone ? "✓" : isActive ? "⚡" : "○"}
                      </span>
                      <span>{stg.text}</span>
                    </div>
                  );
                })}
              </div>
            </div>
          </div>
        )}
        <div ref={messagesEndRef} />
      </div>

      {/* Input Bar */}
      <form
        className="admin-chatbot-input-form"
        onSubmit={(e) => {
          e.preventDefault();
          handleSend();
        }}
      >
        <input
          type="text"
          className="admin-chatbot-input"
          placeholder="Ask AI about buses, attendance, routes..."
          value={inputPrompt}
          onChange={(e) => setInputPrompt(e.target.value)}
          disabled={isTyping}
        />
        <button
          type="submit"
          className="admin-chatbot-send-btn"
          disabled={!inputPrompt.trim() || isTyping}
          title="Send message"
        >
          <span>➤</span>
        </button>
      </form>
    </div>
  );
}
