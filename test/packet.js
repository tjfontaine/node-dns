var dns = require('../dns'),
  Packet = require('../lib/packet').Packet;

exports.roundTrip = function (test) {
  var buff, pre, post;

  pre = new Packet();
  pre.header.id = 12345;
  pre.header.rcode = 1;

  pre.question.push(dns.Question({
    name: 'www.google.com',
    type: dns.consts.NAME_TO_QTYPE.A,
  }));

  pre.answer.push(dns.A({
    name: 'www.google.com',
    address: '127.0.0.1',
    ttl: 600,
  }));

  buff = new Buffer(pre.estimateSize());

  pre.pack(buff, 0);

  post = new Packet();
  post.unpack(buff, true);

  test.ok(pre.compare(post));

  test.done();
};
