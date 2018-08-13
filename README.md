# Shield Study Search Nudges

## About This Repository

The UX team has developed two contextual doorhanger “nudges” to gently inform users that they can search, navigate, and view their history items in our address bar. We will test these doorhangers to ensure they do not suppress retention, usage, nor user satisfaction using this [Shield Study](https://wiki.mozilla.org/Firefox/Shield/Shield_Studies) addon.

## Seeing the add-on in action

See [TESTPLAN.md](./docs/TESTPLAN.md) for more details on how to get the add-on installed and tested.

## Data Collected / Telemetry Pings

See [TELEMETRY.md](./docs/TELEMETRY.md) for more details on what pings are sent by this addon.

## Analyzing data

Telemetry pings are loaded into S3 and re:dash. Sample query:

* [All pings](https://sql.telemetry.mozilla.org/queries/{#your-id}/source#table)

## Improving this add-on

See [DEV.md](./docs/DEV.md) for more details on how to work with this addon as a developer.
