#!/usr/bin/env bash
set -e

pip install -r requirements.txt

if python -c "import torch; torch.cuda.is_available()" 2>/dev/null | grep -q "True"; then
  echo "CUDA detected — installing GPU torch"
  pip install torch --index-url https://download.pytorch.org/whl/cu121
elif command -v nvidia-smi &>/dev/null; then
  echo "CUDA detected via nvidia-smi — installing GPU torch"
  pip install torch --index-url https://download.pytorch.org/whl/cu121
else
  echo "No CUDA detected — installing CPU-only torch"
  pip install torch --index-url https://download.pytorch.org/whl/cpu
fi
