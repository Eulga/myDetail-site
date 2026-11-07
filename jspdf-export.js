(function () {
  var DEFAULT_SELECTOR = "#pdf-capture";
  var DEFAULT_FILENAME = "이력서.pdf";
  var DEFAULT_STATUS_SELECTOR = "#jspdf-export-status";
  var DEFAULT_FORMAT = "a4";
  var DEFAULT_ORIENTATION = "portrait";
  var DEFAULT_UNIT = "mm";
  var DEFAULT_MARGIN = 10;
  var DEFAULT_RENDER_SCALE = 2;
  var DEFAULT_CAPTURE_WIDTH = 955;
  var DEFAULT_FONT_SCALE = 1;
  var DEFAULT_LINE_HEIGHT_SCALE = 1;
  var DEFAULT_NORMAL_LINE_HEIGHT_RATIO = 1.2;
  var DEFAULT_BACKGROUND_COLOR = "#ffffff";
  var DEFAULT_IMAGE_TYPE = "JPEG";
  var DEFAULT_IMAGE_QUALITY = 0.95;
  var DEFAULT_EXPAND_SELECTORS = "textarea";
  var DEFAULT_SAFE_PAGE_BREAK_MODE = "strict";
  var BALANCED_SAFE_PAGE_BREAK_MODE = "balanced";
  var OFF_SAFE_PAGE_BREAK_MODE = "off";
  var MIN_RENDER_SCALE = 1;
  var RENDER_SCALE_STEP = 0.25;
  var MAX_CANVAS_EDGE_PX = 8192;
  var MAX_CANVAS_AREA_PX = 16000000;
  var STRICT_PAGE_BREAK_SEARCH_BACKTRACK_PX = 180;
  var BALANCED_PAGE_BREAK_SEARCH_BACKTRACK_PX = 96;
  var MIN_BREAK_GAP_PX = 12;
  var MIN_PAGE_HEIGHT_PX = 240;
  var MAX_SCROLL_EXPAND_PASSES = 4;
  var MAX_BALANCED_HEADING_GROUP_HEIGHT_PX = 320;
  var BALANCED_HEADING_GROUP_RATIO = 0.35;
  var BREAK_CANDIDATE_TAG_PATTERN =
    /^(TABLE|THEAD|TBODY|TFOOT|TR|H1|H2|H3|H4|H5|H6|P|LI|UL|OL|DL|DT|DD|SECTION|ARTICLE|BLOCKQUOTE)$/;
  var INTRINSIC_PROTECTED_TAG_PATTERN = /^(TR|LI|P|DT|DD|BLOCKQUOTE)$/;
  var TYPOGRAPHY_CONTAINER_TAG_PATTERN =
    /^(P|LI|DT|DD|BLOCKQUOTE|TD|TH|H1|H2|H3|H4|H5|H6|SPAN|DIV|A|BUTTON|LABEL)$/;
  var TYPOGRAPHY_SKIPPED_TAG_PATTERN = /^(SCRIPT|STYLE|NOSCRIPT)$/;
  var EXPORT_STATE_KEY = "__jspdfExportState";
  var TRIGGER_BUSY_PROPERTY = "__jspdfExportBusy";

  function getExportState() {
    if (!window[EXPORT_STATE_KEY]) {
      window[EXPORT_STATE_KEY] = {};
    }

    return window[EXPORT_STATE_KEY];
  }

  function setStatus(element, message, isError) {
    if (!element) {
      return;
    }

    element.textContent = message;
    element.classList.toggle("is-error", Boolean(isError));
  }

  function setTriggerBusy(trigger, isBusy) {
    if (!trigger) {
      return;
    }

    if (typeof trigger.disabled !== "undefined") {
      trigger.disabled = isBusy;
    }

    trigger.setAttribute("aria-busy", isBusy ? "true" : "false");
    trigger[TRIGGER_BUSY_PROPERTY] = Boolean(isBusy);
  }

  function isTriggerBusy(trigger) {
    return Boolean(
      trigger &&
      (trigger[TRIGGER_BUSY_PROPERTY] ||
        trigger.getAttribute("aria-busy") === "true"),
    );
  }

  function waitForFonts() {
    if (!document.fonts || !document.fonts.ready) {
      return Promise.resolve();
    }

    return document.fonts.ready.catch(function () {
      return undefined;
    });
  }

  function getSearchParams() {
    try {
      return new URLSearchParams(window.location.search || "");
    } catch (error) {
      return new URLSearchParams();
    }
  }

  function toKebabCase(value) {
    return String(value)
      .replace(/([a-z0-9])([A-Z])/g, "$1-$2")
      .replace(/_/g, "-")
      .toLowerCase();
  }

  function uniqueValues(values) {
    var result = [];

    values.forEach(function (value) {
      if (result.indexOf(value) === -1) {
        result.push(value);
      }
    });

    return result;
  }

  function readOptionValue(trigger, aliases, fallbackValue) {
    var searchParams = getSearchParams();
    var aliasList = uniqueValues(
      aliases
        .concat(
          aliases.map(function (alias) {
            return toKebabCase(alias);
          }),
        )
        .concat(
          aliases.map(function (alias) {
            return alias.toLowerCase();
          }),
        ),
    );
    var dataset = trigger && trigger.dataset ? trigger.dataset : {};
    var index = 0;

    for (index = 0; index < aliases.length; index += 1) {
      if (
        Object.prototype.hasOwnProperty.call(dataset, aliases[index]) &&
        dataset[aliases[index]] !== ""
      ) {
        return dataset[aliases[index]];
      }
    }

    for (index = 0; index < aliasList.length; index += 1) {
      if (searchParams.has(aliasList[index])) {
        return searchParams.get(aliasList[index]);
      }
    }

    return fallbackValue;
  }

  function readStringOption(trigger, aliases, fallbackValue) {
    var value = readOptionValue(trigger, aliases, fallbackValue);

    if (value === null || typeof value === "undefined") {
      return fallbackValue;
    }

    value = String(value).trim();
    return value === "" ? fallbackValue : value;
  }

  function readBooleanOption(trigger, aliases, fallbackValue) {
    var value = readOptionValue(trigger, aliases, null);

    if (value === null || typeof value === "undefined" || value === "") {
      return fallbackValue;
    }

    value = String(value).toLowerCase();
    return (
      value === "1" || value === "true" || value === "yes" || value === "on"
    );
  }

  function readNumberOption(trigger, aliases, fallbackValue) {
    var value = readOptionValue(trigger, aliases, null);
    var parsedValue = Number(value);

    if (value === null || typeof value === "undefined" || value === "") {
      return fallbackValue;
    }

    if (!Number.isFinite(parsedValue)) {
      return fallbackValue;
    }

    return parsedValue;
  }

  function clamp(value, minValue, maxValue) {
    return Math.min(maxValue, Math.max(minValue, value));
  }

  function normalizeOrientation(value) {
    var normalizedValue = String(value || DEFAULT_ORIENTATION).toLowerCase();

    if (normalizedValue === "p") {
      return "portrait";
    }

    if (normalizedValue === "l") {
      return "landscape";
    }

    return normalizedValue === "landscape" ? "landscape" : "portrait";
  }

  function normalizeImageType(value) {
    var normalizedValue = String(value || DEFAULT_IMAGE_TYPE).toUpperCase();
    return normalizedValue === "PNG" ? "PNG" : "JPEG";
  }

  function normalizeCaptureWidth(value) {
    var numericValue = Number(value);

    if (!Number.isFinite(numericValue) || numericValue <= 0) {
      return DEFAULT_CAPTURE_WIDTH;
    }

    return Math.max(1, Math.ceil(numericValue));
  }

  function normalizePositiveScale(value, fallbackValue) {
    var numericValue = Number(value);

    if (!Number.isFinite(numericValue) || numericValue <= 0) {
      return fallbackValue;
    }

    return numericValue;
  }

  function normalizeSafePageBreakMode(value) {
    var normalizedValue = String(
      value === null || typeof value === "undefined"
        ? DEFAULT_SAFE_PAGE_BREAK_MODE
        : value,
    )
      .trim()
      .toLowerCase();

    if (
      normalizedValue === "1" ||
      normalizedValue === "true" ||
      normalizedValue === "yes" ||
      normalizedValue === "on" ||
      normalizedValue === DEFAULT_SAFE_PAGE_BREAK_MODE
    ) {
      return DEFAULT_SAFE_PAGE_BREAK_MODE;
    }

    if (normalizedValue === BALANCED_SAFE_PAGE_BREAK_MODE) {
      return BALANCED_SAFE_PAGE_BREAK_MODE;
    }

    if (
      normalizedValue === "0" ||
      normalizedValue === "false" ||
      normalizedValue === "no" ||
      normalizedValue === OFF_SAFE_PAGE_BREAK_MODE
    ) {
      return OFF_SAFE_PAGE_BREAK_MODE;
    }

    return DEFAULT_SAFE_PAGE_BREAK_MODE;
  }

  function getPdfOptions(trigger) {
    return {
      selector: readStringOption(
        trigger,
        [
          "selector",
          "target",
          "pdfSelector",
          "pdfTarget",
          "exportSelector",
          "captureSelector",
        ],
        DEFAULT_SELECTOR,
      ),
      filename: readStringOption(
        trigger,
        [
          "filename",
          "fileName",
          "pdfFilename",
          "exportFilename",
          "downloadFilename",
        ],
        DEFAULT_FILENAME,
      ),
      statusSelector: readStringOption(
        trigger,
        [
          "statusSelector",
          "statusTarget",
          "statusElement",
          "exportStatusSelector",
        ],
        DEFAULT_STATUS_SELECTOR,
      ),
      format: readStringOption(
        trigger,
        ["format", "pageFormat", "pdfFormat"],
        DEFAULT_FORMAT,
      ),
      orientation: normalizeOrientation(
        readStringOption(
          trigger,
          ["orientation", "pageOrientation", "pdfOrientation"],
          DEFAULT_ORIENTATION,
        ),
      ),
      unit: readStringOption(trigger, ["unit", "pdfUnit"], DEFAULT_UNIT),
      margin: readNumberOption(
        trigger,
        ["margin", "pageMargin", "marginMm", "pageMarginMm", "pdfMargin"],
        DEFAULT_MARGIN,
      ),
      renderScale: readNumberOption(
        trigger,
        ["renderScale", "scale", "canvasScale", "pdfRenderScale"],
        DEFAULT_RENDER_SCALE,
      ),
      captureWidth: normalizeCaptureWidth(
        readNumberOption(
          trigger,
          [
            "captureWidth",
            "pdfCaptureWidth",
            "exportCaptureWidth",
            "windowWidth",
            "exportWindowWidth",
            "pdfWindowWidth",
          ],
          DEFAULT_CAPTURE_WIDTH,
        ),
      ),
      fontScale: normalizePositiveScale(
        readNumberOption(trigger, ["fontScale"], DEFAULT_FONT_SCALE),
        DEFAULT_FONT_SCALE,
      ),
      lineHeightScale: normalizePositiveScale(
        readNumberOption(
          trigger,
          ["lineHeightScale"],
          DEFAULT_LINE_HEIGHT_SCALE,
        ),
        DEFAULT_LINE_HEIGHT_SCALE,
      ),
      backgroundColor: readStringOption(
        trigger,
        ["backgroundColor", "pdfBackgroundColor", "canvasBackgroundColor"],
        DEFAULT_BACKGROUND_COLOR,
      ),
      imageType: normalizeImageType(
        readStringOption(
          trigger,
          ["imageType", "pdfImageType"],
          DEFAULT_IMAGE_TYPE,
        ),
      ),
      imageQuality: clamp(
        readNumberOption(
          trigger,
          ["imageQuality", "pdfImageQuality"],
          DEFAULT_IMAGE_QUALITY,
        ),
        0,
        1,
      ),
      useCORS: readBooleanOption(
        trigger,
        ["useCORS", "useCors", "html2canvasUseCORS", "html2canvasUseCors"],
        true,
      ),
      allowTaint: readBooleanOption(
        trigger,
        ["allowTaint", "html2canvasAllowTaint"],
        false,
      ),
      ignoreSelector: readStringOption(
        trigger,
        ["ignoreSelector", "ignoreElementsSelector", "pdfIgnoreSelector"],
        "",
      ),
      expandScrollable: readBooleanOption(
        trigger,
        [
          "expandScrollable",
          "expandScroll",
          "expandOverflow",
          "unfoldScrollable",
        ],
        true,
      ),
      expandSelectors: readStringOption(
        trigger,
        [
          "expandSelectors",
          "expandSelector",
          "scrollExpandSelectors",
          "unfoldSelectors",
        ],
        DEFAULT_EXPAND_SELECTORS,
      ),
      safePageBreaks: normalizeSafePageBreakMode(
        readOptionValue(
          trigger,
          ["safePageBreaks"],
          DEFAULT_SAFE_PAGE_BREAK_MODE,
        ),
      ),
    };
  }

  function resolveStatusElement(trigger, options) {
    var statusElement = null;

    if (options.statusSelector) {
      statusElement = document.querySelector(options.statusSelector);
    }

    if (!statusElement && trigger) {
      statusElement = document.getElementById("jspdf-export-status");
    }

    return statusElement;
  }

  function getStableElementWidth(element, captureWidth) {
    if (captureWidth > 0) {
      return captureWidth;
    }

    return Math.max(
      1,
      Math.ceil(
        Math.max(element.scrollWidth, element.clientWidth, element.offsetWidth),
      ),
    );
  }

  function getStableElementHeight(element) {
    return Math.max(
      1,
      Math.ceil(
        Math.max(
          element.scrollHeight,
          element.clientHeight,
          element.offsetHeight,
        ),
      ),
    );
  }

  function getElementDimensions(element, captureWidth) {
    return {
      width: getStableElementWidth(element, captureWidth),
      height: getStableElementHeight(element),
    };
  }

  function getElementWindow(element) {
    if (element && element.ownerDocument && element.ownerDocument.defaultView) {
      return element.ownerDocument.defaultView;
    }

    return window;
  }

  function hasExpandableOverflow(overflowValue) {
    return Boolean(overflowValue) && overflowValue !== "visible";
  }

  function rememberElementState(stateMap, element) {
    if (!stateMap.has(element)) {
      stateMap.set(element, {
        style: element.getAttribute("style"),
        scrollTop: element.scrollTop,
        scrollLeft: element.scrollLeft,
      });
    }
  }

  function applyFixedCaptureWidth(target, captureWidth, stateMap) {
    rememberElementState(stateMap, target);
    target.style.width = captureWidth + "px";
    target.style.minWidth = captureWidth + "px";
    target.style.maxWidth = captureWidth + "px";
    target.style.boxSizing = "border-box";
  }

  function hasDirectTextContent(element) {
    return Array.prototype.slice.call(element.childNodes).some(function (node) {
      return (
        node && node.nodeType === 3 && String(node.textContent).trim() !== ""
      );
    });
  }

  function isTypographyTarget(element, options) {
    if (!element || shouldIgnoreElement(element, options)) {
      return false;
    }

    if (TYPOGRAPHY_SKIPPED_TAG_PATTERN.test(element.tagName)) {
      return false;
    }

    return (
      TYPOGRAPHY_CONTAINER_TAG_PATTERN.test(element.tagName) ||
      hasDirectTextContent(element)
    );
  }

  function parseFontSizePx(computedStyle) {
    var fontSize = parseFloat(computedStyle.fontSize);

    if (!Number.isFinite(fontSize) || fontSize <= 0) {
      return 0;
    }

    return fontSize;
  }

  function parseLineHeightPx(computedStyle, fontSizePx, scaledFontSizePx) {
    var lineHeightText = String(computedStyle.lineHeight || "").trim();
    var parsedLineHeight = parseFloat(lineHeightText);

    if (
      lineHeightText !== "" &&
      lineHeightText !== "normal" &&
      Number.isFinite(parsedLineHeight) &&
      parsedLineHeight > 0
    ) {
      return parsedLineHeight;
    }

    return Math.max(
      1,
      (scaledFontSizePx || fontSizePx || 1) * DEFAULT_NORMAL_LINE_HEIGHT_RATIO,
    );
  }

  function collectTypographyScaleInstructions(root, options) {
    var elements = [root].concat(
      Array.prototype.slice.call(root.querySelectorAll("*")),
    );

    return elements
      .filter(function (element) {
        return isTypographyTarget(element, options);
      })
      .map(function (element) {
        var computedStyle = getElementWindow(element).getComputedStyle(element);
        var fontSizePx = parseFontSizePx(computedStyle);
        var scaledFontSizePx = Math.max(1, fontSizePx * options.fontScale);
        var lineHeightPx = parseLineHeightPx(
          computedStyle,
          fontSizePx,
          scaledFontSizePx,
        );

        if (!fontSizePx) {
          return null;
        }

        return {
          element: element,
          fontSizePx: scaledFontSizePx,
          lineHeightPx: Math.max(1, lineHeightPx * options.lineHeightScale),
        };
      })
      .filter(Boolean);
  }

  function applyTypographyScale(target, options, stateMap) {
    if (
      options.fontScale === DEFAULT_FONT_SCALE &&
      options.lineHeightScale === DEFAULT_LINE_HEIGHT_SCALE
    ) {
      return;
    }

    collectTypographyScaleInstructions(target, options).forEach(
      function (instruction) {
        rememberElementState(stateMap, instruction.element);
        instruction.element.style.fontSize = instruction.fontSizePx + "px";
        instruction.element.style.lineHeight = instruction.lineHeightPx + "px";
      },
    );
  }

  function expandScrollableElement(element, stateMap) {
    var computedStyle = null;
    var overflowY = "";
    var overflowX = "";
    var hasVerticalOverflow = false;
    var hasHorizontalOverflow = false;
    var isTextarea = false;
    var changed = false;

    if (!element || element.hasAttribute("data-html2canvas-ignore")) {
      return false;
    }

    computedStyle = getElementWindow(element).getComputedStyle(element);
    overflowY = computedStyle.overflowY || computedStyle.overflow;
    overflowX = computedStyle.overflowX || computedStyle.overflow;
    hasVerticalOverflow = element.scrollHeight > element.clientHeight + 1;
    hasHorizontalOverflow = element.scrollWidth > element.clientWidth + 1;
    isTextarea = element.tagName === "TEXTAREA";

    if (!isTextarea && !hasVerticalOverflow && !hasHorizontalOverflow) {
      return false;
    }

    if (
      isTextarea ||
      (hasVerticalOverflow && hasExpandableOverflow(overflowY))
    ) {
      rememberElementState(stateMap, element);
      element.style.height =
        Math.max(element.scrollHeight, element.clientHeight) + "px";
      element.style.maxHeight = "none";
      element.style.overflowY = "visible";
      changed = true;
    }

    if (hasHorizontalOverflow && hasExpandableOverflow(overflowX)) {
      rememberElementState(stateMap, element);
      element.style.width =
        Math.max(element.scrollWidth, element.clientWidth) + "px";
      element.style.maxWidth = "none";
      element.style.overflowX = "visible";
      changed = true;
    }

    if (changed) {
      rememberElementState(stateMap, element);
      element.style.overflow = "visible";
      element.scrollTop = 0;
      element.scrollLeft = 0;
    }

    return changed;
  }

  function expandPreferredElements(root, stateMap, selectorText) {
    if (!selectorText) {
      return;
    }

    root.querySelectorAll(selectorText).forEach(function (element) {
      expandScrollableElement(element, stateMap);
    });
  }

  function expandScrollableDescendants(root, options, stateMap) {
    var pass = 0;

    expandPreferredElements(root, stateMap, options.expandSelectors);

    for (pass = 0; pass < MAX_SCROLL_EXPAND_PASSES; pass += 1) {
      var changed = false;

      Array.prototype.slice
        .call(root.querySelectorAll("*"))
        .reverse()
        .forEach(function (element) {
          if (expandScrollableElement(element, stateMap)) {
            changed = true;
          }
        });

      if (expandScrollableElement(root, stateMap)) {
        changed = true;
      }

      if (!changed) {
        break;
      }
    }
  }

  function restoreElementStates(stateMap) {
    Array.from(stateMap.entries())
      .reverse()
      .forEach(function (entry) {
        var element = entry[0];
        var state = entry[1];

        if (state.style === null) {
          element.removeAttribute("style");
        } else {
          element.setAttribute("style", state.style);
        }

        element.scrollTop = state.scrollTop;
        element.scrollLeft = state.scrollLeft;
      });
  }

  function prepareCaptureTarget(target, options) {
    var stateMap = new Map();

    applyFixedCaptureWidth(target, options.captureWidth, stateMap);
    applyTypographyScale(target, options, stateMap);

    if (options.expandScrollable) {
      expandScrollableDescendants(target, options, stateMap);
    }

    return {
      target: target,
      size: getElementDimensions(target, options.captureWidth),
      restore: function () {
        restoreElementStates(stateMap);
      },
    };
  }

  function isHeadingElement(element) {
    return Boolean(element) && /^H[1-6]$/.test(element.tagName);
  }

  function isPageBreakCandidate(element) {
    var computedStyle = null;

    if (!element || element.hasAttribute("data-html2canvas-ignore")) {
      return false;
    }

    if (BREAK_CANDIDATE_TAG_PATTERN.test(element.tagName)) {
      return true;
    }

    computedStyle = getElementWindow(element).getComputedStyle(element);
    if (
      computedStyle.position === "absolute" ||
      computedStyle.position === "fixed" ||
      computedStyle.display === "inline" ||
      computedStyle.display === "inline-block"
    ) {
      return false;
    }

    return (
      computedStyle.display === "block" ||
      computedStyle.display === "table" ||
      computedStyle.display === "flex" ||
      computedStyle.display === "grid" ||
      computedStyle.display === "list-item"
    );
  }

  function getRelativeRect(targetRect, element) {
    var rect = element.getBoundingClientRect();

    return {
      top: rect.top - targetRect.top,
      bottom: rect.bottom - targetRect.top,
      height: rect.height,
    };
  }

  function pushProtectedRange(ranges, start, end, totalHeight) {
    var clampedStart = Math.max(0, Math.floor(start) + 1);
    var clampedEnd = Math.min(totalHeight, Math.ceil(end) - 1);

    if (clampedEnd - clampedStart >= MIN_BREAK_GAP_PX) {
      ranges.push({
        start: clampedStart,
        end: clampedEnd,
      });
    }
  }

  function normalizeRanges(ranges) {
    var mergedRanges = [];

    ranges
      .slice()
      .sort(function (left, right) {
        return left.start - right.start;
      })
      .forEach(function (range) {
        var lastRange =
          mergedRanges.length > 0
            ? mergedRanges[mergedRanges.length - 1]
            : null;

        if (!lastRange || range.start > lastRange.end) {
          mergedRanges.push({
            start: range.start,
            end: range.end,
          });
          return;
        }

        lastRange.end = Math.max(lastRange.end, range.end);
      });

    return mergedRanges;
  }

  function isProtectedOffset(offset, protectedRanges) {
    var index = 0;

    for (index = 0; index < protectedRanges.length; index += 1) {
      if (offset < protectedRanges[index].start) {
        return false;
      }

      if (offset <= protectedRanges[index].end) {
        return true;
      }
    }

    return false;
  }

  function getBreakCandidateElements(target) {
    return Array.prototype.slice
      .call(target.querySelectorAll("*"))
      .filter(isPageBreakCandidate);
  }

  function getSafePageBreakSettings(mode, idealPageHeight) {
    if (mode === OFF_SAFE_PAGE_BREAK_MODE) {
      return {
        enabled: false,
        backtrackPx: 0,
        headingGroupMaxHeight: 0,
        maxProtectedBlockHeight: 0,
      };
    }

    if (mode === BALANCED_SAFE_PAGE_BREAK_MODE) {
      return {
        enabled: true,
        backtrackPx: BALANCED_PAGE_BREAK_SEARCH_BACKTRACK_PX,
        headingGroupMaxHeight: Math.max(
          1,
          Math.min(
            MAX_BALANCED_HEADING_GROUP_HEIGHT_PX,
            Math.floor(idealPageHeight * BALANCED_HEADING_GROUP_RATIO),
          ),
        ),
        maxProtectedBlockHeight: idealPageHeight,
      };
    }

    return {
      enabled: true,
      backtrackPx: STRICT_PAGE_BREAK_SEARCH_BACKTRACK_PX,
      headingGroupMaxHeight: Number.POSITIVE_INFINITY,
      maxProtectedBlockHeight: idealPageHeight,
    };
  }

  function addIntrinsicProtectedRanges(
    target,
    targetRect,
    totalHeight,
    ranges,
    settings,
  ) {
    Array.prototype.slice
      .call(target.querySelectorAll("*"))
      .forEach(function (element) {
        var rect = null;
        var keepTogether =
          getElementWindow(element).getComputedStyle(element).breakInside ===
          "avoid";

        if (
          !keepTogether &&
          !INTRINSIC_PROTECTED_TAG_PATTERN.test(element.tagName)
        ) {
          return;
        }

        rect = getRelativeRect(targetRect, element);
        if (rect.height < MIN_BREAK_GAP_PX) {
          return;
        }

        if (
          (keepTogether || element.tagName === "TR") &&
          rect.height > settings.maxProtectedBlockHeight
        ) {
          return;
        }

        pushProtectedRange(ranges, rect.top, rect.bottom, totalHeight);
      });
  }

  function addHeadingGroupRanges(
    targetRect,
    totalHeight,
    ranges,
    breakElements,
    headingGroupMaxHeight,
  ) {
    breakElements.forEach(function (element, index) {
      var nextElement = null;
      var headingRect = null;
      var nextRect = null;

      if (!isHeadingElement(element) || index >= breakElements.length - 1) {
        return;
      }

      nextElement = breakElements[index + 1];
      headingRect = getRelativeRect(targetRect, element);
      nextRect = getRelativeRect(targetRect, nextElement);

      if (headingRect.height < MIN_BREAK_GAP_PX || nextRect.height < 1) {
        return;
      }

      if (nextRect.height > headingGroupMaxHeight) {
        return;
      }

      pushProtectedRange(ranges, headingRect.top, nextRect.bottom, totalHeight);
    });
  }

  function findFirstBodyRow(table, thead) {
    var rows = Array.prototype.slice.call(table.querySelectorAll("tr"));
    var index = 0;

    for (index = 0; index < rows.length; index += 1) {
      if (!thead.contains(rows[index])) {
        return rows[index];
      }
    }

    return null;
  }

  function addTableHeaderRanges(
    target,
    targetRect,
    totalHeight,
    ranges,
    settings,
  ) {
    Array.prototype.slice
      .call(target.querySelectorAll("thead"))
      .forEach(function (thead) {
        var table = thead.closest("table");
        var firstRow = null;
        var theadRect = null;
        var rowRect = null;

        if (!table) {
          return;
        }

        firstRow = findFirstBodyRow(table, thead);
        if (!firstRow) {
          return;
        }

        theadRect = getRelativeRect(targetRect, thead);
        rowRect = getRelativeRect(targetRect, firstRow);

        if (theadRect.height < MIN_BREAK_GAP_PX || rowRect.height < 1) {
          return;
        }

        if (
          theadRect.height + rowRect.height >
          settings.maxProtectedBlockHeight
        ) {
          return;
        }

        pushProtectedRange(ranges, theadRect.top, rowRect.bottom, totalHeight);
      });
  }

  function normalizeOffsets(offsets, totalHeight) {
    var normalizedOffsets = [];

    offsets
      .map(function (value) {
        return Math.max(0, Math.min(totalHeight, Math.round(value)));
      })
      .sort(function (left, right) {
        return left - right;
      })
      .forEach(function (value) {
        var lastValue =
          normalizedOffsets.length > 0
            ? normalizedOffsets[normalizedOffsets.length - 1]
            : null;

        if (lastValue === null || value - lastValue >= MIN_BREAK_GAP_PX) {
          normalizedOffsets.push(value);
        }
      });

    return normalizedOffsets;
  }

  function collectProtectedRanges(
    target,
    totalHeight,
    breakElements,
    settings,
  ) {
    var targetRect = target.getBoundingClientRect();
    var ranges = [];

    addIntrinsicProtectedRanges(
      target,
      targetRect,
      totalHeight,
      ranges,
      settings,
    );
    addHeadingGroupRanges(
      targetRect,
      totalHeight,
      ranges,
      breakElements,
      settings.headingGroupMaxHeight,
    );
    addTableHeaderRanges(target, targetRect, totalHeight, ranges, settings);

    return normalizeRanges(ranges);
  }

  function collectPageBreakOffsets(target, totalHeight, settings) {
    var targetRect = target.getBoundingClientRect();
    var offsets = [0, totalHeight];
    var breakElements = getBreakCandidateElements(target);
    var protectedRanges = collectProtectedRanges(
      target,
      totalHeight,
      breakElements,
      settings,
    );

    breakElements.forEach(function (element) {
      var rect = getRelativeRect(targetRect, element);
      var top = rect.top;

      if (rect.height < MIN_BREAK_GAP_PX) {
        return;
      }

      if (top <= MIN_BREAK_GAP_PX || top >= totalHeight - MIN_BREAK_GAP_PX) {
        return;
      }

      if (isProtectedOffset(top, protectedRanges)) {
        return;
      }

      offsets.push(top);
    });

    return normalizeOffsets(offsets, totalHeight);
  }

  function choosePageEndOffset(
    currentOffset,
    totalHeight,
    idealPageHeight,
    pageBreakOffsets,
    backtrackPx,
  ) {
    var remainingHeight = totalHeight - currentOffset;
    var idealEnd = 0;
    var minimumEnd = 0;
    var preferredFloor = 0;
    var earlierPreferredCandidate = 0;
    var earlierSafeCandidate = 0;
    var index = 0;

    if (remainingHeight <= idealPageHeight) {
      return totalHeight;
    }

    idealEnd = currentOffset + idealPageHeight;
    minimumEnd =
      currentOffset +
      Math.min(
        idealPageHeight,
        Math.max(MIN_PAGE_HEIGHT_PX, Math.floor(idealPageHeight * 0.6)),
      );
    preferredFloor = Math.max(minimumEnd, idealEnd - backtrackPx);

    for (index = pageBreakOffsets.length - 1; index >= 0; index -= 1) {
      var candidate = pageBreakOffsets[index];

      if (candidate > idealEnd) {
        continue;
      }

      if (candidate <= currentOffset + MIN_BREAK_GAP_PX) {
        break;
      }

      if (candidate >= preferredFloor) {
        return candidate;
      }

      if (!earlierPreferredCandidate && candidate >= minimumEnd) {
        earlierPreferredCandidate = candidate;
      }

      if (!earlierSafeCandidate) {
        earlierSafeCandidate = candidate;
      }
    }

    if (earlierPreferredCandidate) {
      return earlierPreferredCandidate;
    }

    if (earlierSafeCandidate) {
      return earlierSafeCandidate;
    }

    return Math.min(totalHeight, idealEnd);
  }

  function buildPageOffsets(
    totalHeight,
    idealPageHeight,
    pageBreakOffsets,
    backtrackPx,
  ) {
    var offsets = [0];
    var currentOffset = 0;

    while (currentOffset < totalHeight) {
      var nextOffset = choosePageEndOffset(
        currentOffset,
        totalHeight,
        idealPageHeight,
        pageBreakOffsets,
        backtrackPx,
      );

      if (nextOffset <= currentOffset) {
        nextOffset = Math.min(totalHeight, currentOffset + idealPageHeight);
      }

      offsets.push(nextOffset);
      currentOffset = nextOffset;
    }

    return offsets;
  }

  function createPdfDocument(options) {
    var jsPDF = null;
    var pdf = null;
    var pageWidth = 0;
    var pageHeight = 0;
    var margin = Math.max(0, options.margin);

    if (!window.jspdf || !window.jspdf.jsPDF) {
      throw new Error("jsPDF library is not loaded.");
    }

    jsPDF = window.jspdf.jsPDF;
    pdf = new jsPDF({
      orientation: options.orientation,
      unit: options.unit,
      format: options.format,
    });

    pageWidth = pdf.internal.pageSize.getWidth();
    pageHeight = pdf.internal.pageSize.getHeight();

    return {
      instance: pdf,
      pageWidth: pageWidth,
      pageHeight: pageHeight,
      margin: margin,
      contentWidth: Math.max(1, pageWidth - margin * 2),
      contentHeight: Math.max(1, pageHeight - margin * 2),
    };
  }

  function createPageLayout(target, pdfContext, options) {
    var dimensions = getElementDimensions(target, options.captureWidth);
    var idealPageHeight = Math.max(
      1,
      Math.floor(
        (pdfContext.contentHeight * dimensions.width) / pdfContext.contentWidth,
      ),
    );
    var safePageBreakSettings = getSafePageBreakSettings(
      options.safePageBreaks,
      idealPageHeight,
    );
    var pageBreakOffsets = safePageBreakSettings.enabled
      ? collectPageBreakOffsets(
          target,
          dimensions.height,
          safePageBreakSettings,
        )
      : [0, dimensions.height];

    return {
      size: dimensions,
      pageBreakOffsets: pageBreakOffsets,
      pageOffsets: buildPageOffsets(
        dimensions.height,
        idealPageHeight,
        pageBreakOffsets,
        safePageBreakSettings.backtrackPx,
      ),
    };
  }

  function stepDownScale(scale) {
    return Math.max(
      MIN_RENDER_SCALE,
      Math.round((scale - RENDER_SCALE_STEP) * 100) / 100,
    );
  }

  function isCanvasSafe(width, height, scale) {
    var scaledWidth = Math.ceil(width * scale);
    var scaledHeight = Math.ceil(height * scale);

    if (scaledWidth > MAX_CANVAS_EDGE_PX || scaledHeight > MAX_CANVAS_EDGE_PX) {
      return false;
    }

    return scaledWidth * scaledHeight <= MAX_CANVAS_AREA_PX;
  }

  function resolveRenderScale(width, height, preferredScale) {
    var scale = Math.max(
      MIN_RENDER_SCALE,
      preferredScale || DEFAULT_RENDER_SCALE,
    );

    while (scale >= MIN_RENDER_SCALE) {
      if (isCanvasSafe(width, height, scale)) {
        return scale;
      }

      if (scale === MIN_RENDER_SCALE) {
        break;
      }

      scale = stepDownScale(scale);
    }

    return 0;
  }

  function matchesSelector(element, selector) {
    var matcher =
      element.matches ||
      element.msMatchesSelector ||
      element.webkitMatchesSelector;

    if (!matcher) {
      return false;
    }

    return matcher.call(element, selector);
  }

  function shouldIgnoreElement(element, options) {
    if (!element || !element.hasAttribute) {
      return false;
    }

    if (element.hasAttribute("data-html2canvas-ignore")) {
      return true;
    }

    if (
      options.ignoreSelector &&
      matchesSelector(element, options.ignoreSelector)
    ) {
      return true;
    }

    return false;
  }

  function buildCanvasOptions(layout, options, renderScale) {
    return {
      scale: renderScale,
      useCORS: options.useCORS,
      allowTaint: options.allowTaint,
      backgroundColor: options.backgroundColor,
      windowWidth: options.captureWidth,
      windowHeight: layout.size.height,
      width: options.captureWidth,
      height: layout.size.height,
      x: 0,
      y: 0,
      scrollX: 0,
      scrollY: 0,
      ignoreElements: function (element) {
        return shouldIgnoreElement(element, options);
      },
    };
  }

  function createCanvasSlice(sourceCanvas, startY, endY) {
    var sliceCanvas = document.createElement("canvas");
    var sliceHeight = Math.max(1, endY - startY);
    var sliceContext = null;

    sliceCanvas.width = sourceCanvas.width;
    sliceCanvas.height = sliceHeight;
    sliceContext = sliceCanvas.getContext("2d");
    sliceContext.drawImage(
      sourceCanvas,
      0,
      startY,
      sourceCanvas.width,
      sliceHeight,
      0,
      0,
      sourceCanvas.width,
      sliceHeight,
    );
    return sliceCanvas;
  }

  function appendCanvasPage(pdfContext, canvas, pageIndex, options) {
    var renderedHeight =
      (canvas.height * pdfContext.contentWidth) / canvas.width;

    if (pageIndex > 0) {
      pdfContext.instance.addPage(options.format, options.orientation);
    }

    pdfContext.instance.addImage(
      canvas.toDataURL(
        options.imageType === "PNG" ? "image/png" : "image/jpeg",
        options.imageQuality,
      ),
      options.imageType,
      pdfContext.margin,
      pdfContext.margin,
      pdfContext.contentWidth,
      renderedHeight,
    );
  }

  function buildPdfBlob(target, options, statusElement) {
    var captureContext = prepareCaptureTarget(target, options);
    var pdfContext = null;
    var layout = null;
    var renderScale = 0;

    try {
      pdfContext = createPdfDocument(options);
      layout = createPageLayout(captureContext.target, pdfContext, options);
      renderScale = resolveRenderScale(
        layout.size.width,
        layout.size.height,
        options.renderScale,
      );

      if (!renderScale) {
        throw new Error(
          "전체 캡처가 가능한 캔버스 크기를 계산하지 못했습니다.",
        );
      }
    } catch (error) {
      captureContext.restore();
      throw error;
    }

    setStatus(statusElement, "화면을 캡처하는 중입니다.", false);

    return window
      .html2canvas(
        captureContext.target,
        buildCanvasOptions(layout, options, renderScale),
      )
      .then(
        function (fullCanvas) {
          try {
            var pageOffsets = layout.pageOffsets;
            var totalPages = Math.max(1, pageOffsets.length - 1);
            var canvasScale = fullCanvas.height / layout.size.height;
            var pageIndex = 0;

            for (pageIndex = 0; pageIndex < totalPages; pageIndex += 1) {
              var startY = Math.max(
                0,
                Math.floor(pageOffsets[pageIndex] * canvasScale),
              );
              var endY =
                pageIndex === totalPages - 1
                  ? fullCanvas.height
                  : Math.min(
                      fullCanvas.height,
                      Math.max(
                        startY + 1,
                        Math.floor(pageOffsets[pageIndex + 1] * canvasScale),
                      ),
                    );

              setStatus(
                statusElement,
                "PDF 페이지를 정리하는 중입니다. (" +
                  (pageIndex + 1) +
                  "/" +
                  totalPages +
                  ")",
                false,
              );
              appendCanvasPage(
                pdfContext,
                createCanvasSlice(fullCanvas, startY, endY),
                pageIndex,
                options,
              );
            }

            return pdfContext.instance.output("blob");
          } finally {
            captureContext.restore();
          }
        },
        function (error) {
          captureContext.restore();
          throw error;
        },
      );
  }

  function triggerBlobDownload(blob, filename) {
    var objectUrl = URL.createObjectURL(blob);
    var link = document.createElement("a");

    link.href = objectUrl;
    link.download = filename;
    link.style.display = "none";

    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);

    window.setTimeout(function () {
      URL.revokeObjectURL(objectUrl);
    }, 1000);
  }

  function ensureLibraries() {
    if (typeof window.html2canvas !== "function") {
      throw new Error("html2canvas library is not loaded.");
    }

    if (!window.jspdf || !window.jspdf.jsPDF) {
      throw new Error("jsPDF library is not loaded.");
    }
  }

  function ensurePdfLibrary() {
    if (!window.jspdf || !window.jspdf.jsPDF) {
      throw new Error("jsPDF library is not loaded.");
    }
  }

  function resolveTriggerElement(triggerOrSelector) {
    if (typeof triggerOrSelector === "string") {
      return document.querySelector(triggerOrSelector);
    }

    return triggerOrSelector || document.getElementById("jspdf-export-btn");
  }

  function inspectLayout(triggerOrSelector) {
    var trigger = resolveTriggerElement(triggerOrSelector);
    var options = getPdfOptions(trigger);
    var target = document.querySelector(options.selector);
    var captureContext = null;
    var pdfContext = null;
    var layout = null;

    if (!target) {
      throw new Error("캡처 대상을 찾을 수 없습니다: " + options.selector);
    }

    ensurePdfLibrary();
    captureContext = prepareCaptureTarget(target, options);

    try {
      pdfContext = createPdfDocument(options);
      layout = createPageLayout(captureContext.target, pdfContext, options);

      return {
        safePageBreaks: options.safePageBreaks,
        fontScale: options.fontScale,
        lineHeightScale: options.lineHeightScale,
        size: {
          width: layout.size.width,
          height: layout.size.height,
        },
        pageBreakOffsets: layout.pageBreakOffsets.slice(),
        pageOffsets: layout.pageOffsets.slice(),
      };
    } finally {
      captureContext.restore();
    }
  }

  function exportFromTrigger(trigger) {
    trigger = resolveTriggerElement(trigger);

    if (isTriggerBusy(trigger)) {
      return Promise.resolve();
    }

    var options = getPdfOptions(trigger);
    var statusElement = resolveStatusElement(trigger, options);
    var target = document.querySelector(options.selector);

    if (!target) {
      setStatus(
        statusElement,
        "캡처 대상을 찾을 수 없습니다: " + options.selector,
        true,
      );
      return Promise.resolve();
    }

    ensureLibraries();
    setTriggerBusy(trigger, true);
    setStatus(statusElement, "웹폰트와 화면 상태를 확인하는 중입니다.", false);

    return waitForFonts()
      .then(function () {
        return buildPdfBlob(target, options, statusElement);
      })
      .then(function (blob) {
        triggerBlobDownload(blob, options.filename);
        setStatus(statusElement, "PDF 다운로드를 시작했습니다.", false);
        return undefined;
      })
      .catch(function (error) {
        setStatus(
          statusElement,
          "PDF 생성에 실패했습니다: " +
            (error && error.message ? error.message : error),
          true,
        );
      })
      .then(function (result) {
        setTriggerBusy(trigger, false);
        return result;
      });
  }

  function isTriggerElement(element) {
    return (
      element &&
      element.nodeType === 1 &&
      (element.id === "jspdf-export-btn" ||
        element.hasAttribute("data-pdf-export"))
    );
  }

  function findTriggerElement(startElement) {
    var currentElement = startElement;

    while (currentElement && currentElement !== document) {
      if (isTriggerElement(currentElement)) {
        return currentElement;
      }

      currentElement = currentElement.parentNode;
    }

    return null;
  }

  function handleDocumentClick(event) {
    var trigger = findTriggerElement(event.target);

    if (!trigger) {
      return;
    }

    event.preventDefault();
    exportFromTrigger(trigger);
  }

  function bindDocumentClickHandler() {
    var state = getExportState();

    if (state.documentClickHandler) {
      document.removeEventListener("click", state.documentClickHandler);
    }

    state.documentClickHandler = handleDocumentClick;
    document.addEventListener("click", handleDocumentClick);
  }

  bindDocumentClickHandler();
  window.jspdfExport = {
    exportFromTrigger: exportFromTrigger,
    inspectLayout: inspectLayout,
  };
})();
