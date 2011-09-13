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

var util = require('util')

var Message = require('./message')

var Header = function() {
  this._fields = [
    {
      name: 'id',
      format: 'H',
    },
    {
      name: 'bitfields',
      format: 'H',
      subfields: [
        {
          name: 'qr',
          mask: 0x8000,
          shift: 15,
        },
        {
          name: 'opcode',
          mask: 0x7800,
          shift: 11,
        },
        {
          name: 'aa',
          mask: 0x0400,
          shift: 10,
        },
        {
          name: 'tc',
          mask: 0x0200,
          shift: 9,
        },
        {
          name: 'rd',
          mask: 0x0100,
          shift: 8,
        },
        {
          name: 'ra',
          mask: 0x0080,
          shift: 7,
        },
        {
          name: 'res1',
          mask: 0x0040,
          shift: 6,
        },
        {
          name: 'res2',
          mask: 0x0020,
          shift: 5,
        },
        {
          name: 'res3',
          mask: 0x0010,
          shift: 4,
        },
        {
          name: 'rcode',
          mask: 0x000f,
          shift: 0,
        },
      ],
    },
    {
      name: 'qdcount',
      format: 'H',
    },
    {
      name: 'ancount',
      format: 'H',
    },
    {
      name: 'nscount',
      format: 'H',
    },
    {
      name: 'arcount',
      format: 'H',
    },
  ]
  Message.call(this)
}
util.inherits(Header, Message)

module.exports = Header
