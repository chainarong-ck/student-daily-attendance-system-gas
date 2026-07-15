/**
 * Sanitizes rich-text report sections before they enter either the designer
 * DOM or a print window. Keep this allowlist intentionally small: report
 * sections need text, basic formatting, links, and tables only.
 */
export function sanitizeReportHtml(html: string): string {
    const documentFragment = new DOMParser().parseFromString(
        `<body>${html}</body>`,
        "text/html",
    );
    const allowedTags = new Set([
        "P",
        "DIV",
        "SPAN",
        "BR",
        "H1",
        "H2",
        "H3",
        "H4",
        "STRONG",
        "B",
        "EM",
        "I",
        "U",
        "S",
        "UL",
        "OL",
        "LI",
        "BLOCKQUOTE",
        "TABLE",
        "THEAD",
        "TBODY",
        "TFOOT",
        "TR",
        "TH",
        "TD",
        "A",
        "FONT",
    ]);
    const allowedStyles = new Set([
        "text-align",
        "font-weight",
        "font-style",
        "text-decoration",
        "color",
        "background-color",
        "font-size",
        "font-family",
        "margin-left",
    ]);

    Array.from(documentFragment.body.querySelectorAll<HTMLElement>("*"))
        .reverse()
        .forEach((element) => {
            if (!allowedTags.has(element.tagName)) {
                element.replaceWith(...Array.from(element.childNodes));
                return;
            }
            Array.from(element.attributes).forEach((attribute) => {
                if (
                    attribute.name !== "style" &&
                    attribute.name !== "colspan" &&
                    attribute.name !== "rowspan" &&
                    attribute.name !== "href" &&
                    attribute.name !== "size" &&
                    attribute.name !== "color"
                ) {
                    element.removeAttribute(attribute.name);
                }
            });
            if (element.hasAttribute("href")) {
                const href = element.getAttribute("href") ?? "";
                if (!/^(https?:|mailto:)/i.test(href)) {
                    element.removeAttribute("href");
                } else {
                    element.setAttribute("rel", "noopener noreferrer");
                    element.setAttribute("target", "_blank");
                }
            }
            if (
                element.hasAttribute("size") &&
                !/^[1-7]$/.test(element.getAttribute("size") ?? "")
            ) {
                element.removeAttribute("size");
            }
            if (
                element.hasAttribute("color") &&
                !/^(#[0-9a-f]{3,8}|[a-z]+)$/i.test(
                    element.getAttribute("color") ?? "",
                )
            ) {
                element.removeAttribute("color");
            }
            const safeStyles: string[] = [];
            Array.from(element.style).forEach((property) => {
                if (!allowedStyles.has(property)) {
                    return;
                }
                const value = element.style.getPropertyValue(property);
                if (!/url\s*\(|expression\s*\(|javascript\s*:/i.test(value)) {
                    safeStyles.push(`${property}:${value}`);
                }
            });
            if (safeStyles.length > 0) {
                element.setAttribute("style", safeStyles.join(";"));
            } else {
                element.removeAttribute("style");
            }
        });
    return documentFragment.body.innerHTML;
}
