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

  function chooseNever(entry) {
    if (!ready || entry.pending) return;
    entry.pending = true;
    entry.button.disabled = true;
    const writeRevision = preferenceRevision;

    chrome.storage.local.set({ [PREFERENCE]: true }, () => {
      entry.pending = false;
      if (chrome.runtime.lastError) {
        entry.button.disabled = false;
        entry.button.textContent = "Never (try again)";
        entry.button.title = "Your choice could not be saved. Click to try again.";
        return;
      }
      // A reset in another tab can arrive before this write's callback.
      if (preferenceRevision !== writeRevision && !never) {
        scheduleScan();
        return;
      }
      never = true;
      preferenceRevision++;
      dismiss(entry);
      scheduleScan();
    });
  }

  function makeEntry(control, reminder) {
    const button = document.createElement("button");
    button.type = "button";
    button.textContent = "Never";
    button.dataset.bbcNoLoginNever = "";
    button.title = "Don't ask me to sign in on BBC websites again";
    button.disabled = !ready;
    const entry = { control, reminder, button, dismissed: false, pending: false, generation: 0 };
    button.addEventListener("click", (event) => {
      event.preventDefault();
      event.stopPropagation();
      chooseNever(entry);
    });
    entries.set(control, entry);
    return entry;
  }

  function scan() {
    scheduled = false;
    for (const [control, entry] of entries) {
      if (!control.isConnected || !reminderFor(control)) {
        entry.button.remove();
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
