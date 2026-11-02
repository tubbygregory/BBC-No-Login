(() => {
  "use strict";

  const PREFERENCE = "neverAskToSignIn";
  const CONTROL = 'button, a, input[type="button"], input[type="submit"], [role="button"]';
  const DEFER = /^(?:maybe later|not now|no thanks)[.!]?$/i;
  const SIGN_IN = /\b(?:sign[\s-]*in|log[\s-]*in|login)\b/i;
  const LANDMARK = /^(?:HTML|BODY|MAIN|HEADER|FOOTER|NAV|ARTICLE)$/;
  const BOUNDARY = /^(?:SECTION|ASIDE|FORM|DIALOG)$/;
  const entries = new Map();
  let ready = false;
  let never = false;
  let preferenceRevision = 0;
  let scheduled = false;
  let notice = null;

  function removeNotice() {
    if (!notice) return;
    clearTimeout(notice.timer);
    notice.root.remove();
    notice = null;
  }

  function showSavedNotice(restoreKeyboardFocus = false) {
    removeNotice();
    const root = document.createElement("aside");
    root.dataset.bbcNoLoginNotice = "";
    root.setAttribute("aria-label", "BBC No Login");
    root.setAttribute("popover", "manual");

    const mark = document.createElement("span");
    mark.dataset.bbcNoLoginMark = "";
    mark.setAttribute("aria-hidden", "true");
    mark.textContent = "✓";

    const content = document.createElement("div");
    const title = document.createElement("p");
    title.dataset.bbcNoLoginTitle = "";
    title.setAttribute("role", "status");
    title.setAttribute("aria-live", "polite");
    title.textContent = "Your choice is remembered";
    const copy = document.createElement("p");
    copy.dataset.bbcNoLoginCopy = "";
    copy.textContent = "Optional BBC sign-in reminders will be dismissed automatically.";
    const undo = document.createElement("button");
    undo.type = "button";
    undo.dataset.bbcNoLoginUndo = "";
    undo.textContent = "Undo";
    content.append(title, copy, undo);

    const close = document.createElement("button");
    close.type = "button";
    close.dataset.bbcNoLoginClose = "";
    close.setAttribute("aria-label", "Dismiss confirmation");
    close.textContent = "×";
    root.append(mark, content, close);

    const state = { root, timer: null, pending: false, undone: false };
    notice = state;
    const renderUndone = () => {
      state.undone = true;
      title.textContent = "Reminders allowed again";
      copy.textContent = "Future reminders can appear. The one you dismissed will stay closed.";
      undo.textContent = "Undone";
      undo.disabled = true;
    };
    const expire = () => {
      // Never remove an action while someone is reading or using it.
      if (state.pending || root.contains(document.activeElement) || root.matches(":hover")) {
        state.timer = setTimeout(expire, 5000);
      } else if (notice === state) removeNotice();
    };
    state.timer = setTimeout(expire, 12000);
    close.addEventListener("click", removeNotice);
    undo.addEventListener("click", () => {
      if (state.pending) return;
      state.pending = true;
      undo.disabled = true;
      undo.textContent = "Saving…";
      const writeRevision = preferenceRevision;
      chrome.storage.local.set({ [PREFERENCE]: false }, () => {
        state.pending = false;
        const error = chrome.runtime.lastError;
        if (notice !== state) return;
        if (error) {
          if (preferenceRevision !== writeRevision && !never) {
            renderUndone();
            return;
          }
          title.textContent = "Your choice is still saved";
          copy.textContent = "Could not undo your choice. Please try again.";
          undo.disabled = false;
          undo.textContent = "Try undo again";
          return;
        }
        if (preferenceRevision !== writeRevision && never) {
          undo.disabled = false;
          undo.textContent = "Undo";
          return;
        }
        never = false;
        preferenceRevision++;
        // Keep the focused control in place while presenting the result.
        renderUndone();
        scheduleScan();
      });
    });

    (document.body || document.documentElement).append(root);
    // The top layer keeps feedback above a site's overlays without taking focus.
    // Fallback styling works in Chromium versions without the Popover API.
    if (typeof root.showPopover === "function") {
      try { root.showPopover(); } catch { /* The document may be navigating. */ }
    }
    // If the site's handler leaves keyboard focus on the document after closing
    // the reminder, make Undo reachable without tabbing through the whole page.
    if (restoreKeyboardFocus && [document.body, document.documentElement].includes(document.activeElement)) {
      undo.focus({ preventScroll: true });
    }
  }

  const normalize = (text) => (text || "").replace(/\s+/g, " ").trim();
  const label = (control) => normalize(control.textContent) ||
    normalize(control.value) || normalize(control.getAttribute("aria-label"));

  function isDialog(element) {
    return element.matches('dialog, [role="dialog"], [role="alertdialog"], [aria-modal="true"]');
  }

  function contextText(root) {
    const dialog = isDialog(root);
    const walker = document.createTreeWalker(root, NodeFilter.SHOW_ELEMENT | NodeFilter.SHOW_TEXT, {
      acceptNode(node) {
        if (node.nodeType === Node.TEXT_NODE) return NodeFilter.FILTER_ACCEPT;
        if (node.matches('script, style, template, noscript, [hidden], [inert], [aria-hidden="true"], [data-bbc-no-login-never]') ||
            (!dialog && LANDMARK.test(node.tagName))) return NodeFilter.FILTER_REJECT;
        return NodeFilter.FILTER_SKIP;
      }
    });
    const parts = dialog ? [root.getAttribute("aria-label") || ""] : [];
    let length = 0;
    while (walker.nextNode()) {
      const text = normalize(walker.currentNode.nodeValue);
      length += text.length;
      if (length > 2000) return null;
      parts.push(text);
    }
    // Separating text nodes handles unspaced HTML like </h2><button>.
    return parts.join(" ");
  }

  function isAvailable(control) {
    return !control.disabled && control.getAttribute("aria-disabled") !== "true" &&
      !control.closest('[hidden], [inert], [aria-hidden="true"]') &&
      control.getClientRects().length > 0 &&
      getComputedStyle(control).visibility !== "hidden";
  }

  // Require an explicit defer action next to sign-in copy. Never treat a header
  // sign-in link or an account-required screen as a dismissible reminder.
  function reminderFor(control) {
    if (!DEFER.test(label(control)) || !isAvailable(control)) return null;

    const dialog = control.closest('dialog, [role="dialog"], [role="alertdialog"], [aria-modal="true"]');
    if (dialog) {
      const text = contextText(dialog);
      return text !== null && SIGN_IN.test(text) ? dialog : null;
    }

    let parent = control.parentElement;
    for (let depth = 0; parent && depth < 8; depth++, parent = parent.parentElement) {
      if (LANDMARK.test(parent.tagName)) return null;
      const text = contextText(parent);
      if (text === null) return null;
      if (SIGN_IN.test(text)) return parent;
      // Never borrow sign-in copy from outside a separate survey/form/prompt.
      if (BOUNDARY.test(parent.tagName) || isDialog(parent)) return null;
    }
    return null;
  }

  function dismiss(entry) {
    if (entry.dismissed || !isAvailable(entry.control)) return;
    entry.dismissed = true;
    const generation = ++entry.generation;
    entry.button.remove();
    // Let BBC's own handler clean up focus, scroll locks, overlays and cookies.
    // Do not hide the page or attempt to bypass a required account screen.
    entry.control.click();
    // Server-rendered controls may appear before the site attaches its handlers.
    // Retry briefly, with a fixed limit, rather than clicking on every mutation.
    for (const delay of [300, 1200]) {
      setTimeout(() => {
        if (never && entry.generation === generation && entries.get(entry.control) === entry &&
            reminderFor(entry.control)) entry.control.click();
      }, delay);
    }
  }

  function chooseNever(entry, keyboardInitiated = false) {
    if (!ready || entry.pending) return;
    entry.pending = true;
    entry.button.disabled = true;
    entry.button.textContent = "Saving…";
    entry.error?.remove();
    const writeRevision = preferenceRevision;

    chrome.storage.local.set({ [PREFERENCE]: true }, () => {
      entry.pending = false;
      if (chrome.runtime.lastError) {
        if (preferenceRevision !== writeRevision) {
          entry.button.textContent = "Never";
          scheduleScan();
          return;
        }
        entry.button.disabled = false;
        entry.button.textContent = "Never — try again";
        entry.button.title = "Your choice could not be saved. Click to try again.";
        if (!entry.error) {
          entry.error = document.createElement("span");
          entry.error.dataset.bbcNoLoginError = "";
          entry.error.setAttribute("role", "alert");
          entry.error.textContent = "Could not save your choice. Please try again.";
        }
        entry.button.after(entry.error);
        if (keyboardInitiated && [document.body, document.documentElement].includes(document.activeElement)) {
          entry.button.focus({ preventScroll: true });
        }
        return;
      }
      // A reset in another tab can arrive before this write's callback.
      if (preferenceRevision !== writeRevision && !never) {
        entry.button.textContent = "Never";
        scheduleScan();
        return;
      }
      never = true;
      preferenceRevision++;
      dismiss(entry);
      showSavedNotice(keyboardInitiated);
      scheduleScan();
    });
  }

  function makeEntry(control, reminder) {
    const button = document.createElement("button");
    button.type = "button";
    button.textContent = "Never";
    button.dataset.bbcNoLoginNever = "";
    button.title = "Remember my choice on BBC websites · BBC No Login";
    button.disabled = !ready;
    const entry = { control, reminder, button, dismissed: false, pending: false, generation: 0 };
    button.addEventListener("click", (event) => {
      event.preventDefault();
      event.stopPropagation();
      chooseNever(entry, event.detail === 0);
    });
    entries.set(control, entry);
    return entry;
  }

  function scan() {
    scheduled = false;
    for (const [control, entry] of entries) {
      if (!control.isConnected || !reminderFor(control)) {
        entry.button.remove();
        entry.error?.remove();
        entries.delete(control);
      }
    }

    for (const control of document.querySelectorAll(CONTROL)) {
      if (control.hasAttribute("data-bbc-no-login-never")) continue;
      const reminder = reminderFor(control);
      if (!reminder) continue;
      const entry = entries.get(control) || makeEntry(control, reminder);
      const disabled = !ready || entry.pending;
      if (entry.button.disabled !== disabled) entry.button.disabled = disabled;
      if (ready && never) {
        dismiss(entry);
      } else if (!entry.dismissed && !entry.button.isConnected) {
        // Insert beside, rather than inside, the existing button/link.
        control.after(entry.button);
      }
    }
  }

  function scheduleScan() {
    if (scheduled) return;
    scheduled = true;
    setTimeout(scan, 50);
  }

  chrome.storage.onChanged.addListener((changes, area) => {
    if (area !== "local" || !Object.hasOwn(changes, PREFERENCE)) return;
    preferenceRevision++;
    never = changes[PREFERENCE].newValue === true;
    ready = true;
    if (notice && ((never && notice.undone) || (!never && !notice.pending && !notice.undone))) removeNotice();
    if (!never) {
      for (const entry of entries.values()) {
        entry.dismissed = false;
        entry.generation++;
      }
    }
    scheduleScan();
  });

  const readRevision = preferenceRevision;
  chrome.storage.local.get({ [PREFERENCE]: false }, (result) => {
    // A preference changed while storage was loading: the newer choice wins.
    if (readRevision === preferenceRevision) {
      never = !chrome.runtime.lastError && result?.[PREFERENCE] === true;
    }
    ready = true;
    scheduleScan();
  });

  new MutationObserver(scheduleScan).observe(document, {
    childList: true,
    subtree: true,
    characterData: true,
    attributes: true,
    attributeFilter: ["hidden", "inert", "aria-hidden", "aria-disabled", "disabled", "class", "style", "aria-label", "value"]
  });
  document.addEventListener("DOMContentLoaded", scheduleScan, { once: true });
  scheduleScan();
})();
