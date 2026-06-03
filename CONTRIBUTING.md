# Contributing to OptiByte

We welcome contributions! Please follow these guidelines:

## How to Contribute
1. **Fork the repository** on GitHub.
2. **Clone your fork** locally:
   ```bash
   git clone https://github.com/your-username/OptiByte.git
   cd OptiByte
   ```
3. **Create a new branch** for your feature or bug‑fix:
   ```bash
   git checkout -b my‑feature
   ```
4. **Make your changes** – ensure the code follows the existing style and runs the test suite (`npm test`).
5. **Commit with a clear message**:
   ```bash
   git add .
   git commit -m "feat: brief description of change"
   ```
6. **Push to your fork** and open a Pull Request against `main`.

## Code Style
- Use **ES6** syntax, `const`/`let`, and arrow functions where appropriate.
- Keep indentation to 2 spaces.
- Add or update unit tests for new functionality.

## Testing
Run the full test suite before submitting:
```bash
npm install   # (if new dependencies were added)
npm test
```

## Pull‑Request Checklist
- [ ] Tests pass (`npm test`).
- [ ] Lint passes (if a linter is added).
- [ ] Documentation updated (README or inline comments).
- [ ] PR description clearly explains the change.

Thank you for helping make OptiByte better! 🎉
