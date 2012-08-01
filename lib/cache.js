// Copyright 2012 Timothy J Fontaine <tjfontaine@gmail.com>
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

'use strict';

var consts = require('./consts'),
    Packet = require('./packet');

var A = consts.NAME_TO_QTYPE.A,
    AAAA = consts.NAME_TO_QTYPE.AAAA,
    CNAME = consts.NAME_TO_QTYPE.CNAME;

var debug = function() {
  //var args = Array.prototype.slice.call(arguments);
  //console.log.apply(this, ['cache', Date.now().toString()].concat(args));
};

var MemoryStore = exports.MemoryStore = function(max, range) {
  this._max_keys = max || 10000;
  this._range = range || 50;
  this._index = {};
  this._ttl = [];
};

MemoryStore.prototype._delete = function(name, type) {
  var i, ttl;

  for (i = 0; i < this._ttl.length; i++) {
    ttl = this._ttl[i];
    if (ttl.name === name && ttl.type === type) {
      this._ttl.splice(i, 1);
      break;
    }
  }

  delete this._index[name + type];
};

var lru_sort = function(a, b) {
  if (a.expires > b.expires) {
    return 1;
  } else if (a.expires < b.expires) {
    return -1;
  } else {
    return 0;
  }
};

MemoryStore.prototype._trim = function() {
  var self = this;
  var remove_count = this._ttl.length - this._max_keys;
  var remove;

  if (remove_count > 0) {
    debug('memory store trim to remove', remove_count);
    this._ttl = this._ttl.sort(lru_sort);
    remove = this._ttl.splice(0, remove_count + this._range);
    remove.forEach(function(r) {
      debug('memory store trim', r);
      delete self._index[r.name + r.type];
    });
  }
};

MemoryStore.prototype.purge = function() {
  this._index = {};
  this._ttl = [];
};

MemoryStore.prototype.get = function(name, type, cb) {
  var key = name + type;
  var value = this._index[key];
  var results;

  debug('memory store get', name, type);

  if (value) {
    if (Date.now() < value.expires) {
      results = value.values;
    } else {
      this._delete(name, type);
    }
  }

  process.nextTick(function() {
    cb(results)
  });
};

MemoryStore.prototype.set = function(rr) {
  var name = rr.name,
      type = rr.type,
      expires = Date.now() + (rr.ttl * 1000);

  var key = name + type;
  var value = this._index[key];

  debug('memory store set', name, type, expires);

  if (!value) {
    value = this._index[key] = {
      values: [],
    };

    this._ttl.push({
      name: name,
      type: type,
      ttl: expires,
    });

    this._trim();
  }

  value.expires = expires;
  value.values.push(rr);
};

var Cache = exports.Cache = function(opts) {
  opts = opts || {};
  this._store = opts.store || new MemoryStore();
};

Cache.prototype.lookup = function(question, cb) {
  var self = this;
  var results = [];
  var name = question.name, type = question.type;

  var send = function() {
    var i, packet;

    for (i = 0; i < results.length; i++) {
      if (results[i].type === type) {
        packet = new Packet();
        packet.answer = results;
        break;
      }
    }

    cb(packet);
  };

  var found_cname = function(result) {
    if (!result) {
      send();
    } else {
      debug("cache found cname", name);
      results.push(result[0]);
      name = result[0].data;
      self._store.get(name, type, found_exact);
    }
  };

  var found_exact = function(result) {
    if (!result) {
      if (type === A || type === AAAA) {
        self._store.get(name, CNAME, found_cname);
      } else {
        send();
      }
    } else {
      results = results.concat(result);
      send();
    }
  };

  self._store.get(name, type, found_exact);
};

Cache.prototype.store = function(packet) {
  packet.answer.forEach(this._store.set.bind(this._store));
  packet.authority.forEach(this._store.set.bind(this._store));
  packet.additional.forEach(this._store.set.bind(this._store));
};

Cache.prototype.purge = function() {
  this._store.purge();
};
