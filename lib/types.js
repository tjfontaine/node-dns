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
exports.exported = [];

var RDataType = function (vals, type) {
  this.createFields(this._rdata_fields);
  ResourceRecord.call(this, vals);
  this.type = type;
};
util.inherits(RDataType, ResourceRecord);

var registerType = exports.registerType = function (name, fields) {
  var newType = function (vals) {
    this._rdata_fields = fields;
    RDataType.call(this, vals, consts.NAME_TO_QTYPE[name]);
  };
  util.inherits(newType, RDataType);
  TYPE_MAP[consts.NAME_TO_QTYPE[name]] = newType;
  exports[name] = newType;
  exports.exported.push(name);
};

registerType('SOA',
             [
              fields.Label('primary'),
              fields.Label('admin'),
              fields.Struct('serial', 'I'),
              fields.Struct('refresh', 'I'),
              fields.Struct('retry', 'I'),
              fields.Struct('expiration', 'I'),
              fields.Struct('minimum', 'I'),
             ]);

registerType('A', [fields.IPAddress('address', 4)]);
registerType('AAAA', [fields.IPAddress('address', 6)]);

registerType('MX',
             [
              fields.Struct('priority', 'H'),
              fields.Label('exchange'),
             ]);

registerType('TXT', [fields.CharString('data')]);

registerType('SRV',
             [
              fields.Struct('priority', 'H'),
              fields.Struct('weight', 'H'),
              fields.Struct('port', 'H'),
              fields.Label('target'),
             ]);

registerType('NS', [ fields.Label('data'), ]);
registerType('CNAME', [ fields.Label('data'), ]);
registerType('PTR', [ fields.Label('data') ]);

ResourceRecord.prototype.promote = function () {
  if (!TYPE_MAP[this.type]) {
    return this;
  }

  var new_type = new TYPE_MAP[this.type](this);
  new_type.unpackRData();
  return new_type;
};
