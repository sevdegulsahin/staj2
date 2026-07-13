/**
 * useCamera — manages CameraRef and captures a compressed JPEG as base64.
 */

import { useRef, useCallback } from "react";
import * as ImageManipulator from "expo-image-manipulator";

export function useCamera() {
  const cameraRef = useRef(null);

  /**
   * Capture a photo from the CameraRef, resize & compress it, and return
   * the base64-encoded JPEG string (no data-URI prefix).
   * @returns {Promise<string>} base64 JPEG
   */
  const capturePhoto = useCallback(async () => {
    if (!cameraRef.current) throw new Error("Camera not ready");

    // Capture raw photo
    const photo = await cameraRef.current.takePictureAsync({
      quality: 0.85,
      base64: false,      // we'll compress first, then read as base64
      skipProcessing: true,
    });

    // Resize to 768px wide to reduce payload size
    const manipulated = await ImageManipulator.manipulateAsync(
      photo.uri,
      [{ resize: { width: 768 } }],
      { compress: 0.8, format: ImageManipulator.SaveFormat.JPEG, base64: true }
    );

    return manipulated.base64; // plain base64, no prefix
  }, []);

  return { cameraRef, capturePhoto };
}
