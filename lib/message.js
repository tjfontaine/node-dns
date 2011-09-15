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
var struct = require('struct');

var name = require('./name');

var Message = function () {
  Object.defineProperty(this, 'size', {
    get: function () {
      return this.pack().length;
    },
  });
};

Message.prototype.unpack = function (buff, pos) {
  var i, j, field, sfield, ret, size, nbuff, value, read_size = 0;

  for (i = 0; i < this._fields.length; i++) {
    field = this._fields[i];
    if (field.string === true) {
      ret = name.unpack(buff, pos);
      read_size += ret.position - pos;
      pos = ret.position;
      this[field.name] = ret.value;
    } else {
      size = struct.calcsize(field.format);
      nbuff = buff.slice(pos, size + pos);
      value = struct.unpack('>' + field.format, nbuff)[0];

      this[field.name] = value;
      if (field.subfields) {
        for (j = 0; j < field.subfields.length; j++) {
          sfield = field.subfields[j];
          this[sfield.name] = (value & sfield.mask) >> sfield.shift;
        }
      }

      pos += size;
      read_size += size;
    }
  }
  return read_size;
};

Message.prototype.pack = function () {
  var i, j, f, field, sfield, value, v, buff = new Buffer(0);

  for (i = 0; i < this._fields.length; i++) {
    field = this._fields[i];

    if (field.string === true) {
      buff = Buffer.concat(name.pack(this[field.name]));
    } else {
      if (field.subfields) {
        f = 0;
        for (j = 0; j < field.subfields.length; j++) {
          sfield = field.subfields[j];
          value = this[sfield.name] || 0;
          v = value << sfield.shift;
          v = v & sfield.mask;
          f += v;
        }
        this[field.name] = f;
      }

      value = this[field.name] || 0;
      buff = Buffer.concat(buff, struct.pack('>' + field.format, value));
    }
  }

  return buff;
};

module.exports = Message;
