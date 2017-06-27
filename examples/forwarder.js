var dns = require('../dns');
var packet = require('native-dns-packet');

var SERVFAIL = packet.consts.NAME_TO_RCODE.SERVFAIL;

var servers = [
    dns.createServer(),
    dns.createTCPServer(),
].forEach(function (server) {
    server.serve(53, '127.0.0.1');
    server.on('listening', function() {
        console.log('listening');
    })
    server.on('request', function (outerRequest, outerResponse) {
        console.log('request', outerRequest.question[0], outerRequest.header)

        var innerRequest = dns.Request({
            question: outerRequest.question[0],
            server: {
              address: '8.8.8.8',
              type: 'udp',
              port: 53,
            },
            cache: false,
        })

        innerRequest.send();

        // in the event we get an error or timeout paper over with servfail
        outerResponse.header.rcode = SERVFAIL;

        function requestDone() {
            outerResponse.send();
        }

        innerRequest.on('message', function (err, innerResponse) {
            console.log('response', err, innerResponse.question[0], innerResponse.header)

            outerResponse.header.rcode = innerResponse.header.rcode;

            outerResponse.answer = innerResponse.answer;
            outerResponse.additional = innerResponse.additional;
            outerResponse.authority = innerResponse.authority;

        });

        innerRequest.on('end', function() {
            requestDone();
        })
    });
})
