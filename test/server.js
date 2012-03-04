var dns = require('../dns');

exports.udp4 = function (test) {
  var server = dns.createUDPServer(); 

  var tData = {
    address: '127.0.0.1',
    port: 15353,
  };

  var succeed = false;

  setTimeout(function () {
    test.ok(succeed, 'Test failed to listen');
    server.close();
  }, 300);

  server.on('listening', function () {
    test.deepEqual(this.address(), tData, 'Not listening on the same port and address');
    /* currently disabled because of https://github.com/joyent/node/issues/2867 */
    //this.close();
    succeed = true;
  });

  server.on('socketError', function (err, socket) {
    test.ifError(err, 'Should not have a bind error');
    this.close();
  });

  server.on('close', function () {
    test.done();
  });

  server.serve(tData.port, tData.address);
};

exports.udp6 = function (test) {
  var server = dns.createUDPServer({
    dgram_type: 'udp6',
  }); 

  var tData = {
    address: '::1',
    port: 15353,
  };

  var succeed = false;

  setTimeout(function () {
    test.ok(succeed, 'Test failed to listen');
    server.close();
  }, 300);

  server.on('listening', function () {
    test.deepEqual(this.address(), tData, 'Not listening on the same port and address');

    /* currently disabled because of https://github.com/joyent/node/issues/2867 */
    //this.close();
    succeed = true;
  });

  server.on('socketError', function (err, socket) {
    test.ifError(err, 'Should not have a bind error');
    this.close();
  });

  server.on('close', function () {
    test.done();
  });

  server.serve(tData.port, tData.address);
};

exports.tcp = function (test) {
  var server = dns.createTCPServer(); 

  var tData = {
    address: '127.0.0.1',
    port: 15353,
  };

  server.on('listening', function () {
    test.equal(this.address().port, tData.port, 'Not listening on the same port and address');
    test.equal(this.address().address, tData.address, 'Not listening on the same port and address');
    this.close();
  });

  server.on('socketError', function (err, socket) {
    test.ifError(err, 'Should not have a bind error');
    this.close();
  });

  server.on('close', function () {
    test.done();
  });

  server.serve(tData.port, tData.address);
};
