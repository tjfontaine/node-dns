var BufferCursor = require('./buffercursor');
var ipaddr = require('./ipaddr');
var name_pack = require('./fields').name_pack;

var Writer = module.exports = function (buff, packet) {
  var state,
      next,
      name,
      val,
      section,
      count,
      pos,
      rdata_pos,
      label_index = {};

  buff = BufferCursor(buff);
  state = "HEADER";

  while (true) {
    switch (state) {
      case "HEADER":
        buff.writeUInt16BE(packet.header.id);
        val = 0;
        val += (packet.header.qr << 15) & 0x8000;
        val += (packet.header.opcode << 11) & 0x7800;
        val += (packet.header.aa << 10) & 0x400;
        val += (packet.header.tc << 9) & 0x200;
        val += (packet.header.rd << 8) & 0x100;
        val += (packet.header.ra << 7) & 0x80;
        val += (packet.header.res1 << 6) & 0x40;
        val += (packet.header.res1 << 5) & 0x20;
        val += (packet.header.res1 << 4) & 0x10;
        val += packet.header.rcode & 0xF;
        buff.writeUInt16BE(val);
        buff.writeUInt16BE(1);
        //buff.writeUInt16BE(packet.question.length);
        buff.writeUInt16BE(packet.answer.length);
        buff.writeUInt16BE(packet.authority.length);
        buff.writeUInt16BE(packet.additional.length);
        state = "QUESTION";
        break;
      case "NAME_PACK":
        pos = buff.tell();
        pos += name_pack(name, buff.buffer, pos, label_index);
        buff.seek(pos);
        state = next;
        break;
      case "QUESTION":
        val = packet.question[0];
        name = val.name;
        state = "NAME_PACK";
        next = "QUESTION_NEXT";
        break;
      case "QUESTION_NEXT":
        buff.writeUInt16BE(val.type);
        buff.writeUInt16BE(val.class);
        state = "RESOURCE_RECORD";
        section = "answer";
        count = 0;
        break;
      case "RESOURCE_RECORD":
        if (packet[section].length == count) {
          switch (section) {
            case "answer":
              section = "authority";
              state = "RESOURCE_RECORD";
              break;
            case "authority":
              section = "additional";
              state = "RESOURCE_RECORD";
              break;
            case "additional":
              state = "END";
              break;
          }
          count = 0;
        } else {
          state = "RESOURCE_WRITE";
        }
        break;
      case "RESOURCE_WRITE":
        val = packet[section][count];
        name = val.name;
        state = "NAME_PACK";
        next = "RESOURCE_WRITE_NEXT";
        break;
      case "RESOURCE_WRITE_NEXT":
        buff.writeUInt16BE(val.type);
        buff.writeUInt16BE(val.class);
        buff.writeUInt32BE(val.ttl);

        // where the rdata length goes
        rdata_pos = buff.tell();
        buff.writeUInt16BE(0);

        state = consts.QTYPE_TO_NAME[val.type];
        break;
      case "RESOURCE_DONE":
        pos = buff.tell();
        buff.seek(rdata_pos);
        buff.writeUInt16BE(pos - rdata_pos - 2);
        buff.seek(pos);
        count += 1;
        state = "RESOURCE_RECORD";
        break;
      case "A":
        val = ipaddr.parse(val.address).toByteArray();
        val.forEach(function (b) {
          buff.writeUInt8(b);
        });
        state = "RESOURCE_DONE";
        break;
      case "AAAA":
        val = ipaddr.parse(val.address).toByteArray();
        val.forEach(function (b) {
          buff.writeUInt16BE(b);
        });
        state = "RESOURCE_DONE";
        break;
      case "NS":
      case "CNAME":
      case "PTR":
        name = val.data;
        state = "NAME_PACK";
        next = "RESOURCE_DONE";
        break;
      case "TXT":
        buff.write(val.data, val.data.length, 'ascii');
        state = "RESOURCE_DONE";
        break;
      case "MX":
        buff.writeUInt16BE(val.priority);
        pos += name_pack(val.exchange, buff.buffer, pos, label_index);
        name = val.exchange;
        state = "NAME_PACK";
        next = "RESOURCE_DONE";
        break;
      case "SRV":
        buff.writeUInt16BE(val.priority);
        buff.writeUInt16BE(val.weight);
        buff.writeUInt16BE(val.port);
        name = val.target;
        state = "NAME_PACK";
        next = "RESOURCE_DONE";
        break;
      case "SOA":
        name = val.primary;
        state = "NAME_PACK";
        next = "SOA_ADMIN";
        break;
      case "SOA_ADMIN":
        name = val.admin;
        state = "NAME_PACK";
        next = "SOA_NEXT";
        break;
      case "SOA_NEXT":
        buff.writeUInt32BE(val.serial);
        buff.writeInt32BE(val.refresh);
        buff.writeInt32BE(val.retry);
        buff.writeInt32BE(val.expiration);
        buff.writeInt32BE(val.minimum);
        state = "RESOURCE_DONE";
        break;
      case "END":
        return buff.tell();
        break;
      default:
        throw new Error("WTF No State While Writing");
        break;
    }
  }
}
