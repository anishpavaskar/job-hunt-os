# AGENTS.md

## Product goal
This repo is becoming a personal job-hunt operating system.
Primary outcome: help me identify, prioritize, apply to, and follow up on high-quality roles faster.

## MVP scope
Build a CLI-first MVP with:
- job ingestion
- normalization
- filtering
- scoring
- review/top picks
- application tracking
- follow-up reminders

## Rules
- Prefer editing existing files over creating unnecessary new ones
- Keep the architecture simple and local-first
- Use SQLite for persistence
- Keep commands small and composable
- Do not add frontend/UI unless explicitly asked
- Avoid overengineering abstractions
- Explain major file changes briefly after edits

## Desired folders
/src
  /commands
  /db
  /ingest
  /filter
  /score
/config
/data

## Commands we want
- scan
- review
- draft
- apply
- followups

## Quality bar
- code should run
- avoid placeholder comments when implementation is possible
- make minimal, high-confidence changes