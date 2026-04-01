const JiraHelper = require('./jiraHelper');

function parseArgs(argv) {
  const args = {};

  for (let index = 0; index < argv.length; index += 1) {
    const token = argv[index];
    if (!token.startsWith('--')) {
      continue;
    }

    const key = token.slice(2);
    const next = argv[index + 1];
    if (!next || next.startsWith('--')) {
      args[key] = true;
      continue;
    }

    args[key] = next;
    index += 1;
  }

  return args;
}

function normalizeText(value) {
  if (!value) {
    return '';
  }

  if (typeof value === 'string') {
    return value.trim();
  }

  if (Array.isArray(value)) {
    return value.map((entry) => normalizeText(entry)).filter(Boolean).join('\n').trim();
  }

  if (typeof value === 'object') {
    const parts = [];

    if (typeof value.text === 'string') {
      parts.push(value.text);
    }

    if (Array.isArray(value.content)) {
      const childText = value.content
        .map((entry) => normalizeText(entry))
        .filter(Boolean)
        .join(value.type === 'paragraph' ? '' : '\n');

      if (childText) {
        parts.push(childText);
      }
    }

    return parts.join('\n').trim();
  }

  return String(value).trim();
}

function hasAcceptanceCriteria(issueDetails) {
  return Boolean(issueDetails.acceptanceCriteria && issueDetails.acceptanceCriteria.trim());
}

function hasValidationText(description) {
  return /(^|\n)validation\s*:/i.test(description || '');
}

function isCompleted(status) {
  return ['done', 'closed', 'resolved'].includes((status || '').trim().toLowerCase());
}

function makeCheck(label, status, details = null) {
  return { label, status, details };
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const issueKey = args.key || args.issue || args._;

  if (!issueKey) {
    throw new Error('Provide --key ISSUE-12345');
  }

  const jira = new JiraHelper(args.domain, args.token || process.env.JIRA_TOKEN || process.env.PERSONAL_TOKEN);
  const fields = [
    'summary',
    'description',
    'status',
    'issuetype',
    'project',
    'labels',
    'assignee',
    'components',
    'fixVersions',
    'timetracking',
    'comment',
    'resolutiondate',
    'parent',
    'subtasks',
    'issuelinks',
  ];

  const issue = await jira.getIssue(issueKey, fields);
  const issueDetails = await jira.getIssueDetails(issueKey, { fields });
  const rawFields = issue.fields || {};

  const description = issueDetails.description || '';
  const components = Array.isArray(rawFields.components) ? rawFields.components.map((entry) => normalizeText(entry.name)).filter(Boolean) : [];
  const fixVersions = Array.isArray(rawFields.fixVersions) ? rawFields.fixVersions.map((entry) => normalizeText(entry.name)).filter(Boolean) : [];
  const labels = Array.isArray(rawFields.labels) ? rawFields.labels : [];
  const comments = rawFields.comment && Array.isArray(rawFields.comment.comments) ? rawFields.comment.comments : [];
  const timeTracking = rawFields.timetracking || {};
  const hasTimeLogging = Boolean(timeTracking.timeSpentSeconds || timeTracking.timeSpent || timeTracking.remainingEstimate || timeTracking.originalEstimate);
  const done = isCompleted(issueDetails.status);
  const staleDescription = !description || description.length < 20;
  const validationOnly = hasValidationText(description) && !hasAcceptanceCriteria(issueDetails);

  const checks = [
    makeCheck('Status is set', issueDetails.status ? 'pass' : 'fail', issueDetails.status || 'Missing status'),
    makeCheck('Component is set', components.length > 0 ? 'pass' : 'fail', components.length > 0 ? components.join(', ') : 'No component set'),
    makeCheck('Fix Version is set', fixVersions.length > 0 ? 'pass' : 'fail', fixVersions.length > 0 ? fixVersions.join(', ') : 'No fix version set'),
    makeCheck('Time logging is present', hasTimeLogging ? 'pass' : 'warn', hasTimeLogging ? (timeTracking.timeSpent || timeTracking.originalEstimate || 'Logged') : 'No time tracking values found'),
    makeCheck('Description is populated', description ? 'pass' : 'fail', description || 'Description missing'),
    makeCheck('Description is not obviously stale', !staleDescription ? 'pass' : 'warn', !staleDescription ? 'Description has substantive content' : 'Description is very short and may be stale'),
    makeCheck('Acceptance Criteria are present in the description or AC field', hasAcceptanceCriteria(issueDetails) ? 'pass' : 'fail', hasAcceptanceCriteria(issueDetails) ? `Source: ${issueDetails.acceptanceCriteriaSource}` : 'No acceptance criteria found'),
    makeCheck('Acceptance Criteria are not comment-only', hasAcceptanceCriteria(issueDetails) ? 'pass' : 'warn', hasAcceptanceCriteria(issueDetails) ? `Source: ${issueDetails.acceptanceCriteriaSource}` : `${comments.length} comment(s) exist, but no AC found in description or AC field`),
    makeCheck('Description is more than validation-only text', !validationOnly ? 'pass' : 'warn', !validationOnly ? 'Description includes more than a validation note' : 'Validation text exists, but no explicit AC were found'),
    makeCheck('Labels are justified', labels.length <= 1 ? 'pass' : 'warn', labels.length > 0 ? labels.join(', ') : 'No labels'),
    makeCheck('Completed ticket release date safety', !done ? 'pass' : 'warn', !done ? 'Ticket is not completed' : `Completed ticket with resolution date ${rawFields.resolutiondate || 'unknown'}`),
  ];

  const summary = {
    key: issueDetails.key,
    url: issueDetails.url,
    summary: issueDetails.summary,
    issueType: issueDetails.issueType,
    status: issueDetails.status,
    assignee: issueDetails.assignee,
    component: components,
    fixVersions,
    labels,
    acceptanceCriteriaSource: issueDetails.acceptanceCriteriaSource,
    checks,
  };

  process.stdout.write(`${JSON.stringify(summary, null, 2)}\n`);
}

main().catch((error) => {
  process.stderr.write(`${error.message}\n`);
  process.exitCode = 1;
});