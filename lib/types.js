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
  fields = require('./fields'),
  consts = require('./consts'),
  name = require('./name');

var TYPE_MAP = {};

var RDataType = function (vals, type) {
  this.createFields(this._rdata_fields);
  ResourceRecord.call(this, vals);
  this.type = type;
};
util.inherits(RDataType, ResourceRecord);

var SOA = exports.SOA = function (vals) {
  this._rdata_fields = [
    fields.Label('primary'),
    fields.Label('admin'),
    fields.Struct('serial', 'I'),
    fields.Struct('refresh', 'I'),
    fields.Struct('retry', 'I'),
    fields.Struct('expiration', 'I'),
    fields.Struct('minimum', 'I'),
  ];
  RDataType.call(this, vals, consts.NAME_TO_QTYPE.SOA);
};
util.inherits(SOA, RDataType);
TYPE_MAP[consts.NAME_TO_QTYPE.SOA] = SOA;

var A = exports.A = function (vals) {
  this._rdata_fields = [
    fields.IPAddress('address', 4),
  ];

  RDataType.call(this, vals, consts.NAME_TO_QTYPE.A);
};
util.inherits(A, RDataType);
TYPE_MAP[consts.NAME_TO_QTYPE.A] = A;

var AAAA = exports.AAAA = function (vals) {
  this._rdata_fields = [
    fields.IPAddress('address', 8),
  ];

  RDataType.call(this, vals, consts.NAME_TO_QTYPE.AAAA);
};
util.inherits(AAAA, RDataType);
TYPE_MAP[consts.NAME_TO_QTYPE.AAAA] = AAAA;

var MX = exports.MX = function (vals) {
  this._rdata_fields = [
    fields.Struct('priority', 'H'),
    fields.Label('exchange'),
  ];
  RDataType.call(this, vals, consts.NAME_TO_QTYPE.MX);
};
util.inherits(MX, RDataType);
TYPE_MAP[consts.NAME_TO_QTYPE.MX] = MX;

var TXT = exports.TXT = function (vals) {
  this._rdata_fields = [
    fields.CharString('data'),
  ];
  RDataType.call(this, vals, consts.NAME_TO_QTYPE.TXT);
};
util.inherits(TXT, RDataType);
TYPE_MAP[consts.NAME_TO_QTYPE.TXT] = TXT;

var SRV = exports.SRV = function (vals) {
  this._rdata_fields = [
    fields.Struct('priority', 'H'),
    fields.Struct('weight', 'H'),
    fields.Struct('port', 'H'),
    fields.Label('target'),
  ];
  RDataType.call(this, vals, consts.NAME_TO_QTYPE.SRV);
};
util.inherits(SRV, RDataType);
TYPE_MAP[consts.NAME_TO_QTYPE.SRV] = SRV;

ResourceRecord.prototype.promote = function () {
  if (!TYPE_MAP[this.type]) {
    return this;
  }

  var new_type = new TYPE_MAP[this.type](this);
  new_type.unpackRData();
  return new_type;
};
