"use strict";

/**
 * Feature module for the Search Nudges Shield Study.
 **/

Cu.importGlobalProperties(["fetch"]);

ChromeUtils.import("resource://gre/modules/Services.jsm");
ChromeUtils.defineModuleGetter(this, "AddonManager",
  "resource://gre/modules/AddonManager.jsm");
ChromeUtils.defineModuleGetter(this, "clearInterval",
  "resource://gre/modules/Timer.jsm");
ChromeUtils.defineModuleGetter(this, "setInterval",
  "resource://gre/modules/Timer.jsm");
ChromeUtils.defineModuleGetter(this, "LaterRun",
  "resource:///modules/LaterRun.jsm");
ChromeUtils.defineModuleGetter(this, "SessionStore",
  "resource:///modules/sessionstore/SessionStore.jsm");
ChromeUtils.defineModuleGetter(this, "BrowserWindowTracker",
  "resource:///modules/BrowserWindowTracker.jsm");

const EXPORTED_SYMBOLS = ["Feature"];
const NUDGES_SHOWN_COUNT_MAX = 4;
const PREF_NUDGES_SHOWN_COUNT = "extensions.shield-search-nudges.shown_count";
const PREF_NUDGES_DISMISSED_CLICKAB = "extensions.shield-search-nudges.clicked-awesomebar";
const PREF_NUDGES_DISMISSED_WITHOK = "extensions.shield-search-nudges.oked";
const SEARCH_ENGINE_TOPIC = "browser-search-engine-modified";
const STRING_TIP_GENERAL = "urlbarSearchTip.onboarding";
const STRING_TIP_REDIRECT = "urlbarSearchTip.engineIsCurrentPage";
const TIP_PANEL_ID = "shield-search-nudges-panel";
const TIP_ANCHOR_SELECTOR = "#identity-icon";

/**
 * Return a browser window as soon as possible. If there's no window available
 * yet, simply wait for the first browser window to open.
 */
async function getBrowserWindow() {
  const window = BrowserWindowTracker.getTopWindow();
  if (window) {
    return window;
  }

  return waitForCondition(() => BrowserWindowTracker.getTopWindow());
}

function waitForCondition(condition, msg, interval = 100, maxTries = 50) {
  return new Promise((resolve, reject) => {
    let tries = 0;
    const intervalID = setInterval(async function() {
      if (tries >= maxTries) {
        clearInterval(intervalID);
        msg += ` - timed out after ${maxTries} tries.`;
        reject(msg);
        return;
      }

      let conditionPassed = false;
      try {
        conditionPassed = await condition();
      } catch (e) {
        msg += ` - threw exception: ${e}`;
        clearInterval(intervalID);
        reject(msg);
        return;
      }

      if (conditionPassed) {
        clearInterval(intervalID);
        resolve(conditionPassed);
      }
      tries++;
    }, interval);
  });
}

class Feature {
  /**
   * The feature this study implements.
   *
   *  - studyUtils: the configured studyUtils singleton.
   *
   */
  constructor(variation, studyUtils, log, libPath) {
    this.variation = variation;
    this.studyUtils = studyUtils;
    this.log = log;
    this.libPath = libPath;
    this.shownPanelType = null;
    this._shownPanels = new Set();
    this._listenersAdded = false;
    this._searchEngineObserverAdded = false;
    this._searchEngineCurrentOrigin = "";
    this._startingUp = true;
  }

  /**
   * Boot the addon, which in our case means:
   * 1. (re-)setting the prefs if necessary,
   * 2. loading the frame script and
   * 3. connect with the Search service.
   */
  async start(reason) {
    this.log.debug("Feature start");

    // Perform something only during INSTALL = a new study period begins.
    if (reason === "ADDON_INSTALL") {
      this.resetPrefs();
      // Return early, don't set up anything else.
      // We do this for the first session after installation to avoid:
      // - The first session after a new installation (aka new user).
      // - The first session after upgrade (which is difficult to detect without
      //   changes to core Firefox).
      return;
    }

    // We wait for this promise, and then idle dispatch, so that hopefully
    // nsBrowserGlue has had time to do it stuff, and then work out if it is
    // displaying the default browser prompt.
    await SessionStore.promiseAllWindowsRestored;

    // Listen for new windows being opened
    Services.ww.registerNotification(this);

    // Listen for addon disabling or uninstall.
    AddonManager.addAddonListener(this);

    this._startingUp = true;

    const winEnum = Services.wm.getEnumerator("navigator:browser");
    while (winEnum.hasMoreElements()) {
      const win = winEnum.getNext();
      if (win.closed) {
        continue;
      }
      this._addListenersForWindow(win);
    }
    this._listenersAdded = true;

    Services.tm.idleDispatchToMainThread(() => {
      // We can't reliably check what is being loaded at startup in the main tab.
      // Hence, we let the listeners detect what is being loaded, and then check
      // once we've finished starting.
      this._startingUp = false;
      this._checkDisplayOnFirstStartup();
    });
  }

  _addListenersForWindow(window) {
    window.gBrowser.addTabsProgressListener(this);
    window.gBrowser.tabContainer.addEventListener("TabSelect", this);
  }

  _removeListenersFromWindow(window) {
    window.gBrowser.removeTabsProgressListener(this);
    window.gBrowser.tabContainer.removeEventListener("TabSelect", this);
  }

  /* START AddonListener interface methods. */
  onUninstalling(addon) {
    this.handleDisableOrUninstall(addon);
  }

  onDisabled(addon) {
    this.handleDisableOrUninstall(addon);
  }

  handleDisableOrUninstall(addon) {
    if (addon.id !== this.studyUtils.info().addon.id) {
      return;
    }
    AddonManager.removeAddonListener(this);
    // This is needed even for onUninstalling, because it nukes the addon
    // from UI. If we don't do this, the user has a chance to "undo".
    addon.uninstall();
  }
  /* END AddonListener interface methods. */

  /**
   * Returns the current search engine origin.
   *
   * @return {String} Returns a string which is the origin, or an empty string
   *                  if the search service isn't initialized.
   */
  get currentEngineOrigin() {
    if (!Services.search.isInitialized) {
      return "";
    }

    if (this._searchEngineCurrentOrigin) {
      return this._searchEngineCurrentOrigin;
    }

    if (!this._searchEngineObserverAdded) {
      Services.obs.addObserver(this, SEARCH_ENGINE_TOPIC);
      this._searchEngineObserverAdded = true;
    }

    this._searchEngineCurrentOrigin = Services.search.currentEngine.getSubmission("").uri.prePath;
    return this._searchEngineCurrentOrigin;
  }

  /**
   * Resets the pref to their default values.
   *
   * @param {Boolean} [permanently] Whether to clear the prefs or set them with
   *                                an initial value intead.
   */
  resetPrefs(permanently = false) {
    if (permanently) {
      for (const pref of [PREF_NUDGES_SHOWN_COUNT, PREF_NUDGES_DISMISSED_CLICKAB, PREF_NUDGES_DISMISSED_WITHOK]) {
        Services.prefs.clearUserPref(pref);
      }
    } else {
      Services.prefs.setIntPref(PREF_NUDGES_SHOWN_COUNT, 0);
      Services.prefs.setBoolPref(PREF_NUDGES_DISMISSED_CLICKAB, false);
      Services.prefs.setBoolPref(PREF_NUDGES_DISMISSED_WITHOK, false);
    }
  }

  /**
   * Stops tracking for this session by removing all the listeners. This has
   * the wanted side effect that we also stop displaying any popups.
   */
  stopTrackingForThisSession() {
    if (this._searchEngineObserverAdded) {
      Services.obs.removeObserver(this, SEARCH_ENGINE_TOPIC);
      this._searchEngineObserverAdded = false;
    }

    if (this._listenersAdded) {
      Services.ww.unregisterNotification(this);
      const winEnum = Services.wm.getEnumerator("navigator:browser");
      while (winEnum.hasMoreElements()) {
        const win = winEnum.getNext();
        if (win.closed) {
          continue;
        }
        this._removeListenersFromWindow(win);
      }
    }
  }

  /**
   * Called at end of study, and if the user disables the study or it gets
   * uninstalled by other means.
   *
   * @param {Boolean} [isUninstall]
   */
  async shutdown(isUninstall = false) {
    if (isUninstall) {
      this.resetPrefs(true);
    }

    this.stopTrackingForThisSession();

    // If the panel was created in this window before, let's make sure to clean it up.
    const winEnum = Services.wm.getEnumerator("navigator:browser");
    while (winEnum.hasMoreElements()) {
      const win = winEnum.getNext();
      if (win.document && win.document.getElementById(TIP_PANEL_ID) && !win.closed) {
        const {panel, panelButton} = this._ensurePanel(win);
        panelButton.removeEventListener("command", this);
        panel.remove();
      }
    }
  }

  observe(subject, topic /* , data */) {
    switch (topic) {
      case "domwindowopened": {
        if (!(subject instanceof Ci.nsIDOMWindow) || subject.closed) {
          break;
        }
        const onLoad = () => {
          // Ignore non-browser windows.
          if (subject.document.documentElement.getAttribute("windowtype") === "navigator:browser") {
            this._addListenersForWindow(subject);
          }
        };
        subject.addEventListener("load", onLoad, {once: true});
        break;
      }
      case "domwindowclosed":
        if ((subject instanceof Ci.nsIDOMWindow) &&
           subject.document.documentElement.getAttribute("windowtype") === "navigator:browser") {
          this._removeListenersFromWindow(subject);
        }
        break;
    }
  }

  onLocationChange(browser, webProgress, request, locationURI, /* aFlags */) {
    // Note: a null request probably means this was just a simple session restore.
    if (locationURI && locationURI.spec && request && webProgress.isTopLevel) {
      const window = browser.ownerGlobal;
      const tab = window.gBrowser.getTabForBrowser(browser);
      if (tab && tab.selected) {
        this._checkDocument(locationURI.spec, window);
      }
    }
  }

  handleEvent(event) {
    const eventPrefix = this.shownPanelType ? this.shownPanelType + "-" : "";
    switch (event.type) {
      case "command": {
        // 'Okay, got it' button was clicked.
        Services.prefs.setBoolPref(PREF_NUDGES_DISMISSED_WITHOK, true);
        let panel = event.target.parentNode;
        while (panel.parentNode && panel.localName != "panel") {
          panel = panel.parentNode;
        }
        // Hide the panel when the button is clicked.
        if (panel && panel.hidePopup) {
          panel.hidePopup();
          this.telemetry({event: eventPrefix + "hidden-buttonclick"});
        }
        break;
      }
      case "popuphidden": {
        // Check if the panel was hidden by clicking the URLBar.
        const window = event.target.ownerGlobal;
        const focusMethod = Services.focus.getLastFocusMethod(window);
        if (window.gURLBar.focused && focusMethod && !!(focusMethod & Services.focus.FLAG_BYMOUSE)) {
          Services.prefs.setBoolPref(PREF_NUDGES_DISMISSED_CLICKAB, true);
          this.telemetry({event: eventPrefix + "hidden-awesomebarclick"});
        } else {
          this.telemetry({event: eventPrefix + "hidden"});
        }
        this._shownPanels.add(this.shownPanelType);
        this.shownPanelType = null;
        // Once we've shown both panel types once, that's enough for this session.
        if (this._shownPanels.size == 2) {
          this.stopTrackingForThisSession();
        }
        break;
      }
      case "TabSelect": {
        if (event.target.linkedBrowser &&
            event.target.linkedBrowser.currentURI) {
          this._checkDocument(event.target.linkedBrowser.currentURI.spec, event.target.parentNode.ownerGlobal);
        }
        break;
      }
      default:
        Cu.reportError(`ShieldSearchNudges: Unknown event: ${event.type}`);
        break;
    }
  }

  /**
   * On startup, we need to check that the default engine isn't being displayed,
   * and if it isn't then we display the doorhanger if one of the pages we
   * are looking for is displayed.
   */
  _checkDisplayOnFirstStartup() {
    const winEnum = Services.ww.getWindowEnumerator();
    while (winEnum.hasMoreElements()) {
      const win = winEnum.getNext();
      if (win.document.documentURI != "chrome://browser/content/browser.xul") {
        // There is some sort of modal dialog displaying (or something else),
        // but probably the default browser one, so just get outta here.
        return;
      }
    }

    if (this._showOnceStarted) {
      this._maybeShowTip(this._showOnceStarted);
      delete this._showOnceStarted;
    }
  }

  /**
   * Checks to see if the document matches about:home, about:newtab or the
   * current search engine page.
   *
   * @param {String}    documentURI The document URI to check.
   * @param {DOMWindow} window      The current window object.
   */
  _checkDocument(documentURI, window) {
    this._hideTip(window);
    const currentEngineOrigin = this.currentEngineOrigin;
    if (!currentEngineOrigin) {
      return;
    }

    // Right-trim any query params that may be added to the URL after redirects
    // by the engine homepage.
    // Examples: https://www.google.com/?gws_rd=ssl,
    //           https://www.bing.com/?toWww=1&redig=32177FB59AE945FF944024F304AAE1E6
    // Additionally, right-trim any superfluous trailing URL part that may be
    // entered by accident, but will still load as the search engine homepage.
    // Examples: https://www.google.com//, https://www.bing.com/?#
    const url = documentURI && documentURI.replace(/(.*)[\\/?#]+.*$/, "$1").replace(/[/?#]+$/, "");
    if (url == "about:home" || url == "about:newtab") {
      this._maybeShowTip("general");
    } else if (currentEngineOrigin == url) {
      this._maybeShowTip("redirect");
    }
  }

  /**
   * None of the tips (or nudges) are allowed to be shown when one of these
   * conditions has been met:
   *
   * 1. The AwesomeBar was clicked whilst one of the tips was shown,
   * 2. One of the tips was dismissed by clicking the 'Okay, got it' button,
   * 3. The tips were shown more than four times in sum.
   *
   * @return {Boolean}
   */
  _checkPreConditions() {
    return Services.prefs.getBoolPref(PREF_NUDGES_DISMISSED_CLICKAB, false) ||
      Services.prefs.getBoolPref(PREF_NUDGES_DISMISSED_WITHOK, false) ||
      Services.prefs.getIntPref(PREF_NUDGES_SHOWN_COUNT, 0) >= NUDGES_SHOWN_COUNT_MAX;
  }

  /**
   * This study should expire through Normandy, but should also stop working once
   * the pre-conditions have been met earlier.
   *
   * @return {Boolean}
   */
  hasExpired() {
    return this._checkPreConditions();
  }

  /**
   * Good practice to have the literal 'sending' be wrapped up
   *
   * @param {Object} stringStringMap
   */
  telemetry(stringStringMap) {
    this.studyUtils.telemetry(stringStringMap);
  }

  /**
   * Show the panel with a specific onboarding tip, except when the following
   * conditions are encountered:
   *  - One of the pre-conditions couldn't be met,
   *  - No browser window could be found,
   *  - The panel anchor element could not be found,
   *  - A fresh profile was detected, which means that the user just installed the browser,
   *  - The panel is already open.
   *
   * @param {String} type The tip to display; may be 'general' or 'redirect'
   */
  async _maybeShowTip(type) {
    if (this._startingUp) {
      this._showOnceStarted = type;
      return;
    }

    if (this._checkPreConditions()) {
      this.telemetry({event: type + "-notshown-preconditions"});
      return;
    }

    // `getFocusedBrowserWindow` may return `null` when the focused window is
    // _not_ a browser window, but that's ok - in that case we don't want to show
    // a tip (or nudge) anyway.
    const window = await getBrowserWindow();
    if (!window) {
      this.telemetry({event: type + "-notshown-nobrowserwindow"});
      return;
    }

    const anchor = window.document.querySelector(TIP_ANCHOR_SELECTOR);
    if (!anchor) {
      this.telemetry({event: type + "-notshown-missinganchor"});
      return;
    }

    if (LaterRun.enabled && LaterRun.sessionCount == 1) {
      // Do not show the tip when this is the very first session in a newly
      // created profile.
      this.telemetry({event: type + "-notshown-freshprofile"});
      return;
    }

    const engine = Services.search.currentEngine;
    const [button, content] = await this._getStrings(window, type, engine);

    const {panel, panelImage, panelDescription, panelButton} = this._ensurePanel(window);
    if (["open", "showing"].includes(panel.state) || this._shownPanels.has(type)) {
      this.telemetry({event: type + "-notshown-alreadyshown"});
      return;
    }

    // Show the panel only if we've got the right study variation set to do so.
    // If it's set to 'noshow', it means that this user is in the control group.
    if (this.variation.name == "doshow") {
      panelImage.src = engine.iconURI.spec;
      panelDescription.textContent = content;
      panelButton.setAttribute("label", button);
      panel.hidden = false;

      panel.openPopup(anchor, "bottomcenter topleft", 0, 0);
      panel.addEventListener("popuphidden", this, {once: true});
      this.shownPanelType = type;
    }

    // Increment the counter that keeps track of the number of times this popup
    // was shown.
    Services.prefs.setIntPref(PREF_NUDGES_SHOWN_COUNT,
      Services.prefs.getIntPref(PREF_NUDGES_SHOWN_COUNT, 0) + 1);

    this.telemetry({event: type + "-shown"});
  }

  _hideTip(window) {
    const panel = window.document.getElementById(TIP_PANEL_ID);
    if (panel && ["open", "showing"].includes(panel.state)) {
      panel.hidePopup();
    }
  }

  /**
   * Fetch the strings that are necessary to properly display a specific tip.
   *
   * @param  {DOMWindow}       window
   * @param  {String}          type   The tip to display; may be 'general' or 'redirect'.
   * @param  {nsISearchEngine} engine Currently selected search engine.
   * @return {Array}           [buttonLabel, descriptionText]
   */
  async _getStrings(window, type, engine) {
    if (!this._okayString) {
      // We have to fetch this thing from Activity Stream, because we forgot to
      // land the button label in Fx 60.
      const asStrings = await new Promise(async resolve => {
        let data = {};
        try {
          const locale = Cc["@mozilla.org/browser/aboutnewtab-service;1"]
            .getService(Ci.nsIAboutNewTabService).activityStreamLocale;
          const request = await fetch(`resource://activity-stream/prerendered/${locale}/activity-stream-strings.js`);
          const text = await request.text();
          const [json] = text.match(/{[^]*}/);
          data = JSON.parse(json);
        } catch (ex) {
          Cu.reportError("ShieldSearchNudges: Failed to load strings from Activity Stream");
        }
        resolve(data);
      });
      // Yeah, fall back to a hard-coded English label, just in case.
      // (`asStrings` is guaranteed to be an object.)
      this._okayString = asStrings.section_disclaimer_topstories_buttontext || "Okay, got it";
    }

    const bundle = window.gBrowserBundle;
    return [this._okayString, bundle.formatStringFromName(type == "general" ?
      STRING_TIP_GENERAL : STRING_TIP_REDIRECT, [engine.name], 1)];
  }

  /**
   * If the panel node is not present in the window yet, create it - along with
   * the additional markup and styling.
   *
   * @param  {DOMWindow} window
   * @return {Object}    Dictionary containing the following properties:
   *                     - {DOMNode} panel            The root panel node.
   *                     - {DOMNode} panelBody        The root body layout container.
   *                     - {DOMNode} panelImage       The search engine favicon.
   *                     - {DOMNode} panelDescription The tip text.
   *                     - {DOMNode} panelButton      The 'Okay, got it' button.
   */
  _ensurePanel(window) {
    const {document} = window;
    let panel = document.getElementById(TIP_PANEL_ID);
    if (panel) {
      return {
        panel,
        panelBody: panel.querySelector("vbox > hbox"),
        panelImage: panel.querySelector("vbox > hbox > image"),
        panelDescription: panel.querySelector("vbox > hbox > vbox > description"),
        panelButton: panel.querySelector("vbox > button")
      };
    }

    panel = document.createElement("panel");
    const attrs = [["id", TIP_PANEL_ID], ["type", "arrow"], ["hidden", "true"],
      ["noautofocus", "true"], ["align", "start"], ["orient", "vertical"], ["role", "alert"],
      ["style", "max-width: 30em; font: menu;"]];
    for (const [name, value] of attrs) {
      panel.setAttribute(name, value);
    }

    const panelBody = panel.appendChild(document.createElement("vbox"))
      .appendChild(document.createElement("hbox"));
    // Prevent stretching the image:
    panelBody.setAttribute("style", "-moz-box-align: start");
    const panelImage = panelBody.appendChild(document.createElement("image"));
    panelImage.setAttribute("style", "margin-inline-end: 8px");
    const panelDescription = panelBody.appendChild(document.createElement("vbox"))
      .appendChild(document.createElement("description"));
    const panelButton = panelBody.parentNode.appendChild(document.createElement("button"));
    panelButton.setAttribute("style",
      "margin: 1em calc(-1*var(--arrowpanel-padding)) calc(-1*var(--arrowpanel-padding)); color: inherit");
    panelButton.className = "subviewbutton panel-subview-footer";
    for (const flexElement of [panelDescription, panelDescription.parentNode, panelButton.parentNode]) {
      flexElement.setAttribute("flex", "1");
    }

    document.documentElement.appendChild(panel);
    panelButton.addEventListener("command", this);

    return {panel, panelBody, panelImage, panelDescription, panelButton};
  }
}

// webpack:`libraryTarget: 'this'`
this.EXPORTED_SYMBOLS = EXPORTED_SYMBOLS;
this.Feature = Feature;
