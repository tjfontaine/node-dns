var Request = require('../lib/request'),
  Question = require('../lib/question');

var q = new Question({
  name: 'www.google.com',
  type: 1,
});

var noServer = {
  address: '127.0.0.1',
  port: 19999,
  type: 'udp',
};

var udpServ = {
  address: '8.8.8.8',
  port: 53,
  type: 'udp',
};

var tcpServ = {
  address: '8.8.8.8',
  port: 53,
  type: 'tcp',
};

exports.setUp = function (cb) {
  cb();
};

exports.timeout = function (test) {
  var r = Request({
    question: q,
    server: noServer,
    timeout: 100,
  });

  var timedout = false;

  r.on('timeout', function () {
    timedout = true;
  });

  r.on('end', function () {
    test.ok(timedout, 'Failed to timeout');
    test.done();
  });

  r.send();
};

exports.udpResponse = function (test) {
  var r = Request({
    question: q,
    server: udpServ,
    timeout: 4000,
  });

  r.on('message', function (err, answer) {
    test.ok(!err, 'UDP Request should not error');
    test.ok(answer, 'No UDP answer provided');
  });

  r.on('timeout', function () {
    test.ok(false, 'UDP Requests should not timeout');
  });

  r.on('end', function () {
    test.done();
  });

  r.send();
};

exports.tcpResponse = function (test) {
  var r = Request({
    question: q,
    server: tcpServ,
    timeout: 4000,
  });

  r.on('message', function (err, answer) {
    test.ok(!err, 'TCP Request should not error');
    test.ok(answer, 'No TCP answer provided');
  });

  r.on('timeout', function () {
    test.ok(false, 'TCP Requests should not timeout');
  });

  r.on('end', function () {
    test.done();
  });

  r.send();
};

exports.tearDown = function (cb) {
  cb();
};
