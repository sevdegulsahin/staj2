/**
 * Spatial Vision Assistant — App.js
 *
 * Accessibility-first design:
 * - Entire screen is one large tap target (VoiceOver / TalkBack compatible)
 * - Double-tap → start recording microphone
 * - Single release after double-tap → stop recording, capture photo, call API
 * - Response is read aloud via expo-speech (TTS)
 * - Status changes announced via AccessibilityInfo
 *
 * State machine: idle → recording → processing → speaking → idle
 */

import React, {
  useEffect,
  useRef,
  useState,
  useCallback,
} from "react";
import {
  AccessibilityInfo,
  Animated,
  Easing,
  Platform,
  StyleSheet,
  Text,
  TouchableWithoutFeedback,
  View,
  Alert,
  StatusBar,
} from "react-native";
import { Camera, useCameraPermissions } from "expo-camera";
import * as Speech from "expo-speech";
import * as FileSystem from "expo-file-system";
import { Audio } from "expo-av";

import { analyzeSceneVoice } from "./src/services/apiService";
import { useAudioRecorder } from "./src/hooks/useAudioRecorder";
import { useCamera } from "./src/hooks/useCamera";

// ─── App States ────────────────────────────────────────────────────────────────
const STATE = {
  IDLE: "idle",
  RECORDING: "recording",
  PROCESSING: "processing",
  SPEAKING: "speaking",
};

// ─── Status messages mapped to states ──────────────────────────────────────────
const STATUS_LABELS = {
  [STATE.IDLE]: "Double-tap anywhere to ask a question.",
  [STATE.RECORDING]: "Listening… Release to send.",
  [STATE.PROCESSING]: "Analyzing image, please wait.",
  [STATE.SPEAKING]: "Reading description aloud.",
};

// ─── Color palette ─────────────────────────────────────────────────────────────
const COLORS = {
  bg: "#0a0a0f",
  pulse_idle: "#1e3a5f",
  pulse_recording: "#8b1a1a",
  pulse_processing: "#1a4a2e",
  accent: "#4fc3f7",
  text: "#e8eaf6",
  subtext: "#90a4ae",
};

export default function App() {
  // ── Permissions ──────────────────────────────────────────────────────────────
  const [cameraPermission, requestCameraPermission] = useCameraPermissions();
  const [micPermission, setMicPermission] = useState(false);

  // ── State machine ────────────────────────────────────────────────────────────
  const [appState, setAppState] = useState(STATE.IDLE);
  const [description, setDescription] = useState("");
  const [error, setError] = useState("");

  // ── Camera & Audio hooks ─────────────────────────────────────────────────────
  const { cameraRef, capturePhoto } = useCamera();
  const { isRecording, startRecording, stopRecording } = useAudioRecorder();

  // ── Animation: pulsing ring ──────────────────────────────────────────────────
  const pulseAnim = useRef(new Animated.Value(1)).current;
  const pulseLoop = useRef(null);

  const startPulse = useCallback(() => {
    pulseLoop.current = Animated.loop(
      Animated.sequence([
        Animated.timing(pulseAnim, {
          toValue: 1.15,
          duration: 700,
          easing: Easing.inOut(Easing.ease),
          useNativeDriver: true,
        }),
        Animated.timing(pulseAnim, {
          toValue: 1,
          duration: 700,
          easing: Easing.inOut(Easing.ease),
          useNativeDriver: true,
        }),
      ])
    );
    pulseLoop.current.start();
  }, [pulseAnim]);

  const stopPulse = useCallback(() => {
    pulseLoop.current?.stop();
    Animated.timing(pulseAnim, {
      toValue: 1,
      duration: 300,
      useNativeDriver: true,
    }).start();
  }, [pulseAnim]);

  // ── Request permissions on mount ─────────────────────────────────────────────
  useEffect(() => {
    (async () => {
      if (!cameraPermission?.granted) await requestCameraPermission();
      const { granted } = await Audio.requestPermissionsAsync();
      setMicPermission(granted);
      if (!granted)
        Alert.alert(
          "Microphone Required",
          "Please enable microphone access in settings."
        );
    })();
  }, []);

  // ── Announce state changes via accessibility system ─────────────────────────
  useEffect(() => {
    AccessibilityInfo.announceForAccessibility(STATUS_LABELS[appState]);
    if (appState === STATE.RECORDING) startPulse();
    else stopPulse();
  }, [appState]);

  // ── Double-tap detection (300ms window) ─────────────────────────────────────
  const lastTap = useRef(0);
  const tapTimeout = useRef(null);

  const handlePress = useCallback(() => {
    const now = Date.now();
    if (now - lastTap.current < 300) {
      // Double-tap!
      clearTimeout(tapTimeout.current);
      lastTap.current = 0;
      if (appState === STATE.IDLE) {
        beginSession();
      } else if (appState === STATE.RECORDING) {
        endSession();
      }
    } else {
      lastTap.current = now;
      tapTimeout.current = setTimeout(() => {
        lastTap.current = 0;
      }, 310);
    }
  }, [appState]);

  // ── Session: start recording ─────────────────────────────────────────────────
  const beginSession = useCallback(async () => {
    try {
      setError("");
      setDescription("");
      await startRecording();
      setAppState(STATE.RECORDING);
    } catch (e) {
      setError(e.message);
      setAppState(STATE.IDLE);
    }
  }, [startRecording]);

  // ── Session: stop → capture → API → speak ───────────────────────────────────
  const endSession = useCallback(async () => {
    try {
      setAppState(STATE.PROCESSING);

      // 1. Stop mic recording
      const audioResult = await stopRecording();
      if (!audioResult) throw new Error("No audio recorded");

      // 2. Capture photo silently
      const imageBase64 = await capturePhoto();

      // 3. Call backend
      const result = await analyzeSceneVoice(imageBase64, audioResult.base64);

      // 4. Announce description
      setDescription(result.description);
      setAppState(STATE.SPEAKING);

      Speech.speak(result.description, {
        language: "en",
        rate: 0.92,
        pitch: 1.0,
        onDone: () => setAppState(STATE.IDLE),
        onError: () => setAppState(STATE.IDLE),
      });
    } catch (e) {
      const msg = `Error: ${e.message}`;
      setError(msg);
      setAppState(STATE.IDLE);
      Speech.speak(msg);
    }
  }, [stopRecording, capturePhoto]);

  // ── Derive ring color from state ─────────────────────────────────────────────
  const ringColor =
    appState === STATE.RECORDING
      ? COLORS.pulse_recording
      : appState === STATE.PROCESSING
      ? COLORS.pulse_processing
      : COLORS.pulse_idle;

  // ── Permissions not yet granted ──────────────────────────────────────────────
  if (!cameraPermission) {
    return (
      <View style={styles.center}>
        <Text style={styles.statusText}>Requesting permissions…</Text>
      </View>
    );
  }

  if (!cameraPermission.granted) {
    return (
      <View style={styles.center}>
        <Text style={styles.statusText}>
          Camera permission is required. Please enable it in Settings.
        </Text>
      </View>
    );
  }

  // ── Render ───────────────────────────────────────────────────────────────────
  return (
    <TouchableWithoutFeedback
      onPress={handlePress}
      accessible
      accessibilityRole="button"
      accessibilityLabel="Spatial Vision Assistant. Double-tap to start."
      accessibilityHint={STATUS_LABELS[appState]}
    >
      <View style={styles.container}>
        <StatusBar barStyle="light-content" backgroundColor={COLORS.bg} />

        {/* Hidden camera renders to capture photos silently */}
        <Camera
          ref={cameraRef}
          style={styles.hiddenCamera}
          facing="back"
          ratio="4:3"
        />

        {/* ── Pulsing ring ── */}
        <Animated.View
          style={[
            styles.ring,
            { borderColor: ringColor, transform: [{ scale: pulseAnim }] },
          ]}
          pointerEvents="none"
        />

        {/* ── Inner mic icon area ── */}
        <View style={styles.iconCircle} pointerEvents="none">
          <Text style={styles.micIcon}>
            {appState === STATE.IDLE
              ? "🎤"
              : appState === STATE.RECORDING
              ? "🔴"
              : appState === STATE.PROCESSING
              ? "⚙️"
              : "🔊"}
          </Text>
        </View>

        {/* ── Status label ── */}
        <Text
          style={styles.statusText}
          accessibilityLiveRegion="polite"
          pointerEvents="none"
        >
          {STATUS_LABELS[appState]}
        </Text>

        {/* ── Description output ── */}
        {!!description && (
          <View style={styles.descriptionBox} pointerEvents="none">
            <Text style={styles.descriptionText}>{description}</Text>
          </View>
        )}

        {/* ── Error ── */}
        {!!error && (
          <Text style={styles.errorText} pointerEvents="none">
            {error}
          </Text>
        )}

        {/* ── App title ── */}
        <Text style={styles.appTitle} pointerEvents="none">
          Spatial Vision Assistant
        </Text>
      </View>
    </TouchableWithoutFeedback>
  );
}

// ─── Styles ────────────────────────────────────────────────────────────────────
const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: COLORS.bg,
    alignItems: "center",
    justifyContent: "center",
  },
  center: {
    flex: 1,
    backgroundColor: COLORS.bg,
    alignItems: "center",
    justifyContent: "center",
    padding: 32,
  },
  hiddenCamera: {
    width: 1,
    height: 1,
    position: "absolute",
    opacity: 0,
  },
  ring: {
    width: 220,
    height: 220,
    borderRadius: 110,
    borderWidth: 3,
    position: "absolute",
  },
  iconCircle: {
    width: 140,
    height: 140,
    borderRadius: 70,
    backgroundColor: "#12122a",
    alignItems: "center",
    justifyContent: "center",
    elevation: 8,
    shadowColor: COLORS.accent,
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.4,
    shadowRadius: 20,
  },
  micIcon: {
    fontSize: 56,
  },
  statusText: {
    color: COLORS.text,
    fontSize: 17,
    textAlign: "center",
    marginTop: 140,
    paddingHorizontal: 32,
    lineHeight: 26,
    fontWeight: "500",
  },
  descriptionBox: {
    backgroundColor: "#0d1b2a",
    borderRadius: 16,
    borderWidth: 1,
    borderColor: "#1e3a5f",
    padding: 18,
    marginTop: 28,
    marginHorizontal: 24,
  },
  descriptionText: {
    color: COLORS.accent,
    fontSize: 18,
    lineHeight: 28,
    textAlign: "center",
  },
  errorText: {
    color: "#ef5350",
    fontSize: 14,
    marginTop: 20,
    paddingHorizontal: 32,
    textAlign: "center",
  },
  appTitle: {
    position: "absolute",
    top: Platform.OS === "ios" ? 56 : 36,
    color: COLORS.subtext,
    fontSize: 13,
    letterSpacing: 1.4,
    textTransform: "uppercase",
  },
});
