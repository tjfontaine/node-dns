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

var dgram = require('dgram'),
    EventEmitter = require('events').EventEmitter,
    ipaddr = require('ipaddr.js'),
    net = require('net'),
    util = require('util');

var UDPSocket = exports.UDPSocket = function(socket, remote) {
  this._socket = socket;
  this._remote = remote;
  this._buff = undefined;
  this.base_size = 512;
  this.bound = false;
  this.unref = undefined;
  this.ref = undefined;
};
util.inherits(UDPSocket, EventEmitter);

UDPSocket.prototype.buffer = function(size) {
  this._buff = new Buffer(size);
  return this._buff;
};

UDPSocket.prototype.send = function(len) {
  this._socket.send(this._buff, 0, len, this._remote.port,
                    this._remote.address);
};

UDPSocket.prototype.bind = function(type) {
  var self = this;

  if (this.bound) {
    this.emit('ready');
  } else {
    this._socket = dgram.createSocket(type);
    this._socket.on('listening', function() {
      self.bound = true;
      if (self._socket.unref) {
        self.unref = function() {
          self._socket.unref();
        }
        self.ref = function() {
          self._socket.ref();
        }
      }
      self.emit('ready');
    });

    this._socket.on('message', this.emit.bind(this, 'message'));

    this._socket.on('close', function() {
      self.bound = false;
      self.emit('close');
    });

    this._socket.bind();
  }
};

UDPSocket.prototype.close = function() {
  this._socket.close();
};

UDPSocket.prototype.remote = function(remote) {
  return new UDPSocket(this._socket, remote);
};

var TCPSocket = exports.TCPSocket = function(socket) {
  UDPSocket.call(this, socket);
  this.base_size = 4096;
  this._rest = undefined;
};
util.inherits(TCPSocket, UDPSocket);

TCPSocket.prototype.buffer = function(size) {
  this._buff = new Buffer(size + 2);
  return this._buff.slice(2);
};

TCPSocket.prototype.send = function(len) {
  this._buff.writeUInt16BE(len, 0);
  this._socket.write(this._buff.slice(0, len + 2));
};

TCPSocket.prototype.bind = function(server) {
  var self = this;

  if (this.bound) {
    this.emit('ready');
  } else {
    this._socket = net.connect(server.port, server.address);

    this._socket.on('connect', function() {
      self.bound = true;
      if (self._socket.unref) {
        self.unref = function() {
          self._socket.unref();
        }
        self.ref = function() {
          self._socket.ref();
        }
      }
      self.emit('ready');
    });

    this._socket.on('timeout', function() {
      self.bound = false;
      self.emit('close');
    });

    this._socket.on('close', function() {
      self.bound = false;
      self.emit('close');
    });

    this.catchMessages();
  }
};

TCPSocket.prototype.catchMessages = function() {
  var self = this;
  this._socket.on('data', function(data) {
    var len, tmp;
    if (!self._rest) {
      self._rest = data;
    } else {
      tmp = new Buffer(self._rest.length + data.length);
      self._rest.copy(tmp, 0);
      data.copy(tmp, self._rest.length);
      self._rest = tmp;
    }
    while (self._rest && self._rest.length > 2) {
      len = self._rest.readUInt16BE(0);
      if (self._rest.length >= len + 2) {
        self.emit('message', self._rest.slice(2, len + 2), self);
        self._rest = self._rest.slice(len + 2);
      } else {
        break;
      }
    }
  });
};

TCPSocket.prototype.close = function() {
  this._socket.end();
};

TCPSocket.prototype.remote = function() {
  return this;
};

exports.reverseIP = function(ip) {
  var address, kind, reverseip, parts;
  address = ipaddr.parse(ip.split(/%/)[0]);
  kind = address.kind();

  switch (kind) {
    case 'ipv4':
      address = address.toByteArray();
      address.reverse();
      reverseip = address.join('.') + '.IN-ADDR.ARPA';
      break;
    case 'ipv6':
      parts = [];
      address.toNormalizedString().split(':').forEach(function(part) {
        var i, pad = 4 - part.length;
        for (i = 0; i < pad; i++) {
          part = '0' + part;
        }
        part.split('').forEach(function(p) {
          parts.push(p);
        });
      });
      parts.reverse();
      reverseip = parts.join('.') + '.IP6.ARPA';
      break;
  }

  return reverseip;
};

var is_absolute = exports.is_absolute = function (f) {
  return f && /\.$/.test(f);
};

var ensure_absolute = exports.ensure_absolute = function (f) {
  if (!is_absolute(f))
    return f += '.';
  return f;
};

var CNAME = require('./consts').NAME_TO_QTYPE.CNAME;

var Lookup = exports.Lookup = function (store, zone, question, cb) {
  if (!(this instanceof Lookup))
    return new Lookup(store, zone, question, cb);

  this.store = store;
  this.zone = zone;
  this.cb = cb;
  this.question = question;
  this.results = [];
  this.wildcard = undefined;

  this.name = ensure_absolute(question.name);

  this.store.get(this.zone, this.name, this.lookup.bind(this));
};

Lookup.prototype.send = function (err) {
  this.cb(err, this.results);
};

Lookup.prototype.lookup = function (err, results) {
  var type, ret, name, self = this;

  if (err)
    return this.send(err);

  if (!results) {
    if (!this.wildcard)
      this.wildcard = this.question.name;

    if (this.wildcard.toLowerCase() == this.zone.toLowerCase())
      return this.send();

    name = this.wildcard = this.wildcard.split('.').splice(1).join('.');

    // 'com.'.split('.').splice(1) will return empty string, we're at the end
    if (!this.wildcard)
      return this.send();

    name = '*.' + name;
  } else if (results[this.question.type]) {
    type = this.question.type;
    ret = results;
  } else if (results[CNAME]) {
    type = CNAME;
    ret = results;
    this.name = name = results[CNAME][0].data
  }

  if (ret) {
    ret = ret[type];
    ret.forEach(function (r) {
      var rr, k;

      if (self.wildcard && /^\*/.test(r.name)) {
        rr = {};
        for (k in r) {
          rr[k] = r[k];
        }
        rr.name = self.name;
      } else {
        rr = r;
      }

      self.results.push(rr);
    });
  }

  if (name)
    this.store.get(this.zone, ensure_absolute(name), this.lookup.bind(this));
  else
    this.send();
};
