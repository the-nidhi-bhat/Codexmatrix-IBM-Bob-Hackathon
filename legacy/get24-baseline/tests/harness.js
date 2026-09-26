/**
 * harness.js - shared helpers for the Get24 behavioral safety net (Phase 1 PROTECT).
 *
 * These tests exercise the REAL legacy application: the actual Express 3.0.6 +
 * Socket.IO 0.9.19 server booted from the unmodified app tree, driven over real
 * HTTP and a real Socket.IO client. No application source file is copied,
 * stubbed or reimplemented, and no new dependency is added - the Socket.IO
 * client used here is the copy already shipped inside socket.io@0.9.19
 * (node_modules/socket.io-client@0.9.16), which is the same build the server
 * serves at /socket.io/socket.io.js.
 *
 * Test control is injected only through surfaces the app already honors:
 *   PORT                    (server/index.js: process.env.PORT)
 *   Math.random             (server/game/index.js: getRandomCard draws at call time)
 *   server/config.json      (maxConnections, mutated in memory by preload.js)
 *   server/game/config.json (initialTimer, mutated in memory by preload.js)
 * The overrides live in preload.js, which is loaded with `node -r`; the files
 * on disk are never modified.
 */

var path = require('path');
var http = require('http');
var net = require('net');
var spawn = require('child_process').spawn;
var assert = require('assert');

var APP_DIR = path.resolve(__dirname, '..', '..', '..');
var PRELOAD = path.join(__dirname, 'preload.js');
/**
 * The legacy server requires a matching Origin header on every Socket.IO
 * handshake (server/index.js io.set('origins', ...)), and the 2014
 * `xmlhttprequest` shim that socket.io-client@0.9.16 loads under node can do
 * neither send that header nor complete a handshake on node 6. Swapping in the
 * test-only XHR shim keeps the real Socket.IO client and the real server in
 * place; see xhr-shim.js.
 */
var xhrShimPath = require.resolve('xmlhttprequest');
require.cache[xhrShimPath] = {
	id: xhrShimPath,
	filename: xhrShimPath,
	loaded: true,
	exports: require('./xhr-shim.js')
};

var CLIENT_IO = require('socket.io-client/lib/io.js');
var CLIENT = require('socket.io-client');
var CARDS = require(path.join(APP_DIR, 'server', 'game', 'cards.json'));

/**
 * Test-process-only transport restriction.
 *
 * The `transports` connect option cannot narrow the list in this client build:
 * io.util.merge concatenates arrays, so ['xhr-polling'] merged with the default
 * ['websocket','xhr-polling'] still leaves websocket enabled, and node derives
 * the websocket Origin from 127.0.0.1, which the legacy server's origin
 * whitelist rejects. Removing the websocket implementation from the *test
 * process's* copy of the client makes getTransport pick xhr-polling on the first
 * attempt. Nothing in the application or in node_modules on disk changes.
 */
CLIENT_IO.Transport.websocket = null;

/** Every application event documented in the repository audit. */
var SERVER_EVENTS = ['connected', 'overCapacity', 'gameJoined', 'playerJoined',
	'playerQuit', 'evaluatedExpr', 'invalidExpr', 'timer', 'roundOver'];

/** Seed used by every test unless overridden. See README.md for the card table. */
var DEFAULT_SEED = 1;
var UUID_V4 = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
var CARD = /^[0-9]{4}$/;

var allCards = CARDS.easy.concat(CARDS.med, CARDS.hard);

exports.APP_DIR = APP_DIR;
exports.CARDS = allCards;
exports.UUID_V4 = UUID_V4;
exports.CARD = CARD;
exports.DEFAULT_SEED = DEFAULT_SEED;

function sleep(ms) {
	return new Promise(function (resolve) { setTimeout(resolve, ms); });
}
exports.sleep = sleep;

/** Asserts a 4-digit card string that the server's own cards.json actually ships. */
function assertCard(value, label) {
	assert.ok(typeof value === 'string' && CARD.test(value),
		(label || 'card') + ' should be a 4-digit string, got ' + JSON.stringify(value));
	assert.ok(allCards.indexOf(value) >= 0, (label || 'card') + ' ' + value + ' is not in server/game/cards.json');
}
exports.assertCard = assertCard;

function freePort() {
	return new Promise(function (resolve, reject) {
		var probe = net.createServer();
		probe.on('error', reject);
		probe.listen(0, '127.0.0.1', function () {
			var port = probe.address().port;
			probe.close(function () { resolve(port); });
		});
	});
}

function httpGet(port, urlPath) {
	return new Promise(function (resolve, reject) {
		var req = http.request({ host: '127.0.0.1', port: port, method: 'GET', path: urlPath, agent: false }, function (res) {
			var chunks = [];
			res.on('data', function (c) { chunks.push(c); });
			res.on('end', function () {
				var body = Buffer.concat(chunks);
				resolve({ status: res.statusCode, headers: res.headers, body: body.toString('utf8'), bytes: body.length });
			});
		});
		req.on('error', reject);
		req.end();
	});
}

function startServer(opts) {
	opts = opts || {};
	return freePort().then(function (port) {
		var env = {};
		Object.keys(process.env).forEach(function (k) { env[k] = process.env[k]; });
		env.PORT = String(port);
		env.NODE_ENV = 'development';
		env.TEST_SEED = String(opts.seed === undefined ? DEFAULT_SEED : opts.seed);
		if (opts.initialTimer !== undefined) env.TEST_INITIAL_TIMER = String(opts.initialTimer);
		if (opts.maxConnections !== undefined) env.TEST_MAX_CONNECTIONS = String(opts.maxConnections);

		var proc = spawn(process.execPath, ['-r', PRELOAD, path.join(APP_DIR, 'index.js')], {
			cwd: APP_DIR, env: env, stdio: ['ignore', 'pipe', 'pipe']
		});
		var log = '';
		proc.stdout.setEncoding('utf8');
		proc.stderr.setEncoding('utf8');
		proc.stdout.on('data', function (d) { log += d; });
		proc.stderr.on('data', function (d) { log += d; });

		var server = {
			port: port,
			origin: 'http://localhost:' + port,
			log: function () { return log; },
			stop: function () { if (proc.exitCode === null && !proc.killed) { try { proc.kill(); } catch (e) {} } },
			get: function (p) { return httpGet(port, p); },
			client: function () { return new Client(port); }
		};
		return waitForServer(server, 20000).then(function () { return server; }, function (err) {
			server.stop();
			throw new Error(err.message + '\n--- legacy server output ---\n' + log);
		});
	});
}

function waitForServer(server, timeoutMs) {
	var waited = 0;
	return new Promise(function (resolve, reject) {
		(function poll() {
			server.get('/').then(function (res) {
				if (res.status === 200) return resolve();
				retry('GET / answered ' + res.status);
			}, retry);
			function retry(err) {
				waited += 250;
				if (waited >= timeoutMs) return reject(new Error('legacy server did not become ready: ' + err));
				setTimeout(poll, 250);
			}
		})();
	});
}

/** One real Socket.IO client, recording every application event it receives. */
function Client(port) {
	var self = this;
	this.events = [];
	this.socket = CLIENT.connect('http://127.0.0.1:' + port, {
		reconnect: false,
		'force new connection': true
	});
	SERVER_EVENTS.forEach(function (ev) {
		self.socket.on(ev, function (data) { self.events.push({ event: ev, data: data }); });
	});
	this.socket.on('connect', function () { self.events.push({ event: 'connect', data: null }); });
	this.socket.on('disconnect', function (reason) { self.events.push({ event: 'disconnect', data: reason }); });
}
Client.prototype.all = function (ev) {
	return this.events.filter(function (e) { return e.event === ev; })
		.map(function (e) { return e.data; });
};
Client.prototype.count = function (ev) { return this.all(ev).length; };
Client.prototype.names = function () {
	return this.events.map(function (e) { return e.event; }).join(', ') || '(none)';
};
/** Resolves with the nth payload of ev (default: the first). */
Client.prototype.wait = function (ev, n, timeoutMs) {
	var self = this;
	var want = n || 1;
	var limit = timeoutMs || 5000;
	var waited = 0;
	return new Promise(function (resolve, reject) {
		(function poll() {
			if (self.count(ev) >= want) return resolve(self.all(ev)[want - 1]);
			waited += 25;
			if (waited >= limit) {
				return reject(new Error('timed out after ' + limit + 'ms waiting for "' + ev + '" x' +
					want + '; received: ' + self.names()));
			}
			setTimeout(poll, 25);
		})();
	});
};
/** True when no further event arrived during ms (used for negative assertions). */
Client.prototype.quiet = function (ms) {
	var self = this;
	var before = this.events.length;
	return sleep(ms || 400).then(function () { return self.events.length === before; });
};
Client.prototype.submit = function (expression) {
	this.socket.emit('submitExpression', { expression: expression });
};
Client.prototype.close = function () {
	try { this.socket.disconnect(); } catch (e) {}
};
exports.Client = Client;

/** Starts the real server, runs fn, and always shuts the server down. */
function withServer(opts, fn) {
	return startServer(opts).then(function (server) {
		return Promise.resolve().then(function () { return fn(server); })
			.then(function (out) { server.stop(); return out; },
				  function (err) { server.stop(); throw err; });
	});
}
exports.withServer = withServer;

/** Minimal TAP-ish sequential runner: no test framework, assert only. */
function suite(title) {
	var cases = [];
	var api = {
		title: title,
		test: function (name, fn) { cases.push({ name: name, fn: fn }); },
		server: withServer,
		run: function () {
			var passed = 0, failed = 0, index = 0;
			console.log('# ' + title);
			function next() {
				if (index >= cases.length) {
					var total = cases.length;
					console.log('# ' + total + ' tests, ' + passed + ' passed, ' + failed + ' failed, 0 skipped');
					process.exitCode = failed > 0 ? 1 : 0;
					/**
					 * Long-poll XHR sockets and the spawned legacy server keep handles
					 * open after the last assertion, so exit once stdout has drained.
					 */
					return new Promise(function (resolve) {
						setTimeout(function () { process.exit(failed > 0 ? 1 : 0); resolve(); }, 100);
					});
				}
				var c = cases[index++];
				var started = Date.now();
				return Promise.resolve().then(c.fn).then(function () {
					passed++;
					console.log('ok ' + index + ' - ' + c.name + '  (' + (Date.now() - started) + 'ms)');
				}, function (err) {
					failed++;
					console.log('not ok ' + index + ' - ' + c.name);
					console.log('  ' + String((err && err.stack) || err).split('\n').join('\n  '));
				}).then(next);
			}
			return next();
		}
	};
	return api;
}
exports.suite = suite;
