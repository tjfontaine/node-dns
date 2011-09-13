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

var unpack = function(buff, pos) {
  var hit_label = false
  var read_size = 0
  var start_pos = pos
  var parts = []

  var len = buff.readUInt8(pos)
  while (len != 0) {
    if (len & 0xC0) {
      offset = len - 0xC0
      if (offset == 0) {
        pos = buff.readUInt8(pos+1)
        if (!hit_label) {
          read_size += 1
        }
      } else {
        pos = offset
      }
      len = buff.readUInt8(pos)
      hit_label = true
      continue
    }
    pos++
    if (!hit_label) {
      read_size += 1
    }
    var end = pos + len
    parts.push(buff.toString('ascii', pos, end))
    pos += len
    if (!hit_label) {
      read_size += len
    }
    len = buff.readUInt8(pos)
  }
  return {
    value: parts.join('.'),
    position: start_pos + read_size + 1,
  }
}
exports.unpack = unpack

var pack = function(str) {
  var a = str.split('.')
  var buff = new Buffer(str.length + 2)
  var pos = 0
  for (var i=0; i<a.length; i++) {
    var b = a[i]
    if (b.length) {
      buff.writeUInt8(b.length, pos)
      pos++
      buff.write(b, pos, b.length)
      pos += b.length
    }
  }
  buff.writeUInt8(0, pos)
  return buff
}
exports.pack = pack
