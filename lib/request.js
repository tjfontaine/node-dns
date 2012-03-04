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

var EventEmitter = require('events').EventEmitter,
  PendingRequests = require('./pending'),
  net = require('net'),
  util = require('util');

var Request = function (opts) {
  this.question = opts.question;
  this.server = opts.server;

  if (typeof(this.server) === 'string' || this.server instanceof String)
    this.server = { address: this.server, port: 53, type: 'udp'};

  if (!this.server || !this.server.address || !net.isIP(this.server.address))
    throw new Error("Server object must be supplied with at least address");

  if (!this.server.type || ['udp', 'tcp'].indexOf(this.server.type))
    this.server.type = 'udp';

  if (!this.server.port)
    this.server.port = 53;

  this.timeout = opts.timeout || 4 * 1000;
  this.try_edns = opts.try_edns || false;

  this.fired = false;
  this.id = undefined;
};
util.inherits(Request, EventEmitter);

Request.prototype.handle = function (err, answer) {
  if (!this.fired) {
    this.emit('message', err, answer);
    this.done();
  }
};

Request.prototype.done = function () {
  this.fired = true;
  clearTimeout(this.timer_);
  PendingRequests.remove(this);
  this.emit('end');
  this.id = undefined;
};

Request.prototype.handleTimeout = function () {
  if (!this.fired) {
    this.emit('timeout');
    this.done();
  }
};

Request.prototype.send = function () {
  var self = this;

  this.timer_ = setTimeout(function () {
    self.handleTimeout();
  }, this.timeout);

  PendingRequests.send(this);
};

Request.prototype.cancel = function () {
  this.emit('cancelled');
  this.done();
};

module.exports = function (opts) {
  return new Request(opts);
};
