/**
 * game-events.test.js - game event safety net.
 * Covers the full round lifecycle documented in the repository audit:
 * second player joins, evaluatedExpr, invalidExpr, win/loss roundOver,
 * playerQuit, timer roundOver, and capacity protection.
 *
 * All expression fixtures are built for the card that seed 1 produces (1347),
 * so the suite is fully deterministic without changing game rules.
 */
var assert = require('assert');
var h = require('./harness');

var FIRST_CARD = '1347';
var NEXT_CARD = '3455';
var WIN_EXPR = '7*4-3-1';
var NOT_WIN_EXPR = '1+3+4+7';

var s = h.suite('Get24 legacy game events (real socket.io 0.9.19 server)');

/** Joins one player and asserts the seeded baseline card. */
function join(server, card) {
	var client = server.client();
	return client.wait('gameJoined', 1, 5000).then(function (data) {
		assert.strictEqual(data.card, card || FIRST_CARD,
			'expected the seeded card, got ' + data.card);
		return client;
	});
}

s.test('a second player joins the same game and the first player is told', function () {
	return h.withServer({}, function (server) {
		return join(server).then(function (a) {
			var roomA = a.all('gameJoined')[0].room;
			var b = server.client();
			return b.wait('gameJoined', 1, 5000).then(function (data) {
				assert.strictEqual(data.room, roomA, 'second player should join the same room');
				assert.strictEqual(data.numPlayers, 2, 'gameJoined.numPlayers should be 2');
				assert.strictEqual(data.card, FIRST_CARD, 'both players play the same card');
				return a.wait('playerJoined', 1, 5000);
			}).then(function (data) {
				assert.deepEqual(data, { numPlayers: 2 }, 'playerJoined payload');
				assert.strictEqual(b.count('playerJoined'), 0, 'the joining player is not told about itself');
				a.close();
				b.close();
			});
		});
	});
});

s.test('a valid non-winning expression produces evaluatedExpr and no roundOver', function () {
	return h.withServer({}, function (server) {
		var a;
		return join(server).then(function (client) {
			a = client;
			a.submit(NOT_WIN_EXPR);
			return a.wait('evaluatedExpr', 1, 5000);
		}).then(function (data) {
			assert.deepEqual(Object.keys(data), ['evaluated'], 'evaluatedExpr payload keys');
			assert.strictEqual(data.evaluated, 15, NOT_WIN_EXPR + ' should evaluate to 15');
			return a.quiet(500);
		}).then(function (wasQuiet) {
			assert.ok(wasQuiet, 'a non-winning expression must not end the round, got: ' + a.names());
			assert.strictEqual(a.count('roundOver'), 0, 'no roundOver for a non-winning expression');
			assert.strictEqual(a.count('invalidExpr'), 0, 'a valid expression is not rejected');
			a.close();
		});
	});
});

s.test('a missing card digit produces invalidExpr "Must use all 4 digits."', function () {
	return h.withServer({}, function (server) {
		return join(server).then(function (a) {
			a.submit('1+3+4');
			return a.wait('invalidExpr', 1, 5000);
		}).then(function (data) {
			assert.deepEqual(data, { msg: 'Must use all 4 digits.' }, 'invalidExpr payload');
		});
	});
});

s.test('an illegal character produces invalidExpr "Legal operators are ..."', function () {
	return h.withServer({}, function (server) {
		return join(server).then(function (a) {
			a.submit('1%3+4+7');
			return a.wait('invalidExpr', 1, 5000);
		}).then(function (data) {
			assert.deepEqual(data, { msg: 'Legal operators are \'+-*/()\'.' }, 'invalidExpr payload');
		});
	});
});

s.test('combined digits produce invalidExpr "Digits can\'t be combined."', function () {
	return h.withServer({}, function (server) {
		return join(server).then(function (a) {
			a.submit('13+4+7');
			return a.wait('invalidExpr', 1, 5000);
		}).then(function (data) {
			assert.deepEqual(data, { msg: 'Digits can\'t be combined.' }, 'invalidExpr payload');
		});
	});
});

s.test('an unparseable but legal-character expression produces invalidExpr "Invalid."', function () {
	return h.withServer({}, function (server) {
		return join(server).then(function (a) {
			a.submit('(1+3+4+7');
			return a.wait('invalidExpr', 1, 5000);
		}).then(function (data) {
			assert.deepEqual(data, { msg: 'Invalid.' }, 'invalidExpr payload');
		});
	});
});

s.test('a winning expression ends the round: win for the winner, loss for the other player', function () {
	return h.withServer({}, function (server) {
		var a, b;
		return join(server).then(function (client) {
			a = client;
			b = server.client();
			return b.wait('gameJoined', 1, 5000);
		}).then(function () {
			a.submit(WIN_EXPR);
			return Promise.all([a.wait('evaluatedExpr', 1, 5000), a.wait('roundOver', 1, 5000)]);
		}).then(function (results) {
			assert.strictEqual(results[0].evaluated, 24, WIN_EXPR + ' should evaluate to 24');
			assert.strictEqual(results[1].type, 'win', 'the submitting player wins');
			assert.deepEqual(Object.keys(results[1]).sort(), ['card', 'type'], 'win roundOver payload keys');
			h.assertCard(results[1].card, 'roundOver.card');
			assert.strictEqual(results[1].card, NEXT_CARD, 'the seeded next card should be dealt');
			return b.wait('roundOver', 1, 5000);
		}).then(function (data) {
			assert.strictEqual(data.type, 'loss', 'the other player loses');
			assert.strictEqual(data.expression, WIN_EXPR, 'the losing player is shown the winning expression');
			assert.strictEqual(data.card, NEXT_CARD, 'both players see the same new card');
			assert.strictEqual(b.count('evaluatedExpr'), 0, 'the losing player gets no evaluatedExpr');
			a.close();
			b.close();
		});
	});
});

s.test('a player disconnect produces playerQuit for the remaining player', function () {
	return h.withServer({}, function (server) {
		var a, b;
		return join(server).then(function (client) {
			a = client;
			b = server.client();
			return b.wait('gameJoined', 1, 5000);
		}).then(function () {
			b.close();
			return a.wait('playerQuit', 1, 5000);
		}).then(function (data) {
			assert.deepEqual(data, { numPlayers: 1 }, 'playerQuit payload');
			assert.strictEqual(a.all('playerQuit').length, 1, 'playerQuit is emitted once per departure');
			a.close();
		});
	});
});

s.test('timer expiration ends the round with type timer and a new card', function () {
	return h.withServer({ initialTimer: 3 }, function (server) {
		var a;
		return join(server).then(function (client) { a = client; })
			.then(function () { return a.wait('roundOver', 1, 15000); })
			.then(function (data) {
				assert.strictEqual(data.type, 'timer', 'expiry should report type timer, got ' + data.type);
				assert.deepEqual(Object.keys(data).sort(), ['card', 'type'], 'timer roundOver payload keys');
				assert.strictEqual(data.card, NEXT_CARD, 'the seeded next card should be dealt on timeout');
				assert.deepEqual(a.all('timer').map(function (t) { return t.time; }), [2, 1],
					'timer should count 3 -> 2 -> 1 before expiring');
				assert.strictEqual(a.count('evaluatedExpr'), 0, 'a timeout is not an evaluation');
				a.close();
			});
	});
});

s.test('a connection past maxConnections is rejected: no connected, no gameJoined, disconnect', function () {
	return h.withServer({ maxConnections: 2 }, function (server) {
		var a, b, c;
		return join(server).then(function (client) {
			a = client;
			b = server.client();
			return b.wait('connected', 1, 5000);
		}).then(function () {
			c = server.client();
			return c.wait('disconnect', 1, 5000);
		}).then(function () {
			/**
			 * server/index.js accept() emits `overCapacity` and disconnects in the
			 * same tick, so the advisory packet is discarded before an xhr-polling
			 * client can read it - captured here as existing behavior. The
			 * protection itself is what stays observable: a rejected socket is
			 * never told it connected, never joins a game, and is dropped.
			 */
			assert.strictEqual(c.count('connected'), 0, 'a rejected socket is never told it connected');
			assert.strictEqual(c.count('gameJoined'), 0, 'a rejected socket never joins a game');
			assert.strictEqual(c.count('overCapacity'), 0, 'the advisory packet is discarded by the legacy disconnect race');
			assert.strictEqual(c.socket.socket.connected, false, 'the rejected socket should be disconnected');
			assert.strictEqual(a.all('connected')[0].numUsers, 1, 'accepted players keep their numbering');
			assert.strictEqual(b.all('connected')[0].numUsers, 2, 'accepted players keep their numbering');
			assert.strictEqual(a.count('playerJoined'), 1, 'a rejected socket is never announced to the game');
			a.close();
			b.close();
		});
	});
});

s.run();
