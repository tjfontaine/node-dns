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
      label_index = {},
      counts = {},
      section,
      count;

  var packet = new Packet(socket);

  pos = 0;
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
        val = {};
        val.name = name_unpack(msg, label_index);
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
        val = {};
        val.name = name_unpack(msg, label_index);
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
        pos = msg.tell();
        msg.seek(pos - rdata_len);
        val.data = name_unpack(msg, label_index);
        msg.seek(pos);
        state = "RESOURCE_DONE";
        break;
      case "TXT":
        val.data = rdata.toString('ascii', rdata.readUInt8());
        state = "RESOURCE_DONE";
        break;
      case "MX":
        val.priority = rdata.readUInt16BE();
        pos = msg.tell();
        msg.seek(pos - rdata_len + rdata.tell());
        val.exchange = name_unpack(msg, label_index);
        msg.seek(pos);
        state = "RESOURCE_DONE";
        break;
      case "SRV":
        val.priority = rdata.readUInt16BE();
        val.weight = rdata.readUInt16BE();
        val.port = rdata.readUInt16BE();
        pos = msg.tell();
        msg.seek(pos - rdata_len + rdata.tell());
        val.target = name_unpack(msg, label_index);
        msg.seek(pos);
        state = "RESOURCE_DONE";
        break;
      case "SOA":
        pos = msg.tell();
        msg.seek(pos - rdata_len + rdata.tell());
        val.primary = name_unpack(msg, label_index);
        val.admin = name_unpack(msg, label_index);
        rdata.seek(msg.tell() - (pos - rdata_len + rdata.tell()));
        msg.seek(pos);
        val.serial = rdata.readUInt32BE();
        val.refresh = rdata.readInt32BE();
        val.retry = rdata.readInt32BE();
        val.expiration = rdata.readInt32BE();
        val.minimum = rdata.readInt32BE();
        state = "RESOURCE_DONE";
        break;
      case "OPT":
        // assert first entry in additional
        counts[count] -= 1;
        packet.payload = val.class;
        pos = msg.tell();
        msg.seek(pos - 6);
        packet.header.rcode = (msg.readUInt8() << 4) + packet.header.rcode;
        packet.edns_version = msg.readUInt8();
        val = msg.readUInt16BE();
        msg.seek(pos);
        packet.do = (val & 0x8000) << 15;
        while (!rdata.eof()) {
          packet.edns_options.push({
            code: rdata.readUInt16BE(),
            data: rdata.slice(rdata.readUInt16BE()).buffer,
          });
        }
        state = "RESOURCE_RECORD";
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
