var REMOTE_DNS = process.env.NODE_DNS_REMOTE || '8.8.8.8';
var REMOTE_PORT = process.env.NODE_DNS_REMOTE_PORT || 53;

if (process.env.DNSMASQ_PORT_15353_UDP_ADDR) {
    REMOTE_DNS = process.env.DNSMASQ_PORT_15353_UDP_ADDR;
    REMOTE_PORT = +process.env.DNSMASQ_PORT_15353_UDP_PORT;
    console.error('using dns', REMOTE_DNS, REMOTE_PORT)
}

exports.REMOTE_DNS = REMOTE_DNS;
exports.REMOTE_PORT = REMOTE_PORT;
