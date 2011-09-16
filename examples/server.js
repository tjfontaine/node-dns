"use strict";

var dns = require('../dns'),
  server = dns.createServer('udp4');

server.bind(5353);

server.on('request', function (request, response) {
  //console.log(request)
  response.answer.push(dns.A({
    name: request.question[0].name,
    address: '127.0.0.1',
    ttl: 600,
  }));
  response.send();
});
