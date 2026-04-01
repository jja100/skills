---
name: review
description: 'This skill reviews the recent edits and suggests code changes to remove the onboard controller API and related code.'
license: MIT
---

# Code Review Checklist

A comprehensive checklist of commonly missed items derived from recurring bugs and review feedback in this codebase. Use this before raising a PR.

---

## API Design & Conventions

- [ ] HTTP method matches the operation: `POST` for create, `PUT`/`PATCH` for update, `DELETE` for delete — not interchangeable
- [ ] New API fields are included in both the request **and** response schemas (not silently ignored)
- [ ] API field names are consistent between the request payload, response body, and database column/field names
- [ ] Setting a field to `null` in a PUT/PATCH request actually **removes** the value rather than being ignored
- [ ] Pagination: `limit=0` is handled explicitly — returns empty or a capped default, never all records
- [ ] API endpoints that call downstream device/data APIs pass `limit` explicitly (not relying on defaults that return unbounded results)
- [ ] Signed URLs generated in API responses are valid and point to the correct resource

---

## Input Validation

- [ ] Required fields are validated server-side (not only in the UI)
- [ ] Numeric fields have min/max range checks (e.g. percentages capped at 100, port numbers within valid range)
- [ ] String fields have maximum length validation applied and enforced
- [ ] Fields that must be a specific type (e.g. VLAN must be a number) reject non-conforming input with a clear error
- [ ] Optional fields missing from the payload get a sensible default value, not an empty string or `undefined`
- [ ] Null/empty field handling: missing optional fields do not cause downstream `Cannot read properties of undefined` errors

---

## Naming & Consistency

- [ ] Field/property names follow the existing naming convention in the module (camelCase, snake_case, etc.)
- [ ] No new abbreviations or aliases introduced for fields that already have a canonical name elsewhere
- [ ] Audit log action descriptions accurately describe the operation (e.g. "CSV export" not "voucher export")
- [ ] Event notification messages are complete and do not contain `undefined`, `object Object`, or raw internal keys
- [ ] UI labels match API field names and documentation

---

## Delete / Remove Operations

- [ ] Deleting a parent resource cleans up or un-blocks dependent child resources (e.g. deleting a subscriber unblocks AP-group selection)
- [ ] Deleting a profile/config does not push an "unknown" or corrupt config to devices — a safe default is applied instead
- [ ] Unlink / remove operations work correctly and do not report "resource does not exist" when the resource is present
- [ ] Bulk delete and single delete paths share the same validation and error handling logic

---

## Claim / Install / Onboarding Flows

- [ ] All fields are populated after a device is claimed: hostname, PCUID, claim time, installation summary fields
- [ ] App logos, branding, and display names update correctly on the second and subsequent saves (not only on first save)
- [ ] Device actions (reboot, site-scan, Wi-Fi optimise) work for devices under MCID, not just standalone devices
- [ ] Approval state is not left in "waiting for approval" after a successful failover or re-onboard

---

## Configuration & Overrides

- [ ] Subscriber/device overrides are applied in the correct priority order and do not corrupt underlying config values
- [ ] Admin passwords set via overrides are not truncated, escaped, or otherwise corrupted when pushed to the device
- [ ] Controller config files do not become corrupted after operations such as disabling wireless scan or applying overrides
- [ ] Enabling/disabling a feature flag (e.g. `enableSysMtu`) gates the actual config push — the value is not sent when the flag is off

---

## UI / Frontend

- [ ] Pages with large datasets (1000+ records) load within an acceptable time; API calls include appropriate `limit` and pagination
- [ ] Filters and search state are preserved when navigating between tabs or sub-pages, not silently reset
- [ ] Display values that are percentages, counts, or rates cannot exceed their logical maximum (e.g. no >100% CPU)
- [ ] Dropdowns and selectors do not show items from a different account/tenant/scope
- [ ] SSID security types, port types, and other enum-backed fields reflect the correct selected value in the UI after save

---

## Data Integrity & Database

- [ ] New collections or tables that require uniqueness have a unique index defined — not just application-level deduplication
- [ ] Old documents missing new fields (added in a later release) are handled gracefully via migration or null-safe queries
- [ ] Postgres/Mongo queries that filter on `src->'field'` include a `OR NULL` / `IS NULL` branch for documents created before the field existed

---

## Security

- [ ] New API endpoints are covered by the existing auth/role middleware — no endpoint is accidentally public
- [ ] Guest/restricted users cannot access or enumerate resources they don't own (test with a non-admin account)
- [ ] Credentials (passwords, tokens) are not logged, returned in error responses, or exposed in audit logs

---

## Testing & Edge Cases

- [ ] Unit tests cover the new validation logic, including boundary values and null inputs
- [ ] The bug/feature was reproduced and verified on the target server build, not only locally
- [ ] Related sibling features (e.g. template path vs device path for the same config field) are tested together, not in isolation

