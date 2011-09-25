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

var RDataType = function (vals, type) {
  this.createFields(this._rdata_fields);
  ResourceRecord.call(this, vals);
  this.type = type;
};
util.inherits(RDataType, ResourceRecord);

var TypeMap = function () {
  this.exported = {};
  this.map = {};
};

TypeMap.prototype.registerType = function (name, fields) {
  var newType = function (vals) {
    this._rdata_fields = fields;
    RDataType.call(this, vals, consts.NAME_TO_QTYPE[name]);
  };
  util.inherits(newType, RDataType);
  this.map[consts.NAME_TO_QTYPE[name]] = newType;
  this.exported[name] = newType;
};

TypeMap.prototype.fromQtype = function (qtype) {
  return this.map[qtype];
};

var types = new TypeMap();

types.registerType('SOA',
             [
              fields.Label('primary'),
              fields.Label('admin'),
              fields.Struct('serial', 'I'),
              fields.Struct('refresh', 'I'),
              fields.Struct('retry', 'I'),
              fields.Struct('expiration', 'I'),
              fields.Struct('minimum', 'I'),
             ]);

types.registerType('A', [fields.IPAddress('address', 4)]);
types.registerType('AAAA', [fields.IPAddress('address', 6)]);

types.registerType('MX',
             [
              fields.Struct('priority', 'H'),
              fields.Label('exchange'),
             ]);

types.registerType('TXT', [fields.CharString('data')]);

types.registerType('SRV',
             [
              fields.Struct('priority', 'H'),
              fields.Struct('weight', 'H'),
              fields.Struct('port', 'H'),
              fields.Label('target'),
             ]);

types.registerType('NS', [ fields.Label('data'), ]);
types.registerType('CNAME', [ fields.Label('data'), ]);
types.registerType('PTR', [ fields.Label('data') ]);

ResourceRecord.prototype.promote = function () {
  var Type = types.fromQtype(this.type), new_type;

  if (!Type) {
    console.log("couldn't promote type:", this.type);
    return this;
  }

  new_type = new Type();
  new_type.unpack(this.raw_, this.record_position_);
  new_type.unpackRData();

  return new_type;
};

module.exports = types;
