// Copyright 2011 Timothy J Fontaine <tjfontaine@gmail.com>
//
// Permission is hereby granted, free of charge, to any person obtaining a copy
// of this software and associated documentation files (the "Software"), to deal
// in the Software without restriction, including without limitation the rights
// to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
// copies of the Software, and to permit persons to whom the Software is
// furnished to do so, subject to the following conditions:
//
// The above copyright notice and this permission notice shall be included in
// all copies or substantial portions of the Software.
//
// THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
// IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
// FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
// AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
// LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
// OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN
// THE SOFTWARE

'use strict';

var LABEL_POINTER = 0xC0;

var isPointer = function(len) {
  return (len & LABEL_POINTER) === LABEL_POINTER;
};

var name_unpack = exports.name_unpack = function(buff, pos) {
  var hit_label,
      read_size,
      end,
      increaseRead,
      increasePosition,
      readLen,
      parts,
      len;

  parts = [];
  read_size = 0;
  hit_label = false;

  increaseRead = function(length) {
    if (length === undefined) {
      length = 1;
    }

    if (!hit_label) {
      read_size += length;
    }
  };

  increasePosition = function(length) {
    if (length === undefined) {
      length = 1;
    }
    increaseRead(length);
    pos += length;
  };

  readLen = function() {
    len = buff.readUInt8(pos);
    increasePosition();
  };

  readLen();

  while (len !== 0) {
    if (isPointer(len)) {
      len -= LABEL_POINTER;
      len = len << 8;
      pos = len + buff.readUInt8(pos);
      increaseRead();
      hit_label = true;
    } else {
      end = pos + len;
      parts.push(buff.toString('ascii', pos, end));
      increasePosition(len);
    }

    readLen();
  }

  return {
    read: read_size,
    value: parts.join('.')
  };
};

function splitMax(str, sep, max) {
  var tmp = str.split(sep, max),
      txt = tmp.join(sep),
      rest = str.replace(txt, '').replace(sep, '');
  tmp.push(rest)
  return tmp
}

var name_pack = exports.name_pack = function(str, buff, buf_pos, index) {
  var written = 0,
      found_ptr = false,
      written_parts = [],
      parts, name, left;

  var compress = function(s) {
    if (!s) { return false; }

    var offset = index[s];
    if (offset) {
      offset = (LABEL_POINTER << 8) + offset;
      buff.writeUInt16BE(offset, buf_pos + written);
      written += 2;
      return true;
    }
    return false;
  };

  var splitStr = function(s) {
    if (s && s.length) {
      parts = splitMax(s, '.', 1);
      name = parts[0];
      if (parts.length > 1) {
        left = parts[1];
      } else {
        left = undefined;
      }
    } else {
      parts = [];
      name = undefined;
      left = undefined;
    }
  };

  found_ptr = compress(str);
  splitStr(str);

  while (!found_ptr && parts.length > 0) {
    written_parts.push({
      value: name,
      offset: written + buf_pos,
    });

    buff.writeUInt8(name.length, written + buf_pos);
    written += 1;
    buff.write(name, written + buf_pos, name.length);
    written += name.length;

    found_ptr = compress(left);
    splitStr(left);
  }

  if (!found_ptr) {
    buff.writeUInt8(0, written + buf_pos);
    written += 1;
  }

  if (written_parts.length) {
    var i = written_parts.length;
    while (i > 0) {
      var key = written_parts.slice(i-1);
      var names = [];
      key.forEach(function(k) { names.push(k.value); });
      index[names.join('.')] = key[0].offset;
      i -= 1;
    }
  }

  return written;
};
