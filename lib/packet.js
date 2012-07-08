// Copyright 2011 Timothy J Fontaine <tjfontaine@gmail.com>
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

var consts = require('./consts'),
    writer = require('./writer'),
    util = require('util');

var Packet = exports.Packet = function(socket) {
  this.header = {
    id: 0,
    qr: 0,
    opcode: 0,
    aa: 0,
    tc: 0,
    rd: 1,
    ra: 0,
    res1: 0,
    res2: 0,
    res3: 0,
    rcode: 0,
  };
  this.question = [];
  this.answer = [];
  this.authority = [];
  this.additional = [];
  this.edns_options = [];

  this._socket = socket;
};

Packet.prototype.send = function() {
  var buff, len, pbuff, size;

  if (typeof(this.edns_version) !== 'undefined' || this._socket.tcp) {
    size = 4096;
  } else {
    size = 512;
  }

  this.payload = size;
  buff = new Buffer(size);

  if (this._socket.tcp) {
    pbuff = buff.slice(2);
  } else {
    pbuff = buff;
  }

  len = writer(pbuff, this);

  if (this._socket.tcp) {
    buff.writeUInt16BE(len, 0);
    len += 2;
  }

  this._socket.send(buff.slice(0, len));
};
