#!/bin/sh
# Runs the whole Get24 behavioral safety net in the legacy runtime.
# Requires node 6.17.1 and the app's node_modules (see ../repro/LEGACY_NPM_LS.txt).
# See README.md in this folder for the docker one-liner.
set -e
status=0
for suite in http socket game-events; do
	node "legacy/get24-baseline/tests/$suite.test.js" || status=1
done
exit $status
