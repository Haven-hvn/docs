# haven-cli — Pipeline CLI & TUI

> Repo: `haven-cli/` (`haven_cli/` 14 pkgs, `haven_tui/`, `js-services/`, `vetkd_py/`, `pyproject.toml` hatchling, python >=3.11, CLI `haven-tui`).

## Boundary

- **Owns:** Event-driven media pipeline, archival, Filecoin pinning, vetKD encryption (upload side via `packages/python` + `vetkd_py`), daemon/scheduler/plugins.
- **Depends on:** `haven-aol` Python SDK only (encrypt metadata). No shared DB with dapp/mobile.
- **Deploy:** `pip install haven-cli` or `install.sh`, Docker via `Dockerfile`.

## Package map (`haven_cli/`)

`access_pattern`, `cli`, `config`, `crypto`, `daemon`, `database`, `js_runtime`, `main`, `media`, `pipeline`, `plugins`, `scheduler`, `services`, `tui`, `vlm`, `bittorrent_plugin_init` + `tests/` (15 suites) + `js-services/` (Node helpers).

## Flows (decoupled)

- Upload: `cli -> crypto (encrypt CID with threshold/chain/token) -> haven-aol python SDK (vetkd encrypt) -> Filecoin pin -> metadata emit` (no dapp call).
- Decrypt not performed here (frontends only).

## Corbell mapping

`id: haven-cli, language: python, tags: [cli, tui, tooling, decoupled]`. Graph shows datastore usage local only, no cross edges to other frontends.
