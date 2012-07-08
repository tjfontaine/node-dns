// Copyright 2011 Timothy J Fontaine <tjfontaine@gmail.com>
//
// Permission is hereby granted, free of charge, to any person obtaining a copy
// of this software and associated documentation files (the "Software"), to deal
// in the Software without restriction, including without limitation the rights
// to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
// copies of the Software, and to permit persons to whom the Software is
// furnished to do so, subject to the following conditions:
//
// The above copyright notice and this permission notice shall be included in
// all copies or substantial portions of the Software.
//
// THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
// IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
// FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
// AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
// LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
// OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN
// THE SOFTWARE

'use strict';

var BufferCursor = require('./buffercursor');
var ipaddr = require('./ipaddr');
var name_pack = require('./fields').name_pack;
var consts = require('./consts');

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

  if (typeof(packet.ends_version) !== 'undefined') {
    state = "EDNS";
  } else {
    state = "HEADER";
  }

  while (true) {
    switch (state) {
      case "EDNS":
        val = {
          name: '',
          type: consts.NAME_TO_QTYPE.OPT,
          class: packet.payload,
        };
        pos = packet.header.rcode;
        val.ttl = packet.header.rcode >> 4;
        packet.header.rcode = pos - (val.ttl << 4);
        val.ttl = (val.ttl << 8) + packet.edns_version;
        val.ttl = (val.ttl << 16) + (packet.do << 15) & 0x8000;
        packet.additional.splice(0, 0, val);
        state = "HEADER";
        break;
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
        name_pack(name, buff, label_index);
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
        buff.writeUInt8(val.data.length);
        buff.write(val.data, val.data.length, 'ascii');
        state = "RESOURCE_DONE";
        break;
      case "MX":
        buff.writeUInt16BE(val.priority);
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
      case "OPT":
        while(packet.edns_options.length) {
          val = packet.edns_options.pop();
          msg.writeUInt16BE(val.code);
          for (pos = 0; pos < val.data.length; pos++) {
            msg.writeUInt8(val.data.readUInt8(pos));
          }
        }
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
