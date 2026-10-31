# AI Medical Scribe & Live Transcription Application

A full-stack, real-time medical transcription and clinical information extraction application built with **FastAPI (Python)**, **Modern Vanilla JavaScript/CSS**, **Web Audio VAD (Voice Activity Detection)**, and **LLM Structured Extraction (Gemini / OpenAI / Intelligent Fallback Engine)** matching the requested design and architecture.

---

## 🌟 Key Features

1. **Microphone Audio Capture & VAD (Voice Activity Detection)**:
   - Uses Web Audio API real-time RMS energy analysis and spectral analysis.
   - Detects speech start and end with configurable silence hangover windows (prevents silence from generating empty chunks).
   - Dynamic real-time VAD energy meter visualizer with active/silence state badges.
   - Saves recordings in WebM format (`Save Recording` button).

2. **Real-time Speech-to-Text (ASR)**:
   - Live continuous transcription feed with interim and final speech recognition results.
   - Real-time word counter and chunk counter metrics.
   - Full support for cloud Whisper API chunks when `OPENAI_API_KEY` is configured.

3. **Structured Clinical Information Extraction**:
   Extracts all required fields according to the specification:
   - **Clinical Summary**: Concise, high-yield summary for medical records.
   - **Patient Details**: Name, Age, Sex, and Medical Record Identifiers (with in-app demographic modal editor).
   - **Chief Complaint**: Primary reason for the visit in patient's terms.
   - **History of Present Illness (HPI)**: Onset, duration, progression, aggravating/relieving factors.
   - **Symptoms**: Discrete lists with **Reported Positives** and **Stated Negatives** strictly separated.
   - **Assessment & Diagnosis**: Provisional diagnosis and differentials.
   - **Medication History**: Active home medications, dosages, and drug allergies prior to visit.
   - **Prescription Medicine (Rx)**: Structured list of newly prescribed or renewed medicines with dosage, frequency, course duration, and patient administration directions.
   - **Examinations & Tests (Observations)**: Physical findings and vitals stated during consultation.
   - **Past Medical History**: Chronic conditions, surgeries, and hospitalizations.
   - **Plan & Follow-Up**: Prescriptions, lab orders, lifestyle guidance, and return precautions.

4. **Bring Your Own API Key (BYOK)**:
   - In-app modal accessible from the header (`🔑 API Keys`) to configure custom **Google Gemini** or **OpenAI** API keys.
   - Keys are stored securely in browser `localStorage` and never logged on the server.
   - Real-time **Verify Key** validation testing against live Gemini/OpenAI endpoints.
   - Selectable LLM engine preference (Auto-Select, Google Gemini 2.5 Flash, or OpenAI GPT-4o).
   - Graceful fallback: user custom keys &rarr; server `.env` keys &rarr; offline clinical heuristic parser.

5. **Prescription & EHR Export**:
   - One-click `Copy to Prescription` copies a formatted EHR document directly to clipboard with dedicated Prescription Medicines (Rx) section.

---

## 🚀 Running the Application

### 1. Backend (FastAPI)
The backend is located in [`backend/`](file:///d:/Projects/Docs%20App/backend):
```powershell
# From the project root:
.\.venv\Scripts\python.exe -m uvicorn server:app --host 127.0.0.1 --port 8000 --reload
```
- Health Check: `http://127.0.0.1:8000/api/health`
- Process Endpoint: `POST http://127.0.0.1:8000/api/process-transcript`
- Audio Chunk Endpoint: `POST http://127.0.0.1:8000/api/transcribe-chunk`

*(Optional)* Configure API keys in [`backend/.env`](file:///d:/Projects/Docs%20App/backend/.env):
```env
OPENAI_API_KEY=your_openai_key_here
GEMINI_API_KEY=your_gemini_key_here
```

### 2. Frontend (Vite + Vanilla JS + CSS3)
The frontend is located in [`frontend/`](file:///d:/Projects/Docs%20App/frontend):
```powershell
cd frontend
npm run dev
```
Open [http://localhost:5173](http://localhost:5173) in any modern browser (Chrome, Edge, Firefox, Brave).

---

## 💻 Tech Stack
- **Backend**: Python 3.11, FastAPI, Uvicorn, Pydantic, HTTPX, WebSockets.
- **Frontend**: HTML5, Vanilla CSS3 (Custom Design System, Responsive layout), Modern ES Modules.
- **Audio & AI**: Web Audio API (VAD AnalyserNode), MediaStream & MediaRecorder, OpenAI Whisper / Gemini 2.5 Flash / Intelligent Clinical Heuristic Parser fallback.
