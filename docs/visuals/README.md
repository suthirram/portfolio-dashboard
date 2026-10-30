# Visual specs

Design deliverables for planned UI changes: annotated frame sets showing what
a change looks like before it is built.

There is no Figma account wired into this project, so a visual spec here is a
**self-contained HTML page**, authored against
[`frontend/src/styles/tokens.css`](../../frontend/src/styles/tokens.css) and
playing the role a Figma frame set would — labelled artboards, numbered
annotations, edge-state coverage. Keeping the mockup in the repo next to the
PRD/DD/PD means it is reviewed in the same PR as the plan it illustrates, and
a token change that invalidates a frame shows up in a diff.

## Conventions

* One file per plan: `PD-0xx-<slug>.html`. No build step, no external
  requests — open it directly in a browser (`open docs/visuals/<file>.html`).
* **Start every file with `<!doctype html>`, `<meta charset="utf-8">` and a
  viewport meta**, then `<title>`/`<style>` — no `<html>`/`<head>`/`<body>`.
  The Artifact publisher wraps the page in its own skeleton (where the extra
  doctype is a harmless no-op), but a file opened locally gets no wrapper:
  without these lines it renders in quirks mode (broken table/box sizing)
  and may decode `—`/`₹`/`€` as Windows-1252 garbage.
* **Palettes are copied from `tokens.css`, never invented.** A frame that
  drifts from the shipped tokens is worse than no frame. Each page carries a
  switcher for the three shipped themes (dark, light, cyberpunk) so a
  reviewer can check the change holds in all of them.
* Frames are numbered and each carries annotations tied to the PRD/DD section
  it realises, plus a table mapping frames to the plan's task numbers.
* Mockups use **real-looking data** (actual symbol formats, both the INR/EUR
  and the USD case) and are explicitly labelled "not production markup" —
  they are illustrations, not components to copy.
* Reused components are drawn too, marked as reused, so a hand-off ("this
  view navigates, that modal writes") is visible rather than assumed.

## Index

| Plan | Spec | Published link | Covers |
|---|---|---|---|
| [PD-047](../plans/PD-047-all-transactions-view.md) | [`PD-047-all-transactions-view.html`](PD-047-all-transactions-view.html) | [view](https://claude.ai/code/artifact/f9a60fc0-e8c3-4ae9-9549-02af56e6f52c) | Dashboard entry point, `/transactions` default + filtered states, the reused per-holding editor, empty + admin act-as states, column map |
| [PD-048](../plans/PD-048-dividend-history.md) | [`PD-048-dividend-history.html`](PD-048-dividend-history.html) | [view](https://claude.ai/artifact/N1DGvkdmVHjUyVG5gxiUv6) | Dashboard dividend figures, Dividends INR/EUR tabs + analytics, add/edit, import (choose file / confirm share names / preview / result), delete all, History dividends column, dedup examples |

Published links are private to the repo owner until shared from the page's
share menu; the committed HTML is the source of truth either way.
