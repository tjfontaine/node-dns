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

var ResourceRecord = require('./resourcerecord'),
  ipaddr = require('ipaddr.js'),
  util = require('util'),
  struct = require('struct'),
  consts = require('./consts'),
  name = require('./name');

var SOA = exports.SOA = function (vals) {
  this._rdata_fields = [
    {
      name: 'primary',
      type: 'string',
    },
    {
      name: 'admin',
      type: 'string',
    },
    {
      name: 'serial',
      format: 'I',
    },
    {
      name: 'refresh',
      format: 'I',
    },
    {
      name: 'retry',
      format: 'I',
    },
    {
      name: 'expiration',
      format: 'I',
    },
    {
      name: 'minimum',
      format: 'I',
    },
  ];
  ResourceRecord.call(this, vals);
  this.type = consts.NAME_TO_QTYPE.SOA;
};
util.inherits(SOA, ResourceRecord);
consts.TYPE_MAP[consts.NAME_TO_QTYPE.SOA] = SOA;

var A = exports.A = function (vals) {
  Object.defineProperty(this, 'address', {
    set: function (val) {
      this.address_binary = ipaddr.parse(val);
    },
    get: function () {
      return this.address_binary.toString();
    },
  });

  this._rdata_fields = [
    {
      name: 'address_binary',
      type: 'ipaddr',
      kind: 4,
    },
  ];

  ResourceRecord.call(this, vals);
  this.type = consts.NAME_TO_QTYPE.A;
};
util.inherits(A, ResourceRecord);
consts.TYPE_MAP[consts.NAME_TO_QTYPE.A] = A;

var AAAA = exports.AAAA = function (vals) {
  Object.defineProperty(this, 'address', {
    set: function (val) {
      this.address_binary = ipaddr.parse(val);
    },
    get: function () {
      return this.address_binary.toString();
    },
  });

  this._rdata_fields = [
    {
      name: 'address_binary',
      type: 'ipaddr',
      kind: 6,
    },
  ];

  ResourceRecord.call(this, vals);
  this.type = consts.NAME_TO_QTYPE.AAAA;
};
util.inherits(AAAA, ResourceRecord);
consts.TYPE_MAP[consts.NAME_TO_QTYPE.AAAA] = AAAA;

ResourceRecord.prototype.promote = function () {
  if (!consts.TYPE_MAP[this.type]) {
    return this;
  }

  var i, j, ret, field, bytes, to_read, Type, size,
    pos = 0,
    t = new consts.TYPE_MAP[this.type](this);

  pos = 0;
  for (i = 0; i < t._rdata_fields.length; i++) {
    field = t._rdata_fields[i];
    switch (field.type) {
    case 'string':
      ret = name.unpack(t.rdata, pos);
      pos = ret.position;
      t[field.name] = ret.value;
      break;
    case 'ipaddr':
      bytes = [];
      to_read = 0;
      switch (field.kind) {
      case 4:
        to_read = 4;
        Type = ipaddr.IPv4;
        break;
      case 6:
        to_read = 8;
        Type = ipaddr.IPv6;
        break;
      }
      for (j = 0; j < to_read; j++) {
        bytes.push(t.rdata.readUInt8(pos + j));
      }
      pos += to_read;
      t[field.name] = new Type(bytes);
      break;
    default:
      size = struct.calcsize(field.format);
      t[field.name] = struct.unpack('>' + field.format, t.rdata.slice(pos, pos + size))[0];
      pos += size;
      break;
    }
  }

  return t;
};
