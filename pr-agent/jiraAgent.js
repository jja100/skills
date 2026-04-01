// jiraAgent.js
// Minimal Jira integration for the pr-agent skill
// No external npm install required


const https = require('https');
const http = require('http');

const JIRA_BASE_URL = process.env.JIRA_BASE_URL || 'https://jira.cambiumnetworks.com';
const JIRA_TOKEN = process.env.JIRA_TOKEN;

function getJiraAuthHeader() {
    if (!JIRA_TOKEN) throw new Error('JIRA_TOKEN env var required');
    return { 'Authorization': `Bearer ${JIRA_TOKEN}` };
}


function jiraRequest(path, method = 'GET', body = null) {
    return new Promise((resolve, reject) => {
        const urlObj = new URL(`${JIRA_BASE_URL}/rest/api/2${path}`);
        const isHttps = urlObj.protocol === 'https:';
        const lib = isHttps ? https : http;
        const options = {
            method,
            hostname: urlObj.hostname,
            port: urlObj.port || (isHttps ? 443 : 80),
            path: urlObj.pathname + urlObj.search,
            headers: {
                'Content-Type': 'application/json',
                ...getJiraAuthHeader(),
            },
        };
        const req = lib.request(options, (res) => {
            let data = '';
            res.on('data', (chunk) => { data += chunk; });
            res.on('end', () => {
                if (res.statusCode < 200 || res.statusCode >= 300) {
                    return reject(new Error(`Jira API error: ${res.statusCode} ${res.statusMessage}`));
                }
                try {
                    resolve(JSON.parse(data));
                } catch (e) {
                    reject(new Error('Failed to parse Jira response as JSON'));
                }
            });
        });
        req.on('error', reject);
        if (body) {
            req.write(JSON.stringify(body));
        }
        req.end();
    });
}

module.exports = {
    async fetch_issue({ issueKey }) {
        return jiraRequest(`/issue/${issueKey}`);
    },
    async fetch_issues({ jql, maxResults = 20 }) {
        return jiraRequest(`/search?jql=${encodeURIComponent(jql)}&maxResults=${maxResults}`);
    },
    // Add more Jira helpers as needed
};
