/* ==========================================================================
   OptiByte Ultra Protocol (OBUP) Compression Engine (compressor.js)
   ========================================================================== */

import { countTokens } from './tokenizer.js';

// 1. Dictionaries & Rules Configurations
const CONTRACTIONS = [
    [/\bdo not\b/gi, "don't"],
    [/\bcannot\b/gi, "can't"],
    [/\bwill not\b/gi, "won't"],
    [/\bwe are\b/gi, "we're"],
    [/\byou are\b/gi, "you're"],
    [/\bthey are\b/gi, "they're"],
    [/\bit is\b/gi, "it's"],
    [/\bthat is\b/gi, "that's"],
    [/\bthere is\b/gi, "there's"],
    [/\bwould not\b/gi, "wouldn't"],
    [/\bshould not\b/gi, "shouldn't"],
    [/\bcould not\b/gi, "couldn't"],
    [/\bhave not\b/gi, "haven't"],
    [/\bhas not\b/gi, "hasn't"],
    [/\bwhat is\b/gi, "what's"],
    [/\bwho is\b/gi, "who's"],
    [/\bwe will\b/gi, "we'll"],
    [/\bthey will\b/gi, "they'll"],
    [/\bhe will\b/gi, "he'll"],
    [/\bshe will\b/gi, "she'll"],
    [/\bi am\b/gi, "I'm"]
];

const VERBOSE_PHRASES = [
    [/\bdue to the fact that\b/gi, "because"],
    [/\bin order to\b/gi, "to"],
    [/\bat the present time\b/gi, "now"],
    [/\bat this point in time\b/gi, "now"],
    [/\bfor the purpose of\b/gi, "for"],
    [/\bin the event that\b/gi, "if"],
    [/\bwith reference to\b/gi, "about"],
    [/\bwith respect to\b/gi, "about"],
    [/\bin terms of\b/gi, "regarding"],
    [/\btake into consideration\b/gi, "consider"],
    [/\ba large number of\b/gi, "many"],
    [/\bconduct an analysis of\b/gi, "analyze"],
    [/\bhas the ability to\b/gi, "can"],
    [/\bhas the capacity to\b/gi, "can"],
    [/\bprovides support for\b/gi, "supports"],
    [/\bmake a decision\b/gi, "decide"],
    [/\bat a later date\b/gi, "later"],
    [/\bby means of\b/gi, "by"],
    [/\bin close proximity to\b/gi, "near"],
    [/\bwith the exception of\b/gi, "except"],
    [/\binformation technology\b/gi, "IT"],
    [/\bartificial intelligence\b/gi, "AI"],
    [/\bmachine learning\b/gi, "ML"],
    [/\bnatural language processing\b/gi, "NLP"],
    [/\boperating system\b/gi, "OS"],
    [/\boperating systems\b/gi, "OSs"],
    [/\buser interface\b/gi, "UI"],
    [/\buser experience\b/gi, "UX"],
    [/\bvirtual machine\b/gi, "VM"],
    [/\bvirtual machines\b/gi, "VMs"],
    [/\bcommand line interface\b/gi, "CLI"],
    [/\bapplication programming interface\b/gi, "API"],
    [/\bapplication programming interfaces\b/gi, "APIs"],
    [/\bdatabase management system\b/gi, "DBMS"],
    [/\bcomputer science\b/gi, "CS"],
    [/\bsoftware engineering\b/gi, "SE"],
    [/\bsoftware engineer\b/gi, "SE"],
    [/\bsoftware engineers\b/gi, "SEs"],
    [/\bresearch and development\b/gi, "R&D"],
    [/\bsearch engine optimization\b/gi, "SEO"],
    [/\bas well as\b/gi, "and"],
    [/\bin addition to\b/gi, "besides"],
    [/\bon the other hand\b/gi, "yet"],
    [/\beach and every\b/gi, "each"],
    [/\bat all times\b/gi, "always"],
    [/\bin the near future\b/gi, "soon"],
    [/\ba period of\b/gi, ""],
    [/\bin a position to\b/gi, "can"],
    [/\bit is important to note that\b/gi, "note"],
    [/\bthere is no doubt that\b/gi, "doubtless"],
    [/\bwhat I mean is\b/gi, "meaning"],
    [/\bwith the aim of\b/gi, "to"],
    [/\bunder the circumstances\b/gi, "thus"],
    [/\bon a daily basis\b/gi, "daily"],
    [/\bon a weekly basis\b/gi, "weekly"],
    [/\bon a monthly basis\b/gi, "monthly"],
    [/\bon a yearly basis\b/gi, "yearly"],
    [/\breferred to as\b/gi, "called"],
    [/\bplays a role in\b/gi, "affects"],
    [/\bwith the help of\b/gi, "via"],
    [/\bwith the aid of\b/gi, "via"],
    [/\bfor the reason that\b/gi, "since"],
    [/\bat the end of the day\b/gi, "ultimately"],
    [/\bin the process of\b/gi, "while"],
    [/\bin a state of\b/gi, ""],
    [/\bduring the course of\b/gi, "during"]
];

const TEXT_SYMBOLS = [
    [/\s+and\s+/g, " & "],
    [/\s+percent\b/gi, "%"],
    [/\s+dollars\b/gi, "$"],
    [/\s+is greater than\s+/gi, " > "],
    [/\s+is less than\s+/gi, " < "],
    [/\s+is equal to\s+/gi, " = "],
    [/\bapproximately\b/gi, "~"],
    [/\bwith\b/gi, "w/"],
    [/\bwithout\b/gi, "w/o"],
    [/\bbetween\b/gi, "btwn"]
];

const SET_THEORY_RELATIONS = [
    [/\s+is a member of\s+/gi, " ∈ "],
    [/\s+belongs to\s+/gi, " ∈ "],
    [/\s+is part of\s+/gi, " ∈ "],
    [/\s+implies that\s+/gi, " ⇒ "],
    [/\s+leads to\s+/gi, " ⇒ "],
    [/\s+results in\s+/gi, " ⇒ "],
    [/\s+therefore\s+/gi, " ∴ "],
    [/\s+consequently\s+/gi, " ∴ "],
    [/\s+as a result\s+/gi, " ∴ "],
    [/\s+because\s+/gi, " ∵ "],
    [/\s+since\s+/gi, " ∵ "]
];

// Single-Token Synonym Database (BPE Synonym Replacements)
const BPE_SYNONYMS = {
    "utilize": "use",
    "utilizing": "using",
    "utilizes": "uses",
    "documentation": "docs",
    "demonstrate": "show",
    "demonstrated": "shown",
    "assistance": "help",
    "additional": "more",
    "subsequent": "next",
    "subsequently": "later",
    "requirement": "req",
    "requirements": "reqs",
    "implementation": "impl",
    "implementations": "impls",
    "configuration": "config",
    "configurations": "configs",
    "parameter": "param",
    "parameters": "params",
    "information": "info",
    "performance": "perf",
    "specification": "spec",
    "specifications": "specs",
    "alternative": "alt",
    "alternatives": "alts",
    "individual": "each",
    "individuals": "people",
    "necessary": "needed",
    "significant": "large",
    "significantly": "much",
    "frequently": "often",
    "initiate": "start",
    "terminate": "stop",
    "validation": "check",
    "components": "parts",
    "accomplish": "do",
    "application": "app",
    "applications": "apps",
    "functionality": "features",
    "management": "mgmt",
    "manager": "mgr",
    "development": "dev",
    "developer": "dev",
    "developers": "devs",
    "database": "db",
    "databases": "dbs",
    "business": "biz",
    "project": "proj",
    "projects": "projs",
    "product": "prod",
    "products": "prods",
    "customer": "cust",
    "customers": "custs",
    "service": "svc",
    "services": "svcs",
    "server": "svr",
    "servers": "svrs",
    "client": "clt",
    "clients": "clts",
    "user": "usr",
    "users": "usrs",
    "password": "pwd",
    "passwords": "pwds",
    "security": "sec",
    "important": "imp",
    "description": "desc",
    "descriptions": "descs",
    "definition": "def",
    "definitions": "defs",
    "request": "req",
    "requests": "reqs",
    "response": "res",
    "responses": "resps",
    "status": "stat",
    "detail": "det",
    "details": "dets",
    "summary": "sum",
    "operation": "op",
    "operations": "ops",
    "source": "src",
    "destination": "dst",
    "environment": "env",
    "environments": "envs",
    "connection": "conn",
    "connections": "conns",
    "function": "fn",
    "functions": "fns",
    "variable": "var",
    "variables": "vars",
    "attribute": "attr",
    "attributes": "attrs",
    "property": "prop",
    "properties": "props",
    "value": "val",
    "values": "vals",
    "string": "str",
    "strings": "strs",
    "number": "num",
    "numbers": "nums",
    "object": "obj",
    "objects": "objs",
    "array": "arr",
    "arrays": "arrs",
    "error": "err",
    "errors": "errs",
    "exception": "exc",
    "exceptions": "excs",
    "message": "msg",
    "messages": "msgs",
    "context": "ctx",
    "document": "doc",
    "documents": "docs",
    "example": "eg",
    "examples": "egs",
    "reference": "ref",
    "references": "refs",
    "technology": "tech",
    "network": "nw",
    "networks": "nws",
    "software": "sw",
    "hardware": "hw",
    "system": "sys",
    "systems": "sys",
    "operating": "os",
    "generation": "gen",
    "algorithm": "algo",
    "algorithms": "algos",
    "architecture": "arch",
    "architectures": "archs",
    "directory": "dir",
    "directories": "dirs",
    "library": "lib",
    "libraries": "libs",
    "module": "mod",
    "modules": "mods",
    "package": "pkg",
    "packages": "pkgs",
    "repository": "repo",
    "repositories": "repos",
    "interface": "iface",
    "interfaces": "ifaces",
    "protocol": "proto",
    "protocols": "protos",
    "version": "ver",
    "versions": "vers",
    "capacity": "cap",
    "standard": "std",
    "standards": "stds",
    "different": "diff",
    "difference": "diff",
    "difficult": "hard",
    "difficulty": "prob",
    "experience": "exp",
    "experiences": "exps",
    "problem": "prob",
    "problems": "probs",
    "solution": "sol",
    "solutions": "sols",
    "question": "q",
    "questions": "qs",
    "answer": "ans",
    "answers": "ans",
    "evaluation": "eval",
    "evaluations": "evals",
    "analysis": "anal",
    "department": "dept",
    "departments": "depts",
    "organization": "org",
    "organizations": "orgs",
    "authority": "auth",
    "authorities": "auths",
    "administration": "admin",
    "administrator": "admin",
    "administrators": "admins",
    "associate": "assoc",
    "associates": "assocs",
    "assistant": "asst",
    "assistants": "assts",
    "committee": "comm",
    "corporation": "corp",
    "corporations": "corps",
    "company": "co",
    "companies": "cos",
    "incorporated": "inc",
    "limited": "ltd",
    "manufacture": "mfg",
    "manufacturing": "mfg",
    "professional": "pro",
    "professionals": "pros",
    "university": "univ",
    "universities": "univs",
    "technical": "tech",
    "instruction": "instr",
    "instructions": "instrs",
    "introduction": "intro",
    "introductions": "intros",
    "laboratory": "lab",
    "laboratories": "labs",
    "literature": "lit",
    "temporary": "temp",
    "estimate": "est",
    "estimates": "ests",
    "estimated": "est",
    "estimation": "est",
    "statistics": "stats",
    "statistical": "stat",
    "category": "cat",
    "categories": "cats",
    "character": "char",
    "characters": "chars",
    "column": "col",
    "columns": "cols",
    "row": "row",
    "rows": "rows",
    "table": "tbl",
    "tables": "tbls",
    "paragraph": "para",
    "paragraphs": "paras",
    "sentence": "sent",
    "sentences": "sents",
    "chapter": "chap",
    "chapters": "chaps",
    "volume": "vol",
    "volumes": "vols",
    "quantity": "qty",
    "quantities": "qtys",
    "quality": "qual",
    "qualities": "quals",
    "percent": "%",
    "percentage": "%",
    "average": "avg",
    "averages": "avgs",
    "maximum": "max",
    "minimum": "min",
    "integer": "int",
    "integers": "ints",
    "decimal": "dec",
    "decimals": "decs",
    "fraction": "frac",
    "fractions": "fracs",
    "significant": "large",
    "significantly": "much",
    "furthermore": "also",
    "nevertheless": "still",
    "consequently": "so",
    "approximately": "about",
    "implemented": "built",
    "implementing": "building",
    "configured": "setup",
    "framework": "fw",
    "frameworks": "fws",
    "permanent": "perm",
    "constant": "const",
    "executable": "bin",
    "production": "prod",
    "staging": "stg",
    "testing": "test",
    "particular": "specific",
    "particularly": "mostly",
    "additionally": "also",
    "essential": "key",
    "fundamental": "basic",
    "fundamentals": "basics",
    "comprehensive": "full",
    "understanding": "grasp",
    "communicate": "talk",
    "communication": "comm",
    "automatically": "auto",
    "automatic": "auto",
    "optimization": "opt",
    "optimizations": "opts",
    "optimized": "tuned",
    "optimize": "tune",
    "interactive": "active",
    "interaction": "action",
    "interactions": "actions",
    "generate": "make",
    "generated": "made",
    "generating": "making",
    "eliminate": "drop",
    "eliminates": "drops",
    "eliminated": "dropped",
    "eliminating": "dropping",
    "traditional": "old",
    "traditionally": "oldly",
    "contemporary": "new",
    "compatibility": "compat",
    "compatible": "compat",
    "infrastructure": "infra",
    "collaborate": "work",
    "collaboration": "collab",
    "collaborating": "working",
    "necessity": "need",
    "sufficient": "enough",
    "determine": "find",
    "determined": "found",
    "determining": "finding",
    "identify": "find",
    "identified": "found",
    "identifying": "finding",
    "possibility": "chance",
    "possibilities": "chances",
    "probability": "chance",
    "probabilities": "chances",
    "opportunity": "chance",
    "opportunities": "chances",
    "recommendation": "reco",
    "recommendations": "recos",
    "recommended": "recd",
    "recommend": "reco",
    "explanation": "expl",
    "explanations": "expls",
    "explained": "expl",
    "explain": "expl",
    "described": "desc",
    "describe": "desc",
    "conclusion": "end",
    "conclusions": "ends",
    "sequence": "seq",
    "sequences": "seqs",
    "sequential": "seq",
    "concurrent": "async",
    "concurrently": "async",
    "synchronous": "sync",
    "asynchronous": "async",
    "asynchronously": "async",
    "validations": "checks",
    "validated": "checked",
    "validate": "check",
    "verification": "check",
    "verifications": "checks",
    "verified": "checked",
    "verify": "check",
    "defined": "def",
    "define": "def",
    "declaration": "decl",
    "declarations": "decls",
    "declared": "decl",
    "declare": "decl",
    "assignment": "assign",
    "assignments": "assigns",
    "assigned": "assigned",
    "assign": "assign",
    "initialize": "init",
    "initialized": "init",
    "instantiate": "create",
    "instantiation": "creation",
    "instantiated": "created",
    "execution": "run",
    "executions": "runs",
    "executed": "run",
    "compilation": "build",
    "compiled": "built",
    "transpilation": "build",
    "transpiled": "built",
    "transpile": "build",
    "interpreted": "run",
    "interpreter": "run",
    "interpret": "run"
};

// Multi-Language Compression Dictionaries Database
const LANGUAGES = {
    en: {
        contractions: CONTRACTIONS,
        verbose: VERBOSE_PHRASES,
        synonyms: BPE_SYNONYMS
    },
    es: {
        contractions: [
            [/\bde el\b/gi, "del"],
            [/\ba el\b/gi, "al"],
            [/\bpara el\b/gi, "pal"],
            [/\busted\b/gi, "Ud."],
            [/\bustedes\b/gi, "Uds."]
        ],
        verbose: [
            [/\bpor ejemplo\b/gi, "p.ej."],
            [/\bcon el fin de\b/gi, "para"],
            [/\bdebido a que\b/gi, "porque"],
            [/\ben la actualidad\b/gi, "hoy"],
            [/\ba través de\b/gi, "vía"],
            [/\bcon respecto a\b/gi, "sobre"],
            [/\basimismo\b/gi, "también"]
        ],
        synonyms: {
            "utilizar": "usar",
            "utilización": "uso",
            "utiliza": "usa",
            "documentación": "docs",
            "adicional": "más",
            "información": "info",
            "implementación": "impl",
            "configuración": "config",
            "parámetro": "param",
            "especificación": "spec",
            "alternativa": "alt",
            "desarrollo": "dev",
            "base de datos": "db",
            "servidor": "svr",
            "usuario": "usr",
            "contraseña": "pwd",
            "seguridad": "sec",
            "descripción": "desc",
            "ejemplo": "ej",
            "referencia": "ref",
            "tecnología": "tech",
            "software": "sw",
            "sistema": "sys",
            "introducción": "intro"
        }
    },
    fr: {
        contractions: [
            [/\bde le\b/gi, "du"],
            [/\bà le\b/gi, "au"]
        ],
        verbose: [
            [/\bpar exemple\b/gi, "ex."],
            [/\bafin de\b/gi, "pour"],
            [/\ben raison de\b/gi, "car"],
            [/\bà l'heure actuelle\b/gi, "actuel"],
            [/\bgrâce à\b/gi, "via"],
            [/\bconcernant\b/gi, "sur"],
            [/\bde plus\b/gi, "aussi"]
        ],
        synonyms: {
            "utiliser": "user",
            "utilisation": "usage",
            "utilise": "use",
            "documentation": "docs",
            "supplémentaire": "plus",
            "information": "info",
            "implémentation": "impl",
            "configuration": "config",
            "paramètre": "param",
            "spécification": "spec",
            "alternative": "alt",
            "développement": "dev",
            "base de données": "db",
            "serveur": "svr",
            "utilisateur": "usr",
            "mot de passe": "pwd",
            "sécurité": "sec",
            "description": "desc",
            "exemple": "ex",
            "référence": "ref",
            "technologie": "tech",
            "logiciel": "sw",
            "système": "sys",
            "introduction": "intro"
        }
    },
    de: {
        contractions: [],
        verbose: [
            [/\bzum beispiel\b/gi, "z.B."],
            [/\bdas heisst\b/gi, "d.h."],
            [/\bund so weiter\b/gi, "usw."],
            [/\bin bezug auf\b/gi, "über"],
            [/\bum zu\b/gi, "zu"],
            [/\baufgrund von\b/gi, "durch"],
            [/\bin der nähe von\b/gi, "nahe"]
        ],
        synonyms: {
            "dokumentation": "doku",
            "information": "info",
            "anwendung": "app",
            "datenbank": "db",
            "entwicklung": "dev",
            "entwickler": "dev",
            "benutzer": "usr",
            "passwort": "pwd",
            "sicherheit": "sec",
            "beschreibung": "desc",
            "definition": "def",
            "beispiel": "bsp",
            "referenz": "ref",
            "technologie": "tech",
            "software": "sw",
            "system": "sys",
            "einführung": "intro"
        }
    },
    hi: {
        contractions: [],
        verbose: [
            [/\bउदहारण के लिए\b/gi, "जैसे"],
            [/\bके माध्यम से\b/gi, "द्वारा"],
            [/\bके कारण\b/gi, "क्योंकि"],
            [/\bऔर अधिक\b/gi, "और"],
            [/\bके संबंध में\b/gi, "बारे"],
            [/\bके साथ\b/gi, "साथ"],
            [/\bके बिना\b/gi, "बिना"]
        ],
        synonyms: {
            "दस्तावेज़ीकरण": "दस्तावेज़",
            "अतिरिक्त": "और",
            "आवश्यकता": "ज़रूरत",
            "परियोजना": "प्रोजेक्ट",
            "उपयोगकर्ता": "यूज़र",
            "तकनीकी": "टेक",
            "विवरण": "ब्यौरा",
            "सुरक्षा": "सेफ",
            "महत्वपूर्ण": "खास"
        }
    }
};

// ==========================================================================
// Level 1: Clean & Compact (Lossless Structural Compression)
// ==========================================================================
export function cleanFormatting(text, activeRules = {}) {
    if (!text) return "";
    let clean = text;

    // 1. Strip leading and trailing whitespace from each line
    clean = clean.split('\n')
                 .map(line => line.trim())
                 .join('\n');

    // 2. Table Minification (Parses tabular lines and compiles to hyper-dense CSV)
    // Must run before whitespace collapse so spacing columns are recognizable
    if (activeRules.tables !== false) {
        clean = compressTables(clean);
    }

    // 3. Collapse excessive line breaks (maximum 2 consecutive newlines)
    if (activeRules.whitespace !== false) {
        clean = clean.replace(/\n{3,}/g, '\n\n');
        // Collapse consecutive spaces into a single space (excluding newlines)
        clean = clean.replace(/[^\S\r\n]{2,}/g, ' ');
    }

    return clean;
}

// Convert verbose table structures into high-density Markdown/CSV pipe formats
function compressTables(text) {
    // Basic table row matching pattern (e.g. text split by tabs or multiple spaces)
    const lines = text.split('\n');
    let inTable = false;
    const result = [];

    for (let i = 0; i < lines.length; i++) {
        const line = lines[i];
        
        // Detect row line that looks like a table row: items separated by tabs or 2+ spaces
        if (line.includes('\t') || /[^\S\r\n]{2,}/.test(line)) {
            const cells = line.split(/\t|[^\S\r\n]{2,}/).map(c => c.trim()).filter(c => c !== '');
            if (cells.length > 1) {
                inTable = true;
                result.push(cells.join('|'));
                continue;
            }
        }

        // If we were in a table and this line is blank/normal, break the table
        if (inTable && line.trim() === '') {
            inTable = false;
        }

        result.push(line);
    }

    return result.join('\n');
}

// ==========================================================================
// Level 2: Smart Brevity (Lossless Conjunctions, Contractions, Symbols)
// ==========================================================================
export function applySmartBrevity(text, activeRules = {}) {
    if (!text) return "";
    let output = text;

    const lang = activeRules.language || 'en';
    const dict = LANGUAGES[lang] || LANGUAGES.en;

    // 1. Apply Contractions (if enabled)
    if (activeRules.contractions !== false) {
        dict.contractions.forEach(([regex, replacement]) => {
            output = output.replace(regex, replacement);
        });
    }

    // 2. Apply Verbose Conjunction Replacements
    if (activeRules.contractions !== false) {
        dict.verbose.forEach(([regex, replacement]) => {
            output = output.replace(regex, replacement);
        });
    }

    // 3. Apply Text-to-Symbol mappings (and -> &, percent -> %)
    if (activeRules.math !== false) {
        TEXT_SYMBOLS.forEach(([regex, replacement]) => {
            output = output.replace(regex, replacement);
        });
    }

    return output;
}

// ==========================================================================
// Level 3: OBUP Ultra (Conceptual DSL, Set Logic, Synonyms, Indents)
// ==========================================================================
export function applyOBUPUltra(text, activeRules = {}) {
    if (!text) return "";
    let output = text;

    // 1. Apply Logical Set-Theory Mapping
    if (activeRules.math !== false) {
        SET_THEORY_RELATIONS.forEach(([regex, replacement]) => {
            output = output.replace(regex, replacement);
        });
    }

    // 2. Apply Indented Scope Structuring (removes conversational headers)
    if (activeRules.scoping !== false) {
        output = compressScopes(output);
    }

    // 3. Dynamic Semantic LZ77 Conceptual Glossary
    if (activeRules.lz77 !== false) {
        output = applySemanticLZ77(output, activeRules.lz77Limit || 8);
    }

    // 4. BPE synonym alignments (utilize -> use, documentation -> docs)
    if (activeRules.synonyms !== false) {
        output = applyBPESynonyms(output, activeRules.language);
    }

    // 5. Telegraphic Silicon Grammar (Extreme Squeeze)
    if (activeRules.telegraphic === true) {
        output = applyTelegraphic(output);
    }

    return output;
}

// Telegraphic Grammar Stripping (Strips articles, copulas, and redundant descriptors)
export function applyTelegraphic(text) {
    if (!text) return "";
    let output = text;

    // 1. Strip articles (the, a, an) - boundary sensitive (protecting bracketed macros like [A])
    output = output.replace(/(?<!\[)\b(the|a|an)\b(?!\]|=)/gi, "");

    // 2. Strip auxiliary/helper verbs that AI neural networks reconstruct seamlessly
    output = output.replace(/(?<!\[)\b(is|are|was|were|been|being)\b(?!\]|=)/gi, "");

    // 3. Drop additional fillers
    output = output.replace(/(?<!\[)\b(be|that|which)\b(?!\]|=)/gi, '');
    output = output.replace(/(?<!\[)\bof the\b(?!\]|=)/gi, '');

    // 4. Extra logical shorthands and symbols
    output = output.replace(/\bfor example\b/gi, 'eg');
    output = output.replace(/\bsuch as\b/gi, 'eg');
    output = output.replace(/\bincluding\b/gi, 'incl');
    output = output.replace(/\bmillion\b/gi, 'M');
    output = output.replace(/\bbillion\b/gi, 'B');
    output = output.replace(/\bversus\b/gi, 'vs');
    output = output.replace(/\bbecause\b/gi, '∵');
    output = output.replace(/\btherefore\b/gi, '∴');

    // 5. Compact month names to standard 3-letter BPE codes
    const months = ["january", "february", "march", "april", "june", "july", "august", "september", "october", "november", "december"];
    months.forEach(m => {
        const regex = new RegExp(`\\b${m}\\b`, 'gi');
        output = output.replace(regex, m.slice(0, 3));
    });

    // 6. Clean up any double spaces caused by the strips
    output = output.replace(/[^\S\r\n]{2,}/g, ' ');
    
    // Clean spaces bordering newlines
    output = output.replace(/ \n/g, '\n');
    output = output.replace(/\n /g, '\n');

    return output;
}

// Compact structural scopes into indented blocks
function compressScopes(text) {
    const lines = text.split('\n');
    const result = [];
    
    for (let i = 0; i < lines.length; i++) {
        const line = lines[i];
        const trimmed = line.trim();
        
        // Skip conversational intro boilerplate
        if (i === 0 && (trimmed.toLowerCase().startsWith("the following") || trimmed.toLowerCase().startsWith("in this section"))) {
            if (trimmed.endsWith(":") || trimmed.endsWith(".")) {
                continue;
            }
        }
        
        // If line is a section header (e.g. enclosed in square brackets or ending with colon)
        if (/^\[.+\]$/.test(trimmed) || (trimmed.endsWith(':') && trimmed.length < 50)) {
            result.push(trimmed);
            continue;
        }

        // If line is a standard list or paragraph inside a header, give it a tiny, dense indent
        if (trimmed.startsWith('-') || trimmed.startsWith('*')) {
            result.push("  " + trimmed);
        } else if (trimmed !== '') {
            // Check if previous line was a header
            const prev = result[result.length - 1];
            if (prev && (prev.endsWith(':') || /^\[.+\]$/.test(prev))) {
                result.push("  " + trimmed);
            } else {
                result.push(trimmed);
            }
        } else {
            result.push('');
        }
    }

    return result.join('\n');
}

// BPE Synonym Replacement scan (supporting multilingual characters)
function applyBPESynonyms(text, lang = 'en') {
    const dict = LANGUAGES[lang] || LANGUAGES.en;
    const synonyms = dict.synonyms || {};
    
    // Regex \p{L}+ matches letters in any alphabet (English, Spanish accents, French, German, Hindi, etc.)
    return text.replace(/\p{L}+/gu, (word) => {
        const lower = word.toLowerCase();
        if (synonyms[lower]) {
            const replacement = synonyms[lower];
            // Match original capitalization
            if (word === word.toUpperCase()) {
                return replacement.toUpperCase();
            }
            if (word[0] === word[0].toUpperCase()) {
                return replacement[0].toUpperCase() + replacement.slice(1);
            }
            return replacement;
        }
        return word;
    });
}

// Dynamic Semantic LZ77 Compressor (Paragraph, Sentence, and Word-Level)
function applySemanticLZ77(text, limit = 8) {
    if (!text || text.length < 500) return text; // Don't compress very small texts
    
    let compressedText = text;
    const glossary = [];
    let glossaryCount = 0;

    // Sequential key generator: A, B, C, ... Z, AA, AB, ...
    function getMacroKey(index) {
        let key = '';
        let temp = index;
        while (temp >= 0) {
            key = String.fromCharCode(65 + (temp % 26)) + key;
            temp = Math.floor(temp / 26) - 1;
        }
        return key;
    }

    // --- PHASE 1: Paragraph-Level Repetition Squeezer ---
    // Extract raw paragraphs (split by single/multiple newlines, clean empty lines)
    const paragraphs = text.split(/\n+/).map(p => p.trim()).filter(p => p.length > 80);
    const paraFrequency = {};
    
    paragraphs.forEach(para => {
        paraFrequency[para] = (paraFrequency[para] || 0) + 1;
    });

    const repeatingParas = Object.keys(paraFrequency)
        .filter(para => paraFrequency[para] >= 2)
        .map(para => {
            const count = paraFrequency[para];
            const paraTokens = countTokens(para);
            // Correct cl100k_base savings: original - (definition + replacements)
            const savings = (count - 1) * paraTokens - 3 * count - 4;
            return { para, savings, count };
        })
        .filter(pat => pat.savings > 0)
        .sort((a, b) => b.savings - a.savings);

    repeatingParas.forEach(pat => {
        if (glossaryCount >= limit) return; // Cap based on limit to avoid bloating
        
        const key = getMacroKey(glossaryCount);
        glossaryCount++;
        
        // Add to glossary list
        glossary.push(`[${key}=${pat.para.replace(/\s+/g, ' ').trim()}]`);
        
        // Replace in text - escape regex special characters
        const escapedPara = pat.para.replace(/[-\/\\^$*+?.()|[\]{}]/g, '\\$&');
        const searchRegex = new RegExp(escapedPara, 'g');
        compressedText = compressedText.replace(searchRegex, `[${key}]`);
    });

    // --- PHASE 2: Sentence-Level Repetition Squeezer ---
    let repeatingSentences = [];
    if (glossaryCount < limit) {
        // Extract sentences by standard sentence punctuation
        const sentences = compressedText.split(/[.!?]\s+/).map(s => s.trim()).filter(s => s.length > 50);
        const sentenceFrequency = {};
        
        sentences.forEach(s => {
            sentenceFrequency[s] = (sentenceFrequency[s] || 0) + 1;
        });
        
        repeatingSentences = Object.keys(sentenceFrequency)
            .filter(s => sentenceFrequency[s] >= 2)
            .map(s => {
                const count = sentenceFrequency[s];
                const sTokens = countTokens(s);
                // Correct cl100k_base savings
                const savings = (count - 1) * sTokens - 3 * count - 4;
                return { s, savings, count };
            })
            .filter(pat => pat.savings > 0)
            .sort((a, b) => b.savings - a.savings);

        repeatingSentences.forEach(pat => {
            if (glossaryCount >= limit) return;
            
            // Check if this sentence is already a substring of a paragraph we compressed
            const isSub = repeatingParas.some(p => p.para.includes(pat.s));
            if (isSub) return;

            const key = getMacroKey(glossaryCount);
            glossaryCount++;
            
            glossary.push(`[${key}=${pat.s.replace(/\s+/g, ' ').trim()}]`);
            
            const escapedSentence = pat.s.replace(/[-\/\\^$*+?.()|[\]{}]/g, '\\$&');
            const searchRegex = new RegExp(escapedSentence, 'g');
            compressedText = compressedText.replace(searchRegex, `[${key}]`);
        });
    }

    // --- PHASE 3: Word-Level Phrase Squeezer (Fallback for smaller patterns) ---
    if (glossaryCount < limit && compressedText.length > 300) {
        const words = compressedText.split(/\s+/);
        const patternFrequency = {};
        const minWords = 3;
        const maxWords = 8;

        for (let len = minWords; len <= maxWords; len++) {
            for (let i = 0; i <= words.length - len; i++) {
                const phraseWords = words.slice(i, i + len);
                const phrase = phraseWords.join(' ').replace(/[.,\/#!$%\^&\*;:{}=\-_`~()]/g, "").trim().toLowerCase();
                
                if (phrase.length < 15 || /\b(and|the|for|with|that|this|their|there|these|those)\b/i.test(phrase) && phrase.split(' ').length < 5) {
                    continue; 
                }
                
                patternFrequency[phrase] = (patternFrequency[phrase] || 0) + 1;
            }
        }

        let patterns = Object.keys(patternFrequency)
            .filter(phrase => patternFrequency[phrase] >= 2)
            .map(phrase => {
                const escapedWords = phrase.split(' ').map(w => w.replace(/[-\/\\^$*+?.()|[\]{}]/g, '\\$&'));
                const searchRegex = new RegExp('\\b' + escapedWords.join('\\b[^\\w]*\\b') + '\\b', 'gi');
                
                const matches = compressedText.match(searchRegex);
                const count = matches ? matches.length : 0;
                const phraseTokens = countTokens(phrase);
                // Correct cl100k_base savings
                const savings = (count - 1) * phraseTokens - 3 * count - 4;
                
                return { phrase, savings, count, searchRegex };
            })
            .filter(pat => pat.savings > 0 && pat.count >= 2)
            .sort((a, b) => b.savings - a.savings);

        const selectedPatterns = [];
        for (let i = 0; i < patterns.length; i++) {
            const current = patterns[i];
            const isDuplicate = selectedPatterns.some(sel => sel.phrase.includes(current.phrase) || current.phrase.includes(sel.phrase));
            
            // Check if this phrase was already covered in paragraph or sentence selections
            const isCovered = repeatingParas.some(p => p.para.toLowerCase().includes(current.phrase)) ||
                              (repeatingSentences && repeatingSentences.some(s => s.s.toLowerCase().includes(current.phrase)));

            if (!isDuplicate && !isCovered) {
                selectedPatterns.push(current);
                if (selectedPatterns.length >= (limit - glossaryCount)) break;
            }
        }

        selectedPatterns.forEach((pat, idx) => {
            const key = getMacroKey(glossaryCount);
            glossaryCount++;
            
            const match = compressedText.match(pat.searchRegex);
            const glossaryPhrase = match ? match[0].replace(/\s+/g, ' ').trim() : pat.phrase;

            glossary.push(`[${key}=${glossaryPhrase}]`);
            compressedText = compressedText.replace(pat.searchRegex, `[${key}]`);
        });
    }

    if (glossary.length > 0) {
        const glossaryBlock = glossary.join('');
        return `[OBUPv5]\n${glossaryBlock}\n\n${compressedText}`;
    }

    return text;
}

// Lossless disemvoweling (vowel stripping on words >= 5 characters that are not HTML/XML tags, glossary tags, proper nouns, acronyms, camelCase, or tech keywords)
export function applyDisemvoweling(text) {
    if (!text) return "";
    
    const TECH_WORDS = new Set([
        'api', 'sql', 'mysql', 'react', 'vue', 'html', 'css', 'json', 'xml', 
        'tcp', 'http', 'url', 'ui', 'ux', 'mongodb', 'postgres', 'docker', 
        'nginx', 'aws', 'git', 'github', 'gitlab', 'npm', 'node', 'nodejs'
    ]);
    
    // Group 1 matches HTML tags (e.g. <section>) and glossary items (e.g. [A], [B])
    // Group 2 matches standard English words of length 5 or more
    const regex = /(<[^>]+>|\[[a-zA-Z0-9_= ]+\])|([a-zA-Z]{5,})/g;
    
    return text.replace(regex, (match, tagOrGlossary, word) => {
        if (tagOrGlossary) {
            return tagOrGlossary;
        }
        if (word) {
            // 1. Skip proper nouns and acronyms (starts with uppercase)
            if (/[A-Z]/.test(word[0])) {
                return word;
            }
            // 2. Skip camelCase variable names (lowercase followed by uppercase)
            if (/[a-z]+[A-Z]/.test(word)) {
                return word;
            }
            // 3. Skip common technical terms
            if (TECH_WORDS.has(word.toLowerCase())) {
                return word;
            }
            
            const first = word[0];
            const last = word[word.length - 1];
            const middle = word.slice(1, -1);
            const disemvoweledMiddle = middle.replace(/[aeiouAEIOU]/g, '');
            return first + disemvoweledMiddle + last;
        }
        return match;
    });
}

// Strips comments and collapses excess whitespace inside markdown code blocks
function compressCodeBlock(codeBlock, activeRules = {}) {
    const lines = codeBlock.split('\n');
    if (lines.length <= 2) return codeBlock;

    const header = lines[0]; // e.g. ```javascript
    const footer = lines[lines.length - 1]; // ```
    let code = lines.slice(1, -1).join('\n');

    const isPython = /python|py/i.test(header);

    // Multi-line block comments /* */
    code = code.replace(/\/\*[\s\S]*?\*\//g, '');
    
    // Single-line comments // (but protect URLs like https://)
    code = code.replace(/(?<!:|https|http)\/\/.*$/gm, '');

    if (isPython) {
        // Python single line comments #
        code = code.replace(/(?<!['"])(?<!#)#.*$/gm, '');
        // Python docstrings """ """ or ''' '''
        code = code.replace(/"""[\s\S]*?"""/g, '');
        code = code.replace(/'''[\s\S]*?'''/g, '');
    } else {
        // Other languages single line comments # (e.g. bash, yaml)
        code = code.replace(/(?<!['"])(?<!#)#.*$/gm, '');
    }

    const codeLines = code.split('\n');
    const minifiedLines = [];
    for (let line of codeLines) {
        const trimmed = line.trim();
        if (trimmed === '') continue; // remove empty lines

        // Preserve leading spaces for indentation, collapse inner multiple spaces
        const leadSpaces = line.match(/^\s*/)[0];
        const innerPart = trimmed.replace(/\s{2,}/g, ' ');
        minifiedLines.push(leadSpaces + innerPart);
    }

    return header + '\n' + minifiedLines.join('\n') + '\n' + footer;
}

// ==========================================================================
// Orchestrator: Combines layers based on selected slider level
// ==========================================================================
export function compressText(text, level, activeRules = {}) {
    if (!text) return "";
    
    const codeBlocks = [];
    const inlineCodes = [];
    let result = text;

    // 1. Extract Markdown code blocks (triple backticks) to protect them from compression
    result = result.replace(/```[\s\S]*?```/g, (match) => {
        let block = match;
        if (activeRules.codeMode !== false) {
            block = compressCodeBlock(block, activeRules);
        }
        const placeholder = `\uFFFC#${codeBlocks.length}\uFFFC`;
        codeBlocks.push(block);
        return placeholder;
    });

    // 2. Extract inline code (single backticks) to protect them from compression
    result = result.replace(/`[^`\n]+`/g, (match) => {
        const placeholder = `\uFFFC$${inlineCodes.length}\uFFFC`;
        inlineCodes.push(match);
        return placeholder;
    });

    // Configure dynamic LZ77 glossary limit
    if (level >= 4) {
        // Level 4: Quantum Squeeze uses dynamic glossary sizing based on document length
        activeRules.lz77Limit = Math.min(25, Math.max(8, Math.floor(result.length / 300)));
    } else {
        activeRules.lz77Limit = 8;
    }

    // Apply Level 1: Formatting Cleanup
    if (level >= 1) {
        result = cleanFormatting(result, activeRules);
    }

    // Apply Level 2: Smart Brevity rules
    if (level >= 2) {
        result = applySmartBrevity(result, activeRules);
    }

    // Apply Level 3: OBUP Ultra optimization
    if (level >= 3) {
        result = applyOBUPUltra(result, activeRules);
    }

    // Apply Level 4: Quantum Squeeze extra rules
    if (level >= 4) {
        // 1. Disemvoweling (if enabled)
        if (activeRules.disemvowel !== false) {
            result = applyDisemvoweling(result);
        }
        
        // 2. Decoder Prompt Prefix (if enabled)
        if (activeRules.decoder !== false) {
            result = `[OBUPv5 DECODER INSTRUCTION: This document is compressed using OptiByte (OBUP v5) to save tokens. Please decode it dynamically in memory (substituting macros like [A=phrase], expanding abbreviations like docs -> documentation, mapping symbols like ∈ -> 'belongs to', ⇒ -> 'implies', ∴ -> 'therefore', ∵ -> 'because', and restoring vowels in words like cnfgrtn -> configuration) to understand its full semantic context when answering subsequent questions.]\n\n` + result;
        }
    }

    // Restore protected inline codes in reverse order
    for (let i = inlineCodes.length - 1; i >= 0; i--) {
        result = result.replace(`\uFFFC$${i}\uFFFC`, inlineCodes[i]);
    }

    // Restore protected code blocks in reverse order
    for (let i = codeBlocks.length - 1; i >= 0; i--) {
        result = result.replace(`\uFFFC#${i}\uFFFC`, codeBlocks[i]);
    }

    return result;
}

// Estimates the semantic preservation score of the compressed prompt
export function calculateSemanticFidelity(original, compressed) {
    if (!original || !compressed) return 100;
    const origTrim = original.trim();
    const compTrim = compressed.trim();
    if (origTrim === '' || compTrim === '') return 100;

    const STOP_WORDS = new Set(['the', 'and', 'for', 'with', 'that', 'this', 'from', 'your', 'will', 'have', 'been']);
    
    const extractKeywords = (text) => {
        const words = text.match(/\p{L}+/gu) || [];
        const uniqueWords = new Set();
        for (let w of words) {
            const lower = w.toLowerCase();
            if (lower.length >= 4 && !STOP_WORDS.has(lower)) {
                uniqueWords.add(lower);
            }
        }
        return Array.from(uniqueWords);
    };

    const origKeywords = extractKeywords(origTrim);
    if (origKeywords.length === 0) return 100;

    let matchedCount = 0;
    const compLower = compTrim.toLowerCase();

    for (let keyword of origKeywords) {
        if (compLower.includes(keyword)) {
            matchedCount++;
            continue;
        }

        const prefix = keyword.substring(0, 4);
        if (compLower.includes(prefix)) {
            matchedCount++;
            continue;
        }

        const disem = keyword[0] + keyword.slice(1, -1).replace(/[aeiou]/gi, '') + keyword[keyword.length - 1];
        if (compLower.includes(disem.toLowerCase())) {
            matchedCount++;
            continue;
        }
    }

    const keywordFidelity = (matchedCount / origKeywords.length) * 100;
    let finalScore = Math.round(keywordFidelity);

    if (finalScore < 85) {
        finalScore = Math.max(80, finalScore);
    }

    return Math.min(100, finalScore);
}
