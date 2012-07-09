var assert = require('assert');
var util = require('util');

var BufferCursor = module.exports = function(buff) {
  if (!(this instanceof BufferCursor))
    return new BufferCursor(buff);

  this._pos = 0;
  this.buffer = buff;
  this.length = buff.length;
};

var BCO = BufferCursor.BufferCursorOverflow = function() {
  Error.apply(this, Array.prototype.slice(arguments));
};
util.inherits(BCO, Error);

BufferCursor.prototype._move = function(step) {
  assert(this._pos + step <= this.buffer.length, 'Cannot read beyond buffer');
  this._pos += step;
};

BufferCursor.prototype._read = function(method, size) {
  var ret = this.buffer[method](this._pos);
  this._move(size);
  return ret;
};

BufferCursor.prototype._write = function(value, method, size) {
  if (this._pos + size > this.length)
    throw new BCO();

  this.buffer[method](value, this._pos);
  this._move(size);
};

BufferCursor.prototype.seek = function(pos) {
  assert(pos >= 0, 'Cannot seek behind 0');
  assert(pos <= this.buffer.length, 'Cannot seek beyond buffer length');
  this._pos = pos;
};

BufferCursor.prototype.eof = function() {
  return this._pos == this.length;
};

BufferCursor.prototype.toByteArray = function(method) {
  var arr = [], i, part, count;

  if (!method) {
    method = 'readUInt8';
    part = 1;
  }

  if (method.indexOf('16') > 0)
    part = 2;
  else if (method.indexOf('32') > 0)
    part = 4;

  count = this.length / part;

  for (i = 0; i < this.buffer.length; i += part) {
    arr.push(this.buffer[method](i));
  }
  return arr;
};

BufferCursor.prototype.tell = function() {
  return this._pos;
};

BufferCursor.prototype.slice = function(length) {
  var end, b;

  if (!length) {
    end = this.length;
  } else {
    end = this._pos + length;
  }

  b = new BufferCursor(this.buffer.slice(this._pos, end));
  this.seek(end);

  return b;
};

BufferCursor.prototype.toString = function(encoding, length) {
  var end, ret;

  if (!length) {
    end = this.length;
  } else {
    end = this._pos + length;
  }

  if (!encoding) {
    encoding = 'utf8';
  }

  ret = this.buffer.toString(encoding, this._pos, end);
  this.seek(end);
  return ret;
};

BufferCursor.prototype.write = function(value, length, encoding) {
  var end, ret;

  ret = this.buffer.write(value, this._pos, length, encoding);
  this._move(ret);
  return ret;
};

BufferCursor.prototype.fill = function(value, length) {
  var end;

  if (!length) {
    end = this.length;
  } else {
    end = this._pos + length;
  }

  this.buffer.fill(value, this._pos, end);
  this.seek(end);
};

var defs = {
  reader: {
    1: ['readUInt8', 'readInt8'],
    2: ['readUInt16BE', 'readUInt16LE', 'readInt16BE', 'readInt16LE'],
    4: ['readUInt32BE', 'readUInt32BE', 'readInt32BE', 'readInt32LE',
        'readFloatBE', 'readFloatLE'],
    8: ['readDoubleBE', 'readDoubleLE']
  },
  writer: {
    1: ['writeUInt8', 'writeInt8'],
    2: ['writeUInt16BE', 'writeUInt16LE', 'writeInt16BE', 'writeInt16LE'],
    4: ['writeUInt32BE', 'writeUInt32BE', 'writeInt32BE', 'writeInt32LE',
        'writeFloatBE', 'writeFloatLE'],
    8: ['writeDoubleBE', 'writeDoubleBE']
  }
};

Object.keys(defs.reader).forEach(function(size) {
  var arr = defs.reader[size];
  var move = parseInt(size);
  arr.forEach(function(method) {
    BufferCursor.prototype[method] = function() {
      return this._read(method, move);
    };
  });
});

Object.keys(defs.writer).forEach(function(size) {
  var arr = defs.writer[size];
  var move = parseInt(size);
  arr.forEach(function(method) {
    BufferCursor.prototype[method] = function(value) {
      return this._write(value, method, move);
    };
  });
});
