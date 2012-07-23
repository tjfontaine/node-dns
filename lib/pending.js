// Copyright 2012 Timothy J Fontaine <tjfontaine@gmail.com>
//
// Permission is hereby granted, free of charge, to any person obtaining a copy
// of this software and associated documentation files (the "Software"), to deal
// in the Software without restriction, including without limitation the rights
// to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
// copies of the Software, and to permit persons to whom the Software is
// furnished to do so, subject to the following conditions:
//
// The above copyright notice and this permission notice shall be included in
// all copies or substantial portions of the Software.
//
// THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
// IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
// FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
// AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
// LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
// OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN
// THE SOFTWARE

'use strict';

var dgram = require('dgram'),
    net = require('net'),
    util = require('util'),
    EventEmitter = require('events').EventEmitter,
    Packet = require('./packet'),
    consts = require('./consts'),
    TCPMessage = require('./utils').TCPMessage,
    DNSSocket = require('./utils').Socket;

var debug = function() {
  //var args = Array.prototype.slice.call(arguments);
  //console.log.apply(this, [Date.now().toString()].concat(args));
};

var SocketQueue = function(server) {
  this._active = {};
  this._active_count = 0;
  this._pending = [];

  debug('created', server);

  this._server = server;

  switch(server) {
    case 'udp4':
    case 'udp6':
      this._socket = dgram.createSocket(server);
      this._socket.on('listening', this._onlisten.bind(this));
      this._socket.on('message', this._onmessage.bind(this));
      this._socket.bind();
      break;
    default:
      this._socket = net.connect(server.port, server.address);
      this._socket.on('connect', this._onlisten.bind(this));
      this._tcp = new TCPMessage(this._socket, this._onmessage.bind(this));
      this._socket.on('timeout', this._onclose.bind(this));
      break;
  }

  this._socket.on('close', this._onclose.bind(this));

  this._unref();
};
util.inherits(SocketQueue, EventEmitter);

SocketQueue.prototype.send = function(request) {
  debug('added', request.question);
  this._pending.push(request);
  this._fill();
};

SocketQueue.prototype.remove = function(request) {
  var req = this._active[request.id];
  var idx = this._pending.indexOf(request);

  if (req) {
    delete this._active[request.id];
    this._active_count -= 1;
    this._fill();
  }

  if (idx > -1)
    this._pending.splice(idx, 1);

  this._unref();
};

SocketQueue.prototype.close = function() {
  debug('closing', this._server);
  if (this._socket.end) {
    this._socket.end();
  } else {
    this._socket.close();
  }
  this._socket = undefined;
  this.emit('close');
};

SocketQueue.prototype._fill = function() {
  debug('pre fill, active:', this._active_count, 'pending:', this._pending.length);
  while (this._listening && this._pending.length && this._active_count < 100) {
    this._dequeue();
  }
  debug('post fill, active:', this._active_count, 'pending:', this._pending.length);
};

var random_integer = function() {
  return Math.floor(Math.random() * 50000 + 1);
};

SocketQueue.prototype._dequeue = function() {
  var req = this._pending.pop();
  var id, packet, dnssocket;

  if (req) {
    id = random_integer();

    while (this._active[id])
      id = random_integer();

    debug('sending', req.question, id);

    req.id = id;
    this._active[id] = req;
    this._active_count += 1;

    try {
      if (req.server.type === 'tcp')
        dnssocket = new DNSSocket(null, this._socket);
      else
        dnssocket = new DNSSocket(this._socket, req.server);

      packet = new Packet(dnssocket);
      packet.header.id = id;
      packet.header.rd = 1;

      if (req.try_edns) {
        packet.edns_version = 0;
        //TODO when we support dnssec
        //packet.do = 1
      }

      packet.question.push(req.question)
      packet.send();

      this._ref();
    } catch (e) {
      req.error(e);
    }
  };
};

SocketQueue.prototype._onmessage = function(msg, remote) {
  var req;

  debug('got a message', this._server);

  try {
    var packet = Packet.parse(msg, remote);
    req = this._active[packet.header.id];
    debug('associated message', packet.header.id);
  } catch (e) {
    debug('error parsing packet', e);
  }

  if (req) {
    delete this._active[packet.header.id];
    this._active_count -= 1;
    req.handle(null, packet);
    this._fill();
  }

  this._unref();
};

SocketQueue.prototype._unref = function() {
  var self = this;

  if (this._active_count <= 0) {
    if (this._socket.unref) {
      debug('unrefd socket');
      this._socket.unref();
    } else if (!this._timer) {
      this._timer = setTimeout(function() {
        self.close();
      }, 300);
    }
  }
};

SocketQueue.prototype._ref = function() {
  if (this._socket.ref) {
    debug('refd socket');
    this._socket.ref();
  } else if (this._timer) {
    clearTimeout(this._timer);
    this._timer = null;
  }
};

SocketQueue.prototype._onlisten = function() {
  this._listening = true;
  this._fill();
};

SocketQueue.prototype._onclose = function() {
  var req, err;

  this._listening = false;

  err = new Error('getHostByName ' + consts.TIMEOUT);
  err.errno = consts.TIMEOUT;

  while (this._pending.length) {
    req = this._pending.pop();
    req.error(err);
  }

  Object.keys(this._active).forEach(function(key) {
    var req = this._active[key];
    req.error(err);
    delete this._active[key];
    this._active_count -= 1;
  });
};

var serverHash = function(server) {
  if (server.type === 'tcp')
    return server.address + ':' + server.port;
  else
    return 'udp' + net.isIP(server.address);
};

var _sockets = {};

exports.send = function(request) {
  var hash = serverHash(request.server);
  var socket = _sockets[hash];

  if (!socket) {
    switch (hash) {
      case 'udp4':
      case 'udp6':
        socket = new SocketQueue(hash);
        break;
      default:
        socket = new SocketQueue(request.server);
        break;
    }

    socket.on('close', function() {
      delete _sockets[hash];
    });

    _sockets[hash] = socket;
  }

  socket.send(request);
};

exports.remove = function(request) {
  var hash = serverHash(request.server);
  var socket = _sockets[hash];
  if (socket) {
    socket.remove(request);
  }
};
