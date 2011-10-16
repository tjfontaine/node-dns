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

var util = require('util'),
  Message = require('./message'),
  fields = require('./fields'),
  ResourceRecord = require('./resourcerecord'),
  types = require('./types'),
  consts = require('./consts'),
  Packet = require('./packet');

var OptField = function () {
  this._fields = [
    fields.Struct('code', 'H'),
    fields.BufferField('data', 'H'),
  ];
  Message.call(this);
};
util.inherits(OptField, Message);

var OPT = exports.OPT = function (vals) {
  this._fields = [
    fields.Label('name'),
    fields.Struct('type', 'H'),
    fields.Struct('udpSize', 'H'),
    fields.Struct('rcode', 'B'),
    fields.Struct('version', 'B'),
    fields.Struct('bitfields', 'H'),
    fields.BufferField('rdata', 'H'),
    fields.SubField('do', 'bitfields', 15, 0x8000),
  ];

  Message.call(this);

  this.type = consts.NAME_TO_QTYPE.OPT;
  this.options = [];

  this.initialize(vals);
};
util.inherits(OPT, Message);

types.map[consts.NAME_TO_QTYPE.OPT] = OPT;
types.exported.OPT = OPT;

OPT.prototype.initialize = ResourceRecord.prototype.initialize;

OPT.prototype.pack = function () {
  var i, field, ret = new Buffer(0);

  for (i = 0; i < this.options.length; i++) {
    field = this.options[i];
    ret.concat(field.pack());
  }

  this.rdata = ret;

  return Message.prototype.pack.call(this);
};

OPT.prototype.unpackRData = function () {
  var field, offset, rdata_pos;
  
  offset = 0;
  rdata_pos = this._fields[4].position;

  while (offset !== this.rdata.length) {
    field = new OptField();
    offset += field.unpack(this.raw_, rdata_pos + offset);
    this.options.push(field);
  }
};

var EDNSPacket = exports.EDNSPacket = function (socket, rinfo) {
  Packet.call(this, socket, rinfo);

  Object.defineProperty(this, 'opt', {
    get: function () {
      var promoted;

      if (this.additional.length === 0) {
        this.additional.push(new OPT());
      }

      promoted = this.additional[0] instanceof OPT;

      if (!promoted) {
        this.additional[0] = this.additional[0].promote();
      }

      return this.additional[0];
    },
  });

  Object.defineProperty(this, 'rcode', {
    get: function () {
      return this.header.rcode + (this.opt.rcode << 4);
    },
    set: function (value) {
      this.opt.rcode = value >> 4;
      this.header.rcode = value - (this.opt.rcode << 4);
    },
    configurable: true,
  });

  Object.defineProperty(this, 'version', {
    get: function () {
      return this.opt.version;
    },
    set: function (value) {
      this.opt.version = value;
    },
  });

  Object.defineProperty(this, 'udpSize', {
    get: function () {
      return this.opt.udpSize;
    },
    set: function (value) {
      this.opt.udpSize = value;
    },
  });

  Object.defineProperty(this, 'do', {
    get: function () {
      return this.opt.do;
    },
    set: function (value) {
      this.opt.do = value;
    },
  });

  this.version = 0;
  this.udpSize = 4096;
  this.do = 1;
};
util.inherits(EDNSPacket, Packet);

Packet.prototype.isEDNS = function () {
  return this.additional.length > 0 && this.additional[0].type === consts.NAME_TO_QTYPE.OPT;
};

Packet.prototype.promote = function () {
  var newInstance;

  if (!this.isEDNS()) {
    return this;
  }

  newInstance = new EDNSPacket(this._socket, this._rinfo);
  newInstance.unpack(this.raw_);

  return newInstance;
};
