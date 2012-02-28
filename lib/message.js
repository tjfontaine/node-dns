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

var Message = function () {
  this.initializeFields(this._fields);
  if (this._sub_fields) {
    this.initializeFields(this._sub_fields);
  }
};

Message.prototype.initializeFields = function (fields) {
  var self = this;
  fields.forEach(function (field) {
    self[field.name] = field.default;
  });
};

Message.prototype.unpack = function (buff, pos) {
  var ret;

  this.record_position_ = pos;
  this.raw_ = buff;

  ret = this.unpackFields(this._fields, buff, pos);

  if (this._sub_fields) {
    this.unpackFields(this._sub_fields, buff, pos);
  }

  return ret;
};

Message.prototype.unpackFields = function (fields, buff, pos) {
  var self = this, start = pos;

  fields.forEach(function (field) {
    var value;
    if (field.get) {
      value = field.get(self);
    } else {
      var ret, start;

      start = pos;

      try {
        ret = field.unpack(buff, pos);
      } catch (e) {
        var err = new Error("Failed to unpack: " + field.name + " -- " + e);
        err.inner = e;
        throw e;
      }

      pos += ret.read;
      value = ret.value;

      if (ret.field_position) {
        field.position = ret.field_position;
      } else {
        field.position = start;
      }
    }
    self[field.name] = value || field.default;
  });

  return pos - start;
};

Message.prototype.pack = function (buff, pos) {
  if (this._sub_fields) {
    this.packFields(this._sub_fields, buff, pos);
  }
  return this.packFields(this._fields, buff, pos);
};

Message.prototype.packFields = function(fields, buff, pos) {
  var spos = pos, self = this;

  fields.forEach(function (field) {
    var value = self[field.name];

    if (field.set) {
      field.set(self, value);
    } else {
      try {
        pos += field.pack.call(self, value, buff, pos);
      } catch (e) {
        var err = new Error("Failed to pack: " + field.name + " -- " + e);
        err.inner = e;
        throw e;
      }
    }
  });

  return pos - spos;
};

Message.prototype.estimateSize = function () {
  return this.estimateSizeFields(this._fields);
};

Message.prototype.estimateSizeFields = function (fields) {
  var size = 0, self = this;
  fields.forEach(function (field) {
    var value = self[field.name];
    if (!field.size.call) {
      size += field.size;
    } else {
      size += field.size(value);
    }
  });
  return size;
};

module.exports = Message;
