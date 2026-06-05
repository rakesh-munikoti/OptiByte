# Stage 1: Build the Python virtual environment with markitdown
FROM python:3.11-slim AS python-builder

RUN apt-get update && apt-get install -y --no-install-recommends \
    build-essential \
    && rm -rf /var/lib/apt/lists/*

RUN python -m venv /opt/venv
ENV PATH="/opt/venv/bin:$PATH"

RUN pip install --no-cache-dir "markitdown[all]"

# Stage 2: Runtime image containing Node.js and Python 3 runtime
FROM node:18-slim

# Install minimal Python 3 runtime (no pip or compilers needed)
RUN apt-get update && apt-get install -y --no-install-recommends \
    python3 \
    && rm -rf /var/lib/apt/lists/*

# Copy the Python virtual environment from builder stage
COPY --from=python-builder /opt/venv /opt/venv
ENV PATH="/opt/venv/bin:$PATH"

# Set workspace directory
WORKDIR /app

# Copy dependency configuration
COPY package*.json ./

# Install only production Node.js packages
RUN npm ci --only=production

# Copy application source code
COPY . .

# Ensure temp directory exists and is writable for uploads
RUN mkdir -p temp && chmod 777 temp

# Expose port (Render overrides this with process.env.PORT, server.js handles it)
EXPOSE 3000

# Run server.js
CMD ["node", "server.js"]
