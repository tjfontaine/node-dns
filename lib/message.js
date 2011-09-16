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

var Message = function () {
  this.createFields(this._fields);
};

Message.prototype.createFields = function(fields) {
  var self = this;
  fields.forEach(function (field) {
    var method = {
      enumerable: true,
    };

    if (field.get) {
      method.get = function () {
        return field.get(self);
      };
      method.set = function (value) {
        field.set(self, value);
      };
    } else {
      method.get = function () {
        return field.value;
      };
      method.set = function (value) {
        field.value = value;
      };
    }

    Object.defineProperty(self, field.name, method);
  });
};

Message.prototype.unpack = function (buff, pos) {
  this.record_position_ = pos;
  this.raw_ = buff;
  return this.unpackFields(this._fields, buff, pos);
};

Message.prototype.unpackFields = function (fields, buff, pos) {
  var self = this, start = pos;

  fields.forEach(function (field) {
    if (field.get) {
      return;
    }
    var ret, start;

    start = pos;
    ret = field.unpack(buff, pos);

    pos += ret.read;
    self[field.name] = ret.value;

    if (ret.field_position) {
      field.position = ret.field_position;
    } else {
      field.position = start;
    }
  });

  return pos - start;
};

Message.prototype.pack = function () {
  return this.packFields(this._fields);
};

Message.prototype.packFields = function(fields) {
  var ret = new Buffer(0);

  fields.forEach(function (field) {
    if (field.get) {
      return;
    }
    var packed_field = field.pack(field.value);
    ret = Buffer.concat(ret, packed_field);
  });

  return ret;
};

module.exports = Message;
