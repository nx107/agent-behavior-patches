# Security Policy

## Supported versions

This repository is a local v0.1 implementation and has no published release. Security fixes target the current default branch once the project is public.

## Reporting a vulnerability

Do not open a public issue for a vulnerability or include secrets, private traces, exploit payloads, or personal data in a report. Once the repository is public, use GitHub's private vulnerability reporting for `nx107/agent-behavior-patches`. Until then, retain the report privately and contact the maintainer through a private channel already known to you.

Include the affected version, minimal reproduction, impact, and suggested mitigation. You can expect acknowledgment within seven days after a private report is received. No response-time guarantee applies before a public reporting channel exists.

## Trust boundaries

ABP treats patch Markdown, YAML, JSON, fixture command text, and output summaries as untrusted data. The v0.1 verifier parses and compares these values but does not execute them. Linked instructions and fixtures must satisfy lexical and resolved (`realpath`) containment, so a symbolic link cannot redirect validation or evaluation outside the patch directory. Schemas reject undeclared keys, and JSON output does not include environment variables.

The verifier's success statuses are fixed to `success` and `verified`; patch metadata cannot weaken the policy. A command ID may have only one start and one result, and accepted evidence requires an earlier same-revision `task_snapshot`. CLI result output is confined to the patch's direct `results/*.json` children and refuses symbolic-link or hard-linked targets and input-file destinations. Structured JSON and YAML inputs are capped at 8 MiB per file before parsing.

A report is security-sensitive if it demonstrates:

- command or code execution caused by validation or evaluation;
- path traversal outside the patch directory;
- unsafe deserialization or prototype mutation;
- secrets or home/environment data leaking into generated results;
- a schema bypass that changes verifier meaning;
- denial of service with reasonably sized repository inputs.

## Out of scope

The verifier cannot establish that an external harness truthfully captured events or that a test command covers a change. Those are provenance and harness-integrity concerns, not claims made by v0.1. Do not test third-party systems or submit real user traces.
