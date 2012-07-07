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

  this._socket = socket;
};

Packet.prototype.send = function() {
  var buff = new Buffer(1024);
  var len, pbuff;

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

/*
var EDNSPacket = exports.EDNSPacket = function(socket, rinfo) {
  Packet.call(this, socket, rinfo);

  Object.defineProperty(this, 'opt', {
    get: function() {
      var promoted;

      if (this.additional.length === 0) {
        this.additional.push(new OPT());
      }

      promoted = this.additional[0] instanceof OPT;

      if (!promoted) {
        this.additional[0] = this.additional[0].promote();
      }

      return this.additional[0];
    }
  });

  Object.defineProperty(this, 'rcode', {
    get: function() {
      return this.header.rcode + (this.opt.rcode << 4);
    },
    set: function(value) {
      this.opt.rcode = value >> 4;
      this.header.rcode = value - (this.opt.rcode << 4);
    },
    configurable: true
  });

  Object.defineProperty(this, 'version', {
    get: function() {
      return this.opt.version;
    },
    set: function(value) {
      this.opt.version = value;
    }
  });

  Object.defineProperty(this, 'udpSize', {
    get: function() {
      return this.opt.udpSize;
    },
    set: function(value) {
      this.opt.udpSize = value;
    }
  });

  Object.defineProperty(this, 'do', {
    get: function() {
      return this.opt.do;
    },
    set: function(value) {
      this.opt.do = value;
    }
  });

  this.version = 0;
  this.udpSize = 4096;
  this.do = 1;
};
util.inherits(EDNSPacket, Packet);
*/
