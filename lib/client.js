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
  clone = require('clone'),
  consts = require('./consts'),
  types = require('./types'),
  Question = require('./question'),
  Packet = require('./packet'),
  PendingRequests = require('./pending'),
  Socket = require('./socket'),
  edns = require('./edns');

var IN_FLIGHT = new PendingRequests();

var Request = function (domain, rrtype, check_hosts, specific_server, callback) {
  this.domain = domain;
  this.rrtype = rrtype;
  this.check_hosts = check_hosts;
  this.callback = callback;

  this.started = false;
  this.buildQuestion(domain);
  this.try_edns = IN_FLIGHT.platform.edns;
  this.specific_server = specific_server;

  this.current_server = undefined;
  this.server_list = [];

  IN_FLIGHT.add(this);
};

Request.prototype.remove = function () {
  clearTimeout(this.timer_);
  IN_FLIGHT.remove(this);
};

Request.prototype.cancel = function () {
  this.remove();
  console.log("Request ID:", this.id, "cancelled");
};

Request.prototype.buildQuestion = function (name) {
  this.question = new Question();
  this.question.type = this.rrtype;
  this.question.class = consts.NAME_TO_QCLASS.IN;
  this.question.name = name;
};

Request.prototype.isInHosts = function () {
  var results;
  if (IN_FLIGHT.platform.hosts[this.question.name]) {
    results = IN_FLIGHT.platform.hosts[this.question.name];
    this.callback(null, results);
    return true;
  } else {
    return false;
  }
};

Request.prototype.start = function () {
  var tries = 0, s, slist,
      self = this;

  if (!this.started) {
    this.started = true;
    this.search_path = IN_FLIGHT.platform.search_path.slice(0);

    if (this.specific_server) {
      slist = this.specific_server;
    } else {
      slist = IN_FLIGHT.platform.name_servers;
    }

    while (this.server_list.length < IN_FLIGHT.platform.attempts) {
      s = clone(slist[tries % slist.length]);
      s.type = 'udp';
      this.server_list.push(s);
      s = clone(s);
      s.type = 'tcp';
      this.server_list.push(s);
      tries += 1;
    }
    this.server_list.reverse();
  }

  if (this.timer_) {
    clearTimeout(this.timer_);
  }

  this.timer_ = setTimeout(function () {
    self.handleTimeout();
  }, IN_FLIGHT.platform.timeout);

  if (this.check_hosts && this.isInHosts()) {
    this.remove();
    return;
  }

  this.getServer(function (socket) {
    if (this.try_edns) {
      this.message = new edns.EDNSPacket(socket);
    } else {
      this.message = new Packet(socket);
    }

    this.message.header.id = this.id;
    this.message.header.rd = 1;
    this.message.question.push(this.question);
    this.message.send();
  });
};

Request.prototype.handle = function (err, answer) {
  var rcode, errno;

  if (answer) {
    rcode = answer.rcode;
  }

  switch (rcode) {
  case consts.NAME_TO_RCODE.NOERROR:
    break;
  case consts.NAME_TO_RCODE.NOTFOUND:
    if (this.servers_list.length > 0 && this.search_path.length > 0) {
      this.buildQuestion([this.domain, this.search_path.pop()].join('.'));
    } else {
      errno = consts.NOTFOUND;
    }
    answer = undefined;
    break;
  case consts.NAME_TO_RCODE.FORMERR:
    if (this.try_edns) {
      this.try_edns = false;
      this.server_list.splice(0, 1, this.current_server);
    } else {
      errno = consts.FORMERR;
    }
    answer = undefined;
    break;
  default:
    errno = consts.RCODE_TO_NAME[rcode];
    answer = undefined;
    break;
  }

  if (errno || answer) {
    if (errno) {
      err = new Error('getHostByName ' + errno);
      err.errno = errno;
    }
    this.remove();
    this.callback(err, answer);
  } else {
    this.start();
  }
};

Request.prototype.handleTimeout = function () {
  var err;

  if (this.server_list.length === 0) {
    this.remove();
    err = new Error('getHostByName ' + consts.TIMEOUT);
    err.errno = consts.TIMEOUT;
    err.request = this;
    this.callback(err, undefined);
  } else {
    this.start();
  }
};

Request.prototype.getServer = function (cb) {
  var self = this;

  this.current_server = this.server_list.pop();

  IN_FLIGHT.socketCache(this.current_server, function (err, socket) {
    cb.call(self, socket);
  });
};

var resolve = function (domain) {
  var rrtype = consts.NAME_TO_QTYPE.A,
    specific_server,
    callback = arguments[arguments.length - 1];

  if (arguments.length >= 3) {
    rrtype = consts.NAME_TO_QTYPE[arguments[1]];
  }

  if (arguments.length === 4) {
    if (arguments[2] instanceof String || typeof arguments[2] === 'string') {
      specific_server = {
        address: arguments[2],
        port: 53,
      }
    } else {
      specific_server = arguments[2];
    }
  }

  if (specific_server && !(specific_server instanceof Array)) {
    specific_server = [specific_server];
  }

  if (specific_server) {
    var err;
    specific_server.forEach(function (s) {
      if (!s.address || !net.isIP(s.address)) {
        err = new Error("When defining a specific server, the object must contain address property and be an IP address");
      }
    });
    if (err) {
      callback(err, null);
      return undefined;
    }
  }
  
  return new Request(domain, rrtype, false, specific_server, function (err, response) {
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
  var reverseip, address, parts, kind, error;

  if (!net.isIP(ip)) {
    error = new Error("getHostByAddr ENOTIMP");
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
    family,
    rrtype;

  family = net.isIP(domain);

  if (family === 4 || family === 6) {
    callback(null, domain, family);
    return {};
  }

  family = 4;

  if (domain === null) {
    callback(null, null, family);
    return {};
  }

  if (arguments.length === 3) {
    family = arguments['1'];
    rrtype = consts.FAMILY_TO_QTYPE[family];
  } else {
    rrtype = consts.NAME_TO_QTYPE.ANY;
  }

  return new Request(domain, rrtype, true, undefined, function (err, response) {
    var i, afamily, address, a, all;

    if (err) {
      callback(err, null, 4);
      return;
    }

    if (response instanceof Packet) {
      all = response.answer;

      if (rrtype === consts.NAME_TO_QTYPE.ANY) {
        all = all.concat(response.additional);
      }

      for (i = 0; i < all.length; i++) {
        a = all[i];
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
    } else {
      afamily = net.isIP(response[0]);
      address = response[0];
    }
    callback(err, address, afamily);
  });
};
exports.lookup = lookup;
