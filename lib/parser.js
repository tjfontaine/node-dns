var name_unpack = require('./fields').name_unpack;
var ipaddr = require('./ipaddr');
var BufferCursor = require('./buffercursor');
var consts = require('./consts');
var Packet = require('./packet').Packet;

var Parser = module.exports = function (msg, socket) {
  var state,
      len,
      pos,
      val,
      rdata_len,
      rdata,
      counts = {},
      section,
      count;

  var packet = new Packet(socket);

  pos = label_pos = 0;
  state = "HEADER";

  msg = BufferCursor(msg);
  len = msg.length;

  while (true) {
    switch (state) {
      case "HEADER":
        packet.header.id = msg.readUInt16BE();
        val = msg.readUInt16BE();
        packet.header.qr = (val & 0x8000) >> 15;
        packet.header.opcode = (val & 0x7800) >> 11;
        packet.header.aa = (val & 0x400) >> 10;
        packet.header.tc = (val & 0x200) >> 9;
        packet.header.rd = (val & 0x100) >> 8;
        packet.header.ra = (val & 0x80) >> 7;
        packet.header.res1 = (val & 0x40) >> 6;
        packet.header.res2 = (val & 0x20) >> 5;
        packet.header.res3 = (val & 0x10) >> 4;
        packet.header.rcode = (val & 0xF);
        counts.qdcount = msg.readUInt16BE();
        counts.ancount = msg.readUInt16BE();
        counts.nscount = msg.readUInt16BE();
        counts.arcount = msg.readUInt16BE();
        state = "QUESTION";
        break;
      case "QUESTION":
        pos = msg.tell();
        val = name_unpack(msg.buffer, pos)
        msg.seek(pos + val.read);
        val = { name: val.value };
        val.type = msg.readUInt16BE();
        val.class = msg.readUInt16BE();
        packet.question.push(val);
        // TODO handle qdcount > 0 in practice no one sends this
        state = "RESOURCE_RECORD";
        section = "answer";
        count = "ancount";
        break;
      case "RESOURCE_RECORD":
        if (counts[count] === packet[section].length) {
          switch (section) {
            case "answer":
              section = "authority";
              count = "nscount";
              break;
            case "authority":
              section = "additional";
              count = "arcount";
              break;
            case "additional":
              state = "END";
              break;
          }
        } else {
          state = "RR_UNPACK";
        }
        break;
      case "RR_UNPACK":
        pos = msg.tell();
        val = name_unpack(msg.buffer, pos);
        msg.seek(pos + val.read);
        val = { name: val.value };
        val.type = msg.readUInt16BE();
        val.class = msg.readUInt16BE();
        val.ttl = msg.readUInt32BE();
        rdata_len = msg.readUInt16BE();
        rdata = msg.slice(rdata_len);
        state = consts.QTYPE_TO_NAME[val.type];
        break;
      case "RESOURCE_DONE":
        packet[section].push(val);
        state = "RESOURCE_RECORD";
        break;
      case "A":
        val.address = new ipaddr.IPv4(rdata.toByteArray());
        val.address = val.address.toString();
        state = "RESOURCE_DONE";
        break;
      case "AAAA":
        val.address = new ipaddr.IPv6(rdata.toByteArray('readUInt16BE'));
        val.address = val.address.toString();
        state = "RESOURCE_DONE";
        break;
      case "NS":
      case "CNAME":
      case "PTR":
        val.data = name_unpack(msg.buffer, msg.tell() - rdata_len).value;
        state = "RESOURCE_DONE";
        break;
      case "TXT":
        val.data = rdata.toString('ascii', rdata.readUInt8());
        state = "RESOURCE_DONE";
        break;
      case "MX":
        val.priority = rdata.readUInt16BE();
        val.exchange = name_unpack(msg.buffer, msg.tell() - rdata_len + 2).value;
        state = "RESOURCE_DONE";
        break;
      case "SRV":
        val.priority = rdata.readUInt16BE();
        val.weight = rdata.readUInt16BE();
        val.port = rdata.readUInt16BE();
        pos = msg.tell() - rdata_len + rdata.tell();
        val.target = name_unpack(msg.buffer, pos).value;
        state = "RESOURCE_DONE";
        break;
      case "SOA":
        pos = name_unpack(msg.buffer, msg.tell() - rdata_len);
        val.primary = pos.value;
        rdata.seek(pos.read);
        pos = name_unpack(msg.buffer, msg.tell() - rdata_len + pos.read);
        val.admin = pos.value;
        rdata.seek(rdata.tell() + pos.read);
        val.serial = rdata.readUInt32BE();
        val.refresh = rdata.readInt32BE();
        val.retry = rdata.readInt32BE();
        val.expiration = rdata.readInt32BE();
        val.minimum = rdata.readInt32BE();
        state = "RESOURCE_DONE";
        break;
      case "END":
        return packet;
        break;
      default:
        console.log(state, val);
        state = "RESOURCE_DONE";
        break;
    }
  };
};
