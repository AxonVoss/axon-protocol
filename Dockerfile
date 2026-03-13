FROM node:22-slim

LABEL org.opencontainers.image.title="AXON Protocol Miner"
LABEL org.opencontainers.image.description="Mine AXON — the first cryptocurrency requiring real AI inference"
LABEL org.opencontainers.image.source="https://github.com/AxonVoss/axon-protocol"
LABEL org.opencontainers.image.url="https://axonprotocol.net"

# Install build deps for native modules (leveldown, blake3)
RUN apt-get update && apt-get install -y \
    python3 \
    make \
    g++ \
    curl \
    wget \
    ca-certificates \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /axon

# Copy package files first for layer caching
COPY node/package*.json ./node/
RUN cd node && npm install --production=false

# Copy source
COPY node/ ./node/

# Create model cache directory
RUN mkdir -p /root/.axon/models /root/.axon/mainnet-chain

# Download TinyLlama model at build time so the image is self-contained
# (optional: skip with --build-arg SKIP_MODEL=1 for a lighter image)
ARG SKIP_MODEL=0
RUN if [ "$SKIP_MODEL" != "1" ]; then \
    echo "Downloading TinyLlama model (~639MB)..." && \
    wget -q --show-progress -O /root/.axon/models/tinyllama-1.1b-chat-v1.0.Q4_K_M.gguf \
    "https://huggingface.co/TheBloke/TinyLlama-1.1B-Chat-v1.0-GGUF/resolve/main/tinyllama-1.1b-chat-v1.0.Q4_K_M.gguf" && \
    echo "Model downloaded."; \
fi

# Download llama.cpp binary
RUN curl -fsSL "https://github.com/ggerganov/llama.cpp/releases/download/b1820/llama-b1820-bin-ubuntu-x64.zip" \
    -o /tmp/llama.zip 2>/dev/null || true

# Entrypoint script
COPY docker-entrypoint.sh /usr/local/bin/entrypoint.sh
RUN chmod +x /usr/local/bin/entrypoint.sh

EXPOSE 8332 8333

ENV NETWORK=mainnet
ENV CHAIN_DIR=/root/.axon/mainnet-chain
ENV RPC_HOST=0.0.0.0
ENV PEERS=seed1.axonprotocol.net:8333,seed2.axonprotocol.net:8333

ENTRYPOINT ["/usr/local/bin/entrypoint.sh"]
