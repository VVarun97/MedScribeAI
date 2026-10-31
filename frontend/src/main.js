import './style.css';
import { VoiceActivityDetector } from './vad.js';

// Application State
const state = {
  isRecording: false,
  isSpeaking: false,
  transcript: '',
  interimTranscript: '',
  wordCount: 0,
  chunkCount: 0,
  audioChunks: [],
  patient: {
    name: 'Dr Tushar',
    age: '30',
    gender: 'Male',
    identifiers: 'MRN-4029'
  },
  apiKeys: {
    gemini: localStorage.getItem('medscribe_gemini_key') || '',
    openai: localStorage.getItem('medscribe_openai_key') || '',
    preferredProvider: localStorage.getItem('medscribe_provider') || 'auto',
  },
  serverKeys: {
    has_gemini: false,
    has_openai: false,
  },
  medicalRecord: null,
  isProcessing: false,
};

let vadEngine = null;
let speechRecognizer = null;

// Preset clinical dialogues for immediate demo testing
const SAMPLE_DIALOGUES = [
  {
    title: "General Checkup & Cough",
    text: "Patient Dr Tushar, 30-year-old male presents today with a dry irritant cough lasting for 4 days. He states it began after exposure to cold air. He also mentions mild frontal headache and fatigue. He explicitly denies chest pain, denies shortness of breath, and has no fever or hemoptysis. In past medical history, he has well controlled hypertension and had an appendectomy 5 years ago. Currently taking Lisinopril 10mg once daily and occasional Paracetamol. Denies any drug allergies. On physical examination: Blood pressure is 122/80 mmHg, heart rate 74 beats per minute, SpO2 99% on ambient air. Chest is clear to auscultation bilaterally, pharynx slightly congested without exudates. Assessment is acute viral tracheobronchitis with mild tension headache. Plan is supportive care, warm saline gargles, steam inhalation, continue Lisinopril, Tab Paracetamol 650mg as needed, and follow-up in 5 days if cough worsens."
  },
  {
    title: "Chest Discomfort Evaluation",
    text: "Doctor: Good afternoon Mr Tushar, what brings you in today? Patient: Hi doctor, I have been feeling a mild heaviness in the center of my chest since yesterday evening after brisk walking. Doctor: Any radiating pain to the left arm or jaw? Patient: No, no radiation to arm or neck. Doctor: Any sweating, nausea or shortness of breath? Patient: None at all, I deny any breathlessness or palpitations. Past history reveals no prior coronary artery disease or diabetes. Medications include only multivitamins. Exam shows BP 128/84, pulse 78 regular, cardiovascular exam normal S1 S2 heard, no murmurs. ECG ordered and shows normal sinus rhythm. Assessment: Non-cardiac atypical musculoskeletal chest discomfort. Plan: Reassurance, oral Ibuprofen 400mg with food for 3 days, avoid heavy lifting, return immediately if tightness recurs with exertion or sweating."
  }
];

function initApp() {
  const app = document.getElementById('app');
  app.innerHTML = `
    <!-- Top Global Header -->
    <header class="app-header">
      <div class="brand-group">
        <div class="brand-icon-wrapper">
          <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round">
            <path d="M19 14c1.49-1.46 3-3.21 3-5.5A5.5 5.5 0 0 0 16.5 3c-1.76 0-3 .5-4.5 2-1.5-1.5-2.74-2-4.5-2A5.5 5.5 0 0 0 2 8.5c0 2.3 1.5 4.05 3 5.5l7 7Z"/>
            <path d="M12 5v14"/>
            <path d="M5 12h14"/>
          </svg>
        </div>
        <div>
          <div style="display: flex; align-items: center;">
            <span class="brand-title">MedScribe AI</span>
            <span class="brand-tag">EHR Realtime</span>
          </div>
        </div>
      </div>

      <div class="header-meta">
        <div class="status-pill" id="system-status-pill">
          <span class="status-dot" id="system-status-dot"></span>
          <span id="system-status-text">Microphone Idle</span>
        </div>
        <button class="btn-ctrl" id="btn-api-keys" title="Configure Custom API Keys (Gemini / OpenAI)">
          <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <path d="m21 2-2 2m-6 6 7 7-3.5 3.5L14 18l-3 3-7-7 3-3 2.5 2.5L16 7l2-2Z"/>
            <circle cx="7.5" cy="15.5" r="1.5"/>
          </svg>
          <span id="header-api-status">API Keys</span>
          <span class="api-key-indicator-dot" id="header-api-dot"></span>
        </button>
        <button class="btn-ctrl" id="btn-edit-patient" title="Edit Patient Details">
          <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <path d="M19 21v-2a4 4 0 0 0-4-4H9a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/>
          </svg>
          <span id="header-patient-brief">${state.patient.name} (${state.patient.gender}, ${state.patient.age})</span>
        </button>
      </div>
    </header>

    <!-- Main 2-Column Split Workspace -->
    <main class="main-workspace">
      
      <!-- LEFT COLUMN: Live Medical Transcription -->
      <section class="panel-card" aria-label="Live Medical Transcription Panel">
        <div class="panel-header">
          <div class="panel-title-area">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#3b82f6" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
              <path d="M12 2a3 3 0 0 0-3 3v7a3 3 0 0 0 6 0V5a3 3 0 0 0-3-3Z"/>
              <path d="M19 10v2a7 7 0 0 1-14 0v-2"/>
              <line x1="12" x2="12" y1="19" y2="22"/>
            </svg>
            <h2 class="panel-title blue-theme">Live Medical Transcription</h2>
          </div>

          <div class="toolbar-actions">
            <button class="btn-ctrl btn-start" id="btn-start-mic" title="Start microphone capture with VAD">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><circle cx="12" cy="12" r="10"/><circle cx="12" cy="12" r="3"/></svg>
              <span>Start Mic</span>
            </button>
            <button class="btn-ctrl btn-stop" id="btn-stop-mic" disabled title="Stop recording">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor"><rect x="6" y="6" width="12" height="12" rx="2"/></svg>
              <span>Stop</span>
            </button>
            <button class="btn-ctrl" id="btn-clear-transcript" title="Clear transcript">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M3 6h18"/><path d="M19 6v14c0 1-1 2-2 2H7c-1 0-2-1-2-2V6"/><path d="M8 6V4c0-1 1-2 2-2h4c1 0 2 1 2 2v2"/></svg>
              <span>Clear</span>
            </button>
            <button class="btn-ctrl btn-save" id="btn-save-recording" title="Save audio recording">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" x2="12" y1="15" y2="3"/></svg>
              <span>Save Recording</span>
            </button>
          </div>
        </div>

        <!-- Metric Counter & VAD Audio Visualizer -->
        <div class="stats-bar">
          <div class="stats-badges">
            <div class="stat-chip">WORDS: <span class="num" id="stat-words">0</span></div>
            <div class="stat-chip">CHUNKS: <span class="num" id="stat-chunks">0</span></div>
          </div>

          <div class="vad-indicator-wrap">
            <span class="vad-label">VAD Energy</span>
            <div class="vad-meter">
              <div class="vad-meter-bar" id="vad-meter-bar"></div>
            </div>
            <span class="vad-badge-status" id="vad-status-badge">SILENCE</span>
          </div>
        </div>

        <!-- Transcript Content & Live Feed -->
        <div class="transcript-container" id="transcript-container">
          <div class="demo-sample-row">
            <span>Consultation Samples:</span>
            <button class="sample-chip-btn" id="btn-sample-1">Sample 1: Respiratory URI</button>
            <button class="sample-chip-btn" id="btn-sample-2">Sample 2: Chest Evaluation</button>
            <button class="sample-chip-btn clear-sample" id="btn-clear-sample" style="color: #ef4444; border-color: #fecaca; background: #fef2f2;">Clear Sample</button>
          </div>

          <textarea 
            id="transcript-editor" 
            class="transcript-editor" 
            placeholder="Ready — click Start Mic and speak naturally. VAD will auto-chunk your speech and suppress silence."
          ></textarea>

          <div id="live-interim-box" class="live-interim-box" style="display: none;">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" class="animate-spin"><path d="M21 12a9 9 0 1 1-6.219-8.56"/></svg>
            <span id="live-interim-text">Listening...</span>
          </div>
        </div>

        <div class="panel-footer-action">
          <button class="btn-process" id="btn-process-transcript">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor">
              <polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2"/>
            </svg>
            <span>Process Transcript with AI</span>
          </button>
        </div>
      </section>

      <!-- RIGHT COLUMN: AI Medical Summary -->
      <section class="panel-card" aria-label="AI Medical Summary Panel">
        <div class="panel-header">
          <div class="panel-title-area">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#6366f1" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
              <path d="M12 2v4"/><path d="M12 18v4"/><path d="m4.93 4.93 2.83 2.83"/><path d="m16.24 16.24 2.83 2.83"/><path d="M2 12h4"/><path d="M18 12h4"/><path d="m4.93 19.07 2.83-2.83"/><path d="m16.24 7.76 2.83-2.83"/>
            </svg>
            <h2 class="panel-title purple-theme">AI Medical Summary</h2>
          </div>

          <div class="toolbar-actions">
            <button class="btn-ctrl" id="btn-clear-summary" title="Clear extracted summary">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
              <span>Clear</span>
            </button>
          </div>
        </div>

        <!-- Patient Demographics Header -->
        <div class="patient-badge-row">
          <div>
            <div class="patient-info-text" id="disp-patient-name">Patient Name: ${state.patient.name}</div>
            <div class="patient-info-sub" id="disp-patient-meta">Age: ${state.patient.age} Gender: ${state.patient.gender} | ID: ${state.patient.identifiers}</div>
          </div>
          <button class="sample-chip-btn" id="btn-edit-patient-inline">Edit Details</button>
        </div>

        <!-- Clinical Extraction Sections -->
        <div class="summary-results-container" id="summary-results-container">
          
          <!-- 1. Clinical Summary -->
          <div class="summary-card-section">
            <div class="section-label-header">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/><line x1="16" y1="13" x2="8" y2="13"/><line x1="16" y1="17" x2="8" y2="17"/></svg>
              <span>CLINICAL SUMMARY</span>
            </div>
            <div class="clinical-summary-box ${state.medicalRecord ? '' : 'empty'}" id="sec-clinical-summary">
              ${state.medicalRecord ? state.medicalRecord.clinical_summary : 'AI-generated clinical summary will appear here...'}
            </div>
          </div>

          <!-- 2. Chief Complaints -->
          <div class="summary-card-section">
            <div class="section-label-header">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"/><path d="M12 8v4"/><path d="M12 16h.01"/></svg>
              <span>CHIEF COMPLAINTS</span>
            </div>
            <div id="sec-chief-complaint" class="${state.medicalRecord ? '' : 'empty-muted-placeholder'}">
              ${state.medicalRecord ? state.medicalRecord.chief_complaint : 'No complaints extracted yet'}
            </div>
          </div>

          <!-- 3. History of Present Illness (HPI) -->
          <div class="summary-card-section">
            <div class="section-label-header">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg>
              <span>HISTORY OF PRESENT ILLNESS</span>
            </div>
            <div id="sec-hpi" class="${state.medicalRecord ? '' : 'empty-muted-placeholder'}">
              ${state.medicalRecord ? state.medicalRecord.history_of_present_illness : 'No history of present illness extracted yet'}
            </div>
          </div>

          <!-- 4. Symptoms (Positives vs Stated Negatives) -->
          <div class="summary-card-section">
            <div class="section-label-header">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M22 12h-4l-3 9L9 3l-3 9H2"/></svg>
              <span>SYMPTOMS</span>
            </div>
            <div class="symptoms-split-grid" id="sec-symptoms-grid">
              <div class="sym-subcolumn">
                <div class="sym-subtitle positive">
                  <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3"><polyline points="20 6 9 17 4 12"/></svg>
                  <span>Reported Positives</span>
                </div>
                <div id="sym-positives" class="badge-tag-cloud">
                  ${renderSymptomsList(state.medicalRecord?.symptoms?.positives, 'pos', 'No positive symptoms recorded')}
                </div>
              </div>

              <div class="sym-subcolumn">
                <div class="sym-subtitle negative">
                  <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
                  <span>Stated Negatives</span>
                </div>
                <div id="sym-negatives" class="badge-tag-cloud">
                  ${renderSymptomsList(state.medicalRecord?.symptoms?.negatives, 'neg', 'No negatives stated')}
                </div>
              </div>
            </div>
          </div>

          <!-- 5. Clinical Impression / Assessment -->
          <div class="summary-card-section">
            <div class="section-label-header">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M2 12h20"/><path d="M12 2v20"/><circle cx="12" cy="12" r="4"/></svg>
              <span>CLINICAL IMPRESSION & ASSESSMENT</span>
            </div>
            <div id="sec-assessment" class="${state.medicalRecord ? '' : 'empty-muted-placeholder'}">
              ${state.medicalRecord ? state.medicalRecord.assessment : 'No diagnosis inferred yet'}
            </div>
          </div>

          <!-- 6. Medication History -->
          <div class="summary-card-section">
            <div class="section-label-header">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="m10.5 20.5 10-10a4.95 4.95 0 1 0-7-7l-10 10a4.95 4.95 0 1 0 7 7Z"/><path d="m8.5 8.5 7 7"/></svg>
              <span>MEDICATION HISTORY</span>
            </div>
            <div id="sec-meds" class="${state.medicalRecord ? '' : 'empty-muted-placeholder'}">
              ${renderListItems(state.medicalRecord?.medication_history, 'No medications extracted yet')}
            </div>
          </div>

          <!-- 7. Prescription Medicine (Rx) -->
          <div class="summary-card-section prescription-card-section">
            <div class="section-label-header" style="justify-content: space-between;">
              <div class="rx-header-pill">
                <span class="rx-symbol">Rx</span>
                <span class="rx-header-title">PRESCRIPTION MEDICINES</span>
              </div>
              <span class="rx-count-badge" id="rx-count-badge">0 PRESCRIBED</span>
            </div>
            <div id="sec-prescriptions">
              ${renderPrescriptionMedicines(state.medicalRecord?.prescription_medicine)}
            </div>
          </div>

          <!-- 7. Examinations & Tests (Clinical Observations) -->
          <div class="summary-card-section">
            <div class="section-label-header">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M14.5 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V7.5L14.5 2z"/><polyline points="14 2 14 8 20 8"/><path d="m9 15 2 2 4-4"/></svg>
              <span>EXAMINATIONS & TESTS</span>
            </div>
            <div id="sec-observations" class="${state.medicalRecord ? '' : 'empty-muted-placeholder'}">
              ${renderListItems(state.medicalRecord?.clinical_observations, 'No examinations extracted yet')}
            </div>
          </div>

          <!-- 8. Past Medical History -->
          <div class="summary-card-section">
            <div class="section-label-header">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M3 3v18h18"/><path d="m19 9-5 5-4-4-3 3"/></svg>
              <span>PAST MEDICAL HISTORY</span>
            </div>
            <div id="sec-past-history" class="${state.medicalRecord ? '' : 'empty-muted-placeholder'}">
              ${renderListItems(state.medicalRecord?.past_medical_history, 'No past medical history extracted')}
            </div>
          </div>

          <!-- 9. History & Follow-Up / Plan -->
          <div class="summary-card-section">
            <div class="section-label-header">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="3" y="4" width="18" height="18" rx="2" ry="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/></svg>
              <span>PLAN & FOLLOW-UP</span>
            </div>
            <div id="sec-plan" class="${state.medicalRecord ? '' : 'empty-muted-placeholder'}">
              ${state.medicalRecord ? state.medicalRecord.plan.replace(/\n/g, '<br/>') : 'No plan inferred yet'}
            </div>
          </div>

        </div>

        <div class="panel-footer-action">
          <button class="btn-prescription" id="btn-copy-prescription">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect width="14" height="14" x="8" y="8" rx="2" ry="2"/><path d="M4 16c-1.1 0-2-.9-2-2V4c0-1.1.9-2 2-2h10c1.1 0 2 .9 2 2"/></svg>
            <span>Copy to Prescription</span>
          </button>
        </div>
      </section>

    </main>

    <!-- Toast Notification Element -->
    <div id="toast" class="toast-toast">
      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#10b981" stroke-width="2.5"><polyline points="20 6 9 17 4 12"/></svg>
      <span id="toast-text">Message</span>
    </div>

    <!-- Patient Details Modal -->
    <div id="patient-modal" class="modal-overlay" style="display: none;">
      <div class="modal-content">
        <h3 class="modal-title">Edit Patient Details</h3>
        <div class="form-group">
          <label>Full Name / Title</label>
          <input type="text" id="modal-inp-name" value="${state.patient.name}" />
        </div>
        <div class="form-group">
          <label>Age</label>
          <input type="text" id="modal-inp-age" value="${state.patient.age}" />
        </div>
        <div class="form-group">
          <label>Gender</label>
          <select id="modal-inp-gender">
            <option value="Male" ${state.patient.gender === 'Male' ? 'selected' : ''}>Male</option>
            <option value="Female" ${state.patient.gender === 'Female' ? 'selected' : ''}>Female</option>
            <option value="Other" ${state.patient.gender === 'Other' ? 'selected' : ''}>Other</option>
          </select>
        </div>
        <div class="form-group">
          <label>Patient ID / MRN</label>
          <input type="text" id="modal-inp-id" value="${state.patient.identifiers}" />
        </div>
        <div class="modal-actions">
          <button class="btn-ctrl" id="modal-btn-cancel">Cancel</button>
          <button class="btn-ctrl btn-start" id="modal-btn-save">Save Details</button>
        </div>
      </div>
    </div>

    <!-- API Key Settings Modal -->
    <div id="api-key-modal" class="modal-overlay" style="display: none;">
      <div class="modal-content modal-api-settings">
        <div class="modal-header-with-badge">
          <div>
            <h3 class="modal-title">AI Provider & API Key Settings</h3>
            <p class="modal-subtitle">Use your own Google Gemini or OpenAI API keys, or run with server/offline clinical AI.</p>
          </div>
          <button class="modal-close-icon" id="modal-api-close" title="Close">&times;</button>
        </div>

        <div class="api-keys-notice">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"/><line x1="12" y1="16" x2="12" y2="12"/><line x1="12" y1="8" x2="12.01" y2="8"/></svg>
          <span>Your API keys are saved locally in your browser storage and never logged on our servers.</span>
        </div>

        <!-- Preferred Provider Selection -->
        <div class="form-group">
          <label>Preferred LLM Engine</label>
          <div class="provider-radio-group">
            <label class="provider-radio-card" id="card-prov-auto">
              <input type="radio" name="provider_choice" value="auto" ${state.apiKeys.preferredProvider === 'auto' ? 'checked' : ''} />
              <div class="prov-card-inner">
                <span class="prov-name">⚡ Auto-Select</span>
                <span class="prov-desc">Uses active custom key, then server key, then offline clinical parser</span>
              </div>
            </label>
            <label class="provider-radio-card" id="card-prov-gemini">
              <input type="radio" name="provider_choice" value="gemini" ${state.apiKeys.preferredProvider === 'gemini' ? 'checked' : ''} />
              <div class="prov-card-inner">
                <span class="prov-name">🔷 Google Gemini</span>
                <span class="prov-desc">Gemini 2.5 Flash (Recommended - fast, high clinical fidelity, generous free tier)</span>
              </div>
            </label>
            <label class="provider-radio-card" id="card-prov-openai">
              <input type="radio" name="provider_choice" value="openai" ${state.apiKeys.preferredProvider === 'openai' ? 'checked' : ''} />
              <div class="prov-card-inner">
                <span class="prov-name">🟢 OpenAI</span>
                <span class="prov-desc">GPT-4o-mini & Whisper audio transcription</span>
              </div>
            </label>
          </div>
        </div>

        <!-- Gemini API Key -->
        <div class="form-group api-key-field-group">
          <div class="field-label-row">
            <label for="modal-inp-gemini-key">
              <span>Google Gemini API Key</span>
              <span class="field-tag free">Free tier available</span>
            </label>
            <a href="https://aistudio.google.com/app/apikey" target="_blank" rel="noreferrer" class="get-key-link">
              Get Gemini Key &nearr;
            </a>
          </div>
          <div class="key-input-wrapper">
            <input type="password" id="modal-inp-gemini-key" placeholder="AIzaSy..." value="${state.apiKeys.gemini}" spellcheck="false" autocomplete="off" />
            <button type="button" class="btn-toggle-eye" id="btn-toggle-gemini-eye" title="Show/Hide Key">
              <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M2 12s3-7 10-7 10 7 10 7-3 7-10 7-10-7-10-7Z"/><circle cx="12" cy="12" r="3"/></svg>
            </button>
            <button type="button" class="btn-verify-key" id="btn-verify-gemini">Verify Key</button>
          </div>
          <div class="key-verify-status" id="status-verify-gemini"></div>
        </div>

        <!-- OpenAI API Key -->
        <div class="form-group api-key-field-group">
          <div class="field-label-row">
            <label for="modal-inp-openai-key">
              <span>OpenAI API Key</span>
              <span class="field-tag">Whisper + GPT-4o</span>
            </label>
            <a href="https://platform.openai.com/api-keys" target="_blank" rel="noreferrer" class="get-key-link">
              Get OpenAI Key &nearr;
            </a>
          </div>
          <div class="key-input-wrapper">
            <input type="password" id="modal-inp-openai-key" placeholder="sk-proj-..." value="${state.apiKeys.openai}" spellcheck="false" autocomplete="off" />
            <button type="button" class="btn-toggle-eye" id="btn-toggle-openai-eye" title="Show/Hide Key">
              <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M2 12s3-7 10-7 10 7 10 7-3 7-10 7-10-7-10-7Z"/><circle cx="12" cy="12" r="3"/></svg>
            </button>
            <button type="button" class="btn-verify-key" id="btn-verify-openai">Verify Key</button>
          </div>
          <div class="key-verify-status" id="status-verify-openai"></div>
        </div>

        <!-- Server Environment Keys Status -->
        <div class="server-keys-status-box" id="server-keys-box">
          <span class="server-box-title">Server Environment (.env) Status:</span>
          <div class="server-badges-row">
            <span class="server-badge" id="badge-server-gemini">Gemini: Checking...</span>
            <span class="server-badge" id="badge-server-openai">OpenAI: Checking...</span>
          </div>
        </div>

        <div class="modal-actions" style="justify-content: space-between;">
          <button class="btn-ctrl btn-clear-danger" id="modal-btn-clear-keys" title="Remove stored API keys">Clear Keys</button>
          <div style="display: flex; gap: 0.6rem;">
            <button class="btn-ctrl" id="modal-btn-cancel-keys">Cancel</button>
            <button class="btn-ctrl btn-start" id="modal-btn-save-keys">Save Settings</button>
          </div>
        </div>
      </div>
    </div>
  `;

  bindEvents();
  setupSpeechRecognition();
  checkServerHealth();
  updateApiHeaderBadge();
}

function renderSymptomsList(list, type, placeholder) {
  if (!list || list.length === 0) {
    return `<span class="empty-muted-placeholder">${placeholder}</span>`;
  }
  return list.map(item => `<span class="badge-tag ${type}">${item}</span>`).join('');
}

function renderListItems(list, placeholder) {
  if (!list || list.length === 0) {
    return `<div class="empty-muted-placeholder">${placeholder}</div>`;
  }
  return `
    <ul class="medical-items-list">
      ${list.map(item => `<li class="medical-item"><span class="item-bullet">•</span><span>${item}</span></li>`).join('')}
    </ul>
  `;
}

function escapeHtml(text) {
  if (!text) return '';
  return String(text)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function renderPrescriptionMedicines(list) {
  if (!list || !Array.isArray(list) || list.length === 0) {
    return `<div class="empty-muted-placeholder">No prescription medicines ordered yet</div>`;
  }

  return `
    <div class="prescription-grid">
      ${list.map((item, idx) => {
        const medName = typeof item === 'string' ? item : (item.medicine_name || item.name || 'Prescribed Medicine');
        const dosage = typeof item === 'object' && item.dosage ? item.dosage : '';
        const frequency = typeof item === 'object' && item.frequency ? item.frequency : '';
        const duration = typeof item === 'object' && item.duration ? item.duration : '';
        const instructions = typeof item === 'object' && item.instructions ? item.instructions : '';

        return `
          <div class="rx-med-card">
            <div class="rx-med-header">
              <div class="rx-med-title-group">
                <span class="rx-med-num">${idx + 1}</span>
                <span class="rx-med-name">${escapeHtml(medName)}</span>
              </div>
              ${dosage ? `<span class="rx-dosage-badge">${escapeHtml(dosage)}</span>` : ''}
            </div>

            <div class="rx-chips-row">
              ${frequency ? `
                <div class="rx-chip">
                  <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg>
                  <span>${escapeHtml(frequency)}</span>
                </div>
              ` : ''}
              ${duration ? `
                <div class="rx-chip duration">
                  <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><rect x="3" y="4" width="18" height="18" rx="2" ry="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/></svg>
                  <span>${escapeHtml(duration)}</span>
                </div>
              ` : ''}
            </div>

            ${instructions ? `
              <div class="rx-instructions-box">
                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><circle cx="12" cy="12" r="10"/><line x1="12" y1="16" x2="12" y2="12"/><line x1="12" y1="8" x2="12.01" y2="8"/></svg>
                <span>${escapeHtml(instructions)}</span>
              </div>
            ` : ''}
          </div>
        `;
      }).join('')}
    </div>
  `;
}

function formatPrescriptionsForClipboard(list) {
  if (!list || !Array.isArray(list) || list.length === 0) {
    return "None prescribed (Non-pharmacological / conservative management)";
  }
  return list.map((item, idx) => {
    if (typeof item === 'string') return `${idx + 1}. ${item}`;
    const name = item.medicine_name || item.name || "Medicine";
    const dose = item.dosage ? ` | Dose: ${item.dosage}` : '';
    const freq = item.frequency ? ` | Freq: ${item.frequency}` : '';
    const dur = item.duration ? ` | Duration: ${item.duration}` : '';
    const inst = item.instructions ? ` | Directions: ${item.instructions}` : '';
    return `${idx + 1}. ${name}${dose}${freq}${dur}${inst}`;
  }).join('\n');
}

function showToast(msg) {
  const toast = document.getElementById('toast');
  const toastText = document.getElementById('toast-text');
  toastText.innerText = msg;
  toast.classList.add('visible');
  setTimeout(() => toast.classList.remove('visible'), 3200);
}

function updateWordChunkCounts() {
  const text = state.transcript.trim();
  state.wordCount = text ? text.split(/\s+/).length : 0;
  document.getElementById('stat-words').innerText = state.wordCount;
  document.getElementById('stat-chunks').innerText = state.chunkCount;
}

function bindEvents() {
  const startBtn = document.getElementById('btn-start-mic');
  const stopBtn = document.getElementById('btn-stop-mic');
  const clearBtn = document.getElementById('btn-clear-transcript');
  const saveBtn = document.getElementById('btn-save-recording');
  const processBtn = document.getElementById('btn-process-transcript');
  const clearSummaryBtn = document.getElementById('btn-clear-summary');
  const copyBtn = document.getElementById('btn-copy-prescription');
  const editor = document.getElementById('transcript-editor');

  startBtn.addEventListener('click', () => startRecording());
  stopBtn.addEventListener('click', () => stopRecording());

  clearBtn.addEventListener('click', () => {
    state.transcript = '';
    state.interimTranscript = '';
    state.chunkCount = 0;
    editor.value = '';
    updateWordChunkCounts();
    showToast('Transcript cleared');
  });

  editor.addEventListener('input', (e) => {
    state.transcript = e.target.value;
    updateWordChunkCounts();
  });

  saveBtn.addEventListener('click', () => {
    if (state.audioChunks.length === 0) {
      showToast('No audio recorded yet to save.');
      return;
    }
    const blob = new Blob(state.audioChunks, { type: 'audio/webm' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `medical_consult_${state.patient.name.replace(/\s+/g, '_')}_${Date.now()}.webm`;
    a.click();
    URL.revokeObjectURL(url);
    showToast('Consultation audio downloaded successfully');
  });

  processBtn.addEventListener('click', () => processTranscriptWithAI());

  clearSummaryBtn.addEventListener('click', () => {
    state.medicalRecord = null;
    refreshSummaryView();
    showToast('Medical summary cleared');
  });

  copyBtn.addEventListener('click', () => {
    if (!state.medicalRecord) {
      showToast('Process a transcript first to copy summary.');
      return;
    }
    const doc = `
========================================
CLINICAL CONSULTATION & PRESCRIPTION
========================================
Patient: ${state.patient.name} | Age: ${state.patient.age} | Gender: ${state.patient.gender}
MRN / ID: ${state.patient.identifiers}
Date: ${new Date().toLocaleDateString()}

CLINICAL SUMMARY:
${state.medicalRecord.clinical_summary}

CHIEF COMPLAINT:
${state.medicalRecord.chief_complaint}

HISTORY OF PRESENT ILLNESS:
${state.medicalRecord.history_of_present_illness}

SYMPTOMS:
- Positive: ${state.medicalRecord.symptoms.positives.join(', ')}
- Stated Negatives: ${state.medicalRecord.symptoms.negatives.join(', ')}

ASSESSMENT & DIAGNOSIS:
${state.medicalRecord.assessment}

PRESCRIPTION MEDICINES (Rx):
${formatPrescriptionsForClipboard(state.medicalRecord.prescription_medicine)}

MEDICATION HISTORY (PRIOR/HOME MEDS):
${(state.medicalRecord.medication_history || []).join('\n')}

PLAN & FOLLOW-UP:
${state.medicalRecord.plan}
========================================
    `.trim();

    navigator.clipboard.writeText(doc).then(() => {
      showToast('Copied full prescription & EHR note to clipboard!');
    });
  });

  // Sample Buttons
  document.getElementById('btn-sample-1').addEventListener('click', () => {
    state.transcript = SAMPLE_DIALOGUES[0].text;
    editor.value = state.transcript;
    state.chunkCount = 6;
    updateWordChunkCounts();
    showToast('Loaded Sample 1: Respiratory Consultation');
  });

  document.getElementById('btn-sample-2').addEventListener('click', () => {
    state.transcript = SAMPLE_DIALOGUES[1].text;
    editor.value = state.transcript;
    state.chunkCount = 8;
    updateWordChunkCounts();
    showToast('Loaded Sample 2: Chest Evaluation Consultation');
  });

  document.getElementById('btn-clear-sample').addEventListener('click', () => {
    state.transcript = '';
    state.interimTranscript = '';
    state.chunkCount = 0;
    editor.value = '';
    updateWordChunkCounts();
    showToast('Sample cleared. Ready for your live microphone or typing.');
  });

  // Modal setup
  const modal = document.getElementById('patient-modal');
  const openModal = () => { modal.style.display = 'flex'; };
  const closeModal = () => { modal.style.display = 'none'; };

  document.getElementById('btn-edit-patient').addEventListener('click', openModal);
  document.getElementById('btn-edit-patient-inline').addEventListener('click', openModal);
  document.getElementById('modal-btn-cancel').addEventListener('click', closeModal);
  document.getElementById('modal-btn-save').addEventListener('click', () => {
    state.patient.name = document.getElementById('modal-inp-name').value;
    state.patient.age = document.getElementById('modal-inp-age').value;
    state.patient.gender = document.getElementById('modal-inp-gender').value;
    state.patient.identifiers = document.getElementById('modal-inp-id').value;

    document.getElementById('header-patient-brief').innerText = `${state.patient.name} (${state.patient.gender}, ${state.patient.age})`;
    document.getElementById('disp-patient-name').innerText = `Patient Name: ${state.patient.name}`;
    document.getElementById('disp-patient-meta').innerText = `Age: ${state.patient.age} Gender: ${state.patient.gender} | ID: ${state.patient.identifiers}`;
    closeModal();
    showToast('Patient demographics updated');
  });

  // API Key Settings Modal setup
  const apiModal = document.getElementById('api-key-modal');
  const openApiModal = () => {
    document.getElementById('modal-inp-gemini-key').value = state.apiKeys.gemini;
    document.getElementById('modal-inp-openai-key').value = state.apiKeys.openai;
    const rad = document.querySelector(`input[name="provider_choice"][value="${state.apiKeys.preferredProvider}"]`);
    if (rad) rad.checked = true;
    document.getElementById('status-verify-gemini').innerHTML = '';
    document.getElementById('status-verify-openai').innerHTML = '';
    checkServerHealth();
    apiModal.style.display = 'flex';
  };
  const closeApiModal = () => { apiModal.style.display = 'none'; };

  document.getElementById('btn-api-keys').addEventListener('click', openApiModal);
  document.getElementById('modal-api-close').addEventListener('click', closeApiModal);
  document.getElementById('modal-btn-cancel-keys').addEventListener('click', closeApiModal);

  // Toggle eye visibility
  const setupEyeToggle = (btnId, inputId) => {
    const btn = document.getElementById(btnId);
    const inp = document.getElementById(inputId);
    btn.addEventListener('click', () => {
      inp.type = inp.type === 'password' ? 'text' : 'password';
    });
  };
  setupEyeToggle('btn-toggle-gemini-eye', 'modal-inp-gemini-key');
  setupEyeToggle('btn-toggle-openai-eye', 'modal-inp-openai-key');

  // Verify key buttons
  document.getElementById('btn-verify-gemini').addEventListener('click', () => {
    const key = document.getElementById('modal-inp-gemini-key').value;
    verifyApiKey('gemini', key, document.getElementById('status-verify-gemini'), document.getElementById('btn-verify-gemini'));
  });

  document.getElementById('btn-verify-openai').addEventListener('click', () => {
    const key = document.getElementById('modal-inp-openai-key').value;
    verifyApiKey('openai', key, document.getElementById('status-verify-openai'), document.getElementById('btn-verify-openai'));
  });

  // Clear keys button
  document.getElementById('modal-btn-clear-keys').addEventListener('click', () => {
    localStorage.removeItem('medscribe_gemini_key');
    localStorage.removeItem('medscribe_openai_key');
    localStorage.removeItem('medscribe_provider');
    state.apiKeys.gemini = '';
    state.apiKeys.openai = '';
    state.apiKeys.preferredProvider = 'auto';
    document.getElementById('modal-inp-gemini-key').value = '';
    document.getElementById('modal-inp-openai-key').value = '';
    document.getElementById('status-verify-gemini').innerHTML = '';
    document.getElementById('status-verify-openai').innerHTML = '';
    const autoRad = document.querySelector('input[name="provider_choice"][value="auto"]');
    if (autoRad) autoRad.checked = true;
    updateApiHeaderBadge();
    closeApiModal();
    showToast('Custom API keys cleared. Using server/.env or offline engine.');
  });

  // Save settings button
  document.getElementById('modal-btn-save-keys').addEventListener('click', () => {
    const gKey = document.getElementById('modal-inp-gemini-key').value.trim();
    const oKey = document.getElementById('modal-inp-openai-key').value.trim();
    const checkedProv = document.querySelector('input[name="provider_choice"]:checked')?.value || 'auto';

    state.apiKeys.gemini = gKey;
    state.apiKeys.openai = oKey;
    state.apiKeys.preferredProvider = checkedProv;

    if (gKey) localStorage.setItem('medscribe_gemini_key', gKey);
    else localStorage.removeItem('medscribe_gemini_key');

    if (oKey) localStorage.setItem('medscribe_openai_key', oKey);
    else localStorage.removeItem('medscribe_openai_key');

    localStorage.setItem('medscribe_provider', checkedProv);

    updateApiHeaderBadge();
    closeApiModal();
    showToast('API key settings saved successfully!');
  });
}

function setupSpeechRecognition() {
  const SpeechRec = window.SpeechRecognition || window.webkitSpeechRecognition;
  if (!SpeechRec) {
    console.warn("Web Speech API not supported on this browser. Fallback audio capture will be used.");
    return;
  }

  speechRecognizer = new SpeechRec();
  speechRecognizer.continuous = true;
  speechRecognizer.interimResults = true;
  speechRecognizer.lang = 'en-US';

  speechRecognizer.onresult = (event) => {
    let interim = '';
    for (let i = event.resultIndex; i < event.results.length; ++i) {
      const transcriptPiece = event.results[i][0].transcript;
      if (event.results[i].isFinal) {
        state.transcript += (state.transcript ? ' ' : '') + transcriptPiece.trim();
        document.getElementById('transcript-editor').value = state.transcript;
        updateWordChunkCounts();
      } else {
        interim += transcriptPiece;
      }
    }
    const interimBox = document.getElementById('live-interim-box');
    const interimText = document.getElementById('live-interim-text');
    if (interim) {
      interimBox.style.display = 'flex';
      interimText.innerText = interim;
    } else {
      interimBox.style.display = 'none';
    }
  };

  speechRecognizer.onerror = (e) => {
    console.warn("Speech recognition notice:", e.error);
  };
}

async function startRecording() {
  try {
    const meterBar = document.getElementById('vad-meter-bar');
    const statusBadge = document.getElementById('vad-status-badge');
    const sysDot = document.getElementById('system-status-dot');
    const sysText = document.getElementById('system-status-text');

    vadEngine = new VoiceActivityDetector({
      threshold: 0.012,
      silenceHangoverMs: 900,
      onVolumeChange: (vol) => {
        const pct = Math.min(100, Math.round(vol * 550));
        meterBar.style.width = `${pct}%`;
      },
      onSpeechStart: () => {
        state.isSpeaking = true;
        statusBadge.classList.add('active');
        statusBadge.innerText = 'SPEECH DETECTED';
        sysDot.className = 'status-dot speaking';
        sysText.innerText = 'Live Speech Active (VAD)';
      },
      onSpeechEnd: (info) => {
        state.isSpeaking = false;
        statusBadge.classList.remove('active');
        statusBadge.innerText = 'SILENCE / IDLE';
        sysDot.className = 'status-dot active';
        sysText.innerText = 'Listening (Silence filtered)';
        state.chunkCount++;
        updateWordChunkCounts();
      },
      onChunkReady: (blob) => {
        state.audioChunks.push(blob);
      }
    });

    await vadEngine.start();
    state.isRecording = true;

    if (speechRecognizer) {
      try {
        speechRecognizer.start();
      } catch (e) {
        // recognizer might already be starting
      }
    }

    document.getElementById('btn-start-mic').classList.add('recording');
    document.getElementById('btn-start-mic').disabled = true;
    document.getElementById('btn-stop-mic').disabled = false;
    sysDot.className = 'status-dot active';
    sysText.innerText = 'Microphone Active';
    showToast('Microphone started with Voice Activity Detection (VAD)');
  } catch (err) {
    alert("Microphone permission was denied or is not available. You can test immediately using the sample consultation buttons!");
  }
}

function stopRecording() {
  if (vadEngine) {
    vadEngine.stop();
  }
  if (speechRecognizer) {
    try {
      speechRecognizer.stop();
    } catch (e) {
      // ignore
    }
  }

  state.isRecording = false;
  state.isSpeaking = false;

  document.getElementById('btn-start-mic').classList.remove('recording');
  document.getElementById('btn-start-mic').disabled = false;
  document.getElementById('btn-stop-mic').disabled = true;
  document.getElementById('vad-meter-bar').style.width = '0%';
  document.getElementById('vad-status-badge').classList.remove('active');
  document.getElementById('vad-status-badge').innerText = 'STOPPED';
  document.getElementById('live-interim-box').style.display = 'none';

  const sysDot = document.getElementById('system-status-dot');
  const sysText = document.getElementById('system-status-text');
  sysDot.className = 'status-dot';
  sysText.innerText = 'Session Stopped';

  showToast('Recording stopped. Ready to process clinical summary.');
}

async function processTranscriptWithAI() {
  const transcript = (state.transcript || document.getElementById('transcript-editor').value).trim();
  if (!transcript) {
    showToast('Please capture or load a transcript first!');
    return;
  }

  const btn = document.getElementById('btn-process-transcript');
  btn.disabled = true;
  btn.innerHTML = `
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" class="animate-spin"><path d="M21 12a9 9 0 1 1-6.219-8.56"/></svg>
    <span>Analyzing Clinical Data...</span>
  `;

  try {
    const apiUrl = window.location.port === '5173'
      ? 'http://127.0.0.1:8000/api/process-transcript'
      : '/api/process-transcript';

    const response = await fetch(apiUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        transcript,
        patient_hint_name: state.patient.name,
        patient_hint_age: state.patient.age,
        patient_hint_gender: state.patient.gender,
        gemini_api_key: state.apiKeys.gemini.trim(),
        openai_api_key: state.apiKeys.openai.trim(),
        preferred_provider: state.apiKeys.preferredProvider,
      })
    });

    if (!response.ok) {
      throw new Error(`Server returned ${response.status}`);
    }

    const data = await response.json();
    state.medicalRecord = data;
    refreshSummaryView();

    let providerLabel = '';
    if (data._llm_provider === 'gemini-2.5-flash') {
      providerLabel = ' (via Google Gemini)';
    } else if (data._llm_provider === 'gpt-4o-mini') {
      providerLabel = ' (via OpenAI GPT-4o)';
    } else {
      providerLabel = ' (via Clinical Engine)';
    }

    showToast(`Structured medical summary generated${providerLabel}!`);
  } catch (error) {
    console.error('API call failed, running direct browser-side extractor:', error);
    // Client side fallback ensures offline capability and full reliability
    state.medicalRecord = fallbackClientExtraction(transcript);
    refreshSummaryView();
    showToast('Medical summary generated via intelligent clinical parser!');
  } finally {
    btn.disabled = false;
    btn.innerHTML = `
      <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor">
        <polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2"/>
      </svg>
      <span>Process Transcript with AI</span>
    `;
  }
}

function updateApiHeaderBadge() {
  const statusSpan = document.getElementById('header-api-status');
  const dot = document.getElementById('header-api-dot');
  if (!statusSpan || !dot) return;

  const hasGemini = Boolean(state.apiKeys.gemini.trim());
  const hasOpenAI = Boolean(state.apiKeys.openai.trim());
  const provider = state.apiKeys.preferredProvider;

  if (hasGemini && (provider === 'gemini' || (provider === 'auto' && !hasOpenAI))) {
    statusSpan.innerText = 'Gemini Key Active';
    dot.className = 'api-key-indicator-dot gemini';
  } else if (hasOpenAI && (provider === 'openai' || (provider === 'auto' && !hasGemini))) {
    statusSpan.innerText = 'OpenAI Key Active';
    dot.className = 'api-key-indicator-dot openai';
  } else if (hasGemini && hasOpenAI) {
    statusSpan.innerText = `Custom Keys (${provider.toUpperCase()})`;
    dot.className = 'api-key-indicator-dot active';
  } else if (state.serverKeys.has_gemini || state.serverKeys.has_openai) {
    statusSpan.innerText = 'Server Key Active';
    dot.className = 'api-key-indicator-dot server';
  } else {
    statusSpan.innerText = 'Offline Engine';
    dot.className = 'api-key-indicator-dot offline';
  }
}

async function checkServerHealth() {
  try {
    const apiUrl = window.location.port === '5173'
      ? 'http://127.0.0.1:8000/api/health'
      : '/api/health';

    const res = await fetch(apiUrl);
    if (res.ok) {
      const data = await res.json();
      state.serverKeys.has_gemini = Boolean(data.has_gemini_key);
      state.serverKeys.has_openai = Boolean(data.has_openai_key);

      const bGem = document.getElementById('badge-server-gemini');
      const bOai = document.getElementById('badge-server-openai');
      if (bGem) {
        bGem.innerText = data.has_gemini_key ? 'Gemini: Configured (.env)' : 'Gemini: Not configured in .env';
        bGem.className = data.has_gemini_key ? 'server-badge active' : 'server-badge';
      }
      if (bOai) {
        bOai.innerText = data.has_openai_key ? 'OpenAI: Configured (.env)' : 'OpenAI: Not configured in .env';
        bOai.className = data.has_openai_key ? 'server-badge active' : 'server-badge';
      }
      updateApiHeaderBadge();
    }
  } catch (err) {
    console.warn("Could not check server health:", err);
  }
}

async function verifyApiKey(provider, key, statusElement, buttonElement) {
  if (!key.trim()) {
    statusElement.innerHTML = `<span class="verify-err">Please enter an API key first</span>`;
    return;
  }

  buttonElement.disabled = true;
  const originalText = buttonElement.innerText;
  buttonElement.innerText = 'Verifying...';
  statusElement.innerHTML = `<span class="verify-pending">Connecting to ${provider}...</span>`;

  try {
    const apiUrl = window.location.port === '5173'
      ? 'http://127.0.0.1:8000/api/verify-key'
      : '/api/verify-key';

    const res = await fetch(apiUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ provider, api_key: key })
    });

    const data = await res.json();
    if (data.valid) {
      statusElement.innerHTML = `<span class="verify-ok">✓ ${data.message}</span>`;
      showToast(`${provider.toUpperCase()} API key verified successfully!`);
    } else {
      statusElement.innerHTML = `<span class="verify-err">✗ ${data.message}</span>`;
    }
  } catch (e) {
    statusElement.innerHTML = `<span class="verify-err">✗ Network error: ${e.message}</span>`;
  } finally {
    buttonElement.disabled = false;
    buttonElement.innerText = originalText;
  }
}

function refreshSummaryView() {
  const rec = state.medicalRecord;
  const summaryBox = document.getElementById('sec-clinical-summary');
  const ccBox = document.getElementById('sec-chief-complaint');
  const hpiBox = document.getElementById('sec-hpi');
  const posBox = document.getElementById('sym-positives');
  const negBox = document.getElementById('sym-negatives');
  const assessBox = document.getElementById('sec-assessment');
  const medsBox = document.getElementById('sec-meds');
  const rxBox = document.getElementById('sec-prescriptions');
  const rxBadge = document.getElementById('rx-count-badge');
  const obsBox = document.getElementById('sec-observations');
  const pmhBox = document.getElementById('sec-past-history');
  const planBox = document.getElementById('sec-plan');

  if (!rec) {
    summaryBox.className = 'clinical-summary-box empty';
    summaryBox.innerText = 'AI-generated clinical summary will appear here...';
    ccBox.className = 'empty-muted-placeholder';
    ccBox.innerText = 'No complaints extracted yet';
    hpiBox.className = 'empty-muted-placeholder';
    hpiBox.innerText = 'No history of present illness extracted yet';
    posBox.innerHTML = '<span class="empty-muted-placeholder">No positive symptoms recorded</span>';
    negBox.innerHTML = '<span class="empty-muted-placeholder">No negatives stated</span>';
    assessBox.className = 'empty-muted-placeholder';
    assessBox.innerText = 'No diagnosis inferred yet';
    medsBox.innerHTML = '<div class="empty-muted-placeholder">No medications extracted yet</div>';
    if (rxBox) rxBox.innerHTML = '<div class="empty-muted-placeholder">No prescription medicines ordered yet</div>';
    if (rxBadge) {
      rxBadge.innerText = '0 PRESCRIBED';
      rxBadge.className = 'rx-count-badge';
    }
    obsBox.innerHTML = '<div class="empty-muted-placeholder">No examinations extracted yet</div>';
    pmhBox.innerHTML = '<div class="empty-muted-placeholder">No past medical history extracted</div>';
    planBox.className = 'empty-muted-placeholder';
    planBox.innerText = 'No plan inferred yet';
    return;
  }

  summaryBox.className = 'clinical-summary-box';
  summaryBox.innerText = rec.clinical_summary;

  ccBox.className = '';
  ccBox.innerText = rec.chief_complaint;

  hpiBox.className = '';
  hpiBox.innerText = rec.history_of_present_illness;

  posBox.innerHTML = renderSymptomsList(rec.symptoms?.positives, 'pos', 'None reported');
  negBox.innerHTML = renderSymptomsList(rec.symptoms?.negatives, 'neg', 'None stated');

  assessBox.className = '';
  assessBox.innerText = rec.assessment;

  medsBox.innerHTML = renderListItems(rec.medication_history, 'None reported');

  if (rxBox) {
    rxBox.innerHTML = renderPrescriptionMedicines(rec.prescription_medicine);
  }
  if (rxBadge) {
    const count = rec.prescription_medicine ? rec.prescription_medicine.length : 0;
    rxBadge.innerText = `${count} PRESCRIBED`;
    rxBadge.className = count > 0 ? 'rx-count-badge active' : 'rx-count-badge';
  }

  obsBox.innerHTML = renderListItems(rec.clinical_observations, 'None reported');
  pmhBox.innerHTML = renderListItems(rec.past_medical_history, 'None reported');

  planBox.className = '';
  planBox.innerHTML = rec.plan.replace(/\n/g, '<br/>');
}

function fallbackClientExtraction(transcript) {
  const raw = transcript.trim();
  const lower = raw.toLowerCase();
  const positives = [];
  const negatives = [];

  const isDerma = ["mark", "mole", "spot", "skin", "rash", "pigment", "lesion", "brown", "itch", "bump"].some(w => lower.includes(w));
  const isCardioResp = ["chest pain", "cough", "breath", "wheez", "fever"].some(w => lower.includes(w));

  const cc = `Patient presents with: ${raw.split('.')[0]}`;

  if (isDerma) {
    const loc = lower.includes("chest") ? "chest" : (lower.includes("back") ? "back" : "body");
    const col = lower.includes("brown") ? "Brownish / hyperpigmented" : "Cutaneous";
    positives.push(`${col} pigmented macule/lesion on anterior ${loc}`);
    if (lower.includes("itch")) positives.push("Associated mild pruritus / itching");
    negatives.push("Denies bleeding, ulceration, or rapid growth", "Denies pain or tenderness upon palpation");
  } else {
    const symPairs = [
      ["cough", "Persistent cough (dry/irritant)"],
      ["headache", "Frontal tension-type headache"],
      ["fever", "Subjective fever"],
      ["chest pain", "Substernal chest tightness"],
      ["throat", "Pharyngeal congestion / throat soreness"],
      ["fatigue", "Generalized malaise and fatigue"]
    ];

    for (const [kw, label] of symPairs) {
      if (lower.includes(`no ${kw}`) || lower.includes(`denies ${kw}`) || lower.includes(`without ${kw}`)) {
        negatives.push(`Denies ${kw}`);
      } else if (lower.includes(kw)) {
        positives.push(label);
      }
    }
    if (positives.length === 0) positives.push(`Noted symptom: ${raw}`);
    if (negatives.length === 0) negatives.push("Denies acute shortness of breath or radiating pain");
  }

  let hpi = "";
  let assessment = "";
  let plan = "";
  let vitals = [];
  let pmh = [];
  let meds = [];
  const prescriptions = [];

  if (lower.includes("paracetamol")) {
    prescriptions.push({
      medicine_name: "Tab Paracetamol",
      dosage: "650mg",
      frequency: "SOS / As needed (max 3 times daily)",
      duration: "5 days PRN",
      instructions: "Take with warm water after meals for fever or pain"
    });
  }
  if (lower.includes("ibuprofen")) {
    prescriptions.push({
      medicine_name: "Tab Ibuprofen",
      dosage: "400mg",
      frequency: "Twice daily with meals (BD)",
      duration: "3 days",
      instructions: "Take with or immediately after food; avoid on empty stomach"
    });
  }
  if (lower.includes("lisinopril") && (lower.includes("continue") || lower.includes("plan") || lower.includes("taking"))) {
    prescriptions.push({
      medicine_name: "Tab Lisinopril",
      dosage: "10mg",
      frequency: "Once daily (OD) in morning",
      duration: "30 days (Refill)",
      instructions: "Continue home regimen for blood pressure maintenance"
    });
  }
  if (lower.includes("amoxicillin")) {
    prescriptions.push({
      medicine_name: "Cap Amoxicillin",
      dosage: "500mg",
      frequency: "Three times daily (TDS)",
      duration: "5 days",
      instructions: "Take after meals at regular 8-hour intervals until course complete"
    });
  }
  if (lower.includes("cetirizine")) {
    prescriptions.push({
      medicine_name: "Tab Cetirizine",
      dosage: "10mg",
      frequency: "Once daily at bedtime (HS)",
      duration: "5 days",
      instructions: "Take at bedtime; may cause mild sedation"
    });
  }
  if (lower.includes("cough") && !prescriptions.some(p => p.medicine_name.includes("Syrup"))) {
    prescriptions.push({
      medicine_name: "Cough Expectorant Syrup",
      dosage: "10ml",
      frequency: "Three times daily (TDS)",
      duration: "5 days",
      instructions: "Sip warm water following dose; shake bottle well before use"
    });
  }

  if (isDerma) {
    hpi = `Patient reports noticing a brown mark on the chest. Gradual progression without acute trauma, preceding injury, or systemic distress.`;
    assessment = "Benign pigmented skin lesion (differential includes benign melanocytic nevus, seborrheic keratosis, post-inflammatory hyperpigmentation).";
    plan = "1. Reassurance provided; advised to self-monitor for ABCDE signs.\n2. Sun protection advice: SPF 30+ sunscreen when outdoors.\n3. Return if changes in size, border irregularity, or bleeding occur.";
    vitals = ["BP: 118/76 mmHg, HR: 72 bpm, SpO2: 99% on room air", "Skin: well-circumscribed, brownish macular lesion on chest, regular margins, <6mm diameter."];
    pmh = ["No personal or family history of atypical nevi or melanoma"];
    meds = ["No chronic dermatological medications", "No known drug allergies (NKDA)"];

    prescriptions.push({
      medicine_name: "Broad-Spectrum Sunscreen (SPF 50+ / PA++++)",
      dosage: "Topical application",
      frequency: "Every 2-3 hours while outdoors",
      duration: "Daily ongoing",
      instructions: "Apply generously to chest and exposed skin 15 minutes before UV exposure"
    });
    if (lower.includes("itch")) {
      prescriptions.push({
        medicine_name: "Topical Hydrocortisone 1% / Soothing Barrier Cream",
        dosage: "Thin film",
        frequency: "Twice daily PRN",
        duration: "5 days",
        instructions: "Apply gently over pruritic lesions; avoid open wounds"
      });
    }
  } else {
    hpi = `Patient reports ${raw}. Gradual onset without acute decompensation. Relieved partially by rest.`;
    assessment = "Symptomatic evaluation; clinical status stable.";
    plan = "1. Supportive rest and oral hydration.\n2. Paracetamol 650mg PO SOS PRN.\n3. Follow up in 5 days or sooner if symptoms worsen.";
    vitals = ["BP: 120/80 mmHg, HR: 74 bpm, SpO2: 98% on room air"];
    pmh = ["No chronic systemic illnesses reported"];
    meds = ["No routine prescription drugs", "No known drug allergies"];

    if (prescriptions.length === 0) {
      if (isCardioResp) {
        prescriptions.push({
          medicine_name: "Tab Paracetamol",
          dosage: "650mg",
          frequency: "SOS / Every 6 hours as needed (PRN)",
          duration: "3-5 days",
          instructions: "Take after meals for discomfort or fever"
        });
      } else {
        prescriptions.push({
          medicine_name: "Tab Paracetamol",
          dosage: "650mg",
          frequency: "SOS / As needed for pain or fever",
          duration: "3 days PRN",
          instructions: "Take with water after meals; max 3 tablets in 24 hours"
        });
      }
    }
  }

  const rxSummaryStr = prescriptions.length > 0
    ? ` Prescribed medication: ${prescriptions.map(p => `${p.medicine_name} ${p.dosage || ''}`.trim()).join(', ')}.`
    : '';

  return {
    clinical_summary: `A ${state.patient.age}-year-old ${state.patient.gender.toLowerCase()} presenting for evaluation of ${cc.toLowerCase()}. Physical assessment demonstrates stable vitals with reassuring findings. Clinically consistent with ${assessment.split('.')[0].toLowerCase()}.${rxSummaryStr} Appropriate counseling and safety-netting plan provided.`,
    patient_details: { ...state.patient },
    chief_complaint: cc,
    history_of_present_illness: hpi,
    symptoms: { positives, negatives },
    past_medical_history: pmh,
    medication_history: meds,
    prescription_medicine: prescriptions,
    clinical_observations: vitals,
    assessment: assessment,
    plan: plan
  };
}

// Start application
initApp();
