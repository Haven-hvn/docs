# Corbell Graph Summary

> Workspace: `haven-platform` (root `..`), generated 2026-08-13.
> DB: `corbell-data/.corbell/workspace.db` (SQLite 460K).

## workspace.yaml

```yaml
version: "1"

workspace:
  name: "haven-platform"
  root: ".."

services:
  - id: haven-aol
    repo: ../haven-aol
    language: python
    tags: [core, icp-canister, vetkd, cryptography, decoupled]
  - id: haven-dapp
    repo: ../haven-dapp
    language: typescript
    tags: [frontend, nextjs, web3, decoupled]
  - id: haven-cli
    repo: ../haven-cli
    language: python
    tags: [cli, tui, tooling, decoupled]
  - id: haven-mobile
    repo: ../haven-mobile
    language: typescript
    tags: [mobile, react-native, decoupled]

existing_docs:
  auto_scan: true
  paths: []
  patterns:
    - "*.design.md"
    - "*-spec.md"
    - "RFC-*.md"
    - "ADR-*.md"
    - "DESIGN.md"

storage:
  graph:
    backend: sqlite
    path: .corbell/workspace.db
  embeddings:
    backend: sqlite
    path: .corbell/workspace.db
  model: all-MiniLM-L6-v2

spec:
  output_dir: specs/
  template: default

integrations:
  notion:
    token: ${CORBELL_NOTION_TOKEN}
    parent_page_id: ${CORBELL_NOTION_PAGE_ID}
  linear:
    api_key: ${CORBELL_LINEAR_API_KEY}
    team_id: ${CORBELL_LINEAR_TEAM_ID}
    default_project_id: ${CORBELL_LINEAR_PROJECT_ID}
  jira:
    url: ${CORBELL_JIRA_URL}
    email: ${CORBELL_JIRA_EMAIL}
    api_token: ${CORBELL_JIRA_API_TOKEN}
    project_key: ${CORBELL_JIRA_PROJECT_KEY}
    issue_type: Task

llm:
  provider: anthropic
  model: claude-sonnet-4-5
  api_key: ${ANTHROPIC_API_KEY}
  context_budget: 100000
```

## graph build

```
  ✓ haven-dapp  →  /root/haven-dapp
  ✓ haven-cli  →  /root/haven-cli
  ✓ haven-mobile  →  /root/haven-mobile

✓ Graph built:
  Services  : 4
  Datastores: 1
  Queues    : 0
  Methods   : 0
  Edges     : 6
```

## graph services

```
/root/Corbell/corbell/core/workspace.py:246: UserWarning: Environment variable 'CORBELL_JIRA_URL' is referenced in workspace.yaml but is not set.
  return {k: _expand_env(v) for k, v in value.items()}
/root/Corbell/corbell/core/workspace.py:246: UserWarning: Environment variable 'CORBELL_JIRA_EMAIL' is referenced in workspace.yaml but is not set.
  return {k: _expand_env(v) for k, v in value.items()}
/root/Corbell/corbell/core/workspace.py:246: UserWarning: Environment variable 'CORBELL_JIRA_API_TOKEN' is referenced in workspace.yaml but is not set.
  return {k: _expand_env(v) for k, v in value.items()}
/root/Corbell/corbell/core/workspace.py:246: UserWarning: Environment variable 'CORBELL_JIRA_PROJECT_KEY' is referenced in workspace.yaml but is not set.
  return {k: _expand_env(v) for k, v in value.items()}
/root/Corbell/corbell/core/workspace.py:246: UserWarning: Environment variable 'ANTHROPIC_API_KEY' is referenced in workspace.yaml but is not set.
  return {k: _expand_env(v) for k, v in value.items()}
                                    Services                                    
┏━━━━━━━━━━━━━━┳━━━━━━━━━━━━┳━━━━━━━━━┳━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━┓
┃ ID           ┃ Language   ┃ Type    ┃ Tags                                   ┃
┡━━━━━━━━━━━━━━╇━━━━━━━━━━━━╇━━━━━━━━━╇━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━┩
│ haven-aol    │ python     │ service │ core, icp-canister, vetkd,             │
│              │            │         │ cryptography, decoupled                │
│ haven-dapp   │ typescript │ service │ frontend, nextjs, web3, decoupled      │
│ haven-cli    │ python     │ service │ cli, tui, tooling, decoupled           │
│ haven-mobile │ typescript │ service │ mobile, react-native, decoupled        │
└──────────────┴────────────┴─────────┴────────────────────────────────────────┘
```

## Notes

- `haven-aol` scanned as `python` (language enum limitation); real primary is Motoko.
- Embeddings: `corbell embeddings build` pending (requires `sentence-transformers`); template specs already materialized under `architecture/`.
- Re-run: `corbell graph build --methods` with `pip install "corbell[treesitter]"` for typed signatures + call edges.

