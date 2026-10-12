import React, { useState, useEffect, useRef } from "react";
import "../../assets/styles/AdminChatBot.css";

/**
 * AGENTIC AI MODEL HANDLER (CUSTOMIZABLE)
 * -------------------------------------------------------------
 * You can update this function to connect to your custom LLM backend
 * (e.g., Google Gemini 2.5/Flash, OpenAI, Claude, or a custom Flask/Node API).
 * 
 * By default, this engine processes live Firestore fleet & attendance 
 * context in real-time to answer admin queries with high precision.
 */
async function callAgenticAIModel({ prompt, messages, buses = [], students = [] }) {
  // Simulate network thinking latency for realistic agentic feel
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

      return `🚍 **Bus ${foundBus.id} Status Report:**
• **Operational Status:** ${foundBus.isLive ? "🟢 On Route (Live GPS)" : "⚪ " + foundBus.status}
• **Assigned Route:** ${foundBus.route || "Campus Transit Corridor"}
• **Current Location:** ${foundBus.location || "Depot"}
• **Current Speed:** ${foundBus.speed || "0 km/h"}
• **Assigned Driver:** ${foundBus.driver || "Not Assigned"} ${foundBus.phone ? `(${foundBus.phone})` : ""}
• **Student Attendance:** ${busPresent} Present / ${busAbsent} Absent (${busStudents.length} total enrolled).`;
    }
  }

  // 2. Active buses list
  if (lower.includes("active bus") || lower.includes("which bus") || lower.includes("moving") || lower.includes("buses")) {
    if (activeBuses.length === 0) {
      return `📡 **Active Fleet Overview:**
Currently, **0 out of ${totalBuses}** buses are broadcasting live coordinates.
All fleet buses (${buses.map((b) => b.id).join(", ")}) are currently resting at the Campus Depot.`;
    }
    return `📡 **Active Fleet Overview (${activeBuses.length}/${totalBuses} On Route):**
${activeBuses.map((b) => `• **Bus ${b.id}** — 🟢 *${b.status}* | Speed: ${b.speed} | Loc: ${b.location} | Driver: ${b.driver}`).join("\n")}`;
  }

  // 3. Absent students query
  if (lower.includes("absent") || lower.includes("missing")) {
    if (absentStudents.length === 0) {
      return `🎉 **Attendance Update:**
All **${totalStudents}** registered students are marked **Present** on their respective buses!`;
    }
    const sampleAbsent = absentStudents.slice(0, 8);
    return `⚠️ **Absent Passengers (${absentStudents.length} Students):**
${sampleAbsent.map((s) => `• **${s.name}** (${s.regNo || s.id}) — Bus ${s.busNo} • ${s.classGrade}`).join("\n")}
${absentStudents.length > 8 ? `\n*...and ${absentStudents.length - 8} more students. View full list in the Attendance tab.*` : ""}`;
  }

  // 4. Attendance / Present overview
  if (lower.includes("attendance") || lower.includes("present") || lower.includes("scan") || lower.includes("stats") || lower.includes("summary")) {
    return `📊 **Campus Transit Attendance Intelligence:**
• **Total Enrolled Passengers:** ${totalStudents} students
• **Present (Scanned):** ${presentStudents.length} students (${attendanceRate}%)
• **Absent / Pending:** ${absentStudents.length} students
• **Fleet Deployment:** ${activeBuses.length} active / ${totalBuses} total buses

💡 *Tip: You can ask me about specific buses like "Tell me about Bus V11" or "Who is absent?".*`;
  }

  // 5. Driver / Contact query
  if (lower.includes("driver") || lower.includes("phone") || lower.includes("call") || lower.includes("contact")) {
    const driversList = buses
      .filter((b) => b.driver)
      .map((b) => `• **Bus ${b.id}:** ${b.driver} ${b.phone ? `(📞 ${b.phone})` : ""}`)
      .join("\n");
    return `👨‍✈️ **Assigned Bus Drivers:**
${driversList || "No drivers assigned yet."}`;
  }

  // 6. Generic intelligent fallback
  return `🤖 **ScaniGo Fleet AI:**
I analyzed the live transit system. Here is what I know:
• **Active Buses:** ${activeBuses.length} of ${totalBuses} on route
• **Today's Attendance:** ${presentStudents.length}/${totalStudents} students scanned (${attendanceRate}%)

You can ask me questions like:
1. *"Which buses are currently moving?"*
2. *"Give me status of Bus V11"*
3. *"Show absent students list"*
4. *"Who is the driver of Bus V14?"*`;
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
  const messagesEndRef = useRef(null);

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  };

  useEffect(() => {
    scrollToBottom();
  }, [messages, isTyping]);

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

    try {
      const aiReplyText = await callAgenticAIModel({
        prompt: queryText,
        messages: [...messages, userMessage],
        buses,
        students,
      });

      const aiMessage = {
        id: "ai_" + Date.now(),
        sender: "ai",
        text: aiReplyText,
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
          text: "⚠️ Sorry, I encountered an issue while querying the fleet engine. Please try again.",
          timestamp: new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }),
        },
      ]);
    } finally {
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
            <div className={`admin-chat-bubble ${m.sender === "user" ? "user-bubble" : "ai-bubble"}`}>
              <div className="admin-bubble-text">{formatText(m.text)}</div>
              <div className="admin-bubble-time">{m.timestamp}</div>
            </div>
          </div>
        ))}

        {isTyping && (
          <div className="admin-chat-row ai-row">
            <div className="admin-bubble-avatar">🤖</div>
            <div className="admin-chat-bubble ai-bubble admin-typing-bubble">
              <span className="admin-typing-dot"></span>
              <span className="admin-typing-dot"></span>
              <span className="admin-typing-dot"></span>
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
