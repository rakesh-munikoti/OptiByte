import { exec } from 'child_process';
import { logger } from './logger.js';

let pythonStatus = {
    checked: false,
    cmd: null,
    hasMarkItDown: false,
    message: 'Checking...',
};

/**
 * Validates Python environment and caches the resolved command
 * @returns {Promise<{checked: boolean, cmd: string|null, hasMarkItDown: boolean, message: string}>}
 */
export function checkPythonEnvironment() {
    return new Promise((resolve) => {
        if (pythonStatus.checked) {
            return resolve(pythonStatus);
        }

        const isWin = process.platform === 'win32';
        const commands = isWin ? ['python', 'py', 'python3'] : ['python3', 'python'];

        let index = 0;
        function tryNext() {
            if (index >= commands.length) {
                pythonStatus.checked = true;
                pythonStatus.cmd = null;
                pythonStatus.hasMarkItDown = false;
                pythonStatus.message = 'Python is not installed or not on PATH.';
                resolve(pythonStatus);
                return;
            }
            const cmd = commands[index++];
            exec(`${cmd} -c "import markitdown"`, (error) => {
                if (!error) {
                    pythonStatus.checked = true;
                    pythonStatus.cmd = cmd;
                    pythonStatus.hasMarkItDown = true;
                    pythonStatus.message = `Server running. MarkItDown ready via ${cmd}.`;
                    resolve(pythonStatus);
                } else {
                    tryNext();
                }
            });
        }
        tryNext();
    });
}

/**
 * Gets the cached working Python command, falling back to 'python'
 * @returns {string}
 */
export function getPythonCommand() {
    return pythonStatus.cmd || 'python';
}
