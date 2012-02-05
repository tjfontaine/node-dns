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
  Packet = require('./packet'),
  Socket = require('./socket');

var random_integer = function () {
  return Math.floor(Math.random() * 50000 + 1);
};

var PendingRequests = module.exports = function () {
  this.active_ = {};
  this.active_.count = 0;
  this._socket_cache = {};
  this._socket_pending = {};

  var self = this;

  this.platform = require('./platform');
  this.platform.on('ready', function () {
    self.sendQueued();
  });
  if (this.platform.ready) {
    this.sendQueued();
  }
};

PendingRequests.prototype.socketCacheName = function (server) {
  var name;
  if (server.type === 'tcp') {
    name = server.address + ':' + server.port;
  } else {
    name = 'udp' + net.isIP(server.address);
  }
  return name;
};

PendingRequests.prototype.socketCacheGet = function (server) {
  var name = this.socketCacheName(server);
  return this._socket_cache[name];
};

PendingRequests.prototype.socketCacheRemove = function (server) {
  var cache_name = this.socketCacheName(server);
  var socket = this.socketCacheGet(server);
  if (socket) {
    delete this._socket_cache[cache_name];
    if (server.type === 'tcp') {
      socket.socket.end();
    } else {
      socket.socket.close();
    }
    clearTimeout(socket.timer);
  }
};

PendingRequests.prototype.socketCacheAdd = function (server, socket) {
  var self = this;
  var cache_name = this.socketCacheName(server);
  this._socket_cache[cache_name] = {
    last: new Date().getTime(),
    socket: socket,
    timer: setInterval(function() { self.checkDrain(server); }, 300),
  };
};

PendingRequests.prototype.socketPendingGet = function (server) {
  var name = this.socketCacheName(server);
  return this._socket_pending[name];
};

PendingRequests.prototype.socketPendingAdd = function (server, cb) {
  var name = this.socketCacheName(server);
  if (!this._socket_pending[name]) {
    this._socket_pending[name] = [];
  }
  this._socket_pending[name].push(cb);
};

PendingRequests.prototype.socketPendingRemove = function (server) {
  var name = this.socketCacheName(server);
  delete this._socket_pending[name];
};

PendingRequests.prototype.socketPendingEmit = function (server, socket) {
  var S, pending, self = this;
  pending = this.socketPendingGet(server);
  if (pending) {
    self.socketCacheAdd(server, socket);
    this.socketPendingRemove(server);
    pending.forEach(function (p) {
      if (server.type === 'tcp') {
        S = new Socket(null, socket);
      } else {
        S = new Socket(socket, server);
      }
      p.call(self, undefined, S);
    });
  }
};

PendingRequests.prototype.socketCache = function (server, cb) {
  var S, pending = this.socketPendingGet(server),
    socket = this.socketCacheGet(server);

  if (!socket) {
    this.socketPendingAdd(server, cb);
    if (!pending) {
      if (server.type === 'tcp') {
        this._createTcp(server);
      } else {
        this._createUdp(server);
      }
    }
  } else {
    socket.last = new Date().getTime();
    if (server.type === 'tcp') {
      S = new Socket(null, socket.socket);
    } else {
      S = new Socket(socket.socket, server);
    }
    cb.call(this, undefined, S);
  }
};

PendingRequests.prototype._createTcp = function (server) {
  var socket, self = this, rest, tmp;
  socket = net.connect(server.port, server.address);
  socket.on('timeout', function () {
    self.socketPendingRemove(server);
    self.socketCacheRemove(server);
  });
  socket.on('close', function () { self.socketCacheRemove(server); });
  socket.on('connect', function () {
    self.socketPendingEmit(server, socket);
  });
  socket.on('data', function (data) {
    if (!rest) {
      rest = data;
    } else {
      tmp = new Buffer(rest.length + data.length);
      rest.copy(tmp, 0);
      data.copy(tmp, rest.length);
      rest = tmp;
    }
    try {
      var len = rest.readUInt16BE(0);
      self.handleMessage(rest.slice(2, len+2), new Socket(null, socket));
      rest = undefined;
    } catch (e) {
    }
  });
};

PendingRequests.prototype._createUdp = function (server) {
  var socket, self = this,
    type = net.isIP(server.address);
  if (type) {
    socket = dgram.createSocket('udp' + type);
    socket.bind()
    socket.on('message', function (msg, remote) {
      self.handleMessage(msg, new Socket(socket, remote));
    });
    socket.on('close', function () {
      self.socketCacheRemove(server);
    });
    //socket.on('listening', function () {
      //self.socketCacheAdd(server, socket);
      self.socketPendingEmit(server, socket);
    //});
  }
};

PendingRequests.prototype.sendQueued = function () {
  var i, request;

  for (i in this.active_) {
    if (this.active_.hasOwnProperty(i) && i !== 'count') {
      request = this.active_[i];
      if (!request.started) {
        request.start();
      }
    }
  }
};

PendingRequests.prototype.add = function (request) {
  var id = random_integer();
  while (this.active_[id] !== undefined) {
    id = random_integer();
  }
  request.id = id;
  this.active_[id] = request;
  this.active_.count++;

  if (this.platform.ready) {
    request.start();
  }
};

PendingRequests.prototype.remove = function (request) {
  delete this.active_[request.id];
  this.active_.count--;
};

PendingRequests.prototype.checkDrain = function (server) {
  var socket = this.socketCacheGet(server);
  var cur = new Date().getTime();
  if (socket && this.active_.count === 0 && cur - socket.last > 300) {
    this.socketCacheRemove(server);
  }
};

PendingRequests.prototype.handleMessage = function (msg, socket) {
  var err, request, answer;

  answer = new Packet(socket);
  answer.unpack(msg);
  answer = answer.promote();

  if (this.active_[answer.header.id]) {
    request = this.active_[answer.header.id];
    request.handle(err, answer);
  }
};
