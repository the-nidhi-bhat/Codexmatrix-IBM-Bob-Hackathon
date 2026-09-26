/**
 * socket.test.js - Socket.IO connection safety net.
 * Covers: a client can connect, the `connected` payload shape, and the first
 * `gameJoined` payload shape (room uuid, card from cards.json, player count).
 */
var assert = require('assert');
var h = require('./harness');

var s = h.suite('Get24 legacy Socket.IO connection + join (real socket.io 0.9.19 server)');

s.test('a Socket.IO client completes the handshake and connects', function () {
	return h.withServer({}, function (server) {
		var a = server.client();
		return a.wait('connect', 1, 5000).then(function () {
			/** `a.socket` is the namespace; the connection flag lives on the socket it wraps. */
			assert.strictEqual(a.socket.socket.connected, true, 'client should report itself connected');
			a.close();
		});
	});
});

s.test('server emits connected with an incrementing numUsers count', function () {
	return h.withServer({}, function (server) {
		var a = server.client();
		return a.wait('connected', 1, 5000).then(function (first) {
			assert.deepEqual(Object.keys(first), ['numUsers'], 'connected payload keys');
			assert.strictEqual(first.numUsers, 1, 'first connection should be numUsers 1');
			var b = server.client();
			return b.wait('connected', 1, 5000).then(function (second) {
				assert.strictEqual(second.numUsers, 2, 'second connection should be numUsers 2');
				a.close();
				b.close();
			});
		});
	});
});

s.test('first player receives gameJoined with a uuid room, a real card and numPlayers 1', function () {
	return h.withServer({}, function (server) {
		var a = server.client();
		return a.wait('gameJoined', 1, 5000).then(function (data) {
			assert.deepEqual(Object.keys(data).sort(), ['card', 'numPlayers', 'room'],
				'gameJoined payload keys, got ' + Object.keys(data));
			assert.ok(h.UUID_V4.test(data.room), 'room should be a uuid v4, got ' + data.room);
			h.assertCard(data.card, 'gameJoined.card');
			assert.strictEqual(data.numPlayers, 1, 'first player should be numPlayers 1');
			assert.strictEqual(a.count('overCapacity'), 0, 'a first player is never over capacity');
			a.close();
		});
	});
});

s.test('the round timer starts ticking for the first player', function () {
	return h.withServer({ initialTimer: 300 }, function (server) {
		var a = server.client();
		return a.wait('timer', 1, 5000).then(function (data) {
			assert.deepEqual(Object.keys(data), ['time'], 'timer payload keys');
			assert.strictEqual(data.time, 299, 'first tick should report 299 of the 300s round');
			a.close();
		});
	});
});

s.run();
