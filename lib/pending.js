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
    Packet = require('./packet'),
    TCPMessage = require('./utils').TCPMessage,
    Socket = require('./utils').Socket;

var serverHash = function(server) {
  if (server.type === 'tcp')
    return server.address + ':' + server.port;
  else
    return 'udp' + net.isIP(server.address);
};

// Data structure that creates sockets and listens for new packets
var SocketCache = function(parent) {
  // This holds callbacks for people trying to get a socket
  this._pending = {};
  // Holds actual sockets
  this._socket = {};
  this._parent = parent;
};

SocketCache.prototype._getPending = function(server) {
  var name = serverHash(server);
  return this._pending[name];
};

SocketCache.prototype._pendingAdd = function(server, cb) {
  var name = serverHash(server);
  if (!this._pending[name]) {
    this._pending[name] = [];
  }
  this._pending[name].push(cb);
};

SocketCache.prototype._pendingRemove = function(server) {
  var name = serverHash(server);
  delete this._pending[name];
};

SocketCache.prototype._pendingEmit = function(server, socket) {
  var dnssocket, pending;

  pending = this._getPending(server);

  if (pending) {
    this._socketAdd(server, socket);

    this._pendingRemove(server);

    if (server.type === 'tcp') {
      dnssocket = new Socket(null, socket);
    } else {
      dnssocket = new Socket(socket, server);
    }

    pending.forEach(function(cb) {
      cb(dnssocket);
    });
  }
};

SocketCache.prototype._getSocket = function(server) {
  var name = serverHash(server);
  var socket = this._socket[name]
  if (socket)
    socket.last = Date.now();
  return socket;
};

SocketCache.prototype._socketRemoveInternal = function(shash, socket) {
  if (socket) {
    delete this._socket[shash];
    if (socket.socket.end) {
      socket.socket.end();
    } else {
      socket.socket.close();
    }
  }
};

SocketCache.prototype._socketRemove = function(server) {
  var cache_name = serverHash(server);
  var socket = this._getSocket(server);
  this._socketRemoveInternal(cache_name, socket);
};

SocketCache.prototype._socketAdd = function(server, socket) {
  var cache_name = serverHash(server);
  var cached = this._getSocket(server);
  if (!cached) {
    cached = this._socket[cache_name] = {
      last: Date.now(),
      socket: socket
    };
  }
  return cached;
};

SocketCache.prototype._createTcp = function(server) {
  var socket, self = this, tcp;
  socket = net.connect(server.port, server.address);

  socket.on('timeout', function() {
    self._pendingRemove(server);
    self._socketRemove(server);
  });

  socket.on('close', function() {
    self._pendingRemove(server);
    self._socketRemove(server);
  });

  socket.on('connect', function() {
    self._pendingEmit(server, socket);
  });

  tcp = new TCPMessage(socket, function(msg, socket) {
    self._parent.handleMessage(server, msg, socket);
  });
};

SocketCache.prototype._createUdp = function(server) {
  var socket, self = this,
      type = net.isIP(server.address);
  if (type) {
    socket = dgram.createSocket('udp' + type);

    var onMessage = function(msg, remote) {
      // 20 is the smallest a packet could be when asking for the root
      // we have no way to associate this response to any request, thus if the
      // packet was broken somewhere along the way it will result in a timeout
      if (msg.length >= 20)
        self._parent.handleMessage(server, msg, new Socket(socket, remote));
    };

    var onClose = function() {
      self._pendingRemove(server);
      self._socketRemove(server);
    };

    var onListening = function() {
      self._pendingEmit(server, socket);
    };

    socket.on('message', onMessage);
    socket.on('close', onClose);
    socket.on('listening', onListening);

    socket.bind();
  }
};

// Request a socket, if it's not currently open create it
SocketCache.prototype.get = function(server, cb) {
  var socket, self = this;

  this._pendingAdd(server, cb);

  socket = this._getSocket(server);

  if (!socket) {
    if (server.type === 'tcp') {
      this._createTcp(server);
    } else {
      this._createUdp(server);
    }
  } else {
    process.nextTick(function () {
      self._pendingEmit(server, socket.socket);
    });
  }
};

SocketCache.prototype.close = function(shash) {
  var socket = this._socket[shash];
  this._socketRemoveInternal(shash, socket);
};

var random_integer = function() {
  return Math.floor(Math.random() * 50000 + 1);
};

// TODO XXX FIXME -- Until we can unref a socket, close a socket if no
// requests have come in for in 300ms
var SOCKET_TIMEOUT = 300;

// Data strucutre that manages making sure there are only so many requests in
// in flight at a given time, as well closing sockets as needed
var ServerQueue = module.exports = function(parent, active) {
  var self = this;

  // Where requests are stored if the socket isn't ready or if the socket is
  // full
  this._queue = {};
  // requests active by socket and type
  this._active = {};
  // this handles socket creation and message catching
  this._socketCache = new SocketCache(parent);
  this._max_queue = active;

  var check_sockets = function() {
    var s, now;
    now = Date.now();
    Object.keys(self._socketCache._socket).forEach(function(s) {
      var socket = self._socketCache._socket[s];
      var delta = now - socket.last;

      // If it's been longer than SOCKET_TIMEOUT and there are no requests
      // queued or still in flight we're safe to close the socket
      if (delta > SOCKET_TIMEOUT && self._queue[s].order.length === 0 &&
          self._active[s].count === 0) {
        self._socketCache.close(s);
      }
    });
    // only readd the timer if we actually have sockets to pay attention to
    if (Object.keys(self._socketCache._socket).length) {
      self._timer = setTimeout(check_sockets, SOCKET_TIMEOUT);
    }
  };

  // TODO XXX FIXME -- When we can unref sockets we'll ref on active requests
  // and unref when empty, that way these sockets won't hold the loop
  self._timer = setTimeout(check_sockets, SOCKET_TIMEOUT);
};

ServerQueue.prototype._getQueue = function(server) {
  var name = serverHash(server);

  // order allows us to preserve the order since iterating the object keys
  // may not preserve that
  if (!this._queue[name]) {
    this._queue[name] = {
      order: []
    };
  }

  return this._queue[name];
};

ServerQueue.prototype._getActive = function(server) {
  var name = serverHash(server);

  if (!this._active[name]) {
    this._active[name] = {
      count: 0
    };
  }

  return this._active[name];
};

ServerQueue.prototype.add = function(server, request, cb) {
  var id, queue, active;

  queue = this._getQueue(server);
  active = this._getActive(server);

  // create request id, make sure it's not going to collide with a queued
  // request or request already in flight for this server
  // ids are unique per server not system wide
  id = random_integer();
  while (queue[id] || active[id]) id = random_integer();

  queue[id] = {
    request: request,
    cb: cb
  };

  // append to head of the order
  queue.order.splice(0, 0, id);

  request.id = id;

  this.fill(server);
};

ServerQueue.prototype.remove = function(server, id) {
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

ServerQueue.prototype.pop = function(server) {
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

// While we have space go ahead and send as many requests as we can fit
ServerQueue.prototype.fill = function(server) {
  var active, cb;
  active = this._getActive(server);
  while (active.count < this._max_queue) {
    cb = this.pop(server);
    if (cb)
      this._socketCache.get(server, cb);
    else
      break;
  }
};

ServerQueue.prototype.getRequest = function(server, id) {
  var active = this._getActive(server);
  return active[id];
};

var PendingRequests = function() {
  // 100 requests in flight per server
  // 100 for 8.8.8.8 udp, 100 for 8.8.8.8 tcp
  this._server_queue = new ServerQueue(this, 100);
};

PendingRequests.prototype.send = function(request) {
  // The socket may not be created yet, or there may already be too many
  // requests in flight, packets won't be generated until the socket is
  // actually ready for sending.
  // Request IDs aren't created until we're sure we're not going to collide
  // with an existing request
  this._server_queue.add(request.server, request, function(socket) {
    var packet;

    // TODO -- We might want to slab allocate these? or perhaps in .send
    try {
      packet = new Packet(socket);
      packet.header.id = request.id;
      packet.header.rd = 1;

      if (request.try_edns) {
        packet.edns_version = 0;
        //packet.do = 1;
      }

      packet.question.push(request.question);
      packet.send();
    } catch (e) {
      request.error(e);
    }
  });
};

// Stop caring about this request, deregister it from the queue
PendingRequests.prototype.remove = function(request) {
  if (request && request.server && request.id)
    this._server_queue.remove(request.server, request.id);
};

// Proxy response back to Request object
// TODO -- Should this be handled in ServerQueue instead?
PendingRequests.prototype.handleMessage = function(server, msg, socket) {
  var err, request, answer, start, end;

  // TODO -- Handle parse failure, we may have enough information to pass that
  // information back to Request
  answer = Packet.parse(msg, socket);

  request = this._server_queue.getRequest(server, answer.header.id);
  if (request)
  {
    this.remove(request);
    request.handle(err, answer);
  }
};

module.exports = new PendingRequests();
