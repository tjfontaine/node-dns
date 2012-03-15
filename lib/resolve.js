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

var consts = require('./consts'),
  Question = require('./question'),
  platform = require('./platform'),
  Request = require('./request');

var _queue = [];

var sendQueued = function () {
  _queue.forEach(function (request) {
    request.start();
  });
  _queue = [];
};

platform.on('ready', function () {
  sendQueued();
});

if (platform.ready) {
  sendQueued();
}

var Resolve = module.exports = function (opts, callback) {
  this.domain = opts.domain;
  this.rrtype = opts.rrtype;
  this.check_hosts = opts.check_hosts;
  this.callback = callback;

  this.buildQuestion(this.domain);

  this.started = false;
  this.current_server = undefined;
  this.server_list = [];

  this.request = undefined;

  if (!platform.ready) {
    _queue.push(this);
  } else {
    this.start();
  }
};

Resolve.prototype.cancel = function () {
  if (this.request) {
    this.request.cancel();
  }
};

Resolve.prototype.buildQuestion = function (name) {
  this.question = new Question();
  this.question.type = this.rrtype;
  this.question.class = consts.NAME_TO_QCLASS.IN;
  this.question.name = name;
};

Resolve.prototype.isInHosts = function () {
  var results;
  if (platform.hosts[this.question.name]) {
    results = platform.hosts[this.question.name];
    this.callback(null, results);
    return true;
  } else {
    return false;
  }
};

Resolve.prototype.start = function () {
  var tries = 0, s, t, u, slist,
      self = this;

  if (!this.started) {
    this.started = true;
    this.try_edns = platform.edns;
    this.search_path = platform.search_path.slice(0);

    slist = platform.name_servers;

    while (this.server_list.length < platform.attempts) {
      s = slist[tries % slist.length];
      u = {
        address: s.address,
        port: s.port,
        type: 'udp',
      };
      t = {
        address: s.address,
        port: s.port,
        type: 'tcp',
      }
      this.server_list.push(u);
      this.server_list.push(t);
      tries += 1;
    }
    this.server_list.reverse();
  }

  if (this.check_hosts && this.isInHosts()) {
    return;
  }

  if (this.server_list.length === 0) {
    this.handleTimeout();
  } else {
    this.current_server = this.server_list.pop();
    this.request = Request({
      question: this.question,
      server: this.current_server,
      timeout: platform.timeout,
      try_edns: this.try_edns,
    });

    this.request.on('timeout', function () {
      self.handleTimeout();
    });

    this.request.on('message', function (err, answer) {
      self.handle(err, answer);
    });

    this.request.send();
  }
};

Resolve.prototype.handle = function (err, answer) {
  var rcode, errno;

  if (answer) {
    rcode = answer.rcode;
  }

  switch (rcode) {
  case consts.NAME_TO_RCODE.NOERROR:
    break;
  case consts.NAME_TO_RCODE.NOTFOUND:
    if (this.server_list.length > 0 && this.search_path.length > 0) {
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
    this.callback(err, answer);
  } else {
    this.start();
  }
};

Resolve.prototype.handleTimeout = function () {
  var err;

  if (this.server_list.length === 0) {
    err = new Error('getHostByName ' + consts.TIMEOUT);
    err.errno = consts.TIMEOUT;
    err.request = this;
    this.callback(err, undefined);
  } else {
    this.start();
  }
};
