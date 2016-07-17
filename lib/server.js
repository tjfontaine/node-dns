// Copyright 2011 Timothy J Fontaine <tjfontaine@gmail.com>
// Copyright 2016 github Community
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
    EventEmitter = require('events').EventEmitter,
    net = require('net'),
    util = require('util'),
    UDPSocket = require('./utils').UDPSocket,
    TCPSocket = require('./utils').TCPSocket,
    Packet = require('./packet');

var Server = function(opts) {
  var self = this;

  this._socket.on('listening', function() {
    self.emit('listening');
  });

  this._socket.on('close', function() {
    self.emit('close');
  });

  this._socket.on('error', function(err) {
    self.emit('socketError', err, self._socket);
  });
};
util.inherits(Server, EventEmitter);

Server.prototype.close = function() {
  this._socket.close();
};

Server.prototype.address = function() {
  return this._socket.address();
};

Server.prototype.handleMessage = function(msg, remote, address) {
  var request, response = new Packet(remote);

  try {
    request = Packet.parse(msg, remote);

    request.address = address;

    response.header.id = request.header.id;
    response.header.qr = 1;
    response.question = request.question;

    this.emit('request', request, response);
  } catch (e) {
    this.emit('error', e, msg, response);
  }
};

var UDPServer = function(opts) {
  var self = this;

  this._socket = dgram.createSocket(opts.dgram_type || 'udp4');

  this._socket.on('message', function(msg, remote) {
    self.handleMessage(msg, new UDPSocket(self._socket, remote), remote);
  });

  Server.call(this, opts);
};
util.inherits(UDPServer, Server);

UDPServer.prototype.serve = function(port, address, callback) {
  this._socket.bind(port, address, callback);
};

var TCPServer = function(opts) {
  var self = this;

  this._socket = net.createServer(function(client) {
    var tcp = new TCPSocket(client);
    var address = client.address();
    tcp.on('message', function(msg, remote) {
      self.handleMessage(msg, tcp, address);
    });
    tcp.catchMessages();
  });

  Server.call(this, opts);
};
util.inherits(TCPServer, Server);

TCPServer.prototype.serve = function(port, address, callback) {
  this._socket.listen(port, address, callback);
};

exports.createServer = function(opts) {
  return new UDPServer(opts || {});
};

exports.createUDPServer = function(opts) {
  return exports.createServer(opts);
};

exports.createTCPServer = function(opts) {
  return new TCPServer(opts || {});
};
