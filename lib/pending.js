/*
Copyright 2012 Timothy J Fontaine <tjfontaine@gmail.com>

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in
all copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN

*/

"use strict";

var dgram = require('dgram'),
  net = require('net'),
  util = require('util'),
  SocketCache = require('./socket_cache'),
  Packet = require('./packet').Packet,
  EDNSPacket = require('./packet').EDNSPacket,
  Socket = require('./socket');

var random_integer = function () {
  return Math.floor(Math.random() * 50000 + 1);
};

var SOCKET_TIMEOUT = 300;

var ServerQueue = module.exports = function (parent, active) {
  var self = this;

  this._queue = {};
  this._active = {};
  this._socketCache = new SocketCache(parent);
  this._max_queue = active;

  var check_sockets = function () {
    var s, now;
    now = new Date().getTime();
    Object.keys(self._socketCache._socket).forEach(function (s) {
      var socket = self._socketCache._socket[s];
      var delta = now - socket.last;

      var m = { server: s, delta: delta };

      if (self._queue[s])
        m.queue = self._queue[s].order.length;

      if (self._active[s])
        m.active = self._active[s].count;

      if (delta > SOCKET_TIMEOUT && self._queue[s].order.length === 0 && self._active[s].count === 0) {
        self._socketCache.close(s);
      }
    });
    if (Object.keys(self._socketCache._socket).length) {
      self._timer = setTimeout(check_sockets, SOCKET_TIMEOUT);
    }
  };

  self._timer = setTimeout(check_sockets, SOCKET_TIMEOUT);
};

ServerQueue.prototype._hash = function (server) {
  if (server.type === 'tcp')
    return server.address + ':' + server.port;
  else
    return 'udp' + net.isIP(server.address);
};

ServerQueue.prototype._getQueue = function (server) {
  var name = this._hash(server);

  if (!this._queue[name]) {
    this._queue[name] = {
      order: [],
    };
  }

  return this._queue[name];
};

ServerQueue.prototype._getActive = function (server) {
  var name = this._hash(server);

  if (!this._active[name]) {
    this._active[name] = {
      count: 0,
    };
  }

  return this._active[name];
};

ServerQueue.prototype.add = function (server, request, cb) {
  var name, id, queue, active;

  name = this._hash(server);
  queue = this._getQueue(server);
  active = this._getActive(server);

  id = random_integer();
  while (queue[id] || active[id]) id = random_integer();

  queue[id] = {
    request: request,
    cb: cb,
  };
  queue.order.splice(0, 0, id);
  request.id = id;
  this.fill(server);
};

ServerQueue.prototype.remove = function (server, id) {
  var idx, queue, active;

  queue = this._getQueue(server);
  active = this._getActive(server);

  delete queue[id];
  idx = queue.order.indexOf(id);
  if (idx > -1)
    queue.order.splice(idx, 1);

  if (active[id]) {
    delete active[id];
    active.count -= 1;
  }

  this.fill(server);
};

ServerQueue.prototype.pop = function (server) {
  var queue, active, id, obj;
  queue = this._getQueue(server);
  active = this._getActive(server);

  id = queue.order.pop();
  obj = queue[id];

  if (id && obj) {
    active[id] = obj.request;
    active.count += 1;
    return obj.cb;
  }
};

ServerQueue.prototype.fill = function (server) {
  var active, cb;
  active = this._getActive(server);
  while (active.count < this._max_queue) {
    cb = this.pop(server);
    if (cb)
      this._socketCache.get(server, cb);
    else
      break;
  };
};

ServerQueue.prototype.getRequest = function (server, id) {
  var active = this._getActive(server);
  return active[id];
};

var PendingRequests = function () {
  this._server_queue = new ServerQueue(this, 100);
  this.autopromote = false;
};

PendingRequests.prototype.send = function (request) {
  var packet;

  this._server_queue.add(request.server, request, function (socket) {
    if (request.try_edns) {
      packet = new EDNSPacket(socket);
    } else {
      packet = new Packet(socket);
    }
    packet.header.id = request.id;
    packet.header.rd = 1;
    packet.question.push(request.question);
    try {
      packet.send();
    } catch (e) {
      request.error(e);
    }
  });
};

PendingRequests.prototype.remove = function (request) {
  if (request.server && request.id)
    this._server_queue.remove(request.server, request.id);
};

PendingRequests.prototype.handleMessage = function (server, msg, socket) {
  var err, request, answer;

  answer = new Packet(socket);
  answer.unpack(msg, this.autopromote);
  answer = answer.promote();

  request = this._server_queue.getRequest(server, answer.header.id);
  if (request)
  {
    this.remove(request);
    request.handle(err, answer);
  }
};

module.exports = new PendingRequests();
