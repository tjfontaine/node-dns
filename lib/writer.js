var BufferCursor = require('./buffercursor');
var ipaddr = require('./ipaddr');
var name_pack = require('./fields').name_pack;

var Writer = module.exports = function (buff, packet) {
  var state, val, label_index = {};

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
      case "QUESTION":
        pos = buff.tell();
        val = packet.question[0];
        pos += name_pack(val.name, buff.buffer, pos, label_index);
        buff.seek(pos);
        buff.writeUInt16BE(val.type);
        buff.writeUInt16BE(val.class);
        state = "END";
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
