---
name: jira
description: 'Use when you need Jira API access from the local workspace. Search issues, fetch acceptance criteria, inspect the latest Jira tickets from git history, audit a Jira ID against hygiene expectations, create or update issues, and drive implementation workflows.'
license: MIT
---

# Jira Helper

## Overview

JavaScript helper for Jira REST API. Requires `JIRA_TOKEN` or `PERSONAL_TOKEN` in the environment.

## When to Use

- Search or query issues with JQL
- Pull the latest Jira keys from repo history and resolve them to live Jira tickets
- Extract acceptance criteria from a dedicated Jira field or from the issue description
- Audit a Jira ID for hygiene fields like status, component, fix version, time logging, description quality, and acceptance criteria presence
- Create or update issues
- Get project details and issue types
- Manage assignments and transitions
- Add comments to issues

## Methods

- `searchIssues(jql, options)`
- `getIssue(issueKey, fields)`
- `getIssueDetails(issueKey)`
- `resolveAcceptanceCriteriaFieldIds()`
- `checkIssue.js --key ISSUE-12345` for checklist-style hygiene audit
- `createIssue(issueData)`
- `updateIssue(issueKey, updateData)`
- `addComment(issueKey, comment)`
- `getProjects()`
- `getProject(projectKey)`
- `getIssueTypes(projectKey)`
- `assignIssue(issueKey, accountId)`
- `getTransitions(issueKey)`
- `transitionIssue(issueKey, transitionId, data)`
- `getUsers()`

## CLI Usage

```bash
node /root/.copilot/skills/jira/fetchIssues.js --git-repo /home/cambium/cnssng --count 20
node /root/.copilot/skills/jira/fetchIssues.js --jql "project = CNSSNG ORDER BY updated DESC" --count 20
node /root/.copilot/skills/jira/fetchIssues.js --keys CNSSNG-51460,CNSSNG-51394
node /root/.copilot/skills/jira/checkIssue.js --key CNSSNG-51892
```

## Audit Output

The issue audit script returns JSON with:

- Jira key, summary, type, status, assignee, URL
- Component, fix version, and labels
- Acceptance criteria source when found
- Checklist results with `pass`, `warn`, or `fail`

Current checklist coverage includes:

- Status present
- Component set
- Fix Version set
- Time logging present
- Description populated
- Description not obviously stale
- Acceptance Criteria present in description or a dedicated AC field
- Acceptance Criteria not comment-only
- Description not limited to validation-only text
- Labels kept minimal
- Completed-ticket release-date safety reminder

## Recommended Use

Use `checkIssue.js` when a user asks to "check this Jira" or when you need a fast hygiene review for a single issue before implementation starts.

Use `fetchIssues.js` when you need to gather multiple tickets from JQL, explicit keys, or repo history.

## Environment

- `JIRA_TOKEN` or `PERSONAL_TOKEN` for Jira bearer auth
- `JIRA_DOMAIN` optionally overrides the default `jira.cambiumnetworks.com`
- `JIRA_ACCEPTANCE_CRITERIA_FIELDS` optionally provides comma-separated Jira field ids for acceptance criteria