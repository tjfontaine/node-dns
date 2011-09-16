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

var util = require('util'),
  fields = require('./fields'),
  Message = require('./message');

var Header = function () {
  this._fields = [
    fields.Struct('id', 'H'),
    fields.Struct('bitfields', 'H'),
    fields.SubField('qr', 'bitfields', 15, 0x8000),
    fields.SubField('opcode', 'bitfields', 11, 0x7800),
    fields.SubField('aa', 'bitfields', 10, 0x400),
    fields.SubField('tc', 'bitfields', 9, 0x200),
    fields.SubField('rd', 'bitfields', 8, 0x100),
    fields.SubField('ra', 'bitfields', 7, 0x80),
    fields.SubField('res1', 'bitfields', 6, 0x40),
    fields.SubField('res2', 'bitfields', 5, 0x20),
    fields.SubField('res3', 'bitfields', 4, 0x10),
    fields.SubField('rcode', 'bitfields', 0, 0xf),
    fields.Struct('qdcount', 'H'),
    fields.Struct('ancount', 'H'),
    fields.Struct('nscount', 'H'),
    fields.Struct('arcount', 'H'),
  ];
  Message.call(this);
};
util.inherits(Header, Message);

module.exports = Header;
