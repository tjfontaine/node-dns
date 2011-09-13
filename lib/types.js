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

var ResourceRecord = require('./resourcerecord')

var ipaddr = require('ipaddr.js')

var util = require('util')

var SOA = exports.SOA = function(vals) {
  this._rdata_fields = [
    {
      name: 'primary',
      type: 'string',
    },
    {
      name: 'admin',
      type: 'string',
    },
    {
      name: 'serial',
      format: 'I',
    },
    {
      name: 'refresh',
      format: 'I',
    },
    {
      name: 'retry',
      format: 'I',
    },
    {
      name: 'expiration',
      format: 'I',
    },
    {
      name: 'minimum',
      format: 'I',
    },
  ]
  ResourceRecord.call(this, vals)
  this.type = 6
}
util.inherits(SOA, ResourceRecord)

var A = exports.A = function(vals) {
  Object.defineProperty(this, 'address', {
    set: function(val) { this.address_binary = ipaddr.parse(val) },
    get: function() { return this.address_binary.toString() },
  })

  this._rdata_fields = [
    {
      name: 'address_binary',
      type: 'ipaddr',
    },
  ]

  ResourceRecord.call(this, vals)
  this.type = 1
}
util.inherits(A, ResourceRecord)

var AAAA = exports.AAAA = function(vals) {
  Object.defineProperty(this, 'address', {
    set: function(val) { this.address_binary = ipaddr.parse(val) },
    get: function() { return this.address_binary.toString() },
  })

  this._rdata_fields = [
    {
      name: 'address_binary',
      type: 'ipaddr',
    },
  ]

  ResourceRecord.call(this, vals)
  this.type = 28
}
util.inherits(AAAA, ResourceRecord)
