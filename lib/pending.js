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
  ServerQueue = require('./server_queue'),
  Socket = require('./socket');


var PendingRequests = module.exports = function () {
  this._queue = [];
  this._server_queue = new ServerQueue(this, 100);

  var self = this;

  this.platform = require('./platform');
  this.platform.on('ready', function () {
    self.sendQueued();
  });
  if (this.platform.ready) {
    this.sendQueued();
  }
};

PendingRequests.prototype.add = function (request) {
  if (!this.platform.ready) {
    this._queue.splice(0, 0, request);
  } else {
    request.start();
  }
};

PendingRequests.prototype.sendQueued = function () {
  this._queue.forEach(function (request) {
    request.start();
  });
};

PendingRequests.prototype.send = function (request) {
  var packet, cache_name;

  this._server_queue.add(request.current_server, request, function (socket) {
    if (request.try_edns) {
      packet = new edns.EDNSPacket(socket);
    } else {
      packet = new Packet(socket);
    }
    packet.header.id = request.id;
    packet.header.rd = 1;
    packet.question.push(request.question);
    packet.send();
  });
};

PendingRequests.prototype.remove = function (request) {
  var idx = this._queue.indexOf(request);
  if (idx > -1)
    this._queue.splice(idx, 1);

  if (request.current_server, request.id)
    this._server_queue.remove(request.current_server, request.id);
};

PendingRequests.prototype.handleMessage = function (server, msg, socket) {
  var err, request, answer;

  answer = new Packet(socket);
  answer.unpack(msg);
  answer = answer.promote();

  request = this._server_queue.getRequest(server, answer.header.id);
  if (request)
  {
    this.remove(request);
    request.handle(err, answer);
  }
};
