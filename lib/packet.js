/*
Copyright 2011 Timothy J Fontaine <tjfontaine@gmail.com>

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

require('bufferjs/concat');

var Header = require('./header'),
  Question = require('./question'),
  ResourceRecord = require('./resourcerecord');

var Packet = exports.Packet = function (socket, rinfo) {
  this._socket = socket;
  this._rinfo = rinfo;

  this.raw_ = undefined;

  this.header = new Header();

  Object.defineProperty(this, 'rcode', {
    get: function () {
      return this.header.rcode;
    },
    set: function (value) {
      this.header.rcode = value;
    },
    configurable: true,
  });

  this.question = [];
  this.answer = [];
  this.authority = [];
  this.additional = [];
};

Packet.prototype.send = function () {
  var message = this.pack();
  this._socket.send(message, 0, message.length, this._rinfo.port, this._rinfo.address);
};

Packet.prototype.pack = function () {
  var message, append;

  this.header.qdcount = this.question.length;
  this.header.ancount = this.answer.length;
  this.header.nscount = this.authority.length;
  this.header.arcount = this.additional.length;

  message = this.header.pack();

  append = function (arrs) {
    var i, a;
    for (i = 0; i < arrs.length; i++) {
      a = arrs[i];
      message = Buffer.concat(message, a.pack());
    }
  };

  append(this.question);
  append(this.answer);
  append(this.authority);
  append(this.additional);

  return message;
};

Packet.prototype.unpack = function (msg) {
  var pos = 0, parse_section, read;

  msg = new Buffer(msg);
  this.raw_ = msg;

  this.header = new Header();
  read = this.header.unpack(msg, pos);
  pos += read;

  parse_section = function (count, Type) {
    var i, t, read, ret = [];

    for (i = 0; i < count; i++) {
      t = new Type();
      read = t.unpack(msg, pos);
      pos += read;
      ret.push(t);
    }

    return ret;
  };

  this.question = parse_section(this.header.qdcount, Question);
  this.answer = parse_section(this.header.ancount, ResourceRecord);
  this.authority = parse_section(this.header.nscount, ResourceRecord);
  this.additional = parse_section(this.header.arcount, ResourceRecord);
};

Packet.prototype.isEDNS = function () {
  return false;
};

Packet.prototype.promote = function () {
  return this;
};

module.exports = Packet;
