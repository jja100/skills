---
name: pr-agent
user-invocable: true
description: 'Skill for BitBucket PR and Jira management via MCP, no separate npm install required.'
license: MIT
---

# PrAgent Skill



This skill provides BitBucket pull request and Jira management tools as a skill. All logic is implemented in the following scripts:

- `/root/.copilot/skills/pr-agent/prAgent.js`: Bitbucket PR management (review, comment, title/description update, file/diff, activities)
- `/root/.copilot/skills/pr-agent/jiraAgent.js`: Jira ticket fetch and search helpers

## CLI Usage

You can invoke PR actions directly from the command line, similar to the Jira skill:

```bash
# Review a PR
node /root/.copilot/skills/pr-agent/reviewPR.js --project MYPROJECT --repoSlug my-repo --pullRequestId 123

# Comment on a PR
node /root/.copilot/skills/pr-agent/commentPR.js --project MYPROJECT --repoSlug my-repo --pullRequestId 123 --comment "Looks good!"

# Get PR details (includes current title/description)
node /root/.copilot/skills/pr-agent/getPRDetails.js --project MYPROJECT --repoSlug my-repo --pullRequestId 123

# Update PR title only
node /root/.copilot/skills/pr-agent/updatePR.js --project MYPROJECT --repoSlug my-repo --pullRequestId 123 --title "New PR title"

# Update PR description with inline text (single line or safely quoted)
node /root/.copilot/skills/pr-agent/updatePR.js --project MYPROJECT --repoSlug my-repo --pullRequestId 123 --description "Updated PR description"

# Update PR description from a markdown/text file (recommended for multiline content)
node /root/.copilot/skills/pr-agent/updatePR.js --project MYPROJECT --repoSlug my-repo --pullRequestId 123 --description-file /tmp/pr-description.md

# Update PR description from stdin (recommended for generated content)
cat /tmp/pr-description.md | node /root/.copilot/skills/pr-agent/updatePR.js --project MYPROJECT --repoSlug my-repo --pullRequestId 123 --description-stdin

# Update both title and description file in one command
node /root/.copilot/skills/pr-agent/updatePR.js --project MYPROJECT --repoSlug my-repo --pullRequestId 123 --title "New PR title" --description-file /tmp/pr-description.md

# Create a new PR (title + refs required)
node /root/.copilot/skills/pr-agent/createPR.js --project MYPROJECT --repoSlug my-repo --title "ABC-1234 Fix sample issue" --fromRef feature/ABC-1234-fix --toRef release/main --description "PR description"

# Create PR with multiline description from file
node /root/.copilot/skills/pr-agent/createPR.js --project MYPROJECT --repoSlug my-repo --title "ABC-1234 Fix sample issue" --fromRef feature/ABC-1234-fix --toRef release/main --description-file /tmp/pr-description.md

# Get PR changes
node /root/.copilot/skills/pr-agent/getPRChanges.js --project MYPROJECT --repoSlug my-repo --pullRequestId 123

# Get PR activities
node /root/.copilot/skills/pr-agent/getPRActivities.js --project MYPROJECT --repoSlug my-repo --pullRequestId 123

# Get single file diff
node /root/.copilot/skills/pr-agent/getFileDiff.js --project MYPROJECT --repoSlug my-repo --pullRequestId 123 --filePath src/index.js

# Get file content
node /root/.copilot/skills/pr-agent/getFileContent.js --project MYPROJECT --repoSlug my-repo --pullRequestId 123 --filePath src/index.js --side TO

# Post a line comment
node /root/.copilot/skills/pr-agent/commentLine.js --project MYPROJECT --repoSlug my-repo --pullRequestId 123 --filePath src/index.js --lineNumber 42 --comment "Check this line"
```

All scripts output JSON to stdout and errors to stderr. Required arguments are validated and must be provided as shown above.

For `updatePR.js`:
- Required: `--project`, `--repoSlug`, `--pullRequestId`
- At least one update field is required: `--title` or one description source
- Description sources are mutually exclusive: use only one of `--description`, `--description-file`, or `--description-stdin`
- Both `--flag value` and `--flag=value` formats are accepted

## Usage
Set the following environment variables for authentication:
- `BITBUCKET_TOKEN` (required for Bitbucket)
- `JIRA_TOKEN` (required for Jira)
---

## Features

- Pull Request Management: Get PR details, changes, activities
- Pull Request Updates: Update PR title and description
- Code Review: AI-powered PR review
- Comment System: Post general and line-specific comments
- File Operations: Get file content and diffs
- Jira Integration: Fetch, analyze, and implement Jira tickets

## Usage

Invoke this skill to:
- Review BitBucket pull requests
- Fetch PR details (title, description, status, etc.)
- Update PR title and description
- Post comments or inline comments
- Fetch PR changes, activities, or file diffs
- Integrate with Jira for ticket intake, implementation, and test case generation

## Example

```
# Review a PR
pr-agent.review_pr({ project: 'MYPROJECT', repoSlug: 'my-repo', pullRequestId: 123 })

# Comment on a PR
pr-agent.comment_pr({ project: 'MYPROJECT', repoSlug: 'my-repo', pullRequestId: 123, comment: 'Looks good!' })
```
