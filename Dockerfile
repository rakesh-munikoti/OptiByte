# Use Node.js official slim image as base
FROM node:18-slim

# Install Python 3, pip, and venv for running markitdown
RUN apt-get update && apt-get install -y --no-install-recommends \
    python3 \
    python3-pip \
    python3-venv \
    && rm -rf /var/lib/apt/lists/*

# Create and use a python virtual environment to avoid PIP conflicts
RUN python3 -m venv /opt/venv
ENV PATH="/opt/venv/bin:$PATH"

# Install markitdown within the virtual environment
RUN pip install --no-cache-dir markitdown

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
