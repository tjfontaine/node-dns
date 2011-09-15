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

var dgram = require('dgram')

var consts = require('./consts')
var types = require('./types')
var Question = require('./question')
var Response = require('./response')

var random_integer = function() {
  return Math.floor(Math.random()*50000+1)
}

var remote_dns = {
  address: '8.8.8.8',
  port: 53,
}

var PendingRequests = function() {
  this._active = {}
  this._active_count = 0
  this._socket4 = undefined
  this._socket6 = undefined
}

PendingRequests.prototype.add = function(request) {
  var id = random_integer()
  while (this._active[id] !== undefined) {
    id = random_integer()
  }
  request.id = id
  this._active[id] = request
  this._active_count++
}

PendingRequests.prototype.remove = function(request) {
  delete this._active[request.id]
  this._active_count--

  if (this._active_count == 0) {
    if (this._socket4) {
      this._socket4.close()
      this._socket4 = undefined
    }
  }
}

PendingRequests.prototype.getSocket = function() {
  if (!this._socket4) {
    this._socket4 = dgram.createSocket('udp4')
    this._socket4.bind()
    var self = this
    this._socket4.on('message', function(msg, remote) {
      self.handleMessage(msg, remote)
    });
  }

  return this._socket4
}

PendingRequests.prototype.handleMessage = function(msg, remote) {
  var err = undefined
  var answer = new Response(this.getSocket(), remote)
  answer.unpack(msg)
  if (this._active[answer.header.id]) {
    var request = this._active[answer.header.id]
    request.handle(err, answer)
  }
}

var IN_FLIGHT = new PendingRequests()

var Request = function(question, callback) {
  this.question = question
  this.callback = callback
  IN_FLIGHT.add(this)
  this.start()
}

Request.prototype.remove = function() {
  IN_FLIGHT.remove(this)
}

Request.prototype.cancel = function() {
  this.remove()
  console.log("Request ID:", this.id, "cancelled")
}

Request.prototype.start = function() {
  this.started = new Date().getTime()
  this.message = new Response(IN_FLIGHT.getSocket(), remote_dns)
  this.message.header.id = this.id
  this.message.header.rd = 1
  this.message.question.push(this.question)
  this.message.send()
}

Request.prototype.handle = function(err, answer) {
  this.ended = new Date().getTime()
  console.log("Request ID:", this.id, "round tripped in:", this.ended - this.started)
  this.remove()
  this.callback(err, answer)
}

var inner_resolve = function(domain, rrtype, callback) {
  var question = new Question()
  question.name = domain
  question.type = rrtype
  question.class = consts.NAME_TO_QCLASS.IN

  return new Request(question, function(err, response) {
    callback(err, response)
  })
}

var resolve = function(domain) {
  var rrtype = consts.NAME_TO_QTYPE.A
  var callback = arguments[arguments.length-1]

  if (arguments.length == 3) {
    rrtype = consts.NAME_TO_QTYPE[arguments[1]]
  }
  
  return inner_resolve(domain, rrtype, function(err, response) {
    var ret = []
    switch (rrtype) {
      case consts.NAME_TO_QTYPE.A:
      case consts.NAME_TO_QTYPE.AAAA:
        for (var i in response.answer) {
          var a = response.answer[i]
          if (a.type == rrtype) {
            ret.push(a.promote().address)
          }
        }
        break;
    }
    callback(err, ret)
  })
}
exports.resolve = resolve

var resolve4 = function(domain, callback) {
  return resolve(domain, 'A', function(err, results) {
    callback(err, results)
  });
}
exports.resolve4 = resolve4

var resolve6 = function(domain, callback) {
  return resolve(domain, 'AAAA', function(err, results) {
    callback(err, results)
  });
}
exports.resolve6 = resolve6

var lookup = function(domain) {
  var callback = arguments[arguments.length-1]
  var family = 4
  if (arguments.length == 3) {
    family = arguments.length[1]
  }
  var rrtype = undefined
  switch (family) {
    case 4:
      rrtype = consts.NAME_TO_QTYPE.A
      break;
    case 6:
      rrtype = consts.NAME_TO_QTYPE.AAAA
      break;
  }

  return inner_resolve(domain, rrtype, function(err, response) {
    for (var i in response.answer) {
      var a = response.answer[i]
      switch (a.type) {
        case consts.NAME_TO_QTYPE.A:
          callback(err, 4, a.promote().address)
          return
          break;
        case consts.NAME_TO_QTYPE.AAAA:
          callback(err, 6, a.promote().address)
          return
          break;
      }
    }
    callback(err, undefined, undefined)
  })
}
exports.lookup = lookup
