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
  name = require('./name');

var ResourceRecord = function (vals) {
  this._fields = [
    fields.Label('name'),
    fields.Struct('type', 'H'),
    fields.Struct('class', 'H'),
    fields.Struct('ttl', 'I'),
    fields.BufferField('rdata', 'H'),
  ];

  Message.call(this);

  this.class = 1;

  this.initialize(vals);
};
util.inherits(ResourceRecord, Message);

ResourceRecord.prototype.initialize = function (vals) {
  var k;

  if (vals) {
    for (k in vals) {
      if (vals.hasOwnProperty(k)) {
        this[k] = vals[k];
      }
    }
  }
};

ResourceRecord.prototype.pack = function () {
  /* XXX
   * this presumes that the accessor takes care of packing
   * could have interesting side effects if you're trying to
   * reuse full packets
   */
  if (!this.rdata) {
    this.rdata = this.packFields(this._rdata_fields);
  }
  var ret = Message.prototype.pack.call(this);
  return ret;
};

ResourceRecord.prototype.unpackRData = function () {
  this.unpackFields(this._rdata_fields,
                    this.raw_,
                    this._fields[4].position);
};

module.exports = ResourceRecord;
