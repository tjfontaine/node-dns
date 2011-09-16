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
  struct = require('struct'),
  Message = require('./message'),
  fields = require('./fields'),
  name = require('./name');

var ResourceRecord = function (vals) {
  var k;

  this._fields = [
    fields.Label('name'),
    fields.Struct('type', 'H'),
    fields.Struct('class', 'H'),
    fields.Struct('ttl', 'I'),
  ];
  Message.call(this);
  
  this.class = 1;

  if (vals) {
    for (k in vals) {
      if (vals.hasOwnProperty(k)) {
        this[k] = vals[k];
      }
    }
  }
};
util.inherits(ResourceRecord, Message);

ResourceRecord.prototype.pack = function () {
  var ret = Message.prototype.pack.call(this);
  
  this.rdata = this.packFields(this._rdata_fields);

  return Buffer.concat(ret, struct.pack('>H', this.rdata.length), this.rdata);
};

ResourceRecord.prototype.unpack = function (buff, pos) {
  var read, size, rdata_length, start = pos;

  read = Message.prototype.unpack.call(this, buff, pos);
  pos += read;

  size = struct.calcsize('>H');
  rdata_length = struct.unpack('>H', buff.slice(pos, pos + size))[0];
  pos += size;

  this.rdata_position = pos;
  this.rdata = buff.slice(pos, pos + rdata_length);
  pos += rdata_length;

  return pos - start;
};

ResourceRecord.prototype.unpackRData = function () {
  this.unpackFields(this._rdata_fields, this._raw, this.rdata_position);
};

module.exports = ResourceRecord;
