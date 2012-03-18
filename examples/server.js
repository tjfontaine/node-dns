"use strict";

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

server.on('listening', function () {
  console.log('server listening on', this.address());
  //this.close();
});

server.on('socketError', function (err, socket) {
  console.log(err);
});

server.on('close', function () {
  console.log('server closed');
});

server.serve(15353, '127.0.0.1');
