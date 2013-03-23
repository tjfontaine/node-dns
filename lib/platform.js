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

'use strict';

var fs = require('fs'),
    EventEmitter = require('events').EventEmitter,
    net = require('net'),
    os = require('os'),
    util = require('util'),
    Cache = require('./cache'),
    consts = require('./consts'),
    path = require('path'),
    utils = require('./utils');

var A = consts.NAME_TO_QTYPE.A,
    AAAA = consts.NAME_TO_QTYPE.AAAA,
    PTR = consts.NAME_TO_QTYPE.PTR;

var Platform = function() {
  this._nsReady = false;
  this._hostsReady = false;

  Object.defineProperty(this, 'ready', {
    get: function() {
      return this._nsReady && this._hostsReady;
    }
  });

  this._watches = {};

  Object.defineProperty(this, 'watching', {
    get: function() {
      return Object.keys(this._watches).length > 0;
    },
    set: function(value) {
      var k;
      if (value)
        this._watchFiles();
      else {
        for (k in this._watches) {
          this._watches[k].close();
          delete this._watches[k];
        }
      }
    }
  });

  this.hosts = new Cache();

  this._initNameServers();
  this._initHostsFile();
  this._populate();

  this.cache = false; //new Cache();
};
util.inherits(Platform, EventEmitter);

Platform.prototype.reload = function() {
  this.emit('unready');
  this._initNameServers();
  this._initHostsFile();
  this._populate();
};

Platform.prototype._initNameServers = function() {
  this._nsReady = false;
  this.name_servers = [];
  this.search_path = [];
  this.timeout = 5 * 1000;
  this.attempts = 5;
  this.edns = false;
};

Platform.prototype._initHostsFile = function() {
  this._hostsReady = false;
  this.hosts.purge();
};

Platform.prototype._populate = function() {
  var hostsfile, self = this;

  switch (os.platform()) {
    case 'win32':
      this.name_servers = [
        {
          address: '8.8.8.8',
          port: 53
        },
        {
          address: '8.8.4.4',
          port: 53
        }
      ];
      self._nsReady = true;
      hostsfile = path.join(process.env.SystemRoot,
                        '\\System32\\drivers\\etc\\hosts');
      break;
    default:
      this.parseResolv();
      hostsfile = '/etc/hosts';
      break;
  }

  this._parseHosts(hostsfile);
};

Platform.prototype._watchFiles = function() {
  var self = this, watchParams;

  watchParams = {persistent: false};

  switch (os.platform()) {
    case 'win32':
      //TODO XXX FIXME: it would be nice if this existed
      break;
    default:
      this._watches.resolve = fs.watch('/etc/resolv.conf', watchParams,
          function(event, filename) {
            if (event === 'change') {
              self.emit('unready');
              self._initNameServers();
              self.parseResolv();
            }
          });
      this._watches.hosts = fs.watch('/etc/hosts', watchParams,
          function(event, filename) {
            if (event === 'change') {
              self.emit('unready');
              self._initHostsFile();
              self._parseHosts(hostsfile);
            }
          });
      break;
  }
};

Platform.prototype._checkReady = function() {
  if (this.ready) {
    this.emit('ready');
  }
};

Platform.prototype.parseResolv = function() {
  var self = this;

  fs.readFile('/etc/resolv.conf', 'ascii', function(err, file) {
    if (err) {
      throw err;
    }

    file.split(/\n/).forEach(function(line) {
      var i, parts, subparts;
      line = line.replace(/^\s+|\s+$/g, '');
      if (!line.match(/^#/)) {
        parts = line.split(/\s+/);
        switch (parts[0]) {
          case 'nameserver':
            self.name_servers.push({
              address: parts[1],
              port: 53
            });
            break;
          case 'domain':
            self.search_path = [parts[1]];
            break;
          case 'search':
            self.search_path = [parts.slice(1)];
            break;
          case 'options':
            for (i = 1; i < parts.length; i++) {
              subparts = parts[i].split(/:/);
              switch (subparts[0]) {
                case 'timeout':
                  self.timeout = parseInt(subparts[1], 10) * 1000;
                  break;
                case 'attempts':
                  self.attempts = parseInt(subparts[1], 10);
                  break;
                case 'edns0':
                  self.edns = true;
                  break;
              }
            }
            break;
        }
      }
    });

    self._nsReady = true;
    self._checkReady();
  });
};

Platform.prototype._parseHosts = function(hostsfile) {
  var self = this;

  fs.readFile(hostsfile, 'ascii', function(err, file) {
    var toStore = {};
    if (err) {
      throw err;
    }

    file.split(/\n/).forEach(function(line) {
      var i, parts, ip, revip, kind;
      line = line.replace(/^\s+|\s+$/g, '');
      if (!line.match(/^#/)) {
        parts = line.split(/\s+/);
        ip = parts[0];
        parts = parts.slice(1);
        kind = net.isIP(ip);

        if (parts.length && ip && kind) {
          /* IP -> Domain */
          revip = utils.reverseIP(ip);
          parts.forEach(function(domain) {
            var r = toStore[revip];
            if (!r)
              r = toStore[revip] = {};
            var t = r[PTR];
            if (!t)
              t = r[PTR] = [];
            t.push({
              type: PTR,
              class: 1,
              name: revip,
              data: domain,
              ttl: Infinity
            });
          });

          /* Domain -> IP */
          parts.forEach(function(domain) {
            var r = toStore[domain.toLowerCase()];
            if (!r) {
              r = toStore[domain.toLowerCase()] = {};
            }
            var type = kind === 4 ? A : AAAA;
            var t = r[type];
            if (!t)
              t = r[type] = [];
            t.push({
              type: type,
              name: domain.toLowerCase(),
              address: ip,
              ttl: Infinity
            });
          });
        }
      }
    });

    Object.keys(toStore).forEach(function (key) {
      self.hosts._store.set(self.hosts._zone, utils.ensure_absolute(key), toStore[key]);
    });
    self._hostsReady = true;
    self._checkReady();
  });
};

module.exports = new Platform();
