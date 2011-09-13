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

require('bufferjs/concat')
var struct = require('struct')

var name = require('./name')

var Message = function() {
  Object.defineProperty(this, 'size', {
    get: function() { return this.pack().length },
  })
}

Message.prototype.unpack = function(buff, pos) {
  var read_size = 0
  for (var i=0; i<this._fields.length; i++) {
    var field = this._fields[i]
    if (field.string === true) {
      var ret = name.unpack(buff, pos)
      read_size += ret.position - pos
      pos = ret.position
      this[field.name] = ret.value
    } else {
      var size = struct.calcsize(field.format)
      var nbuff = buff.slice(pos, size+pos)
      var value = struct.unpack('>'+field.format, nbuff)[0]

      this[field.name] = value
      if (field.subfields) {
        for (var j=0; j<field.subfields.length; j++) {
          var sfield = field.subfields[j]
          this[sfield.name] = (value & sfield.mask) >> sfield.shift
        }
      }

      pos += size
      read_size += size
    }
  }
  return read_size
}

Message.prototype.pack = function() {
  var buff = new Buffer(0)
  for (var i=0; i<this._fields.length; i++) {
    var field = this._fields[i]

    if (field.string === true) {
      buff = Buffer.concat(name.pack(this[field.name]))
    } else {
      if (field.subfields) {
        var f = 0
        for (var j=0; j<field.subfields.length; j++) {
          var sfield = field.subfields[j]
          var value = this[sfield.name] || 0
          var v = value << sfield.shift
          v = v & sfield.mask
          f += v
        }
        this[field.name] = f
      }

      var field_val = this[field.name] || 0
      buff = Buffer.concat(buff, struct.pack('>'+field.format, field_val))
    }
  }

  return buff
}

module.exports = Message
