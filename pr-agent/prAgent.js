// prAgent.js
// Self-contained Bitbucket PR and Jira management skill implementation
// No external npm install required


const https = require('https');
const http = require('http');

// --- Bitbucket API helpers ---
const BITBUCKET_BASE_URL = process.env.BITBUCKET_BASE_URL || 'https://bitbucket.cambiumnetworks.com';
const BITBUCKET_API_VERSION = process.env.BITBUCKET_API_VERSION || 'latest';
const BITBUCKET_TOKEN = process.env.BITBUCKET_TOKEN;

function getAuthHeader() {
    if (!BITBUCKET_TOKEN) throw new Error('BITBUCKET_TOKEN env var required');
    return { 'Authorization': `Bearer ${BITBUCKET_TOKEN}` };
}


function bitbucketRequest(path, method = 'GET', body = null, options = {}) {
    return new Promise((resolve, reject) => {
        const { rawResponse = false, accept = 'application/json' } = options;
        const urlObj = new URL(`${BITBUCKET_BASE_URL}/rest/api/${BITBUCKET_API_VERSION}${path}`);
        const isHttps = urlObj.protocol === 'https:';
        const lib = isHttps ? https : http;
        const headers = {
            ...getAuthHeader(),
            'Accept': accept,
        };
        if (body !== null) {
            headers['Content-Type'] = 'application/json';
        }
        const requestOptions = {
            method,
            hostname: urlObj.hostname,
            port: urlObj.port || (isHttps ? 443 : 80),
            path: urlObj.pathname + urlObj.search,
            headers,
        };
        const req = lib.request(requestOptions, (res) => {
            let data = '';
            res.on('data', (chunk) => { data += chunk; });
            res.on('end', () => {
                if (res.statusCode < 200 || res.statusCode >= 300) {
                    console.error(`Bitbucket API error: ${res.statusCode} ${res.statusMessage} | URL: ${urlObj.toString()}`);
                    return reject(new Error(`Bitbucket API error: ${res.statusCode} ${res.statusMessage} - ${data}`));
                }
                if (rawResponse) {
                    resolve(data);
                    return;
                }
                if (!data) {
                    resolve({});
                    return;
                }
                try {
                    resolve(JSON.parse(data));
                } catch (e) {
                    console.error(`Failed to parse Bitbucket response as JSON | URL: ${urlObj.toString()}`);
                    reject(new Error('Failed to parse Bitbucket response as JSON'));
                }
            });
        });
        req.on('error', (err) => {
            console.error(`Bitbucket API request error: ${err.message} | URL: ${urlObj.toString()}`);
            reject(err);
        });
        if (body) {
            req.write(JSON.stringify(body));
        }
        req.end();
    });
}

// --- Skill API ---
module.exports = {
    async get_pr_details({ project, repoSlug, pullRequestId }) {
        return bitbucketRequest(`/projects/${project}/repos/${repoSlug}/pull-requests/${pullRequestId}`);
    },
    async create_pr({ project, repoSlug, title, description, fromRef, toRef, reviewers = [] }) {
        if (typeof title !== 'string' || !title.trim()) {
            throw new Error('title must be a non-empty string');
        }
        if (typeof fromRef !== 'string' || !fromRef.trim()) {
            throw new Error('fromRef must be a non-empty string (branch name or refs/heads/*)');
        }
        if (typeof toRef !== 'string' || !toRef.trim()) {
            throw new Error('toRef must be a non-empty string (branch name or refs/heads/*)');
        }

        const normalizeRef = (ref) => ref.startsWith('refs/heads/') ? ref : `refs/heads/${ref}`;
        const fromRefId = normalizeRef(fromRef.trim());
        const toRefId = normalizeRef(toRef.trim());

        const body = {
            title: title.trim(),
            fromRef: {
                id: fromRefId,
                repository: {
                    slug: repoSlug,
                    project: { key: project }
                }
            },
            toRef: {
                id: toRefId,
                repository: {
                    slug: repoSlug,
                    project: { key: project }
                }
            },
            ...(typeof description === 'string' ? { description } : {}),
            ...(Array.isArray(reviewers) && reviewers.length > 0
                ? {
                    reviewers: reviewers
                        .filter((name) => typeof name === 'string' && name.trim())
                        .map((name) => ({ user: { name: name.trim() } }))
                }
                : {})
        };

        return bitbucketRequest(
            `/projects/${project}/repos/${repoSlug}/pull-requests`,
            'POST',
            body
        );
    },
    async update_pr({ project, repoSlug, pullRequestId, title, description }) {
        if (typeof title !== 'string' && typeof description !== 'string') {
            throw new Error('At least one of title or description must be provided');
        }

        // Bitbucket Server expects optimistic locking with the current PR version.
        const currentPr = await module.exports.get_pr_details({ project, repoSlug, pullRequestId });

        const body = {
            version: currentPr.version,
            ...(typeof title === 'string' ? { title } : {}),
            ...(typeof description === 'string' ? { description } : {}),
        };

        return bitbucketRequest(
            `/projects/${project}/repos/${repoSlug}/pull-requests/${pullRequestId}`,
            'PUT',
            body
        );
    },
    async get_pr_changes({ project, repoSlug, pullRequestId }) {
        return bitbucketRequest(`/projects/${project}/repos/${repoSlug}/pull-requests/${pullRequestId}/changes`);
    },
    async review_pr({ project, repoSlug, pullRequestId, customInstructions = {} }) {
        // Thorough automated review + optional LLM summarization and commenting.
        // Environment variables used for LLM integration:
        // - LLM_API_URL: full URL to POST prompts (required for LLM calls)
        // - LLM_API_KEY: bearer token for the LLM service (optional)
        // - LLM_MODEL: model name to request (optional)

        // Reuse earlier helper functions for analysis
        function analyzeText(filePath, text) {
            const findings = [];
            if (!text || text.length === 0) {
                findings.push({ level: 'info', message: 'Could not fetch diff or file content; review based on filename only.' });
                if (/package.json$/i.test(filePath)) {
                    findings.push({ level: 'info', message: 'package.json changed — verify dependency updates and run `npm install` and security audit.' });
                }
                return findings;
            }

            const lines = text.split(/\r?\n/);
            const added = lines.filter(l => l.startsWith('+') && !l.startsWith('+++'));
            const removed = lines.filter(l => l.startsWith('-') && !l.startsWith('---'));

            if (added.length + removed.length > 1000) {
                findings.push({ level: 'warning', message: `Large change: ${added.length} additions, ${removed.length} deletions — consider splitting into smaller PRs.` });
            }

            const addedText = added.join('\n');
            const checks = [
                { re: /TODO|FIXME/, level: 'info', message: 'TODO/FIXME left in added code.' },
                { re: /console\.log\(|console\.warn\(|console\.error\(/, level: 'warning', message: 'console.* found — remove debug logging from production code.' },
                { re: /\bdebugger\b/, level: 'warning', message: 'debugger statement left in code.' },
                { re: /eval\(|new Function\(/, level: 'error', message: 'Use of eval/new Function — high risk for code injection.' },
                { re: /\b(password|passwd|secret|api[_-]?key|access[_-]?token|aws_secret)\b/i, level: 'error', message: 'Potential hard-coded secret found — use environment/config secrets.' },
                { re: /require\(['\"]child_process['\"]\)|exec\(|spawn\(/, level: 'warning', message: 'Spawning subprocesses — ensure input is sanitized and intended.' },
                { re: /process\.env\./, level: 'info', message: 'Accessing process.env — ensure secrets are not written into logs or returned.' },
                { re: /SELECT\s+.+FROM|INSERT\s+INTO|UPDATE\s+.+SET/i, level: 'warning', message: 'Raw SQL detected — verify use of parameterized queries to avoid SQL injection.' },
            ];

            for (const c of checks) {
                if (c.re.test(addedText)) findings.push({ level: c.level, message: c.message });
            }

            const longLines = lines
                .map((l, i) => ({ l, i }))
                .filter(x => x.l.length > 200 && !x.l.startsWith('+++') && !x.l.startsWith('---'))
                .slice(0, 5)
                .map(x => ({ line: x.i + 1, preview: x.l.slice(0, 200) }));
            if (longLines.length) {
                findings.push({ level: 'info', message: `Found ${longLines.length} very long lines (showing up to 5). Consider wrapping or refactoring.` , samples: longLines});
            }

            if (!/test|spec|__tests__/.test(text) && !/\.test\./i.test(filePath)) {
                findings.push({ level: 'note', message: 'No test changes detected for this file — verify behavior with unit/integration tests.' });
            }

            const risky = added.filter(l => /(TODO|FIXME|console\.log|debugger|eval\(|new Function\(|password|secret|api[_-]?key)/i.test(l)).slice(0, 10);
            if (risky.length) findings.push({ level: 'info', message: 'Sample risky added lines', samples: risky });

            return findings;
        }

        function buildSummary(fileFindings) {
            const summary = { totalFiles: fileFindings.length, errors: 0, warnings: 0, infos: 0, notes: 0 };
            for (const f of fileFindings) {
                for (const item of f.findings) {
                    if (item.level === 'error') summary.errors++;
                    else if (item.level === 'warning') summary.warnings++;
                    else if (item.level === 'info') summary.infos++;
                    else if (item.level === 'note') summary.notes++;
                }
            }
            return summary;
        }

        // Lightweight LLM client that POSTs JSON { prompt, model } to LLM_API_URL
        function callLLM(prompt) {
            return new Promise((resolve, reject) => {
                const llmUrl = process.env.LLM_API_URL;
                if (!llmUrl) return resolve({ ok: false, reason: 'LLM_API_URL not configured' });
                try {
                    const urlObj = new URL(llmUrl);
                    const lib = urlObj.protocol === 'https:' ? require('https') : require('http');
                    const model = process.env.LLM_MODEL || 'gpt-5-mini';
                    const payload = JSON.stringify({ prompt, model });
                    const options = {
                        method: 'POST',
                        hostname: urlObj.hostname,
                        port: urlObj.port || (urlObj.protocol === 'https:' ? 443 : 80),
                        path: urlObj.pathname + urlObj.search,
                        headers: {
                            'Content-Type': 'application/json',
                            'Content-Length': Buffer.byteLength(payload),
                        }
                    };
                    if (process.env.LLM_API_KEY) options.headers['Authorization'] = `Bearer ${process.env.LLM_API_KEY}`;
                    const req = lib.request(options, (res) => {
                        let data = '';
                        res.on('data', (chunk) => data += chunk);
                        res.on('end', () => {
                            try {
                                const parsed = JSON.parse(data);
                                // Accept common shapes: { text } or { output: '...' } or raw string
                                const text = parsed.text || parsed.output || parsed.result || parsed[0] || JSON.stringify(parsed);
                                resolve({ ok: true, text });
                            } catch (e) {
                                // Not JSON — return raw
                                resolve({ ok: true, text: data });
                            }
                        });
                    });
                    req.on('error', (e) => reject(e));
                    req.write(payload);
                    req.end();
                } catch (err) {
                    resolve({ ok: false, reason: err.message });
                }
            });
        }

        try {
            const changesResp = await module.exports.get_pr_changes({ project, repoSlug, pullRequestId });
            const fileEntries = Array.isArray(changesResp) ? changesResp : (changesResp.values || changesResp.changes || []);
            function extractPath(f) {
                if (!f) return null;
                if (typeof f === 'string') return f;

                // If path is an object with components array, join them
                if (f.path && typeof f.path === 'object') {
                    if (Array.isArray(f.path.components)) return f.path.components.join('/');
                    if (typeof f.path.path === 'string') return f.path.path;
                }

                // If path is a JSON string, try to parse and extract components
                if (typeof f.path === 'string' && f.path.trim().startsWith('{')) {
                    try {
                        const parsed = JSON.parse(f.path);
                        if (parsed.path && Array.isArray(parsed.path.components)) return parsed.path.components.join('/');
                        if (parsed.path && typeof parsed.path === 'string') return parsed.path;
                    } catch (e) {}
                }

                if (typeof f.path === 'string') return f.path;

                // Handle f.to which may be object or string
                if (f.to) {
                    if (typeof f.to === 'string') return f.to;
                    if (typeof f.to.path === 'string') return f.to.path;
                    if (f.to.path && Array.isArray(f.to.path.components)) return f.to.path.components.join('/');
                }

                if (f.destination && f.destination.path) {
                    if (Array.isArray(f.destination.path.components)) return f.destination.path.components.join('/');
                    if (typeof f.destination.path === 'string') return f.destination.path;
                }

                if (f.displayPath) return f.displayPath;
                if (f.filePath) return f.filePath;

                if (f.new && f.new.path) {
                    if (Array.isArray(f.new.path.components)) return f.new.path.components.join('/');
                    if (typeof f.new.path === 'string') return f.new.path;
                }
                if (f.old && f.old.path) {
                    if (Array.isArray(f.old.path.components)) return f.old.path.components.join('/');
                    if (typeof f.old.path === 'string') return f.old.path;
                }

                // Try to extract components from a JSON-like string representation
                try {
                    const j = JSON.stringify(f);
                    const m = j.match(/"components"\s*:\s*\[([^\]]+)\]/);
                    if (m) {
                        // extract quoted parts
                        const parts = m[1].match(/"([^"]+)"/g);
                        if (parts) return parts.map(p => p.replace(/"/g, '')).join('/');
                    }
                } catch (e) {}

                try { return JSON.stringify(f).slice(0, 200); } catch (e) { return String(f); }
            }
            const files = fileEntries.map(f => ({ filePath: extractPath(f) }));

            const fileFindings = [];
            for (const f of files) {
                let diffText = '';
                try {
                    const diffResp = await module.exports.get_single_file_diff({ project, repoSlug, pullRequestId, filePath: f.filePath });
                    diffText = typeof diffResp === 'string' ? diffResp : JSON.stringify(diffResp);
                } catch (e1) {
                    try {
                        const contentResp = await module.exports.get_file_content({ project, repoSlug, pullRequestId, filePath: f.filePath });
                        diffText = typeof contentResp === 'string' ? contentResp : JSON.stringify(contentResp);
                    } catch (e2) {
                        diffText = '';
                    }
                }
                const findings = analyzeText(f.filePath, diffText);
                fileFindings.push({ filePath: f.filePath, findings });
            }

            const summary = buildSummary(fileFindings);

            // Build a prompt for Copilot CLI to perform the human-readable review locally (no external LLM call).
            const copilotPrompt = {
                role: 'system',
                instruction: 'You are a senior engineer and reviewer. Use repository context and diffs provided to create a prioritized, actionable code review. For each finding include: 1) short title, 2) severity (error/warning/info), 3) description, 4) suggested fix, 5) suggested PR comment in markdown (1-3 lines). Finish with an overall recommendation (approve / changes requested) and a concise must-fix checklist.',
                summary,
                fileFindings
            };

            // Return the structured findings plus a Copilot prompt so the Copilot CLI session can consume this and run an internal review and comment flow.
            return { status: 'reviewed', pullRequestId, summary, fileFindings, copilotPrompt };
        } catch (err) {
            return { status: 'error', pullRequestId, message: err.message };
        }
    },
    async comment_pr({ project, repoSlug, pullRequestId, comment }) {
        return bitbucketRequest(`/projects/${project}/repos/${repoSlug}/pull-requests/${pullRequestId}/comments`, 'POST', { text: comment });
    },
    async comment_line({ project, repoSlug, pullRequestId, filePath, lineNumber, comment, lineType, severity }) {
        const parsedLine = Number(lineNumber);
        return bitbucketRequest(`/projects/${project}/repos/${repoSlug}/pull-requests/${pullRequestId}/comments`, 'POST', {
            text: comment,
            anchor: { fileType: 'TO', path: filePath, line: parsedLine, lineType, severity }
        });
    },
    async get_file_content({ project, repoSlug, pullRequestId, filePath, side }) {
        const normalizedSide = String(side || '').toUpperCase();
        if (normalizedSide !== 'FROM' && normalizedSide !== 'TO') {
            throw new Error('side must be FROM or TO');
        }

        const pr = await module.exports.get_pr_details({ project, repoSlug, pullRequestId });
        const commit = normalizedSide === 'FROM'
            ? pr && pr.fromRef && pr.fromRef.latestCommit
            : pr && pr.toRef && pr.toRef.latestCommit;

        if (!commit) {
            throw new Error(`Could not resolve ${normalizedSide} commit for pull request ${pullRequestId}`);
        }

        const encodedPath = String(filePath)
            .split('/')
            .map((segment) => encodeURIComponent(segment))
            .join('/');

        return bitbucketRequest(
            `/projects/${project}/repos/${repoSlug}/raw/${encodedPath}?at=${encodeURIComponent(commit)}`,
            'GET',
            null,
            { rawResponse: true, accept: '*/*' }
        );
    },
    async get_single_file_diff({ project, repoSlug, pullRequestId, filePath }) {
        return bitbucketRequest(`/projects/${project}/repos/${repoSlug}/pull-requests/${pullRequestId}/diff/${filePath}`);
    },
    async get_pr_activities({ project, repoSlug, pullRequestId }) {
        return bitbucketRequest(`/projects/${project}/repos/${repoSlug}/pull-requests/${pullRequestId}/activities`);
    },
    // Add Jira integration as needed
};
