/**
 * http.test.js - legacy HTTP behavior safety net.
 * Boots the real Express 3.0.6 server and checks the responses a browser would get.
 */
var assert = require('assert');
var h = require('./harness');

var s = h.suite('Get24 legacy HTTP behavior (real Express 3.0.6 server)');

s.test('GET / serves the Get24 application page', function () {
	return h.withServer({}, function (server) {
		return server.get('/').then(function (res) {
			assert.strictEqual(res.status, 200, 'expected 200, got ' + res.status);
			assert.ok(/text\/html/.test(res.headers['content-type']),
				'content-type was ' + res.headers['content-type']);
			assert.strictEqual(res.body.slice(0, 15), '<!DOCTYPE html>',
				'body should start with the HTML doctype');
			[
				'<title>Get24</title>',
				'id="container"',
				'id="eval-form"',
				'id="eval-input"',
				'/socket.io/socket.io.js',
				'js/kinetic-v4.6.0.min.js',
				'js/SocketController.js',
				'js/StageController.js',
				'Cory Gross',
				'http://github.com/CoryG89/Get24'
			].forEach(function (needle) {
				assert.ok(res.body.indexOf(needle) >= 0, 'index.html is missing: ' + needle);
			});
			assert.strictEqual(Number(res.headers['content-length']), res.bytes,
				'content-length should match the delivered body');
		});
	});
});

s.test('GET / serves every static asset the page references', function () {
	var assets = [
		['/css/styles.css', /text\/css/, ['div#wrapper', 'input#eval-input']],
		['/js/kinetic-v4.6.0.min.js', /javascript/, ['Kinetic']],
		['/js/SocketController.js', /javascript/, ["socket = io.connect('/');", "socket.on('gameJoined'", "socket.on('roundOver'"]],
		['/js/StageController.js', /javascript/, ['Kinetic']],
		['/favicon.ico', null, null]
	];
	return h.withServer({}, function (server) {
		return assets.reduce(function (chain, asset) {
			return chain.then(function () {
				return server.get(asset[0]).then(function (res) {
					assert.strictEqual(res.status, 200, asset[0] + ' should be 200, got ' + res.status);
					if (asset[1]) {
						assert.ok(asset[1].test(res.headers['content-type']),
							asset[0] + ' content-type was ' + res.headers['content-type']);
					}
					assert.ok(res.bytes > 0, asset[0] + ' served an empty body');
					(asset[2] || []).forEach(function (needle) {
						assert.ok(res.body.indexOf(needle) >= 0, asset[0] + ' is missing: ' + needle);
					});
				});
			});
		}, Promise.resolve());
	});
});

s.test('GET /socket.io/socket.io.js serves the Socket.IO 0.9 client build', function () {
	return h.withServer({}, function (server) {
		return server.get('/socket.io/socket.io.js').then(function (res) {
			assert.strictEqual(res.status, 200, 'expected 200, got ' + res.status);
			assert.ok(/javascript/.test(res.headers['content-type']),
				'content-type was ' + res.headers['content-type']);
			assert.ok(res.bytes > 1000, 'client bundle looks truncated: ' + res.bytes + ' bytes');
			assert.ok(res.body.indexOf('io.connect') >= 0 || res.body.indexOf('io.js') >= 0,
				'served bundle does not look like the socket.io client build');
			assert.ok(/0\.9\.1[0-9]/.test(res.body), 'served bundle does not advertise a 0.9.x client version');
		});
	});
});

s.test('GET / returns 404 for an unknown path', function () {
	return h.withServer({}, function (server) {
		return server.get('/no-such-file.txt').then(function (res) {
			assert.strictEqual(res.status, 404, 'expected 404, got ' + res.status);
		});
	});
});

s.run();
