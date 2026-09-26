/**
 * xhr-shim.js - TEST-ONLY replacement for the `xmlhttprequest` module that
 * socket.io-client@0.9.16 loads when it runs under node.
 *
 * Two problems with the 2014 shim, both unrelated to Get24 itself:
 *   1. it resets connections against this server on node 6 (the client never
 *      completes a handshake);
 *   2. it cannot send a custom Origin header, which the legacy server's
 *      io.set('origins', ...) whitelist requires on every handshake.
 *
 * This file implements just enough of XMLHttpRequest for socket.io-client's
 * xhr-polling transport (open / setRequestHeader / send / abort /
 * onreadystatechange / readyState / status / responseText) on top of node's
 * http module. All Socket.IO framing, heartbeats and buffering stay inside the
 * real client library. Nothing in the Get24 application is touched.
 */

var http = require('http');
var url = require('url');

function NodeXHR() {
	this.readyState = 0;
	this.status = 0;
	this.responseText = '';
	this.response = '';
	this.onreadystatechange = null;
	this._headers = {};
	this._req = null;
}

NodeXHR.prototype.open = function (method, target) {
	this._method = method;
	this._url = target;
	this._headers = {};
	this.readyState = 1;
};

NodeXHR.prototype.setRequestHeader = function (name, value) {
	this._headers[name] = value;
};

NodeXHR.prototype.send = function (body) {
	var self = this;
	var parts = url.parse(this._url);
	var headers = {};
	Object.keys(this._headers).forEach(function (k) { headers[k] = this._headers[k]; }, this);

	/** A browser always sends Origin; the legacy server rejects handshakes without it. */
	if (parts.pathname.indexOf('/socket.io/') === 0) {
		headers.Origin = 'http://localhost:' + (parts.port || 80);
	}

	this._req = http.request({
		method: this._method,
		host: parts.hostname,
		port: parts.port,
		path: parts.path,
		headers: headers,
		agent: false
	}, function (res) {
		var chunks = [];
		res.on('data', function (c) { chunks.push(c); });
		res.on('end', function () {
			var text = Buffer.concat(chunks).toString('utf8');
			self.status = res.statusCode;
			self.responseText = text;
			self.response = text;
			self.readyState = 4;
			self._changed();
		});
	});
	this._req.on('error', function (err) {
		self.status = 0;
		self.error = err;
		self.readyState = 4;
		self._changed();
	});
	if (body) this._req.write(body);
	this._req.end();
};

NodeXHR.prototype.abort = function () {
	if (this._req) this._req.abort();
};

NodeXHR.prototype._changed = function () {
	if (typeof this.onreadystatechange === 'function') this.onreadystatechange.call(this);
};

module.exports = { XMLHttpRequest: NodeXHR };
