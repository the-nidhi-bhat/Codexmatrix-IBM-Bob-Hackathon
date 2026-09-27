/**
 * preload.js - TEST-ONLY, loaded by harness.js as `node -r preload.js index.js`.
 *
 * Makes the real legacy server deterministic without changing one line of
 * application code and without touching any file on disk:
 *
 *   TEST_SEED            replaces Math.random with a seeded Lehmer RNG
 *                        (server/game/index.js calls Math.random inside
 *                        getRandomCard(), so cards become reproducible)
 *   TEST_INITIAL_TIMER   overrides initialTimer in the in-memory copy of
 *                        server/game/config.json so the round timer can expire
 *   TEST_MAX_CONNECTIONS overrides maxConnections in the in-memory copy of
 *                        server/config.json so capacity handling can be reached
 *
 * The config overrides work by mutating the already-cached JSON module object;
 * the .json files on disk are never rewritten.
 */

var path = require('path');

var APP_DIR = path.resolve(__dirname, '..', '..', '..');

if (process.env.TEST_SEED) {
	var seed = parseInt(process.env.TEST_SEED, 10) || 1;
	var MODULUS = 2147483647;
	Math.random = function () {
		seed = (seed * 16807) % MODULUS;
		return seed / MODULUS;
	};
}

function overrideConfig(relativePath, key, value) {
	if (value === undefined || value === '') return;
	require(path.join(APP_DIR, relativePath))[key] = parseInt(value, 10);
}

overrideConfig('server/config.json', 'maxConnections', process.env.TEST_MAX_CONNECTIONS);
overrideConfig('server/game/config.json', 'initialTimer', process.env.TEST_INITIAL_TIMER);
