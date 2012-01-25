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

var struct = require('pystruct'),
  ipaddr = require('ipaddr.js'),
  name = require('./name');

var Struct = exports.Struct = function (field_name, format) {
  var field = {
    name: field_name,
    value: 0,
    pack: function (value) {
      return struct.pack('>' + format, value);
    },
    unpack: function (buff, pos) {
      var size, value;
      size = struct.calcsize(format);
      value = struct.unpack('>' + format, buff, undefined, pos)[0];
      return {
        read: size,
        value: value,
      };
    },
  };

  return field;
};

var SubField = exports.SubField = function (field_name, parent, shift, mask) {
  var field = {
    name: field_name,
    get: function (self) {
      var v = self[parent];
      return (v & mask) >> shift;
    },
    set: function (self, value) {
      var cval = self[parent] - (self[parent] & mask);
      cval += (value << shift) & mask;
      self[parent] = cval;
    },
  };
  return field;
};

var Label = exports.Label = function (field_name) {
  var field = {
    name: field_name,
    value: '',
    pack: function (value) {
      return name.pack(value);
    },
    unpack: name.unpack,
  };

  return field;
};

var IPAddress = exports.IPAddress = function (field_name, byte_length) {
  var field = {
    name: field_name,
    value: undefined,
    pack: function (value) {
      var i, bytes, ret;

      bytes = ipaddr.parse(value).toByteArray();
      ret = new Buffer(bytes.length);

      for (i = 0; i < bytes.length; i++) {
        ret.writeUInt8(bytes[i], i);
      }

      return ret;
    },
    unpack: function (buff, pos) {
      var i, Kind, read = 0, bytes = [];

      switch (byte_length) {
        case 4:
          Kind = ipaddr.IPv4;
          for (i = 0; i < byte_length; i++) {
            bytes.push(buff.readUInt8(pos));
            read += 1;
            pos += 1;
          }
          break;
        case 6:
          Kind = ipaddr.IPv6;
          for (i = 0; i < 8; i++) {
            bytes.push(buff.readUInt16BE(pos));
            read += 2;
            pos += 2;
          }
          break;
      }

      return {
        read: read,
        value: new Kind(bytes).toString(),
      };
    },
  };

  return field;
};

var BufferField = exports.BufferField = function (field_name, format) {
  var field = {
    name: field_name,
    value: undefined,
    pack: function (value) {
      return Buffer.concat(struct.pack('>' + format, value.length), value);
    },
    unpack: function (buff, pos) {
      var value_len, value, size, field_pos, start = pos;

      size = struct.calcsize(format);
      value_len = struct.unpack('>' + format, buff, undefined, pos)[0];

      pos += size;
      field_pos = pos;

      value = buff.slice(pos, pos + value_len);
      pos += value_len;

      return {
        read: pos - start,
        value: value,
        field_position: field_pos,
      };
    },
  };

  return field;
};

var CharString = exports.CharString = function (field_name) {
  var field = {
    name: field_name,
    value: '',
    get: function (self) {
      return self.rdata.toString('ascii', 1, self.rdata.readUInt8(0) + 1);
    },
    set: function (self, value) {
      var v = new Buffer(value.length + 1);
      v.writeUInt8(value.length, 0);
      v.write(value, 1);
      self.rdata = v;
    },
  };

  return field;
};
