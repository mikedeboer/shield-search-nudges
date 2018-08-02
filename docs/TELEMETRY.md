# Telemetry sent by this add-on

## Usual Firefox Telemetry is unaffected.

* No change: `main` and other pings are UNAFFECTED by this add-on.
* Respects telemetry preferences. If user has disabled telemetry, no telemetry will be sent.

## Study-specific endings

This study has no surveys.

The STUDY SPECIFIC ENDINGS this study supports are:

* `user-disable` (the user uninstalled the add-on)
* `ineligible` (although "supported", shouldn't ever happen for this study)
* `expired` (the study finished due to one of the expiration criteria).

Expiration criteria:

* The AwesomeBar was clicked whilst one of the tips was shown,
* One of the tips was dismissed by clicking the 'Okay, got it' button,
* The tips were shown more than four times in sum.

## `shield-study` pings (common to all shield-studies)

[shield-studies-addon-utils](https://github.com/mozilla/shield-studies-addon-utils) sends the usual packets.

All `shield-study` `study_state` sequences look like this:

* `enter => installed => (one of: ineligible, expired, user-disable) => exit`.

## `shield-study-addon` pings, specific to THIS study.

When events are instrumented in this study they are recorded in `sheild-study-addon` pings under:

* `data.attributes.event`

Events happen when:

* The user navigates to a page that is `about:newtab` or `about:home`
  * these events are prefixed `general`
* The user navigates to a page that is the current search engine entry page.
  * these events are prefixed `redirect`

In both of the above cases, a prompt may or may not be shown.

All events for when a prompt is attempted to be shown are:

* `<target>-shown`
  * The prompt has been shown
* `<target>-notshown-expired`
  * The prompt was not shown as we have now expired
* `<target>-notshown-nobrowserwindow`
  * The prompt was not shown as we have no browser window (shouldn't really happen)
* `<target>-notshown-missinganchor`
  * The prompt was not shown as we don't have an anchor point (e.g. a popup window)
* `<target>-notshown-freshprofile`
  * The prompt was not shown because this is a fresh profile.
* `<target>-notshown-alreadyshown`
  * The prompt is already showing.

XXX What about:
* Post upgrade?
* Other doorhangers?

All events for when a prompt is shown, and the user does an action are:

* `<target>-hidden-buttonclick`
  * The user closed the prompt via the "OK" button.
* `<target>-hidden-awesomebarclick`
  * The user closed the prompt by clicking on the address bar.
* `<target>-hidden`
  * The user closed the prompt by clicking somewhere else.

_Note: for the `noshow` variation the prompt won't be shown. The
`<target>-shown` and `<target>-notshown-*` events will be sent, however there
will not be any `<target>-hidden*` events._

## Example sequence for an click on the "OK" button interaction

These are the `payload` fields from all pings in the `shield-study` and `shield-study-addon` buckets.

```
// common fields

branch        doshow
study_name    searchNudgesExperiment
addon_version 1.0.0
version       3

2017-10-09T14:16:18.042Z shield-study
{
  "study_state": "enter"
}
2017-10-09T14:16:18.055Z shield-study
{
  "study_state": "installed"
}
2017-10-09T14:16:18.066Z shield-study-addon
{
  "attributes": {
    "event": "general-notshown-freshprofile",
  }
}
2017-10-09T14:18:18.066Z shield-study-addon
{
  "attributes": {
    "event": "redirect-notshown-freshprofile",
  }
}
2017-10-09T16:29:44.109Z shield-study-addon
{
  "attributes": {
    "event": "general-notshown-freshprofile",
  }
}
2017-10-10T11:12:44.188Z shield-study-addon
{
  "attributes": {
    "event": "general-shown",
  }
}
2017-10-10T11:13:00.191Z shield-study-addon
{
  "attributes": {
    "event": "general-hidden",
  }
}
2017-10-10T11:14:44.188Z shield-study-addon
{
  "attributes": {
    "event": "redirect-shown",
  }
}
2017-10-10T11:15:00.191Z shield-study-addon
{
  "attributes": {
    "event": "redirect-hidden-buttonclick",
  }
}
2017-10-09T16:29:44.188Z shield-study
{
  "study_state": "expired",
}
2017-10-09T16:29:44.191Z shield-study
{
  "study_state": "exit"
}
```
