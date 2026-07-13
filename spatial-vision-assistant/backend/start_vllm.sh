#!/usr/bin/env bash
# ─── vLLM Server Launch Script (run this on your Vast.ai GPU instance) ────────
# Requirements: Python 3.10+, CUDA 12+, at least 24 GB VRAM for 7B model

set -e

MODEL="${VLLM_MODEL:-Qwen/Qwen2-VL-7B-Instruct}"
PORT="${VLLM_PORT:-8000}"
GPU_UTIL="${VLLM_GPU_UTIL:-0.90}"
MAX_MODEL_LEN="${VLLM_MAX_MODEL_LEN:-4096}"

echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "  Spatial Vision Assistant — vLLM Server"
echo "  Model   : $MODEL"
echo "  Port    : $PORT"
echo "  GPU util: $GPU_UTIL"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"

# Install / upgrade vLLM (includes flash-attention)
pip install -q --upgrade vllm

# Launch vLLM with OpenAI-compatible API
python -m vllm.entrypoints.openai.api_server \
  --model "$MODEL" \
  --host 0.0.0.0 \
  --port "$PORT" \
  --gpu-memory-utilization "$GPU_UTIL" \
  --max-model-len "$MAX_MODEL_LEN" \
  --trust-remote-code \
  --enforce-eager \
  --dtype bfloat16
