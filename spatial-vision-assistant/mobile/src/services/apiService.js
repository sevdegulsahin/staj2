/**
 * API Service — isolates all network calls from UI components.
 * Handles: POST /analyze (text prompt) and POST /analyze-voice (audio prompt).
 */

const BASE_URL = process.env.EXPO_PUBLIC_API_URL ?? "http://<VAST_AI_IP>:8000";

/**
 * Send image + pre-transcribed text prompt to the backend.
 * @param {string} imageBase64 - JPEG image as base64 string (no data URI prefix)
 * @param {string} userPrompt  - transcribed user question
 * @returns {{ description: string, audio_base64: string|null }}
 */
export async function analyzeScene(imageBase64, userPrompt) {
  const response = await fetch(`${BASE_URL}/analyze`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      image_base64: imageBase64,
      user_prompt: userPrompt,
    }),
  });

  if (!response.ok) {
    const err = await response.text();
    throw new Error(`Backend error ${response.status}: ${err}`);
  }

  return response.json(); // { description, audio_base64 }
}

/**
 * Send image + raw audio recording to the backend.
 * Backend handles Whisper transcription.
 * @param {string} imageBase64 - JPEG image as base64 string
 * @param {string} audioBase64 - WAV audio as base64 string
 * @returns {{ description: string, audio_base64: string|null }}
 */
export async function analyzeSceneVoice(imageBase64, audioBase64) {
  const response = await fetch(`${BASE_URL}/analyze-voice`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      image_base64: imageBase64,
      audio_base64: audioBase64,
    }),
  });

  if (!response.ok) {
    const err = await response.text();
    throw new Error(`Backend error ${response.status}: ${err}`);
  }

  return response.json();
}
