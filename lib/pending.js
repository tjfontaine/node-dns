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

var PendingRequests = function () {
  this._server_queue = new ServerQueue(this, 100);
  this.autopromote = false;
};

PendingRequests.prototype.send = function (request) {
  var packet;

  this._server_queue.add(request.server, request, function (socket) {
    if (request.try_edns) {
      packet = new edns.EDNSPacket(socket);
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
