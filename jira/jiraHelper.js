const https = require('https');

const DEFAULT_DOMAIN = process.env.JIRA_DOMAIN || 'jira.cambiumnetworks.com';
const DEFAULT_TOKEN = process.env.JIRA_TOKEN || process.env.PERSONAL_TOKEN || null;
const ACCEPTANCE_CRITERIA_FIELD_CANDIDATES = [
  'Acceptance Criteria',
  'Acceptance criteria',
  'Acceptance Criteria (Text)',
];
const ROOT_CAUSE_FIELD_IDS = [
  'customfield_12415',
];


/**
 * Jira Query Helper
 * Provides methods to interact with Jira REST API
 */
class JiraHelper {
  constructor(domain = DEFAULT_DOMAIN, token = DEFAULT_TOKEN) {
    if (!token) {
      throw new Error('Missing Jira token. Set JIRA_TOKEN or PERSONAL_TOKEN in the environment.');
    }

    this.domain = domain;
    this.token = token;
    this.baseURL = `https://${domain}`;
    this.authHeader = `Bearer ${token}`;
    this.apiVersion = '2';
    this.fieldsMetadataPromise = null;
  }

  request(method, path, data = null) {
    return new Promise((resolve, reject) => {
      const options = {
        hostname: this.domain,
        path,
        method,
        headers: {
          Authorization: this.authHeader,
          Accept: 'application/json',
          'Content-Type': 'application/json',
        },
      };

      const req = https.request(options, (res) => {
        let responseData = '';

        res.on('data', (chunk) => {
          responseData += chunk;
        });

        res.on('end', () => {
          if (res.statusCode >= 400) {
            reject(new Error(`Jira API error: ${res.statusCode} - ${responseData}`));
            return;
          }

          try {
            resolve(JSON.parse(responseData));
          } catch (error) {
            resolve(responseData);
          }
        });
      });

      req.on('error', (error) => {
        reject(error);
      });

      if (data) {
        req.write(JSON.stringify(data));
      }

      req.end();
    });
  }

  async searchIssues(jql, options = {}) {
    const acceptanceCriteriaFields = options.includeAcceptanceCriteria
      ? await this.resolveAcceptanceCriteriaFieldIds()
      : [];

    const params = {
      jql,
      maxResults: options.maxResults || 50,
      startAt: options.startAt || 0,
      fields: options.fields || [
        'summary',
        'status',
        'assignee',
        'priority',
        'issuetype',
        'description',
        ...acceptanceCriteriaFields,
      ],
    };

    const queryParams = Object.entries(params)
      .map(([key, value]) => {
        if (Array.isArray(value)) {
          return value.map((entry) => `${key}=${encodeURIComponent(entry)}`).join('&');
        }

        return `${key}=${encodeURIComponent(value)}`;
      })
      .join('&');

    return this.request('GET', `/rest/api/${this.apiVersion}/search?${queryParams}`);
  }

  async getIssue(issueKey, fields = null) {
    let path = `/rest/api/${this.apiVersion}/issue/${issueKey}`;

    if (fields && fields.length > 0) {
      const fieldParams = fields.map((field) => `fields=${encodeURIComponent(field)}`).join('&');
      path += `?${fieldParams}`;
    }

    return this.request('GET', path);
  }

  async getFieldsMetadata() {
    if (!this.fieldsMetadataPromise) {
      this.fieldsMetadataPromise = this.request('GET', `/rest/api/${this.apiVersion}/field`);
    }

    return this.fieldsMetadataPromise;
  }

  async resolveAcceptanceCriteriaFieldIds() {
    const configuredIds = (process.env.JIRA_ACCEPTANCE_CRITERIA_FIELDS || '')
      .split(',')
      .map((entry) => entry.trim())
      .filter(Boolean);

    if (configuredIds.length > 0) {
      return configuredIds;
    }

    const fields = await this.getFieldsMetadata();
    return fields
      .filter((field) => ACCEPTANCE_CRITERIA_FIELD_CANDIDATES.includes(field.name))
      .map((field) => field.id);
  }

  async resolveRootCauseFieldIds() {
    const configuredIds = (process.env.JIRA_ROOT_CAUSE_FIELDS || '')
      .split(',')
      .map((entry) => entry.trim())
      .filter(Boolean);

    if (configuredIds.length > 0) {
      return configuredIds;
    }

    return ROOT_CAUSE_FIELD_IDS;
  }

  normalizeText(value) {
    if (!value) {
      return '';
    }

    if (typeof value === 'string') {
      return value.trim();
    }

    if (Array.isArray(value)) {
      return value
        .map((entry) => this.normalizeText(entry))
        .filter(Boolean)
        .join('\n')
        .trim();
    }

    if (typeof value === 'object') {
      const parts = [];

      if (typeof value.text === 'string') {
        parts.push(value.text);
      }

      if (Array.isArray(value.content)) {
        const childText = value.content
          .map((entry) => this.normalizeText(entry))
          .filter(Boolean)
          .join(value.type === 'paragraph' ? '' : '\n');

        if (childText) {
          parts.push(childText);
        }
      }

      if (Array.isArray(value.items)) {
        const listText = value.items
          .map((entry) => this.normalizeText(entry))
          .filter(Boolean)
          .join('\n');

        if (listText) {
          parts.push(listText);
        }
      }

      return parts.join('\n').trim();
    }

    return String(value).trim();
  }

  extractAcceptanceCriteriaFromDescription(description) {
    if (!description) {
      return null;
    }

    const normalized = description.replace(/\r\n/g, '\n');
    const headingMatch = normalized.match(/(^|\n)#{0,6}\s*Acceptance Criteria\s*:?\s*\n([\s\S]*?)(?=\n#{1,6}\s+|$)/i);
    if (headingMatch && headingMatch[2].trim()) {
      return headingMatch[2].trim();
    }

    const inlineMatch = normalized.match(/Acceptance Criteria\s*:\s*([\s\S]+)/i);
    if (inlineMatch && inlineMatch[1].trim()) {
      return inlineMatch[1].trim();
    }

    return null;
  }

  async extractAcceptanceCriteria(issue) {
    const criteriaFieldIds = await this.resolveAcceptanceCriteriaFieldIds();

    for (const fieldId of criteriaFieldIds) {
      const value = this.normalizeText(issue.fields[fieldId]);
      if (value) {
        return {
          source: fieldId,
          text: value,
        };
      }
    }

    const description = this.normalizeText(issue.fields.description);
    const fromDescription = this.extractAcceptanceCriteriaFromDescription(description);
    if (fromDescription) {
      return {
        source: 'description',
        text: fromDescription,
      };
    }

    return {
      source: null,
      text: null,
    };
  }

  async getIssueDetails(issueKey, options = {}) {
    const acceptanceCriteriaFields = await this.resolveAcceptanceCriteriaFieldIds();
    const fields = Array.from(new Set([
      'summary',
      'description',
      'status',
      'issuetype',
      'project',
      'labels',
      'assignee',
      ...acceptanceCriteriaFields,
      ...(options.fields || []),
    ]));

    const issue = await this.getIssue(issueKey, fields);
    const acceptanceCriteria = await this.extractAcceptanceCriteria(issue);

    return {
      key: issue.key,
      summary: this.normalizeText(issue.fields.summary),
      description: this.normalizeText(issue.fields.description),
      acceptanceCriteria: acceptanceCriteria.text,
      acceptanceCriteriaSource: acceptanceCriteria.source,
      status: issue.fields.status ? this.normalizeText(issue.fields.status.name) : null,
      issueType: issue.fields.issuetype ? this.normalizeText(issue.fields.issuetype.name) : null,
      project: issue.fields.project ? this.normalizeText(issue.fields.project.key) : null,
      assignee: issue.fields.assignee
        ? this.normalizeText(issue.fields.assignee.displayName || issue.fields.assignee.name)
        : null,
      labels: Array.isArray(issue.fields.labels) ? issue.fields.labels : [],
      url: `${this.baseURL}/browse/${issue.key}`,
      raw: issue,
    };
  }

  async createIssue(issueData) {
    // Always assign created issues to jja100 per skill requirement
    const fields = Object.assign({}, issueData, {
      assignee: { name: 'jja100' },
    });

    return this.request('POST', `/rest/api/${this.apiVersion}/issue`, { fields });
  }

  async updateIssue(issueKey, updateData) {
    // Detect and prevent double-wrapping of { fields: ... }
    // Users should pass field objects directly, not wrapped in { fields: ... }
    if (updateData && typeof updateData === 'object' && updateData.fields && !updateData.update) {
      console.warn(`⚠️  updateIssue: updateData appears to already be wrapped in { fields: ... }. The method automatically adds this wrapper. Unwrapping for you...`);
      updateData = updateData.fields;
    }

    // Also detect mistaken { update: ... } format (which is for /transitions)
    if (updateData && typeof updateData === 'object' && updateData.update && !updateData.fields) {
      throw new Error(
        `❌ updateIssue: updateData appears to use { update: ... } format (used for transitions or bulk operations). ` +
        `For simple field updates, pass field objects directly like: { customfield_12415: "value", summary: "..." }`
      );
    }

    return this.request('PUT', `/rest/api/${this.apiVersion}/issue/${issueKey}`, { fields: updateData });
  }

  async addComment(issueKey, comment) {
    return this.request('POST', `/rest/api/${this.apiVersion}/issue/${issueKey}/comment`, { body: comment });
  }

  async getProjects() {
    return this.request('GET', `/rest/api/${this.apiVersion}/project`);
  }

  async getProject(projectKey) {
    return this.request('GET', `/rest/api/${this.apiVersion}/project/${projectKey}`);
  }

  async getIssueTypes(projectKey) {
    const project = await this.getProject(projectKey);
    return project.issueTypes || [];
  }

  async assignIssue(issueKey, userIdentifier) {
    return this.request('PUT', `/rest/api/${this.apiVersion}/issue/${issueKey}`, {
      fields: {
        assignee: {
          name: userIdentifier,
        },
      },
    });
  }

  async transitionIssue(issueKey, transitionId, transitionData = {}) {
    return this.request('POST', `/rest/api/${this.apiVersion}/issue/${issueKey}/transitions`, {
      transition: { id: transitionId },
      ...transitionData,
    });
  }

  async getTransitions(issueKey) {
    const response = await this.request('GET', `/rest/api/${this.apiVersion}/issue/${issueKey}/transitions`);
    return response.transitions || [];
  }

  async getUsers() {
    return this.request('GET', `/rest/api/${this.apiVersion}/user/search?username=.`);
  }
}

module.exports = JiraHelper;