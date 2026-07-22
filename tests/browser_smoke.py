from __future__ import annotations

import re
from pathlib import Path

from playwright.sync_api import sync_playwright

ROOT = Path(__file__).resolve().parents[1]
FIXTURES = ROOT / "tests" / "fixtures"
REQUIRED_IDS = {
    "dropZone",
    "fileInput",
    "selectedFile",
    "selectedThumbnail",
    "selectedFileName",
    "selectedFileMeta",
    "changeFileButton",
    "targetSize",
    "convertButton",
    "convertButtonLabel",
    "message",
    "resultPanel",
    "targetBadge",
    "originalPreview",
    "originalSize",
    "originalDimensions",
    "originalFormat",
    "resultPreview",
    "resultSize",
    "resultDimensions",
    "resultQuality",
    "reductionValue",
    "startOverButton",
    "downloadButton",
}


def read_project() -> tuple[str, str, str, str]:
    html = (ROOT / "index.html").read_text(encoding="utf-8")
    css = (ROOT / "style.css").read_text(encoding="utf-8")
    script = (ROOT / "script.js").read_text(encoding="utf-8")
    utils = (ROOT / "compression-utils.js").read_text(encoding="utf-8")
    return html, css, script, utils


def verify_static_contract(html: str) -> None:
    ids = set(re.findall(r'\bid=["\']([^"\']+)["\']', html))
    missing = REQUIRED_IDS - ids
    assert not missing, f"index.html is missing script-required IDs: {sorted(missing)}"
    assert re.search(
        r'<script\s+type=["\']module["\']\s+src=["\'](?:\./)?script\.js["\']\s*>\s*</script>',
        html,
        re.IGNORECASE,
    ), "script.js must be loaded with type=module"
    assert re.search(
        r'<link[^>]+href=["\'](?:\./)?style\.css["\']', html, re.IGNORECASE
    ), "style.css must be linked from index.html"


def inline_project(page, html: str, css: str, script: str, utils: str) -> None:
    html = re.sub(r'<link[^>]+href=["\'](?:\./)?style\.css["\'][^>]*>', "", html)
    html = re.sub(
        r'<script[^>]+src=["\'](?:\./)?script\.js["\'][^>]*>\s*</script>', "", html
    )

    utils = utils.replace("export ", "")
    script = re.sub(
        r'import\s*\{[\s\S]*?\}\s*from\s*["\']\.\/compression-utils\.js["\'];?',
        "",
        script,
    )

    html = html.replace("</head>", f"<style>{css}</style></head>")
    html = html.replace("</body>", f"<script>{utils}\n{script}</script></body>")
    page.set_content(html, wait_until="load")


def run() -> None:
    html, css, script, utils = read_project()
    verify_static_contract(html)

    with sync_playwright() as playwright:
        browser = playwright.chromium.launch(
            headless=True,
            executable_path="/usr/bin/chromium",
            args=["--no-sandbox"],
        )
        page = browser.new_page(viewport={"width": 1280, "height": 900})
        page_errors: list[str] = []
        page.on("pageerror", lambda error: page_errors.append(str(error)))
        inline_project(page, html, css, script, utils)

        assert page_errors == [], page_errors
        assert page.locator("h1").inner_text() == "Photo Size Converter"
        assert page.locator("#targetSize").input_value() == "10"
        assert page.locator("#dropZone").is_visible()
        assert page.locator("#convertButton").is_disabled()
        assert page.locator(".converter-card").evaluate(
            "element => getComputedStyle(element).borderRadius"
        ) == "24px"

        page.locator("#fileInput").set_input_files(str(FIXTURES / "detailed-photo.jpg"))
        page.locator("#selectedFile:not([hidden])").wait_for(timeout=10_000)
        assert page.locator("#convertButton").is_enabled()

        page.locator("#convertButton").click()
        page.locator("#resultPanel:not([hidden])").wait_for(timeout=20_000)

        result_bytes = int(page.locator("#resultPanel").get_attribute("data-result-bytes"))
        assert int(0.90 * 10 * 1024) <= result_bytes <= 10 * 1024, result_bytes
        assert page.locator("#resultSize").inner_text().endswith("KB")
        assert page.locator("#downloadButton").is_enabled()

        page.locator("#targetSize").fill("25")
        page.locator("#convertButton").click()
        page.locator("#resultPanel:not([hidden])").wait_for(timeout=20_000)
        result_25_bytes = int(page.locator("#resultPanel").get_attribute("data-result-bytes"))
        assert int(0.90 * 25 * 1024) <= result_25_bytes <= 25 * 1024, result_25_bytes

        page.locator("#targetSize").fill("0")
        assert page.locator("#convertButton").is_disabled()
        assert "at least 1 KB" in page.locator("#message").inner_text()

        page.locator("#targetSize").fill("10")
        page.locator("#fileInput").set_input_files(str(FIXTURES / "mobile-orientation-6.jpg"))
        page.locator("#selectedFile:not([hidden])").wait_for(timeout=10_000)
        page.locator("#convertButton").click()
        page.locator("#resultPanel:not([hidden])").wait_for(timeout=20_000)
        assert page.locator("#originalDimensions").inner_text() == "80 × 120 px"
        assert page_errors == [], page_errors

        browser.close()


if __name__ == "__main__":
    run()
    print("Browser smoke tests passed")
