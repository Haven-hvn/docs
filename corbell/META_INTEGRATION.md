# Corbell + Meta Muse Spark Integration

> Fixed: 2026-08-13, Corbell `corbell/core/llm_client.py` patched (+96 lines) to add `meta` provider.

## Problem
`LLM_4343795495832954_r6sx9v-3w-OQPRkgmZelM7uqs9w` is a **Muse Spark** key (`muse-spark-1.2-contributor`) for `https://api.meta.ai/v1`, not Anthropic `sk-ant-*` or OpenAI `sk-*`. Corbell only supported `anthropic|openai|ollama|aws|azure|gcp` — any `LLM_*` key fell back to template mode (`⚠️ No LLM credentials configured`).

Verified: `GET /v1/models` with Bearer `LLM_...` returns `muse-spark-1.2-contributor` (200), but `anthropic`/`openai` client against `api.openai.com` gave `401 invalid x-api-key`. `https://api.llama.com/v1` also 401. Working Muse session auth (`~/.config/muse/auth.json` `dca:...` OAuth) is separate and not usable for LLM API.

Also Muse Spark uses ~600 reasoning tokens before content — `max_tokens < 1000` returns `content:null` with `finish_reason:length`. Default Corbell `max_tokens:8000` is fine.

## Fix
Patched `corbell/core/llm_client.py`:

- `__init__(..., meta_api_base=None)` + `self.meta_api_base = env META_API_BASE/MUSE_API_BASE or https://api.meta.ai/v1`
- `_defaults["meta"] = "muse-spark-1.2-contributor"`
- `provider_map["meta"] = _call_meta`
- `is_configured` for `meta` checks `api_key` presence + `workspace.yaml` `llm.provider: meta`
- `provider_display` label `Meta (muse-spark-1.2-contributor) @ https://api.meta.ai/v1`
- `_call_meta(...)` — OpenAI-compatible `urllib.request` POST to `{base}/v1/chat/completions` with `Authorization: Bearer ${META_API_KEY}`, `model`, `messages`, `max_tokens` (clamped to >=1000, retry on truncation), `temperature`, token tracking via `usage.prompt_tokens/completion_tokens`, timeout 180s.
- `_resolve_key` for `meta`: `META_API_KEY, MUSE_API_KEY, LLM_API_KEY, ANTHROPIC_API_KEY, OPENAI_API_KEY, CORBELL_LLM_API_KEY`
- Updated fallback help text to mention `Meta: export META_API_KEY=LLM_...`

`corbell-data/workspace.yaml` now:

```yaml
llm:
  provider: meta
  model: muse-spark-1.2-contributor
  api_key: ${META_API_KEY}
  context_budget: 100000
```

## Verification

```bash
export META_API_KEY="LLM_4343795495832954_r6sx9v-3w-OQPRkgmZelM7uqs9w"
python -c "from corbell.core.llm_client import LLMClient; c=LLMClient(provider='meta', api_key='...'); print(c.is_configured, c.call('You are helpful','hello',max_tokens=1000))"
# -> True, "Hello, lovely to see you"

corbell spec new --feature "Haven V3 Epoch Cache" --prd "..." 
# -> Mode: meta/muse-spark-1.2-contributor, Token Usage 13,531 tokens $0.18, spec 24K

corbell spec review ...
# -> Token Usage 11,336 tokens $0.11, review 7.7K
```

## Generated specs (this push)

- `specs/haven-v3-epoch-cache.md` (24K, 1,029→7,933 tokens)
- `specs/haven-v3-epoch-cache.review.md` (7.7K)
- `specs/haven-decoupled-architecture-v2.md` (23K, 9K → 8K tokens)
- `specs/haven-decoupled-architecture-v2.review.md` (7.4K, score 4/10 — truncated, needs haven-cli/mobile completion)

All via `meta/muse-spark-1.2-contributor @ https://api.meta.ai/v1` with `LLM_...`.

## Next

- Commit the patch to Corbell: `git add corbell/core/llm_client.py && git commit` (currently unstaged in /root/Corbell)
- Optionally upstream: PR to add `meta` provider docs.
