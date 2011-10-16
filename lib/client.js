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
  Packet = require('./packet'),
  edns = require('./edns');

var random_integer = function () {
  return Math.floor(Math.random() * 50000 + 1);
};

var PendingRequests = function () {
  this.active_ = {};
  this.active_.count = 0;
  this.socket4 = undefined;
  this.socket6 = undefined;

  var self = this;

  this.platform = require('./platform');
  this.platform.on('ready', function () {
    self.sendQueued();
  });
  if (this.platform.ready) {
    this.sendQueued();
  }
};

PendingRequests.prototype.socket = function (server) {
  var socket, created = false, self = this;

  switch (net.isIP(server)) {
  case 4:
    if (!this.socket4) {
      this.socket4 = dgram.createSocket('udp4');
      created = true;
    }
    socket = this.socket4;
    break;
  case 6:
    if (!this.socket6) {
      this.socket6 = dgram.createSocket('udp6');
      created = true;
    }
    socket = this.socket6;
    break;
  default:
    throw new Error("Nameserver is neither ipv4 or ipv6: " + server);
    break;
  }

  if (created) {
    socket.bind()
    socket.on('message', function (msg, remote) {
      self.handleMessage(socket, msg, remote);
    });
  }

  return socket;
}

PendingRequests.prototype.sendQueued = function () {
  var i, request;

  for (i in this.active_) {
    if (this.active_.hasOwnProperty(i) && i !== 'count') {
      request = this.active_[i];
      if (!request.started) {
        request.start();
      }
    }
  }
};

PendingRequests.prototype.add = function (request) {
  var id = random_integer();
  while (this.active_[id] !== undefined) {
    id = random_integer();
  }
  request.id = id;
  this.active_[id] = request;
  this.active_.count++;

  if (this.platform.ready) {
    request.start();
  }
};

PendingRequests.prototype.remove = function (request) {
  delete this.active_[request.id];
  this.active_.count--;

  if (this.active_.count === 0) {
    if (this.socket4) {
      this.socket4.close();
      this.socket4 = undefined;
    }

    if (this.socket6) {
      this.socket6.close();
      this.socket6 = undefined;
    }
  }
};

PendingRequests.prototype.handleMessage = function (socket, msg, remote) {
  var err, request, answer;

  answer = new Packet(socket, remote);
  answer.unpack(msg);
  answer = answer.promote();

  if (this.active_[answer.header.id]) {
    request = this.active_[answer.header.id];
    request.handle(err, answer);
  }
};

var IN_FLIGHT = new PendingRequests();

var Request = function (domain, rrtype, check_hosts, callback) {
  this.retries_ = undefined;
  this.domain = domain;
  this.rrtype = rrtype;
  this.check_hosts = check_hosts;
  this.callback = callback;

  this.started = false;

  this.buildQuestion(domain);

  this.try_edns = IN_FLIGHT.platform.edns;

  this.next_server = 0;

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
  var server,
      self = this;

  if (!this.started) {
    this.started = true;
    this.retries_ = IN_FLIGHT.platform.attempts;
    this.search_path = IN_FLIGHT.platform.search_path.slice(0);
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

  this.retries_--;

  server = this.getServer();

  if (this.try_edns) {
    this.message = new edns.EDNSPacket(IN_FLIGHT.socket(server.address), server);
  } else {
    this.message = new Packet(IN_FLIGHT.socket(server.address), server);
  }

  this.message.header.id = this.id;
  this.message.header.rd = 1;
  this.message.question.push(this.question);
  this.message.send();
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
    if (this.retries_ > 0 && this.search_path.length > 0) {
      this.buildQuestion([this.domain, this.search_path.pop()].join('.'));
    } else {
      errno = consts.NOTFOUND;
    }
    answer = undefined;
    break;
  case consts.NAME_TO_RCODE.FORMERR:
    if (this.try_edns) {
      this.try_edns = false;
      this.retries_++;
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

  if (this.retries_ === 0) {
    this.remove();
    err = new Error('getHostByName ' + consts.TIMEOUT);
    err.errno = consts.TIMEOUT;
    this.callback(err, undefined);
  } else {
    this.start();
  }
};

Request.prototype.getServer = function () {
  var server = IN_FLIGHT.platform.name_servers[this.next_server];
  this.next_server = (this.next_server + 1) % IN_FLIGHT.platform.name_servers.length;
  return server;
};

var resolve = function (domain) {
  var rrtype = consts.NAME_TO_QTYPE.A,
    callback = arguments[arguments.length - 1];

  if (arguments.length === 3) {
    rrtype = consts.NAME_TO_QTYPE[arguments['1']];
  }
  
  return new Request(domain, rrtype, false, function (err, response) {
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

  return new Request(domain, rrtype, true, function (err, response) {
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
