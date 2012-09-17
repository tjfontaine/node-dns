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
    util = require('util'),
    Heap = require('./minheap'),
    Packet = require('./packet');

var CNAME = consts.NAME_TO_QTYPE.CNAME;

var debug = function() {
  //var args = Array.prototype.slice.call(arguments);
  //console.log.apply(this, ['cache', Date.now().toString()].concat(args));
};

var extend = util._extend;

if (!extend) {
  // shamelessly grabbed from joyent/node/lib/util.js
  extend = function(origin, add) {
    // Don't do anything if add isn't an object
    if (!add || typeof add !== 'object') return origin;

    var keys = Object.keys(add);
    var i = keys.length;
    while (i--) {
      origin[keys[i]] = add[keys[i]];
    }
    return origin;
  };
}

var MemoryStore = exports.MemoryStore = function(max, range) {
  this._max_keys = max || 1000;
  this._range = range || 50;
  this._index = {};
  this._ttl = new Heap();
};

MemoryStore.prototype._delete = function(name, type) {
  var entry = this._index[name + type];
  this._ttl.remove(entry);
  delete this._index[name + type];
};

MemoryStore.prototype._trim = function() {
  var self = this;
  var remove_count = this._ttl.length - this._max_keys;
  var remove;

  if (remove_count > 0) {
    debug('memory store trim to remove', remove_count);
    while (remove_count > 0) {
      remove = this._ttl.pop();
      debug('memory store trim', remove);
      delete this._index[remove.name + remove.type];
      remove_count -= 1;
    }
  }
};

MemoryStore.prototype.purge = function() {
  this._index = {};
  this._ttl = new Heap();
};

MemoryStore.prototype.get = function(name, type, cb) {
  var key = name + type;
  var value = this._index[key];
  var results;

  debug('memory store get', name, type);

  if (value) {
    if (Date.now() < value.expires || !value.expires) {
      results = value.values;
    } else {
      this._delete(name, type);
    }
  }

  process.nextTick(function() {
    cb(results);
  });
};

MemoryStore.prototype.set = function(rr) {
  var name = rr.name,
      type = rr.type;

  var expires;

  if (rr.ttl !== false) {
    expires = Date.now() + (rr.ttl * 1000);
  } else {
    expires = false;
  }

  var key = name + type;
  var value = this._index[key];

  debug('memory store set', name, type, expires);

  if (!value) {
    value = this._index[key] = {
      values: []
    };

    this._ttl.insert({
      name: name,
      type: type,
      ttl: expires
    }, expires);

    this._trim();
  }

  value.expires = expires;
  value.values.push(extend({}, rr));
};

var Cache = exports.Cache = function(opts) {
  opts = opts || {};
  this._store = opts.store || new MemoryStore();
};

var send = function(type, results, cb) {
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

Cache.prototype.lookup = function(question, cb) {
  var self = this;
  var results = [];
  var name = question.name.toLowerCase();
  var type = question.type;

  debug('cache lookup', name);

  var found_cname = function(result) {
    if (!result) {
      send(type, results, cb);
    } else {
      debug('cache found cname', name);
      results.push(result[0]);
      name = result[0].data;
      self._store.get(name, type, found_exact);
    }
  };

  var found_exact = function(result) {
    if (!result) {
      self._store.get(name, CNAME, found_cname);
    } else {
      debug('cache found', name, type);
      results = results.concat(result);
      send(type, results, cb);
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
