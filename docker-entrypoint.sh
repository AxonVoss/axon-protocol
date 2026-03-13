#!/bin/bash
set -e

AXON_ADDRESS="${AXON_ADDRESS:-}"
COMMAND="${1:-mine}"
MODEL_PATH="/root/.axon/models/tinyllama-1.1b-chat-v1.0.Q4_K_M.gguf"
MODEL_URL="https://huggingface.co/TheBloke/TinyLlama-1.1B-Chat-v1.0-GGUF/resolve/main/tinyllama-1.1b-chat-v1.0.Q4_K_M.gguf"

echo ""
echo "  ⚡ AXON Protocol"
echo "  ─────────────────────────────────────────"
echo "  Network:  ${NETWORK:-mainnet}"
echo "  Peers:    ${PEERS}"
echo ""

# ── Model check ──────────────────────────────────────────────────────────────
if [ ! -f "$MODEL_PATH" ]; then
    echo "  📥 TinyLlama model not found. Downloading (~639MB)..."
    mkdir -p /root/.axon/models
    wget -q --show-progress \
        -O "$MODEL_PATH" \
        "$MODEL_URL" \
        || { echo "  ❌ Model download failed. Set SKIP_INFERENCE=1 to run in simulation mode."; }
    echo "  ✅ Model ready."
    echo ""
fi

# ── llama.cpp check ───────────────────────────────────────────────────────────
if [ ! -f "/usr/local/bin/llama-cli" ]; then
    echo "  ⚠️  llama-cli not found — running inference simulation mode"
    echo "     (blocks will still be mined but without real AI inference)"
    echo ""
fi

# ── Command dispatch ──────────────────────────────────────────────────────────
cd /axon/node

case "$COMMAND" in
    mine)
        if [ -z "$AXON_ADDRESS" ]; then
            echo "  ❌ Error: AXON_ADDRESS not set."
            echo ""
            echo "  Usage:"
            echo "    # Generate a wallet first:"
            echo "    docker run --rm axonvoss/axon-miner wallet"
            echo ""
            echo "    # Then mine:"
            echo "    docker run -e AXON_ADDRESS=axon1... axonvoss/axon-miner"
            echo ""
            exit 1
        fi
        echo "  ⛏️  Mining to: $AXON_ADDRESS"
        echo "  ─────────────────────────────────────────"
        echo ""
        exec npx ts-node src/cli.ts mine 999999 "$AXON_ADDRESS"
        ;;

    wallet|new)
        echo "  🔑 Generating new wallet..."
        echo ""
        exec npx ts-node src/cli.ts new
        ;;

    balance)
        ADDR="${2:-$AXON_ADDRESS}"
        if [ -z "$ADDR" ]; then
            echo "  ❌ Usage: docker run --rm axonvoss/axon-miner balance <address>"
            exit 1
        fi
        exec npx ts-node src/cli.ts balance "$ADDR"
        ;;

    node)
        echo "  🔗 Starting full node (no mining)..."
        exec npx ts-node src/index.ts
        ;;

    setup-inference)
        exec npx ts-node src/cli.ts setup-inference
        ;;

    *)
        # Pass through any other CLI command
        exec npx ts-node src/cli.ts "$@"
        ;;
esac
