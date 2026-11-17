"""
ScaniGo Agentic AI Backend Server
FastAPI server serving the Admin ChatBot with Live Firestore Telemetry & Google Gemini RAG.
"""

import os
from typing import List, Dict, Any, Optional
from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
from dotenv import load_dotenv

# Load env variables
load_dotenv()

from services.gemini_agent import ask_scani_agent
from services.firestore_service import get_fleet_context_summary

app = FastAPI(
    title="ScaniGo Transit AI Engine",
    description="Agentic RAG Backend for ScaniGo Campus Fleet Management",
    version="2.0.0"
)

# Enable CORS for React Frontend (Vite on 5173 or local preview)
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

class ChatMessage(BaseModel):
    message: str
    history: Optional[List[Dict[str, str]]] = None

@app.get("/")
@app.get("/api/health")
async def health_check():
    gemini_key = os.getenv("GEMINI_API_KEY") or os.getenv("GOOGLE_API_KEY")
    return {
        "status": "online",
        "service": "ScaniGo Agentic AI Backend",
        "gemini_configured": bool(gemini_key and not gemini_key.startswith("your_")),
        "firebase_project": os.getenv("FIREBASE_PROJECT_ID", "scanigo-a9302"),
    }

@app.post("/api/chat")
async def chat_with_agent(req: ChatMessage):
    if not req.message or not req.message.strip():
        raise HTTPException(status_code=400, detail="Message cannot be empty.")
    
    result = await ask_scani_agent(req.message.strip(), req.history)
    return result

@app.get("/api/fleet/summary")
async def fleet_summary():
    data = get_fleet_context_summary()
    return data

if __name__ == "__main__":
    import uvicorn
    port = int(os.getenv("PORT", 8000))
    print(f"🚀 Starting ScaniGo Agentic Backend on http://0.0.0.0:{port}")
    uvicorn.run("main:app", host="0.0.0.0", port=port, reload=True)
