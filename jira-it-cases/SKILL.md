---
name: jira-it-cases
description: 'Write manual IT test cases from Jira tickets. Use when asked to create integration test cases, UI test cases, TSV or spreadsheet-style QA coverage from Jira keys, related Jiras, acceptance criteria, screenshots, git commits, or current cnssng and cnmaestro behavior.'
argument-hint: 'Provide Jira key(s), repo or UI scope, and desired format such as TSV or Excel-style table'
user-invocable: true
---

# Jira IT Cases

Use this skill to turn one or more Jira tickets into manual IT test cases that match the implemented product behavior.

This skill is designed for requests such as:

- "Write IT cases for CNSSNG-49445"
- "Create TSV manual UI test cases for these related Jiras"
- "Use the Jira plus current behavior and screenshots to write QA cases"
- "Generate cnssng page manual validation cases for managedWifi, senior living, and outdoor living"

## Inputs

- One Jira key or a list of Jira keys
- Optional related Jira keys
- Repo or product scope such as `cnssng`, `cnmaestro-apps`, or a named page or feature
- Optional screenshots or UI notes
- Desired output format such as TSV, spreadsheet-style table, high-priority-only, SIT-only, or grouped by module
- Required environment: `JIRA_TOKEN` or `PERSONAL_TOKEN`

## Assets

- `/root/.copilot/skills/jira/jiraHelper.js`
- `/root/.copilot/skills/jira/fetchIssues.js`

## Workflow

1. Resolve the ticket set.
   Start with the Jira key or keys the user gave.
   If the user mentions related Jiras, include them explicitly.
   If the user says "similar" or "related" without listing them, fetch Jira links and commit references to expand the set.

2. Fetch live Jira details.
   Pull summary, status, issue type, description, and acceptance criteria for each Jira.
   Prefer dedicated acceptance criteria fields.
   If the acceptance criteria are missing, stale, or contradicted by later tickets, do not trust Jira blindly.

```bash
node /root/.copilot/skills/jira/fetchIssues.js --keys CNSSNG-49445,CNSSNG-51564
```

3. Map the implementation source of truth.
   Search git history for the Jira keys.
   Identify the files, modules, APIs, UI labels, and product surfaces touched by the ticket chain.
   If a ticket has no direct commit references, infer the implemented scope from related Jiras, code search, Swagger or API definitions, UI labels, tests, and screenshots.

4. Reconcile Jira against real behavior.
   Use the current codebase, visible UI labels, screenshots, tests, and commit history to determine what the feature actually does now.
   If Jira acceptance criteria are stale, write the IT cases against actual behavior, not outdated wording.
   Call out the mismatch in the response when it materially affects the test scope.

5. Decide the validation surface.
   Determine whether the request is for:

- manual UI testing
- API-level IT cases
- mixed UI and backend validation
- cnssng configuration page flows
- cnMaestro or MarketApp end-user flows

   If the user says "from UI", write manual UI cases only.
   If the user says "on cnssng page", focus on the cnssng admin or config UI rather than downstream apps.

6. Expand scope variants.
   If the feature must be validated across app flavors, roles, or contexts, include them explicitly.
   Typical variants include:

- managedWifi
- senior living
- outdoor living
- site level
- network level
- property level
- MSP account boundaries
- empty-state and disabled-state behavior

7. Build the test-case set.
   Cover the main user path first, then validations, edge cases, disabled states, persistence rules, and cross-scope behavior.
   Prefer manual, executable steps.
   Use concrete UI labels taken from the implemented product.

8. Format for QA consumption.
   Default to the user-requested output shape.
   For TSV output, include a header row and keep each field tab-separated.
   For manual cases with multiline steps, keep `Test Steps`, `Expected Result`, and sometimes `Preconditions` quoted so spreadsheet tools preserve line breaks.

## Output Formats

### TSV

Use this header unless the user asks for a different template:

```tsv
Test Case ID	Release	Test Case Description	Module(s) Involved	Preconditions	Test Steps	Expected Result	Actual Result	Status (Pass/Fail)	Test Data	Priority (High/Medium/Low)	Comments/Remarks
```

### Spreadsheet-style table

Use the same logical columns but render as Markdown when TSV is not requested.

## Decision Rules

- If the user asks for "manual" or "from UI", do not generate backend-only test cases unless the UI case requires backend verification.
- If multiple Jira tickets form a single feature chain, merge them into one coherent IT suite instead of duplicating cases per Jira.
- If one Jira supersedes another, use the later behavior as the final source of truth.
- If part of the earlier acceptance criteria was explicitly removed by a follow-up Jira, exclude that behavior from the test cases.
- If screenshots are provided, use them to align labels, layout names, tabs, and visible controls.
- If the current code contradicts Jira text, prefer current implemented behavior and mention the mismatch.
- If the feature spans multiple apps or product variants, include parity cases across each requested variant.
- If the user asks for "similar" output, keep the same style they just approved: same columns, same tone, same QA granularity, and the same TSV or Excel-friendly formatting.

## Quality Criteria

- Test cases are executable manually without guessing the UI path.
- UI labels match the implemented product language.
- Cases cover happy path, validation, disabled states, persistence, and scope boundaries where relevant.
- Cases avoid outdated or removed behavior from superseded Jira text.
- Output is directly usable by QA in TSV or spreadsheet form.
- If multiple apps are requested, coverage clearly states all required variants.

## Completion Checks

- Jira keys were fetched or their absence was explicitly handled.
- Related or follow-up Jiras that materially change behavior were accounted for.
- The final test suite reflects current behavior, not just the original Jira description.
- The requested format was followed exactly.
- The cases are grouped and prioritized in a way QA can execute.

## Example Prompts

- `/jira-it-cases CNSSNG-49445 manual UI IT cases in TSV`
- `/jira-it-cases CNSSNG-51564 CNSSNG-51394 CNSSNG-51625 CNSSNG-51828 for cnssng page across managedWifi, senior living, outdoor living`
- `/jira-it-cases Write only high-priority Site Monitoring manual cases for these Jiras`
- `/jira-it-cases Build spreadsheet-style IT cases from this Jira plus screenshots`