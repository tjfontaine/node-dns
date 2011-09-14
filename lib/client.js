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

function resolve(domain) {
  var socket = dgram.createSocket('udp4')
  var response = new Response(socket, remote_dns)
  response.header.id = random_integer()
  response.header.rd = 1

  var rrtype = consts.NAME_TO_QTYPE.A
  var cb = arguments[arguments.length-1]

  if (arguments.length == 3) {
    rrtype = consts.NAME_TO_QTYPE[arguments[1]]
  }

  socket.on('message', function(msg, remote) {
    var answer = new Response(socket, remote)
    answer.unpack(msg)
    var err = undefined
    var ret = undefined
    if (response.header.id == answer.header.id) {
      ret = []
      for (var i in answer.answer) {
        var a = answer.answer[i].promote()
        if (a.type == rrtype) {
          ret.push(a)
        }
      }
    } else {
      err = new Error("Got back an invalid DNS packet for a request I don't care about: " + response.header.id + " " + answer.header.id)
    }
    cb(err, ret)
  })

  socket.bind()

  var question = new Question()
  question.name = domain
  question.type = rrtype
  question.class = consts.NAME_TO_QCLASS.IN

  response.question.push(question)
  response.send()
}

exports.resolve = resolve
