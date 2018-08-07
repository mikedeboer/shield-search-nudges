# Test plan for this add-on

## Manual / QA TEST Instructions

### Preparations

* Download a Release version of Firefox

### Install the add-on and enroll in the study

* (Create profile: <https://developer.mozilla.org/Firefox/Multiple_profiles>, or via some other method)
* Navigate to _about:config_ and set the following preferences. (If a preference does not exist, create it be right-clicking in the white area and selecting New -> String or Integer depending on the type of preference)
* Set `extensions.legacy.enabled` to `true`. This permits the loading of the embedded Web Extension since new versions of Firefox are becoming restricted to pure Web Extensions only.
* Set `extensions.shield-search-nudges.variation` to one of:
  * `doshow` - The panel is shown to the user.
  * `noshow` - The panel is not shown to the user, however some telemetry is still logged (the telemetry for hiding the panel cannot be logged as it isn't shown).
* Go to [this study's tracking bug](https://bugzilla.mozilla.org/show_bug.cgi?id=1462136) and install the latest signed XPI

## Expected User Experience / Functionality

When the following conditions are met:

* the user is not in the first session after the add-on is installed.
* the user visits one of: `about:home`, `about:newtab` or the current search engine start page

Then:

* A doorhanger prompt will be shown once per session.
  * For `about:home` or `about:newtab`, the doorhanger will read "Type less, find more: Search %S right from your address bar."
  * For the current search engine page it will read "Start your search here to see suggestions from %S and your browsing history."

The doorhanger will stop being shown (and the study will end) when one of the following is met:

* The user clicks on the "Okay, got it" button
* The user clicks in the address bar whilst the doorhanger is displayed
* The doorhanger has been displayed a total of four times.

If the study branch is `noshow`, then the doorhanger will not be shown, however telemetry will
still be logged.

### Do these tests

1. A doorhanger is shown:

   * Once per session
   * Only when `about:home` or `about:newtab`, or the current search engine page is shown
   * Only when no other dialog nor doorhanger is shown (e.g. default browser dialog)
   * Up to a maximum of four times (dismiss the doorhanger by clicking out of it and outside of the address bar)

   Test fails IF:

   * A doorhanger is shown in the first session after installation
   * It is shown more than four times
   * It is displayed when it is not meant to be
   * Doorhanger is shown with the wrong text (see above)

2. A doorhanger stops being shown when the "Okay, got it" button is pressed

   Test fails IF:

   * The doorhanger continues to be displayed after clicking the button.

3. A doorhanger stops being shown when the user clicks within the address bar whilst the doorhanger is being shown

   Test fails IF:

   * The doorhanger continues to be displayed after clicking in the address bar

### Design

Any UI in a Shield study should be consistent with standard Firefox design specifications. These standards can be found at [design.firefox.com](https://design.firefox.com/photon/welcome.html). Firefox logo specifications can be found [here](https://design.firefox.com/photon/visuals/product-identity-assets.html).

### Note: checking "sent Telemetry is correct"

* Open the Browser Console using Firefox's top menu at `Tools > Web Developer > Browser Console`. This will display Shield (loading/telemetry) log output from the add-on.

See [TELEMETRY.md](./TELEMETRY.md) for more details on what pings are sent by this add-on.

## Debug

To debug installation and loading of the add-on:

* Open the Browser Console using Firefox's top menu at `Tools > Web Developer > Browser Console`. This will display Shield (loading/telemetry) and log output from the add-on.

Example log output after installing the add-on:

```
install 5 bootstrap.js:185
startup ADDON_INSTALL bootstrap.js:51
studyUtils has config and variation.name: doshow.
      Ready to send telemetry bootstrap.js:121
info {"studyName":"searchNudgesExperiment","addon":{"id":"search-nudges@shield.mozilla.org","version":"1.3.0"},"variation":{"name":"doshow","weight":1},"shieldId":""} bootstrap.js:82
Feature start Feature.jsm:124  1533304648312	shield-study-utils	DEBUG	log made: shield-study-utils
1533304648312	shield-study-utils	DEBUG	setting up!
1533304648335	shield-study-utils	DEBUG	firstSeen
1533304648335	shield-study-utils	DEBUG	telemetry in:  shield-study {"study_state":"enter"}
1533304648337	shield-study-utils	DEBUG	telemetry: {"version":3,"study_name":"searchNudgesExperiment","branch":"doshow","addon_version":"1.3.0","shield_version":"4.1.0","type":"shield-study","data":{"study_state":"enter"},"testing":true}
1533304648342	shield-study-utils	DEBUG	startup 5
1533304648342	shield-study-utils	DEBUG	marking TelemetryEnvironment: searchNudgesExperiment
1533304648343	shield-study-utils	DEBUG	telemetry in:  shield-study {"study_state":"installed"}
1533304648343	shield-study-utils	DEBUG	telemetry: {"version":3,"study_name":"searchNudgesExperiment","branch":"doshow","addon_version":"1.3.0","shield_version":"4.1.0","type":"shield-study","data":{"study_state":"installed"},"testing":true}
1533304648482	shield-study-utils	DEBUG	telemetry {"event":"general-shown"}
1533304648482	shield-study-utils	DEBUG	telemetry in:  shield-study-addon {"attributes":{"event":"general-shown"}}
1533304648485	shield-study-utils	DEBUG	telemetry: {"version":3,"study_name":"searchNudgesExperiment","branch":"doshow","addon_version":"1.3.0","shield_version":"4.1.0","type":"shield-study-addon","data":{"attributes":{"event":"general-shown"}},"testing":true}
1533304658726	shield-study-utils	DEBUG	telemetry {"event":"general-hidden"}
1533304658726	shield-study-utils	DEBUG	telemetry in:  shield-study-addon {"attributes":{"event":"general-hidden"}}
1533304658727	shield-study-utils	DEBUG	telemetry: {"version":3,"study_name":"searchNudgesExperiment","branch":"doshow","addon_version":"1.3.0","shield_version":"4.1.0","type":"shield-study-addon","data":{"attributes":{"event":"general-hidden"}},"testing":true}
```
