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

var fs = require('fs'),
  EventEmitter = require('events').EventEmitter,
  os = require('os'),
  util = require('util');

var Platform = function () {
  this.name_servers = [];
  this.search_path = [];
  this.timeout = 5 * 1000;
  this.attempts = 5;

  this.ready = false;

  this.populate();
};
util.inherits(Platform, EventEmitter);

Platform.prototype.populate = function () {
  switch (os.platform()) {
    default:
      this.parse_resolv();
      break;
  }
};

Platform.prototype.setReady = function () {
  this.ready = true;
  this.emit('ready');
};

Platform.prototype.parse_resolv = function () {
  var self = this;

  fs.readFile('/etc/resolv.conf', 'ascii', function (err, file) {
    if (err) {
      throw err;
    }

    file.split('\n').forEach(function (line) {
      var i, parts, subparts;
      line = line.replace(/^\s+|\s+$/g, '');
      if (!line.match(/^#/)) {
        parts = line.split(/\s+/);
        switch (parts[0]) {
        case 'nameserver':
          self.name_servers.push(parts[1]);
          break;
        case 'domain':
          self.search_path = parts[1];
          break;
        case 'search':
          self.search_path = parts.slice(1);
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
            }
          }
          break;
        }
      }
    });

    self.setReady();
  });
};

module.exports = new Platform();
