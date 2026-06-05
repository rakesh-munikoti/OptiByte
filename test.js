/* ==========================================================================
   OptiByte Testing Suite (test.js)
   ========================================================================== */

import { countTokens } from './tokenizer.js';
import { 
    cleanFormatting, 
    applySmartBrevity, 
    applyOBUPUltra, 
    applyDisemvoweling, 
    compressText 
} from './compressor.js';

// Simple assertion helper
let testsFailed = 0;
function assert(name, condition, msg = 'Assertion failed') {
    if (condition) {
        console.log(`\x1b[32m✓ PASSED\x1b[0m: ${name}`);
    } else {
        console.error(`\x1b[31m✗ FAILED\x1b[0m: ${name} - ${msg}`);
        testsFailed++;
    }
}

console.log('=======================================================');
console.log('Running OptiByte Core Unit Tests...');
console.log('=======================================================');

// 1. Tokenizer Tests
function runTokenizerTests() {
    console.log('\n--- Running Tokenizer Tests ---');
    
    // Empty text
    assert('Empty String Count', countTokens('') === 0, 'Empty string should return 0 tokens');
    assert('Null/Undefined Count', countTokens(null) === 0, 'Null should return 0 tokens');
    
    // Basic counting
    const standardText = 'Hello world, this is a test.';
    const tokens = countTokens(standardText);
    assert('Standard Text Token Count', tokens > 0 && tokens < 20, `Should count tokens reasonably: got ${tokens}`);
    
    // Local estimator check
    // Since js-tiktoken might be loading async from CDN, we test the counts
    const longNumbers = '1234567890';
    const numberTokens = countTokens(longNumbers);
    assert('Long Number Tokenization', numberTokens >= 2, `Long number should be split into multiple tokens: got ${numberTokens}`);
    
    const camelCase = 'myAwesomeCamelCaseVariable';
    const camelTokens = countTokens(camelCase);
    assert('CamelCase Tokenization', camelTokens > 1, `CamelCase should count multiple tokens: got ${camelTokens}`);
}

// 2. Compressor Level 1 Tests (Clean & Table formatting)
function runCompressorL1Tests() {
    console.log('\n--- Running Compressor L1 Tests ---');
    
    // Formatting cleanup
    const messyText = '  line 1  \n\n\n\n  line 2  ';
    const cleaned = cleanFormatting(messyText, { whitespace: true });
    assert('Whitespace Trim & Collapse', cleaned === 'line 1\n\nline 2', `Got: "${cleaned}"`);
    
    // Table conversion
    const tableText = 'Header1    Header2    Header3\nValue1    Value2    Value3';
    const minTable = cleanFormatting(tableText, { tables: true });
    assert('Table space-to-pipe conversion', minTable.includes('Header1|Header2|Header3'), `Table not compressed: "${minTable}"`);
}

// 3. Compressor Level 2 Tests (Smart Brevity / Contractions / Symbols)
function runCompressorL2Tests() {
    console.log('\n--- Running Compressor L2 Tests ---');
    
    // Contractions
    const contractionSrc = 'I do not know why it is like this.';
    const brevityCheck = applySmartBrevity(contractionSrc, { contractions: true });
    assert('Contraction Replacements', brevityCheck.includes("don't") && brevityCheck.includes("it's"), `Contractions missed: "${brevityCheck}"`);
    
    // Conjunctions & Verbose phrases
    const verboseSrc = 'due to the fact that we analyzed it in order to fix it.';
    const verbosityCheck = applySmartBrevity(verboseSrc, { contractions: true });
    assert('Verbose Phrases Replacements', verbosityCheck.includes("because") && verbosityCheck.includes("to fix"), `Verbose phrases missed: "${verbosityCheck}"`);

    // Math shorthand symbols
    const mathSrc = '50 percent of the dollars is greater than zero';
    const mathCheck = applySmartBrevity(mathSrc, { math: true });
    assert('Math symbols compression', mathCheck.includes('50%') && mathCheck.includes('>'), `Math characters missed: "${mathCheck}"`);
}

// 4. Compressor Level 3 Tests (OBUP Ultra / DSL / Glossary / Synonyms)
function runCompressorL3Tests() {
    console.log('\n--- Running Compressor L3 Tests ---');
    
    // Logic symbols
    const logicSrc = 'A is a member of B therefore A belongs to B';
    const logicCheck = applyOBUPUltra(logicSrc, { math: true });
    assert('Set Logic conversion', logicCheck.includes('∈') && logicCheck.includes('∴'), `Logic symbols missed: "${logicCheck}"`);
    
    // Synonyms
    const synonymSrc = 'Please utilize this documentation to initialize the project.';
    const synCheck = applyOBUPUltra(synonymSrc, { synonyms: true });
    assert('BPE Synonym alignment', synCheck.includes('use') && synCheck.includes('docs') && synCheck.includes('init'), `Synonyms missed: "${synCheck}"`);

    // Semantic LZ77 Glossary (requires larger text to trigger)
    const repeatedPara = 'This is a long repeated block of text that occurs multiple times. '.repeat(10);
    const lzCheck = applyOBUPUltra(repeatedPara, { lz77: true });
    assert('LZ77 Glossary Block extraction', lzCheck.startsWith('[OBUPv5]'), `Glossary block prefix missing: "${lzCheck.slice(0, 50)}..."`);
}

// 5. Compressor Level 4 Tests (Quantum / Disemvoweling)
function runCompressorL4Tests() {
    console.log('\n--- Running Compressor L4 Tests ---');
    
    // Disemvoweling (vowels stripped from words >= 5 characters, keeping first/last, protecting camelCase, proper nouns, tech keywords)
    const disemSrc = 'configuration application document technology MySQL React';
    const disemCheck = applyDisemvoweling(disemSrc);
    
    assert('Disemvoweling configuration', disemCheck.includes('cnfgrtn'), `Got: "${disemCheck}"`);
    assert('Disemvoweling application', disemCheck.includes('applctn'), `Got: "${disemCheck}"`);
    assert('Disemvoweling document', disemCheck.includes('dcmnt'), `Got: "${disemCheck}"`);
    assert('Proper noun protection', disemCheck.includes('React'), `Proper noun modified: "${disemCheck}"`);
    assert('Tech keyword protection', disemCheck.includes('MySQL'), `Tech keyword modified: "${disemCheck}"`);
}

// 6. Filename Sanitizer Regex checks (reflecting server.js hardening)
function runSecuritySanitizerTests() {
    console.log('\n--- Running Security Sanitizer Tests ---');
    
    // Mock the security sanitizer function to be deployed in server.js
    function sanitizeFilename(filename) {
        if (!filename) return 'unnamed_file';
        // Remove characters that might act as shell metacharacters: ;, &, |, `, $, etc.
        // Restrict to alphanumeric, dots, dashes, underscores
        const cleaned = filename.replace(/[^a-zA-Z0-9.\-_]/g, '_');
        // Prevent path traversal and enforce dot-extension format
        return cleaned.replace(/\.+/g, '.');
    }
    
    assert('Safe filename unchanged', sanitizeFilename('report-2026.docx') === 'report-2026.docx', 'Safe filename changed');
    assert('Semicolon injection blocked', sanitizeFilename('test;cat /etc/passwd.txt') === 'test_cat__etc_passwd.txt', `Got: ${sanitizeFilename('test;cat /etc/passwd.txt')}`);
    assert('Command chaining blocked', sanitizeFilename('test&whoami.pdf') === 'test_whoami.pdf', `Got: ${sanitizeFilename('test&whoami.pdf')}`);
    assert('Backticks injection blocked', sanitizeFilename('`id`.xlsx') === '_id_.xlsx', `Got: ${sanitizeFilename('`id`.xlsx')}`);
    assert('Double quote injection blocked', sanitizeFilename('my"file".pdf') === 'my_file_.pdf', `Got: ${sanitizeFilename('my"file".pdf')}`);
}

// 7. API Validation rules tests (mock checks)
function runApiValidationTests() {
    console.log('\n--- Running API Validation Tests ---');
    
    // Test MIME-Type and Extension validation rules
    function mockFileFilter(filename, mimetype) {
        const allowedMimeTypes = [
            'application/pdf', 
            'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
            'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
            'application/vnd.openxmlformats-officedocument.presentationml.presentation',
            'text/plain', 'text/markdown', 'text/html', 'text/csv', 'application/json'
        ];
        const allowedExtensions = ['.pdf', '.docx', '.xlsx', '.xls', '.pptx', '.ppt', '.txt', '.md', '.html', '.csv', '.json'];
        const ext = '.' + filename.split('.').pop().toLowerCase();
        
        return allowedMimeTypes.includes(mimetype) || allowedExtensions.includes(ext);
    }

    assert('Valid PDF file check', mockFileFilter('document.pdf', 'application/pdf') === true, 'Valid PDF rejected');
    assert('Valid DOCX file check', mockFileFilter('report.docx', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document') === true, 'Valid DOCX rejected');
    assert('Invalid exe extension check', mockFileFilter('virus.exe', 'application/octet-stream') === false, 'Invalid exe allowed');
    assert('Invalid mimetype with valid ext check', mockFileFilter('valid.txt', 'application/octet-stream') === true, 'Valid txt rejected due to octet-stream mime');

    // Test API Key rate limit rule mock
    function checkRateLimit(user, inputTokens, dateStr) {
        if (user.lastUsedDate !== dateStr) {
            user.usedToday = 0;
            user.lastUsedDate = dateStr;
        }
        if (user.usedToday + inputTokens > user.dailyLimit) {
            return false;
        }
        user.usedToday += inputTokens;
        return true;
    }

    const testUser = {
        plan: 'Free',
        dailyLimit: 5000,
        usedToday: 4500,
        lastUsedDate: '2026-06-05'
    };

    assert('Within limit API request', checkRateLimit(testUser, 400, '2026-06-05') === true, 'Request within limits rejected');
    assert('Exceeding limit API request', checkRateLimit(testUser, 200, '2026-06-05') === false, 'Request exceeding limits allowed');
    assert('Limit resets on next day', checkRateLimit(testUser, 200, '2026-06-06') === true, 'Limit did not reset on next day');
}

// Run All
runTokenizerTests();
runCompressorL1Tests();
runCompressorL2Tests();
runCompressorL3Tests();
runCompressorL4Tests();
runSecuritySanitizerTests();
runApiValidationTests();

console.log('\n=======================================================');
if (testsFailed === 0) {
    console.log('\x1b[32m✔ SUCCESS: All core OptiByte unit tests passed successfully!\x1b[0m');
    console.log('=======================================================');
    process.exit(0);
} else {
    console.error(`\x1b[31m✗ FAILURE: ${testsFailed} test(s) failed.\x1b[0m`);
    console.log('=======================================================');
    process.exit(1);
}
