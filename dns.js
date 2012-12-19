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

"use strict";

exports.platform = require('./lib/platform');

exports.createServer = require('./lib/server').createServer;
exports.createUDPServer = require('./lib/server').createUDPServer;
exports.createTCPServer = require('./lib/server').createTCPServer;

var client = require('./lib/client');
exports.lookup = client.lookup;
exports.resolve = client.resolve;
exports.resolve4 = client.resolve4;
exports.resolve6 = client.resolve6;
exports.resolveMx = client.resolveMx;
exports.resolveTxt = client.resolveTxt;
exports.resolveSrv = client.resolveSrv;
exports.resolveNs = client.resolveNs;
exports.resolveCname = client.resolveCname;
exports.reverse = client.reverse;

var consts = require('./lib/consts');
exports.BADNAME = consts.BADNAME;
exports.BADRESP = consts.BADRESP;
exports.CONNREFUSED = consts.CONNREFUSED;
exports.DESTRUCTION = consts.DESTRUCTION;
exports.REFUSED = consts.REFUSED;
exports.FORMERR = consts.FORMERR;
exports.NODATA = consts.NODATA;
exports.NOMEM = consts.NOMEM;
exports.NOTFOUND = consts.NOTFOUND;
exports.NOTIMP = consts.NOTIMP;
exports.SERVFAIL = consts.SERVFAIL;
exports.TIMEOUT = consts.TIMEOUT;
exports.consts = consts;

var definedTypes = [
  'A',
  'AAAA',
  'NS',
  'CNAME',
  'PTR',
  'NAPTR',
  'TXT',
  'MX',
  'SRV',
  'SOA',
].forEach(function (type) {
  exports[type] = function (opts) {
    var obj = {};
    opts = opts || {};
    obj.type = consts.nameToQtype(type);
    obj.class = consts.NAME_TO_QCLASS.IN;
    Object.keys(opts).forEach(function (k) {
      if (opts.hasOwnProperty(k) && ['type', 'class'].indexOf(k) == -1) {
        obj[k] = opts[k];
      }
    });
    return obj;
  };
});

exports.Question = function (opts) {
  var q = {}, qtype;

  opts = opts || {};

  q.name = opts.name;

  qtype = opts.type || consts.NAME_TO_QTYPE.A;
  if (typeof(qtype) === 'string' || qtype instanceof String)
    qtype = consts.nameToQtype(qtype.toUpperCase());

  if (!qtype || typeof(qtype) !== 'number')
    throw new Error("Question type must be defined and be valid");

  q.type = qtype;

  q.class = opts.class || consts.NAME_TO_QCLASS.IN;

  return q;
};
exports.Request = client.Request;

var cache = require('./lib/cache');

exports.Cache = cache.Cache;
exports.MemoryStore = cache.MemoryStore;
