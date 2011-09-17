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

var dgram = require('dgram'),
  ipaddr = require('ipaddr.js'),
  net = require('net'),
  consts = require('./consts'),
  types = require('./types'),
  Question = require('./question'),
  Response = require('./response');

var TIMEOUTMS_PER_TRY = 5 * 1000;
var RETRIES_PER_REQUEST = 4;

var random_integer = function () {
  return Math.floor(Math.random() * 50000 + 1);
};

var remote_dns = {
  address: '8.8.8.8',
  port: 53,
};

var PendingRequests = function () {
  this.active_ = {};
  this.active_.count = 0;

  var socket, self = this;

  Object.defineProperty(this, 'socket', {
    get: function () {
      if (!socket) {
        socket = dgram.createSocket('udp4');
        socket.bind();
        socket.on('message', function (msg, remote) {
          self.handleMessage(msg, remote);
        });
      }
      return socket;
    },
    set: function (value) {
      if (value === undefined && socket) {
        socket.close();
      }
      socket = value;
    },
  });
};

PendingRequests.prototype.add = function (request) {
  var id = random_integer();
  while (this.active_[id] !== undefined) {
    id = random_integer();
  }
  request.id = id;
  this.active_[id] = request;
  this.active_.count++;
};

PendingRequests.prototype.remove = function (request) {
  delete this.active_[request.id];
  this.active_.count--;

  if (this.active_.count === 0) {
    this.socket = undefined;
  }
};

PendingRequests.prototype.handleMessage = function (msg, remote) {
  var err, request,
    answer = new Response(this.socket, remote);

  answer.unpack(msg);
  if (this.active_[answer.header.id]) {
    request = this.active_[answer.header.id];
    request.handle(err, answer);
  }
};

var IN_FLIGHT = new PendingRequests();

var Request = function (question, callback) {
  this.retries_ = RETRIES_PER_REQUEST;
  this.question = question;
  this.callback = callback;
  IN_FLIGHT.add(this);
  this.start();
};

Request.prototype.remove = function () {
  clearTimeout(this.timer_);
  IN_FLIGHT.remove(this);
};

Request.prototype.cancel = function () {
  this.remove();
  console.log("Request ID:", this.id, "cancelled");
};

Request.prototype.start = function () {
  var self = this;

  this.timer_ = setTimeout(function () {
    self.handleTimeout();
  }, TIMEOUTMS_PER_TRY);

  this.retries_--;
  this.message = new Response(IN_FLIGHT.socket, this.getServer());
  this.message.header.id = this.id;
  this.message.header.rd = 1;
  this.message.question.push(this.question);
  this.message.send();
};

Request.prototype.handle = function (err, answer) {
  var rcode, errno;
  this.remove();

  if (answer) {
    rcode = answer.header.rcode;
  }

  if (rcode !== consts.NAME_TO_RCODE.NOERROR) {
    errno = consts.RCODE_TO_NAME[rcode];
    err = new Error('getHostByName ' + errno);
    err.errno = consts[errno];
    answer = undefined;
  }

  this.callback(err, answer);
};

Request.prototype.handleTimeout = function () {
  if (this.retries_ === 0) {
    this.remove();
    this.callback(consts.TIMEOUT, undefined);
  } else {
    this.start();
  }
};

Request.prototype.getServer = function () {
  /* TODO XXX FIXME IMPLEMENT */
  return remote_dns;
};

var inner_resolve = function (domain, rrtype, callback) {
  var question = new Question();
  question.name = domain;
  question.type = rrtype;
  question.class = consts.NAME_TO_QCLASS.IN;

  return new Request(question, function (err, response) {
    callback(err, response);
  });
};

var resolve = function (domain) {
  var rrtype = consts.NAME_TO_QTYPE.A,
    callback = arguments[arguments.length - 1];

  if (arguments.length === 3) {
    rrtype = consts.NAME_TO_QTYPE[arguments[1]];
  }
  
  return inner_resolve(domain, rrtype, function (err, response) {
    var ret = [], i, a;

    if (err) {
      callback(err, response);
      return;
    }

    for (i = 0; i < response.answer.length; i++) {
      a = response.answer[i];
      if (a.type === rrtype) {
        a = a.promote();
        switch (rrtype) {
        case consts.NAME_TO_QTYPE.A:
        case consts.NAME_TO_QTYPE.AAAA:
          ret.push(a.address);
          break;
        case consts.NAME_TO_QTYPE.MX:
          ret.push({
            priority: a.priority,
            exchange: a.exchange,
          });
          break;
        case consts.NAME_TO_QTYPE.TXT:
        case consts.NAME_TO_QTYPE.NS:
        case consts.NAME_TO_QTYPE.CNAME:
        case consts.NAME_TO_QTYPE.PTR:
          ret.push(a.data);
          break;
        case consts.NAME_TO_QTYPE.SRV:
          ret.push({
            priority: a.priority,
            weight: a.weight,
            port: a.port,
            name: a.target,
          });
          break;
        }
      }
    }

    if (ret.length === 0) {
      err = consts.NODATA;
      ret = undefined;
    }
    callback(err, ret);
  });
};
exports.resolve = resolve;

var resolve4 = function (domain, callback) {
  return resolve(domain, 'A', function (err, results) {
    callback(err, results);
  });
};
exports.resolve4 = resolve4;

var resolve6 = function (domain, callback) {
  return resolve(domain, 'AAAA', function (err, results) {
    callback(err, results);
  });
};
exports.resolve6 = resolve6;

var resolveMx = function (domain, callback) {
  return resolve(domain, 'MX', function (err, results) {
    callback(err, results);
  });
};
exports.resolveMx = resolveMx;

var resolveTxt = function (domain, callback) {
  return resolve(domain, 'TXT', function (err, results) {
    callback(err, results);
  });
};
exports.resolveTxt = resolveTxt;

var resolveSrv = function (domain, callback) {
  return resolve(domain, 'SRV', function (err, results) {
    callback(err, results);
  });
};
exports.resolveSrv = resolveSrv;

var resolveNs = function (domain, callback) {
  return resolve(domain, 'NS', function (err, results) {
    callback(err, results);
  });
};
exports.resolveNs = resolveNs;

var resolveCname = function (domain, callback) {
  return resolve(domain, 'CNAME', function (err, results) {
    callback(err, results);
  });
};
exports.resolveCname = resolveCname;

var reverse = function (ip, callback) {
  var reverseip, address, parts, kind;

  if (!net.isIP(ip)) {
    var error = new Error("getHostByAddr ENOTIMP");
    error.errno = 'ENOTIMP';
    throw error;
  }

  address = ipaddr.parse(ip);
  kind = address.kind();

  switch (kind) {
  case 'ipv4':
    address = address.toByteArray();
    address.reverse();
    reverseip = address.join('.') + '.IN-ADDR.ARPA';
    break;
  case 'ipv6':
    parts = [];
    address.toNormalizedString().split(':').forEach(function (part) {
      var i, pad = 4 - part.length;
      for (i = 0; i < pad; i++) {
        part = '0' + part;
      }
      part.split('').forEach(function (p) {
        parts.push(p);
      });
    });
    parts.reverse();
    reverseip = parts.join('.') + '.IP6.ARPA';
    break;
  }

  return resolve(reverseip, 'PTR', function (err, results) {
    callback(err, results);
  });
};
exports.reverse = reverse;

var lookup = function (domain) {
  var callback = arguments[arguments.length - 1],
    family = 4,
    rrtype;

  if (arguments.length === 3) {
    family = arguments[1];
    rrtype = consts.FAMILY_TO_QTYPE[family];
  } else {
    rrtype = consts.NAME_TO_QTYPE.ANY;
  }

  return inner_resolve(domain, rrtype, function (err, response) {
    var i, afamily, address, a;

    if (err) {
      callback(err, null, 4);
      return;
    }

    for (i = 0; i < response.answer.length; i++) {
      a = response.answer[i];
      if (afamily && address) {
        break;
      }
      switch (a.type) {
      case consts.NAME_TO_QTYPE.A:
      case consts.NAME_TO_QTYPE.AAAA:
        afamily = consts.QTYPE_TO_FAMILY[a.type];
        address = a.promote().address;
        break;
      }
    }
    callback(err, address, afamily);
  });
};
exports.lookup = lookup;
