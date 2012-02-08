var
  Socket = require('./socket'),
  net = require('net'),
  dgram = require('dgram');

var SocketCache = module.exports = function (parent) {
  this._pending = {};
  this._socket = {};
  this._parent = parent;
};

SocketCache.prototype._hash = function (server) {
  if (server.type === 'tcp')
    return server.address + ':' + server.port;
  else
    return 'udp' + net.isIP(server.address);
};

SocketCache.prototype._getPending = function (server) {
  var name = this._hash(server);
  return this._pending[name];
};

SocketCache.prototype._pendingAdd = function (server, cb) {
  var name = this._hash(server);
  if (!this._pending[name]) {
    this._pending[name] = [];
  }
  this._pending[name].push(cb);
};

SocketCache.prototype._pendingRemove = function (server) {
  var name = this._hash(server);
  delete this._pending[name];
};

SocketCache.prototype._toInternalSocket = function (server, socket) {
  var S;

  if (server.type === 'tcp') {
    S = new Socket(null, socket);
  } else {
    S = new Socket(socket, server);
  }

  return S;
};

SocketCache.prototype._pendingEmit = function (server, socket) {
  var S, pending, self = this;
  pending = this._getPending(server);
  if (pending) {
    self._socketAdd(server, socket);
    this._pendingRemove(server);
    S = this._toInternalSocket(server, socket);
    pending.forEach(function (cb) {
      cb(S);
    });
  }
};

SocketCache.prototype._getSocket = function (server) {
  var name = this._hash(server);
  return this._socket[name];
};

SocketCache.prototype._socketRemoveInternal = function (shash, socket) {
  if (socket) {
    delete this._socket[shash];
    if (socket.socket.end) {
      socket.socket.end();
    } else {
      socket.socket.close();
    }
  }
};

SocketCache.prototype._socketRemove = function (server) {
  var cache_name = this._hash(server);
  var socket = this._getSocket(server);
  this._socketRemoveInternal(cache_name, socket);
};

SocketCache.prototype._socketAdd = function (server, socket) {
  var self = this;
  var cache_name = this._hash(server);
  this._socket[cache_name] = {
    last: new Date().getTime(),
    socket: socket,
  };
};

SocketCache.prototype._createTcp = function (server) {
  var socket, self = this, rest;
  socket = net.connect(server.port, server.address);

  socket.on('timeout', function () {
    self._pendingRemove(server);
    self._socketRemove(server);
  });

  socket.on('close', function () {
    self._pendingRemove(server);
    self._socketRemove(server);
  });

  socket.on('connect', function () {
    self._pendingEmit(server, socket);
  });

  socket.on('data', function (data) {
    /* TODO XXX FIXME Share this code with lib/server.js */
    var len, tmp;
    if (!rest) {
      rest = data;
    } else {
      tmp = new Buffer(rest.length + data.length);
      rest.copy(tmp, 0);
      data.copy(tmp, rest.length);
      rest = tmp;
    }
    while (rest && rest.length > 2) {
      len = rest.readUInt16BE(0);
      if (rest.length >= len + 2) {
        self._parent.handleMessage(server, rest.slice(2, len + 2), new Socket(null, socket));
        rest = rest.slice(len + 2);
      } else {
        break;
      }
    }
  });
};

SocketCache.prototype._createUdp = function (server) {
  var socket, self = this,
    type = net.isIP(server.address);
  if (type) {
    socket = dgram.createSocket('udp' + type);
    socket.bind()
    socket.on('message', function (msg, remote) {
      self._parent.handleMessage(server, msg, new Socket(socket, remote));
    });
    socket.on('close', function () {
      self._socketRemove(server);
    });
    //socket.on('listening', function () {
      //self._socketAdd(server, socket);
      self._pendingEmit(server, socket);
    //});
  }
};

SocketCache.prototype.get = function (server, cb) {
  var socket, pending, S;

  socket = this._getSocket(server);
  pending = this._getPending(server);

  if (!socket) {
    this._pendingAdd(server, cb);
    if (!pending) {
      if (server.type === 'tcp') {
        this._createTcp(server);
      } else {
        this._createUdp(server);
      }
    }
  } else {
    socket.last = new Date().getTime();
    S = this._toInternalSocket(server, socket.socket);
    cb(S);
  }
};

SocketCache.prototype.close = function (shash) {
  var socket = this._socket[shash];
  this._socketRemoveInternal(shash, socket);
};
