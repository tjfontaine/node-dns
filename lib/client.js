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

var ipaddr = require('ipaddr.js'),
  net = require('net'),
  consts = require('./consts'),
  types = require('./types'),
  Packet = require('./packet').Packet,
  Resolve = require('./resolve');

var resolve = function (domain) {
  var rrtype = consts.NAME_TO_QTYPE.A,
    callback = arguments[arguments.length - 1];

  if (arguments.length >= 3) {
    rrtype = consts.NAME_TO_QTYPE[arguments[1]];
  }

  var opts = {
    domain: domain,
    rrtype: rrtype,
    check_hosts: false,
  };
  
  return new Resolve(opts, function (err, response) {
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
  }
    rrtype = consts.FAMILY_TO_QTYPE[family];
  //} else {
  //  rrtype = consts.NAME_TO_QTYPE.ANY;
  //}

  var opts = {
    domain: domain,
    rrtype: rrtype,
    check_hosts: true,
    specific_server: undefined,
  };

  return new Resolve(opts, function (err, response) {
    var i, afamily, address, a, all;

    if (err) {
      callback(err, null, 4);
      return;
    }

    if (response instanceof Packet) {
      all = response.answer;

      //if (rrtype === consts.NAME_TO_QTYPE.ANY) {
        all = all.concat(response.additional);
      //}

      all.forEach(function (a) {
        if (afamily && address) {
          return;
        }
        switch (a.type) {
        case consts.NAME_TO_QTYPE.A:
        case consts.NAME_TO_QTYPE.AAAA:
          afamily = consts.QTYPE_TO_FAMILY[a.type];
          address = a.promote().address;
          break;
        }
      });
    } else {
      afamily = net.isIP(response[0]);
      address = response[0];
    }
    callback(err, address, afamily);
  });
};
exports.lookup = lookup;
