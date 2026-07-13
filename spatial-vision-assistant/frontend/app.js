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
const API_BASE = "http://localhost:8001"; // Change to Vast.ai IP in production

// ─── DOM References ───────────────────────────────────────────────────────────
const dropZone       = document.getElementById("drop-zone");
const dropZoneInner  = document.getElementById("drop-zone-inner");
const fileInput      = document.getElementById("file-input");
const previewImg     = document.getElementById("preview-img");
const clearBtn       = document.getElementById("clear-btn");

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
  recognition.lang = "en-US";

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
function speakText(text) {
  window.speechSynthesis.cancel(); // stop any previous
  const utter = new SpeechSynthesisUtterance(text);
  utter.rate  = 0.92;
  utter.pitch = 1.0;
  utter.lang  = "en-US";

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
