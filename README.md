# OptiByte

**OptiByte** (OptiByte Ultra Protocol – OBUP) is a premium, privacy‑first token optimizer for LLM prompts and documents. All core compression runs client‑side in the browser, ensuring that your prompts never leave the user’s device. The lightweight Node + Python backend only handles file‑to‑text conversion via the `markitdown` library.

## Features
- ✂️ Real‑time token count and savings preview while typing or pasting text.
- 📄 Upload and convert PDF, Excel, Word, and plain‑text files.
- 🎨 Premium dark‑mode UI with glass‑morphism and micro‑animations.
- 🛡️ Full client‑side privacy – no prompt data is sent to any server.
- 🚀 Docker‑ready for one‑click deployment on Render.com.

## Tech Stack
- **Frontend** – HTML, CSS (vanilla), ES modules (JavaScript).
- **Compression** – `compressor.js` implements a hybrid BPE + LZ77 algorithm.
- **Backend** – Node / Express server (`server.js`) + Python (`markitdown`) for file conversion.
- **Deployment** – Dockerfile + `render.yaml` Blueprint for Render.com.

## Quick Start (local)
```bash
# Clone the repo
git clone https://github.com/rakesh-munikoti/OptiByte.git
cd OptiByte

# Install Node dependencies
npm install

# Install Python dependency
python -m pip install markitdown   # or `py -m pip install markitdown`

# Run the app locally
npm start   # opens http://localhost:3000
```

## Deploy to Render.com
1. Push the repository to GitHub (already done).
2. In the Render dashboard, click **New** → **Blueprint** and select the `render.yaml` file.
3. Render will build the Docker image (Node + Python) and expose the service on a public HTTPS URL.
4. Verify the deployment by visiting `https://<your‑service>.onrender.com` and checking the health endpoint:
   ```bash
   curl https://<your‑service>.onrender.com/api/health
   ```

## License
MIT – feel free to fork, improve, and deploy.

---
*Built with love, aiming to wow.*
