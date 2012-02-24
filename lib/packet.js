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

var Header = require('./header'),
  Question = require('./question'),
  ResourceRecord = require('./resourcerecord');

var Packet = exports.Packet = function (socket) {
  this._socket = socket;

  this.raw_ = undefined;

  this.label_index_ = {};

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

  this.clearResources();
};

Packet.prototype.clearResources = function () {
  this.question = [];
  this.answer = [];
  this.authority = [];
  this.additional = [];
};

Packet.prototype.estimateSize = function () {
  var size = this.header.estimateSize();

  var estimate = function (rr) {
    size += rr.estimateSize();
  };

  this.question.forEach(estimate);
  this.answer.forEach(estimate);
  this.authority.forEach(estimate);
  this.additional.forEach(estimate);

  size += 4;
  return size;
};

Packet.prototype.send = function () {
  var buff = new Buffer(this.estimateSize());
  var len, pbuff;

  if (this._socket.tcp) {
    pbuff = buff.slice(2);
  } else {
    pbuff = buff;
  }

  len = this.pack(pbuff, 0);

  if (this._socket.tcp) {
    buff.writeUInt16BE(len, 0);
    len += 2;
  }

  this._socket.send(buff.slice(0, len));
};

Packet.prototype.pack = function (buff, pos) {
  var message, append, spos = pos, self = this;

  this.header.qdcount = this.question.length;
  this.header.ancount = this.answer.length;
  this.header.nscount = this.authority.length;
  this.header.arcount = this.additional.length;

  pos += this.header.pack(buff, pos);

  append = function (a) {
    a.parent = self;
    pos += a.pack(buff, pos);
  };

  this.question.forEach(append);
  this.answer.forEach(append);
  this.authority.forEach(append);
  this.additional.forEach(append);

  return pos - spos;
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
