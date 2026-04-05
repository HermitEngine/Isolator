(() => {
  if (globalThis.__elementPickerController) {
    return;
  }

  class ElementPickerController {
    constructor() {
      this.enabled = false;
      this.currentTarget = null;
      this.navigationPath = [];
      this.navigationIndex = 0;
      this.pointerClientX = 0;
      this.pointerClientY = 0;
      this.highlight = this.createNode("div", "element-picker-highlight");
      this.label = this.createNode("div", "element-picker-label");

      this.onMouseMove = this.onMouseMove.bind(this);
      this.onClick = this.onClick.bind(this);
      this.onKeyDown = this.onKeyDown.bind(this);
      this.onScroll = this.onScroll.bind(this);
      this.onWheel = this.onWheel.bind(this);
    }

    createNode(tagName, id) {
      const node = document.createElement(tagName);
      node.id = id;
      node.hidden = true;
      document.documentElement.appendChild(node);
      return node;
    }

    async toggle() {
      if (this.enabled) {
        await this.disable();
        return;
      }
      await this.enable();
    }

    async enable() {
      if (this.enabled) {
        return;
      }

      this.enabled = true;
      document.documentElement.classList.add("element-picker-active");
      document.addEventListener("mousemove", this.onMouseMove, true);
      document.addEventListener("click", this.onClick, true);
      document.addEventListener("keydown", this.onKeyDown, true);
      document.addEventListener("wheel", this.onWheel, { capture: true, passive: false });
      window.addEventListener("scroll", this.onScroll, true);
      await browser.runtime.sendMessage({ type: "picker:state", enabled: true });
    }

    async disable() {
      if (!this.enabled) {
        return;
      }

      this.enabled = false;
      this.currentTarget = null;
      this.navigationPath = [];
      this.navigationIndex = 0;
      document.documentElement.classList.remove("element-picker-active");
      document.removeEventListener("mousemove", this.onMouseMove, true);
      document.removeEventListener("click", this.onClick, true);
      document.removeEventListener("keydown", this.onKeyDown, true);
      document.removeEventListener("wheel", this.onWheel, { capture: true });
      window.removeEventListener("scroll", this.onScroll, true);
      this.hideOverlay();
      await browser.runtime.sendMessage({ type: "picker:state", enabled: false });
    }

    onMouseMove(event) {
      this.pointerClientX = event.clientX;
      this.pointerClientY = event.clientY;
      const target = this.findTarget(event.clientX, event.clientY);
      if (!target) {
        this.currentTarget = null;
        this.navigationPath = [];
        this.navigationIndex = 0;
        this.hideOverlay();
        return;
      }

      if (target !== this.navigationPath[0]) {
        this.resetNavigation(target);
      } else {
        this.currentTarget = this.navigationPath[this.navigationIndex] ?? target;
      }
      this.showOverlay(this.currentTarget);
    }

    async onClick(event) {
      if (!this.enabled) {
        return;
      }

      const target = this.currentTarget ?? this.findTarget(event.clientX, event.clientY);
      if (!target) {
        return;
      }

      event.preventDefault();
      event.stopPropagation();
      event.stopImmediatePropagation();

      await browser.runtime.sendMessage({
        type: "picker:openSelection",
        payload: {
          renderHtml: this.buildRenderDocument(target),
          pageTitle: document.title,
          pageUrl: location.href,
          selector: this.describeTarget(target),
          tagName: target.tagName.toLowerCase()
        }
      });

      await this.disable();
    }

    async onKeyDown(event) {
      if (event.key !== "Escape") {
        return;
      }

      event.preventDefault();
      event.stopPropagation();
      await this.disable();
    }

    onScroll() {
      if (this.currentTarget?.isConnected) {
        this.showOverlay(this.currentTarget);
        return;
      }

      this.currentTarget = null;
      this.navigationPath = [];
      this.navigationIndex = 0;
      this.hideOverlay();
    }

    onWheel(event) {
      if (!this.enabled) {
        return;
      }

      const direction = Math.sign(event.deltaY);
      if (direction === 0) {
        return;
      }

      event.preventDefault();
      event.stopPropagation();

      const hoveredTarget = this.findTarget(this.pointerClientX, this.pointerClientY);
      if (!this.currentTarget && hoveredTarget) {
        this.resetNavigation(hoveredTarget);
      } else if (hoveredTarget && hoveredTarget !== this.navigationPath[0]) {
        this.resetNavigation(hoveredTarget);
      }

      if (!this.currentTarget) {
        return;
      }

      if (direction > 0) {
        const parent = this.getNavigableParent(this.navigationPath[this.navigationIndex]);
        if (!parent) {
          return;
        }

        const nextIndex = this.navigationIndex + 1;
        if (this.navigationPath[nextIndex] !== parent) {
          this.navigationPath.splice(nextIndex);
          this.navigationPath.push(parent);
        }
        this.navigationIndex = nextIndex;
      } else if (this.navigationIndex > 0) {
        this.navigationIndex -= 1;
      } else {
        return;
      }

      this.currentTarget = this.navigationPath[this.navigationIndex] ?? null;
      if (this.currentTarget) {
        this.showOverlay(this.currentTarget);
      } else {
        this.hideOverlay();
      }
    }

    findTarget(clientX, clientY) {
      const elements = document.elementsFromPoint(clientX, clientY);
      return elements.find((element) => (
        element !== this.highlight &&
        element !== this.label &&
        !this.highlight.contains(element) &&
        !this.label.contains(element)
      )) ?? null;
    }

    showOverlay(target) {
      const rect = target.getBoundingClientRect();
      this.highlight.hidden = false;
      this.label.hidden = false;

      Object.assign(this.highlight.style, {
        top: `${rect.top}px`,
        left: `${rect.left}px`,
        width: `${Math.max(rect.width, 0)}px`,
        height: `${Math.max(rect.height, 0)}px`
      });

      this.label.textContent = `${this.describeTarget(target)}  ${Math.round(rect.width)}x${Math.round(rect.height)}`;

      const labelHeight = 30;
      const top = rect.top > labelHeight + 8
        ? rect.top - labelHeight - 8
        : rect.bottom + 8;
      const left = Math.max(8, Math.min(rect.left, window.innerWidth - this.label.offsetWidth - 8));

      Object.assign(this.label.style, {
        top: `${Math.max(8, top)}px`,
        left: `${left}px`
      });
    }

    hideOverlay() {
      this.highlight.hidden = true;
      this.label.hidden = true;
    }

    resetNavigation(target) {
      this.navigationPath = [target];
      this.navigationIndex = 0;
      this.currentTarget = target;
    }

    getNavigableParent(target) {
      if (!(target instanceof Element)) {
        return null;
      }

      const parent = target.parentElement;
      if (!parent || parent === document.documentElement) {
        return null;
      }

      return parent;
    }

    describeTarget(target) {
      const id = target.id ? `#${target.id}` : "";
      const classList = Array.from(target.classList).slice(0, 3).map((name) => `.${name}`).join("");
      return `<${target.tagName.toLowerCase()}${id}${classList}>`;
    }

    buildRenderDocument(target) {
      const clone = this.buildIsolatedClone(target);
      const stylesheetMarkup = this.collectStylesheetMarkup();
      const inheritedStyles = this.serializeInheritedStyles(target);

      const lang = this.escapeAttribute(document.documentElement.lang || "en");
      const dir = this.escapeAttribute(document.documentElement.dir || "");
      const baseHref = this.escapeAttribute(location.href);
      const htmlAttributes = this.serializeAttributes(document.documentElement, ["lang", "dir"]);
      const bodyAttributes = this.serializeAttributes(document.body);

      return [
        "<!DOCTYPE html>",
        `<html lang="${lang}"${dir ? ` dir="${dir}"` : ""}${htmlAttributes}>`,
        "<head>",
        '<meta charset="utf-8">',
        '<meta name="viewport" content="width=device-width, initial-scale=1">',
        `<base href="${baseHref}">`,
        stylesheetMarkup,
        "<style>",
        "html, body { width: 100%; height: 100%; min-width: 0 !important; min-height: 0 !important; margin: 0; }",
        `body { overflow: auto; ${inheritedStyles} }`,
        "body > * { width: 100% !important; height: 100% !important; min-width: 0 !important; min-height: 0 !important; max-width: none !important; max-height: none !important; margin: 0 !important; }",
        "[data-element-picker-target] { width: 100% !important; height: 100% !important; min-width: 0 !important; min-height: 0 !important; max-width: none !important; max-height: none !important; margin: 0 !important; }",
        "*, *::before, *::after { box-sizing: border-box; }",
        "</style>",
        "</head>",
        `<body${bodyAttributes}>`,
        clone.outerHTML,
        "</body>",
        "</html>"
      ].join("");
    }

    buildIsolatedClone(target) {
      const targetClone = target.cloneNode(true);
      targetClone.setAttribute("data-element-picker-target", "");
      this.syncFormState(target, targetClone);
      this.sanitizeClone(targetClone);
      return targetClone;
    }

    serializeInheritedStyles(target) {
      const inheritedProperties = [
        "color",
        "font",
        "font-family",
        "font-feature-settings",
        "font-kerning",
        "font-language-override",
        "font-optical-sizing",
        "font-palette",
        "font-size",
        "font-size-adjust",
        "font-stretch",
        "font-style",
        "font-synthesis",
        "font-synthesis-position",
        "font-synthesis-small-caps",
        "font-synthesis-style",
        "font-synthesis-weight",
        "font-variant",
        "font-variant-alternates",
        "font-variant-caps",
        "font-variant-east-asian",
        "font-variant-emoji",
        "font-variant-ligatures",
        "font-variant-numeric",
        "font-variant-position",
        "font-weight",
        "letter-spacing",
        "line-height",
        "quotes",
        "tab-size",
        "text-align",
        "text-align-last",
        "text-combine-upright",
        "text-decoration",
        "text-decoration-color",
        "text-decoration-line",
        "text-decoration-skip-ink",
        "text-decoration-style",
        "text-decoration-thickness",
        "text-emphasis",
        "text-emphasis-color",
        "text-emphasis-position",
        "text-emphasis-style",
        "text-indent",
        "text-justify",
        "text-orientation",
        "text-rendering",
        "text-shadow",
        "text-transform",
        "text-underline-offset",
        "text-underline-position",
        "visibility",
        "white-space",
        "word-break",
        "word-spacing",
        "overflow-wrap",
        "writing-mode",
        "-webkit-text-fill-color",
        "-webkit-text-stroke-color",
        "-webkit-text-stroke-width"
      ];
      const computedStyle = getComputedStyle(target);
      return inheritedProperties
        .map((property) => {
          const value = computedStyle.getPropertyValue(property);
          if (!value) {
            return "";
          }
          return `${property}: ${value};`;
        })
        .filter(Boolean)
        .join(" ");
    }

    syncFormState(source, clone) {
      if (!(source instanceof Element) || !(clone instanceof Element)) {
        return;
      }

      if (source instanceof HTMLTextAreaElement) {
        clone.textContent = source.value;
      }

      if (source instanceof HTMLInputElement) {
        clone.setAttribute("value", source.value);
        if (source.checked) {
          clone.setAttribute("checked", "");
        } else {
          clone.removeAttribute("checked");
        }
      }

      if (source instanceof HTMLSelectElement && clone instanceof HTMLSelectElement) {
        Array.from(source.options).forEach((option, index) => {
          if (option.selected) {
            clone.options[index].setAttribute("selected", "");
          } else {
            clone.options[index].removeAttribute("selected");
          }
        });
      }

      const sourceChildren = Array.from(source.children);
      const cloneChildren = Array.from(clone.children);
      for (let index = 0; index < sourceChildren.length; index += 1) {
        this.syncFormState(sourceChildren[index], cloneChildren[index]);
      }
    }

    sanitizeClone(root) {
      if (!(root instanceof Element)) {
        return;
      }

      if (root.tagName.toLowerCase() === "script") {
        root.remove();
        return;
      }

      for (const attribute of Array.from(root.attributes)) {
        const name = attribute.name.toLowerCase();
        const value = attribute.value.trim().toLowerCase();
        if (name.startsWith("on")) {
          root.removeAttribute(attribute.name);
          continue;
        }
        if ((name === "href" || name === "src" || name === "xlink:href") && value.startsWith("javascript:")) {
          root.removeAttribute(attribute.name);
        }
      }

      Array.from(root.children).forEach((child) => {
        this.sanitizeClone(child);
      });
    }

    collectStylesheetMarkup() {
      return Array.from(document.head.children)
        .filter((node) => {
          if (!(node instanceof Element)) {
            return false;
          }
          const tagName = node.tagName.toLowerCase();
          if (tagName === "style") {
            return true;
          }
          if (tagName !== "link") {
            return false;
          }
          const rel = (node.getAttribute("rel") || "").toLowerCase();
          return rel.split(/\s+/).includes("stylesheet");
        })
        .map((node) => node.outerHTML)
        .join("");
    }

    serializeAttributes(element, excludedNames = []) {
      const excluded = new Set(excludedNames.map((name) => name.toLowerCase()));
      const attributes = Array.from(element.attributes)
        .filter((attribute) => !excluded.has(attribute.name.toLowerCase()) && !attribute.name.toLowerCase().startsWith("on"))
        .map((attribute) => ` ${attribute.name}="${this.escapeAttribute(attribute.value)}"`)
        .join("");
      return attributes;
    }

    escapeAttribute(value) {
      return String(value)
        .replaceAll("&", "&amp;")
        .replaceAll("\"", "&quot;")
        .replaceAll("<", "&lt;")
        .replaceAll(">", "&gt;");
    }
  }

  const controller = new ElementPickerController();
  globalThis.__elementPickerController = controller;

  browser.runtime.onMessage.addListener((message) => {
    if (message?.type === "picker:ping") {
      return Promise.resolve({ ok: true });
    }

    if (message?.type === "picker:toggle") {
      return controller.toggle();
    }

    return undefined;
  });
})();
