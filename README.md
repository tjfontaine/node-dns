[![Build Status](https://secure.travis-ci.org/tjfontaine/node-dns.png)](http://travis-ci.org/tjfontaine/node-dns)

native-dns -- A replacement DNS stack for node.js
=================================================

Installation
------------

`npm install native-dns` and then `var dns = require('native-dns');`

Client
------

native-dns exports what should be a 1:1 mapping of the upstream node.js dns
module. That is to say if it's listed in the [docs](http://nodejs.org/docs/latest/api/dns.html)
it should behave similarly. If it doesn't please file an [issue](https://github.com/tjfontaine/node-dns/issues/new)

Request
-------

Beyond matching the upstream module, native-dns also provides a method for
customizing queries.

```javascript
var dns = require('../dns'),
  util = require('util');

var question = dns.Question({
  name: 'www.google.com',
  type: 'A',
});

var start = new Date().getTime();

var req = dns.Request({
  question: question,
  server: { address: '8.8.8.8', port: 53, type: 'udp' },
  timeout: 1000,
});

req.on('timeout', function () {
  console.log('Timeout in making request');
});

req.on('message', function (err, answer) {
  answer.answer.forEach(function (a) {
    console.log(a.promote().address);
  });
});

req.on('end', function () {
  var delta = (new Date().getTime()) - start;
  console.log('Finished processing request: ' + delta.toString() + 'ms');
});

req.send();
```

Request creation takes an object with the following fields

 * `question` -- an instance of Question (required)
 * `server` -- defines the remote end point (required)
  - as an object it should be
    * `address` -- a string ip address (required)
    * `port` -- a number for the remote port (optional, default 53)
    * `type` -- a string indicating `udp` or `tcp` (optional, default `udp`)
You do not need to indicate ipv4 or ipv6, the backend will handle that
  - a string ip address
 * `timeout` -- a number in milliseconds indicating how long to wait for the
request to finish. (optional, default 4000)
 * `try_edns` -- a boolean indicating whether to use an `EDNSPacket` (optional)

There are only two methods

 * `send` -- sends the actual request to the remote endpoint
 * `cancel` -- cancels the request and ignores any responses

Request emits the following events

 * `message` -- This is where you get a response, passes `(err, answer)` where
answer is an instance of `Packet`
 * `timeout` -- Fired when the timeout is reached
 * `cancelled` -- Fired if the request is cancelled
 * `end` -- Always fired after a request finished, regardless of disposition

Server
------

There is also a rudimentary server implementation

```javascript
var dns = require('../dns'),
  server = dns.createServer();

server.on('request', function (request, response) {
  //console.log(request)
  response.answer.push(dns.A({
    name: request.question[0].name,
    address: '127.0.0.1',
    ttl: 600,
  }));
  response.answer.push(dns.A({
    name: request.question[0].name,
    address: '127.0.0.2',
    ttl: 600,
  }));
  response.additional.push(dns.A({
    name: 'hostA.example.org',
    address: '127.0.0.3',
    ttl: 600,
  }));
  response.send();
});

server.on('error', function (err, buff, req, res) {
  console.log(err.stack);
});

server.serve(15353);
```

Server creation

 * `createServer` and `createUDPServer` -- both create a `UDP` based server,
they accept an optional object for configuration,
  - `{ dgram_type: 'udp4' }` is the default option, the other is `udp6`
 * `createTCPServer` -- creates a TCP based server

Server methods

 * `serve(port, [address])` -- specify which port and optional address to listen
on
 * `close()` -- stop the server/close sockets.

Server events

 * `listening` -- emitted when underlying socket is listening
 * `close` -- emitted when the underlying socket is closed
 * `request` -- emitted when a dns message is received, and the packet was
successfully unpacked, passes `(request, response)`
  - Both `request` and `response` are instances of `Packet` when you're finished
creating the response, you merely need to call `.send()` and the packet will
DoTheRightThing
 * `error` -- emitted when unable to properly unpack the packet, passed `(err, msg, response)`
 * `socketError` -- remap of the underlying socket for the server, passes `(err, socket)`

Packet
------

Properties

 * `header`
 * `question` -- array of `Question`s
 * `answer` -- array of `ResourceRecord`s
 * `authority` -- array of `ResourceRecord`s
 * `additional` -- array of `ResourceRecord`s

Each individual `ResourceRecord` has a `.promote()` which will return an
unpacked record (i.e. `A` or `CNAME`) or if the record type is unknown it will
return a `ResourceRecord`
