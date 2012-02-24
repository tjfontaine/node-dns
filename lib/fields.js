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

var ipaddr = require('ipaddr.js'),
  name = require('./name');

var Struct = exports.Struct = function (field_name, format) {
  var size, write, read;

  switch (format) {
    case 'B':
      write = 'writeUInt8';
      read = 'readUInt8';
      size = 1;
      break;
    case 'H':
      write = 'writeUInt16BE';
      read = 'readUInt16BE';
      size = 2;
      break;
    case 'I':
      write = 'writeUInt32BE';
      read = 'readUInt32BE';
      size = 4;
      break;
  };

  var field = {
    name: field_name,
    default: 0,
    pack: function (value, buf,  pos) {
      buf[write](value, pos);
      return size;
    },
    unpack: function (buff, pos) {
      var value = buff[read](pos);
      return {
        read: size,
        value: value,
      };
    },
    size: size,
  };

  return field;
};

var SubField = exports.SubField = function (field_name, parent, shift, mask) {
  var field = {
    name: field_name,
    default: 0,
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
    default: '',
    pack: function (value, buf, pos) {
      return name.pack(value, buf, pos, this.parent.label_index_);
    },
    unpack: name.unpack,
    size: function (value) {
      return value.length;
    },
  };

  return field;
};

var IPAddress = exports.IPAddress = function (field_name, byte_length) {
  var size;

  switch (byte_length) {
    case 4:
      size = 4;
      break;
    case 6:
      size = 16;
      break;
  };

  var field = {
    name: field_name,
    size: size,
    pack: function (value, buf, pos) {
      var i, bytes, ret;
      bytes = ipaddr.parse(value).toByteArray();

      bytes.forEach(function (b, i) {
        buf.writeUInt8(b, i + pos);
      });

      return bytes.length;
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
    pack: function (value, buf, pos) {
      var len = 2;
      buf.writeUInt16BE(value.length, pos);
      value.copy(buf, pos + len, 0, value.length);
      return len + value.length;
    },
    unpack: function (buff, pos) {
      var value_len, value, size, field_pos, start = pos;

      value_len = buff.readUInt16BE(pos);
      size = 2;

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
    size: function (value) {
      return value.length;
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
    size: function (value) {
      return value.length;
    },
  };

  return field;
};
