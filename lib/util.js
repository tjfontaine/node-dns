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

var unpack_name = function(buff) {
  var pos = 0
  var len = buff.readUInt8(pos)
  var parts = []
  while (len != 0) {
    if (len & 0xC0) { throw new Error("Invalid packed name, not using label format: " + len) }
    pos++
    var end = pos + len
    if (end > buff.length) { end = buff.length }
    parts.push(buff.toString('ascii', pos, end))
    pos += len
    len = buff.readUInt8(pos)
  }
  return {
    value: parts.join('.'),
    position: pos+1,
  }
}
exports.unpack_name = unpack_name

var pack_name = function(str) {
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
exports.pack_name = pack_name
