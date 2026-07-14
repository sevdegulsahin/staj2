/**
 * Spatial Vision Assistant — Frontend Logic
 *
 * Flow:
 *  1. User uploads a photo (drag & drop or click)
 *  2. User types or voice-records their question
 *  3. Click "Analyze Scene" → POST /analyze → display + speak result
 *
 * Voice input uses the browser's Web Speech API (SpeechRecognition)
 * TTS output uses the browser's SpeechSynthesis API
 * No external libraries needed.
 */

// ─── Config ───────────────────────────────────────────────────────────────────
const API_BASE = ""; // Relative URL — works on any domain (localhost, ngrok, IP, etc.)

// ─── DOM References ───────────────────────────────────────────────────────────
const dropZone       = document.getElementById("drop-zone");
const dropZoneInner  = document.getElementById("drop-zone-inner");
const fileInput      = document.getElementById("file-input");
const previewImg     = document.getElementById("preview-img");
const clearBtn       = document.getElementById("clear-btn");
const cameraBtn      = document.getElementById("camera-btn");
const introOverlay   = document.getElementById("intro-overlay");
const langTrBtn      = document.getElementById("lang-tr-btn");
const langEnBtn      = document.getElementById("lang-en-btn");

const questionInput  = document.getElementById("question-input");
const voiceBtn       = document.getElementById("voice-btn");
const voiceBtnLabel  = document.getElementById("voice-btn-label");
const waveform       = document.getElementById("waveform");
const voiceHint      = document.getElementById("voice-hint");

const analyzeBtn     = document.getElementById("analyze-btn");
const analyzeIcon    = document.getElementById("analyze-icon");
const analyzeLabel   = document.getElementById("analyze-label");
const loaderRow      = document.getElementById("loader-row");
const loaderText     = document.getElementById("loader-text");

const resultCard     = document.getElementById("result-card");
const resultText     = document.getElementById("result-text");
const ttsBtn         = document.getElementById("tts-btn");
const ttsStopBtn     = document.getElementById("tts-stop-btn");
const copyBtn        = document.getElementById("copy-btn");

const errorBox       = document.getElementById("error-box");
const errorText      = document.getElementById("error-text");

// ─── State ────────────────────────────────────────────────────────────────────
let imageBase64 = null;      // raw base64 (no data URI prefix)
let isAnalyzing = false;
let recognition = null;      // SpeechRecognition instance
let isRecording = false;

// ─── Utilities ────────────────────────────────────────────────────────────────
function showError(msg) {
  errorBox.classList.remove("hidden");
  errorText.textContent = msg;
  setTimeout(() => errorBox.classList.add("hidden"), 8000);
}

function hideError() {
  errorBox.classList.add("hidden");
}

function setLoading(loading, message = "Sending to AI…") {
  isAnalyzing = loading;
  analyzeBtn.disabled = loading;
  if (loading) {
    loaderRow.classList.remove("hidden");
    loaderText.textContent = message;
    analyzeIcon.textContent = "⏳";
    analyzeLabel.textContent = "Analyzing…";
  } else {
    loaderRow.classList.add("hidden");
    analyzeIcon.textContent = "✨";
    analyzeLabel.textContent = "Analyze Scene";
  }
}

/**
 * Convert a File object to a raw base64 string (strips the data URI header).
 */
function fileToBase64(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const dataUrl = reader.result;
      // Strip "data:image/jpeg;base64," prefix
      const base64 = dataUrl.split(",")[1];
      resolve(base64);
    };
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

/**
 * Compress an image file to max 768px wide and return as base64 JPEG.
 */
async function compressImage(file) {
  return new Promise((resolve) => {
    const img = new Image();
    const url = URL.createObjectURL(file);
    img.onload = () => {
      const MAX_W = 768;
      const scale = img.width > MAX_W ? MAX_W / img.width : 1;
      const canvas = document.createElement("canvas");
      canvas.width  = img.width  * scale;
      canvas.height = img.height * scale;
      const ctx = canvas.getContext("2d");
      ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
      URL.revokeObjectURL(url);
      // Export as JPEG, quality 0.82
      const dataUrl = canvas.toDataURL("image/jpeg", 0.82);
      resolve(dataUrl.split(",")[1]);
    };
    img.src = url;
  });
}

// ─── Photo Upload ─────────────────────────────────────────────────────────────
function loadFile(file) {
  if (!file || !file.type.startsWith("image/")) {
    showError("Please upload a valid image file (JPEG, PNG, WEBP).");
    return;
  }
  if (file.size > 10 * 1024 * 1024) {
    showError("File is too large. Maximum size is 10 MB.");
    return;
  }

  const url = URL.createObjectURL(file);
  previewImg.src = url;
  previewImg.classList.remove("hidden");
  dropZoneInner.classList.add("hidden");
  clearBtn.style.display = "block";

  // Compress and store
  compressImage(file).then((b64) => {
    imageBase64 = b64;
  });
}

// Click to upload
dropZone.addEventListener("click", (e) => {
  if (e.target !== fileInput) fileInput.click();
});

dropZone.addEventListener("keydown", (e) => {
  if (e.key === "Enter" || e.key === " ") fileInput.click();
});

fileInput.addEventListener("change", () => {
  if (fileInput.files[0]) loadFile(fileInput.files[0]);
});

// Drag & Drop
dropZone.addEventListener("dragover", (e) => {
  e.preventDefault();
  dropZone.classList.add("drag-over");
});

dropZone.addEventListener("dragleave", () => {
  dropZone.classList.remove("drag-over");
});

dropZone.addEventListener("drop", (e) => {
  e.preventDefault();
  dropZone.classList.remove("drag-over");
  const file = e.dataTransfer.files[0];
  if (file) loadFile(file);
});

// Clear photo
clearBtn.addEventListener("click", () => {
  imageBase64 = null;
  previewImg.src = "";
  previewImg.classList.add("hidden");
  dropZoneInner.classList.remove("hidden");
  clearBtn.style.display = "none";
  fileInput.value = "";
  resultCard.classList.add("hidden");
});

// ─── Intro & Language Selection ───────────────────────────────────────────────
const translations = {
  tr: {
    title: "Dünyayı<br /><span class=\"gradient-text\">Sesle Gör</span>",
    subtitle: "Fotoğraf yükle, soru sor ve çevrenizdeki nesnelerin mekansal konumlarını sesli olarak öğren.",
    step1: "Adım 1",
    step1title: "Fotoğraf Yükle",
    dropTitle: "Sürükle & bırak veya tıkla",
    dropSub: "JPEG · PNG · WEBP — maks 10 MB",
    cameraBtn: "📷 Kameradan Çek (İki kere Boşluk)",
    clearBtn: "✕ Fotoğrafı kaldır",
    step2: "Adım 2",
    step2title: "Sorunuzu Sorun",
    placeholder: "Örnek: Önümdeki masanın üzerinde ne var?",
    voiceHint: "Kayıt için Tıkla",
    step3: "Adım 3",
    step3title: "Sahneyi Analiz Et",
    analyzeDesc: "Yapay zeka, görüntüdeki her şeyin mekansal düzenini açıklayacak.",
    analyzeBtn: "Sahneyi Analiz Et",
    resultTitle: "Mekansal Açıklama",
    ttsBtn: "▶ Sesli Oku",
    stopBtn: "⏹ Durdur",
    copyBtn: "📋 Kopyala",
    cameraLoading: "Kamera açılıyor, lütfen bekleyin...",
    cameraDone: "Fotoğraf çekildi. Lütfen sorunuzu sorun.",
    cameraError: "Kameraya erişilemedi."
  },
  en: {
    title: "See the World<br /><span class=\"gradient-text\">Through Sound</span>",
    subtitle: "Upload a photo, ask a question, and receive a precise spatial audio description of your surroundings.",
    step1: "Step 1",
    step1title: "Upload Photo",
    dropTitle: "Drag & drop or click to upload",
    dropSub: "JPEG · PNG · WEBP — max 10 MB",
    cameraBtn: "📷 Take Photo (Double Space)",
    clearBtn: "✕ Remove photo",
    step2: "Step 2",
    step2title: "Ask Your Question",
    placeholder: "e.g. What objects are on the table in front of me?",
    voiceHint: "Hold to Record",
    step3: "Step 3",
    step3title: "Analyze Scene",
    analyzeDesc: "AI will describe the spatial layout of everything in the image.",
    analyzeBtn: "Analyze Scene",
    resultTitle: "Spatial Description",
    ttsBtn: "▶ Read Aloud",
    stopBtn: "⏹ Stop",
    copyBtn: "📋 Copy",
    cameraLoading: "Opening camera, please wait...",
    cameraDone: "Photo taken. You can ask your question now.",
    cameraError: "Could not access the camera."
  }
};

let appLanguage = "tr"; // default

function setLanguage(lang) {
  appLanguage = lang;
  const t = translations[lang];
  
  document.getElementById("ui-title").innerHTML = t.title;
  document.getElementById("ui-subtitle").textContent = t.subtitle;
  document.getElementById("ui-step1").textContent = t.step1;
  document.getElementById("ui-step1-title").textContent = t.step1title;
  document.getElementById("ui-drop-title").textContent = t.dropTitle;
  document.getElementById("ui-drop-sub").textContent = t.dropSub;
  cameraBtn.textContent = t.cameraBtn;
  clearBtn.textContent = t.clearBtn;
  
  document.getElementById("ui-step2").textContent = t.step2;
  document.getElementById("ui-step2-title").textContent = t.step2title;
  questionInput.placeholder = t.placeholder;
  voiceBtnLabel.textContent = t.voiceHint;
  
  document.getElementById("ui-step3").textContent = t.step3;
  document.getElementById("ui-step3-title").textContent = t.step3title;
  document.getElementById("ui-analyze-desc").textContent = t.analyzeDesc;
  analyzeLabel.textContent = t.analyzeBtn;
  
  document.getElementById("ui-result-title").textContent = t.resultTitle;
  ttsBtn.textContent = t.ttsBtn;
  ttsStopBtn.textContent = t.stopBtn;
  copyBtn.textContent = t.copyBtn;
  
  // Update speech recognition language
  if (recognition) {
    recognition.lang = lang === "tr" ? "tr-TR" : "en-US";
  }
}

langTrBtn.addEventListener("click", () => {
  introOverlay.style.display = "none";
  setLanguage("tr");
  speakText("Mekansal Görme Asistanına hoş geldiniz. Fotoğraf çekmek için iki kere boşluk tuşuna basın.");
});

langEnBtn.addEventListener("click", () => {
  introOverlay.style.display = "none";
  setLanguage("en");
  speakText("Welcome to the Spatial Vision Assistant. Press the spacebar twice to take a photo.");
});

// ─── Camera Access (Double Space) ─────────────────────────────────────────────
let lastSpacePress = 0;

document.addEventListener("keydown", (e) => {
  if (e.target.tagName === "TEXTAREA" || e.target.tagName === "INPUT") return;

  if (e.key === " ") {
    e.preventDefault(); // prevent page scroll
    const now = Date.now();
    if (now - lastSpacePress < 500) { // 500ms for double tap
      lastSpacePress = 0;
      takePhotoFromCamera();
    } else {
      lastSpacePress = now;
    }
  }
});

cameraBtn.addEventListener("click", takePhotoFromCamera);

async function takePhotoFromCamera() {
  try {
    speakText(translations[appLanguage].cameraLoading);
    // Request back camera if on mobile, default on desktop
    const stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: "environment" } });
    
    const video = document.createElement("video");
    video.srcObject = stream;
    video.setAttribute("playsinline", "");
    video.play();
    
    video.onplaying = () => {
      // 1.5 seconds delay for the camera to adjust exposure/focus
      setTimeout(() => {
        const canvas = document.createElement("canvas");
        canvas.width = video.videoWidth;
        canvas.height = video.videoHeight;
        const ctx = canvas.getContext("2d");
        ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
        
        // Stop all video tracks
        stream.getTracks().forEach(track => track.stop());
        
        // Compress and extract base64
        const MAX_W = 768;
        const scale = canvas.width > MAX_W ? MAX_W / canvas.width : 1;
        const finalCanvas = document.createElement("canvas");
        finalCanvas.width = canvas.width * scale;
        finalCanvas.height = canvas.height * scale;
        const finalCtx = finalCanvas.getContext("2d");
        finalCtx.drawImage(canvas, 0, 0, finalCanvas.width, finalCanvas.height);
        
        const dataUrl = finalCanvas.toDataURL("image/jpeg", 0.82);
        imageBase64 = dataUrl.split(",")[1];
        
        // Show in UI
        previewImg.src = dataUrl;
        previewImg.classList.remove("hidden");
        dropZoneInner.classList.add("hidden");
        clearBtn.style.display = "block";
        
        speakText(translations[appLanguage].cameraDone);
      }, 1500);
    };
  } catch (err) {
    speakText(translations[appLanguage].cameraError);
    showError("Camera error: " + err.message);
  }
}

// ─── Voice Input (Web Speech API) ────────────────────────────────────────────
const SpeechRecognition =
  window.SpeechRecognition || window.webkitSpeechRecognition;

if (!SpeechRecognition) {
  voiceBtn.disabled = true;
  voiceHint.textContent = "Voice input not supported in this browser. Use Chrome.";
} else {
  recognition = new SpeechRecognition();
  recognition.continuous = false;
  recognition.interimResults = true;
  recognition.lang = "tr-TR";

  recognition.onstart = () => {
    isRecording = true;
    voiceBtn.classList.add("recording");
    voiceBtn.setAttribute("aria-pressed", "true");
    voiceBtnLabel.textContent = "Recording… click to stop";
    waveform.classList.add("active");
    voiceHint.textContent = "Listening…";
  };

  recognition.onresult = (e) => {
    const transcript = Array.from(e.results)
      .map((r) => r[0].transcript)
      .join(" ");
    questionInput.value = transcript;
    voiceHint.textContent = "Transcript: " + transcript.slice(0, 60) + (transcript.length > 60 ? "…" : "");
  };

  recognition.onend = () => {
    isRecording = false;
    voiceBtn.classList.remove("recording");
    voiceBtn.setAttribute("aria-pressed", "false");
    voiceBtnLabel.textContent = "Hold to Record";
    waveform.classList.remove("active");
    if (!questionInput.value.trim()) {
      voiceHint.textContent = "No speech detected. Try again.";
    }
  };

  recognition.onerror = (e) => {
    voiceHint.textContent = "Mic error: " + e.error;
  };

  voiceBtn.addEventListener("click", () => {
    if (isRecording) {
      recognition.stop();
    } else {
      questionInput.value = "";
      voiceHint.textContent = "";
      recognition.start();
    }
  });
}

// ─── Analyze ──────────────────────────────────────────────────────────────────
analyzeBtn.addEventListener("click", async () => {
  hideError();

  if (!imageBase64) {
    showError("Please upload a photo first.");
    return;
  }

  const prompt = questionInput.value.trim();
  if (!prompt) {
    showError("Please type or record a question.");
    return;
  }

  setLoading(true, "Sending to AI…");
  resultCard.classList.add("hidden");

  try {
    setLoading(true, "Processing with vLLM…");

    const response = await fetch(`${API_BASE}/analyze`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        image_base64: imageBase64,
        user_prompt: prompt,
      }),
    });

    if (!response.ok) {
      const errBody = await response.text();
      throw new Error(`Server error ${response.status}: ${errBody}`);
    }

    const data = await response.json();
    const description = data.description;

    // Show result
    resultText.textContent = description;
    resultCard.classList.remove("hidden");
    resultCard.scrollIntoView({ behavior: "smooth", block: "nearest" });

    // Auto-speak
    speakText(description);
  } catch (err) {
    showError(err.message || "Something went wrong. Is the backend running?");
  } finally {
    setLoading(false);
  }
});

// ─── TTS (Browser SpeechSynthesis) ───────────────────────────────────────────
function detectLanguage(text) {
  // Simple check for English common words
  const enWords = /\b(the|is|are|and|on|in|to|of|it|there|here|with)\b/i;
  // Simple check for Turkish characters or common words
  const trRegex = /[çğıöşüÇĞIÖŞÜ]/;
  const trWords = /\b(ve|bir|var|yok|sağ|sol|üst|alt|için|bu|şu)\b/i;

  if (enWords.test(text) && !trRegex.test(text)) return "en-US";
  if (trRegex.test(text) || trWords.test(text)) return "tr-TR";
  
  return "tr-TR"; // Default fallback
}

function speakText(text) {
  window.speechSynthesis.cancel(); // stop any previous
  const utter = new SpeechSynthesisUtterance(text);
  
  const lang = detectLanguage(text);
  utter.lang  = lang;
  utter.rate  = 0.88;
  utter.pitch = 1.0;

  // Try to find a voice that matches the detected language
  const voices = window.speechSynthesis.getVoices();
  const prefix = lang.split("-")[0]; // "en" or "tr"
  const matchedVoice = voices.find(v => v.lang.startsWith(prefix));
  if (matchedVoice) utter.voice = matchedVoice;

  utter.onstart = () => {
    ttsBtn.classList.add("hidden");
    ttsStopBtn.classList.remove("hidden");
  };

  utter.onend = utter.onerror = () => {
    ttsBtn.classList.remove("hidden");
    ttsStopBtn.classList.add("hidden");
  };

  window.speechSynthesis.speak(utter);
}

ttsBtn.addEventListener("click", () => {
  const text = resultText.textContent;
  if (text) speakText(text);
});

ttsStopBtn.addEventListener("click", () => {
  window.speechSynthesis.cancel();
  ttsBtn.classList.remove("hidden");
  ttsStopBtn.classList.add("hidden");
});

// ─── Copy to clipboard ────────────────────────────────────────────────────────
copyBtn.addEventListener("click", async () => {
  const text = resultText.textContent;
  try {
    await navigator.clipboard.writeText(text);
    copyBtn.textContent = "✅ Copied!";
    setTimeout(() => (copyBtn.textContent = "📋 Copy"), 2000);
  } catch {
    copyBtn.textContent = "Failed";
  }
});

// ─── Keyboard shortcut: Enter on textarea doesn't submit unless Ctrl/Cmd ──────
questionInput.addEventListener("keydown", (e) => {
  if ((e.ctrlKey || e.metaKey) && e.key === "Enter") {
    analyzeBtn.click();
  }
});
