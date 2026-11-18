#!/usr/bin/env python3
"""Generate a self-contained, offline PD-059 visual companion; never publish."""

from pathlib import Path
import json
import re

ROOT = Path(__file__).resolve().parent
VISUALS = ROOT.parent
REPOSITORY = VISUALS.parents[1]


def visual_spec_html():
    source = (VISUALS / "PD-059-ui-2-reference.html").read_text()
    tokens = (REPOSITORY / "frontend/src/styles/tokens.css").read_text()

    # Offline export: Google Fonts remain available in the local handoff,
    # while this documentation artifact never initiates an external request.
    source = re.sub(r"@import\s+url\([^)]*\);", "", source)
    marker = "function loadPreviewBrandFonts() {"
    assert source.count(marker) == 1
    source = source.replace(marker, marker + "\n  return; // Offline visual-spec export: use local fallback fonts.")
    frame_tokens = tokens.replace('[data-theme="cyberpunk"]', '[data-theme="cyber"]')
    aliases = """
    :root { --bg:var(--bg-primary); --panel:var(--bg-card); --side:var(--bg-secondary);
      --text:var(--text-primary); --muted:var(--text-secondary); --accent:var(--blue);
      --accentsoft:var(--blue-dim); --greensoft:var(--green-dim); --redsoft:var(--red-dim);
      --line:var(--border); --chart:var(--blue); --wash:var(--bg-secondary); }
    """
    source = source.replace("</head>", "<style>" + frame_tokens + aliases + "</style></head>")
    bridge = """
    <script>
    window.visualSpec = {
      show(frame, outerTheme) {
        document.querySelectorAll('dialog[open]').forEach(dialog=>dialog.close());
        setPreviewPerspective(frame.role);
        if(frame.page==='Profile') adminOpen('Profile');
        else document.querySelector('[data-nav="'+frame.page+'"]').click();
        if(frame.view) selectView(frame.view);
        if(frame.valuation) { planPreview.valuation=frame.valuation; planPreview.fxReviewed=false; renderChart(); }
        if(frame.action==='holding') openDetails(holdings[0].symbol);
        if(frame.action==='fx') previewFxPrompt();
        if(frame.action==='dividend-import') dividendImport();
        if(frame.page==='Gold') document.querySelectorAll('dialog[open]').forEach(dialog=>dialog.close());
        const selectedTheme=frame.theme || (outerTheme==='cyberpunk'?'cyber':outerTheme);
        setTheme(selectedTheme==='cyber'&&!perspectiveViewer().premium?'dark':selectedTheme);
      }
    };
    </script>
    """
    source = source.replace("</body>", bridge + "</body>")
    template = (ROOT / "PD-059-ui-2.template.html").read_text()
    encoded = json.dumps(source, ensure_ascii=True).replace("<", "\\u003c").replace("&", "\\u0026")
    return template.replace("{{TOKENS}}", tokens).replace("{{APP_JSON}}", encoded)


if __name__ == "__main__":
    target = REPOSITORY / "docs/visuals/PD-059-ui-2.html"
    target.write_text(visual_spec_html())
    print(f"Built {target.relative_to(REPOSITORY)} ({target.stat().st_size:,} bytes)")
