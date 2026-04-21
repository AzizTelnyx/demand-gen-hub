name: abm-builder-research
description: |
  ABM Builder research pipeline — find real companies matching criteria.
  Interpret → Search → Enrich → Score → Validate → Commit.
  Only 2 steps use LLM (interpret + validate edge cases).
  Everything else is deterministic API calls via thin Python scripts.
  Shared functions imported from abm_builder_lib.py.

  Usage: lobster run --mode tool --file workflows/abm-builder-research.lobster
  Args: --brief "Find AI agent companies in APAC"

steps:
  - id: interpret
    command: cd /Users/azizalsinafi/.openclaw/workspace/demand-gen-hub && /opt/homebrew/bin/python3 scripts/abm-builder-interpret.py --brief "$BRIEF"
    description: AI interprets research brief → structured search criteria (Gemini Flash)

  - id: search
    command: cd /Users/azizalsinafi/.openclaw/workspace/demand-gen-hub && /opt/homebrew/bin/python3 scripts/abm-builder-search.py --criteria-json '$interpret.result'
    description: Brave web search — find real company domains matching criteria

  - id: enrich
    command: cd /Users/azizalsinafi/.openclaw/workspace/demand-gen-hub && /opt/homebrew/bin/python3 scripts/abm-builder-enrich.py --domains-json '$search.result'
    description: Clearbit firmographics enrichment for discovered domains

  - id: score
    command: cd /Users/azizalsinafi/.openclaw/workspace/demand-gen-hub && /opt/homebrew/bin/python3 scripts/abm-builder-score.py --accounts-json '$enrich.result' --products '$PRODUCTS'
    description: Deterministic relevance scoring — desc 40%, tags 30%, tech 15%, size 15%. Drop < 0.15.

  - id: validate
    command: cd /Users/azizalsinafi/.openclaw/workspace/demand-gen-hub && /opt/homebrew/bin/python3 scripts/abm-builder-validate.py --accounts-json '$score.result' --criteria-json '$interpret.result'
    description: AI validates borderline cases (score 0.15–0.6). Auto-accepts > 0.6. Uses gpt-4.1-mini.

  - id: review
    command: echo "Review discovered accounts before committing to ABM database"
    approval: required

  - id: commit
    command: cd /Users/azizalsinafi/.openclaw/workspace/demand-gen-hub && /opt/homebrew/bin/python3 scripts/abm-builder-commit.py --accounts-json '$validate.result' --list-name '$LIST_NAME' --criteria-json '$interpret.result'
    condition: $review.approved
    description: Commit validated accounts to ABMAccount + ABMListMember tables
