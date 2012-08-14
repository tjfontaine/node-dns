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

var ipaddr = require('./ipaddr');

var Socket = exports.Socket = function(socket, remote) {
  if (socket.send) {
    return new UDPSocket(socket, remote);
  } else {
    return new TCPSocket(socket);
  }
};

var UDPSocket = exports.UDPSocket = function(socket, remote) {
  this._socket = socket;
  this._remote = remote;
  this._buff = undefined;
  this.base_size = 512;
};

UDPSocket.prototype.buffer = function(size) {
  this._buff = new Buffer(size);
  return this._buff;
};

UDPSocket.prototype.send = function(len) {
  this._socket.send(this._buff, 0, len, this._remote.port,
                    this._remote.address);
};

var TCPSocket = exports.TCPSocket = function(socket) {
  this._socket = socket;
  this._buff = undefined;
  this.base_size = 4096;
};

TCPSocket.prototype.buffer = function(size) {
  this._buff = new Buffer(size + 2);
  return this._buff.slice(2);
};

TCPSocket.prototype.send = function(len) {
  this._buff.writeUInt16BE(len, 0);
  this._socket.write(this._buff.slice(0, len + 2));
};

var TCPMessage = exports.TCPMessage = function(socket, handleMessage) {
  var dnssocket, rest;

  dnssocket = new TCPSocket(socket);

  socket.on('data', function(data) {
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
        handleMessage(rest.slice(2, len + 2), dnssocket);
        rest = rest.slice(len + 2);
      } else {
        break;
      }
    }
  });
};

exports.reverseIP = function(ip) {
  var address, kind, reverseip, parts;
  address = ipaddr.parse(ip);
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
