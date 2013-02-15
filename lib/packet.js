// Copyright 2011 Timothy J Fontaine <tjfontaine@gmail.com>
//
// Permission is hereby granted, free of charge, to any person obtaining a copy
// of this software and associated documentation files (the 'Software'), to deal
// in the Software without restriction, including without limitation the rights
// to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
// copies of the Software, and to permit persons to whom the Software is
// furnished to do so, subject to the following conditions:
//
// The above copyright notice and this permission notice shall be included in
// all copies or substantial portions of the Software.
//
// THE SOFTWARE IS PROVIDED 'AS IS', WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
// IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
// FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
// AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
// LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
// OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN
// THE SOFTWARE

'use strict';

var consts = require('./consts'),
    BufferCursor = require('buffercursor'),
    BufferCursorOverflow = BufferCursor.BufferCursorOverflow,
    ipaddr = require('ipaddr.js'),
    util = require('util');

var Packet = module.exports = function(socket) {
  this.header = {
    id: 0,
    qr: 0,
    opcode: 0,
    aa: 0,
    tc: 0,
    rd: 1,
    ra: 0,
    res1: 0,
    res2: 0,
    res3: 0,
    rcode: 0
  };
  this.question = [];
  this.answer = [];
  this.authority = [];
  this.additional = [];
  this.edns_options = [];
  this.payload = undefined;
  this.address = undefined;

  this._socket = socket;
};

Packet.prototype.send = function() {
  var buff, len, size;

  if (typeof(this.edns_version) !== 'undefined') {
    size = 4096;
  }

  this.payload = size = size || this._socket.base_size;

  buff = this._socket.buffer(size);
  len = Packet.write(buff, this);
  this._socket.send(len);
};

var LABEL_POINTER = 0xC0;

var isPointer = function(len) {
  return (len & LABEL_POINTER) === LABEL_POINTER;
};

var name_unpack = function(buff, index) {
  var parts, len, start, pos, i, part, combine = [];

  start = buff.tell();

  parts = [];
  len = buff.readUInt8();

  while (len !== 0) {
    if (isPointer(len)) {
      len -= LABEL_POINTER;
      len = len << 8;
      pos = len + buff.readUInt8();
      parts.push({
        pos: pos,
        value: index[pos]
      });
      len = 0;
    } else {
      parts.push({
        pos: buff.tell() - 1,
        value: buff.toString('ascii', len)
      });
      len = buff.readUInt8();
    }
  }

  for (i = parts.length - 1; i >= 0; i--) {
    part = parts[i];
    combine.splice(0, 0, part.value);
    index[part.pos] = combine.join('.');
  }

  return combine.join('.');
};

var name_pack = function(str, buff, index) {
  var offset, dot, part;

  while (str) {
    if (index[str]) {
      offset = (LABEL_POINTER << 8) + index[str];
      buff.writeUInt16BE(offset);
      break;
    } else {
      index[str] = buff.tell();
      dot = str.indexOf('.');
      if (dot > -1) {
        part = str.slice(0, dot);
        str = str.slice(dot + 1);
      } else {
        part = str;
        str = undefined;
      }
      buff.writeUInt8(part.length);
      buff.write(part, part.length, 'ascii');
    }
  }

  if (!str) {
    buff.writeUInt8(0);
  }
};

Packet.write = function(buff, packet) {
  var state,
      next,
      name,
      val,
      section,
      count,
      pos,
      rdata_pos,
      last_resource,
      label_index = {};

  buff = BufferCursor(buff);

  if (typeof(packet.edns_version) !== 'undefined') {
    state = 'EDNS';
  } else {
    state = 'HEADER';
  }

  while (true) {
    try {
      switch (state) {
        case 'EDNS':
          val = {
            name: '',
            type: consts.NAME_TO_QTYPE.OPT,
            class: packet.payload
          };
          pos = packet.header.rcode;
          val.ttl = packet.header.rcode >> 4;
          packet.header.rcode = pos - (val.ttl << 4);
          val.ttl = (val.ttl << 8) + packet.edns_version;
          val.ttl = (val.ttl << 16) + (packet.do << 15) & 0x8000;
          packet.additional.splice(0, 0, val);
          state = 'HEADER';
          break;
        case 'HEADER':
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
          // TODO assert on question.length > 1, in practice multiple questions
          // aren't used
          buff.writeUInt16BE(1);
          // answer offset 6
          buff.writeUInt16BE(packet.answer.length);
          // authority offset 8
          buff.writeUInt16BE(packet.authority.length);
          // additional offset 10
          buff.writeUInt16BE(packet.additional.length);
          state = 'QUESTION';
          break;
        case 'TRUNCATE':
          buff.seek(2);
          val = buff.readUInt16BE();
          val |= (1 << 9) & 0x200;
          buff.seek(2);
          buff.writeUInt16BE(val);
          switch (section) {
            case 'answer':
              pos = 6;
              // seek to authority and clear it and additional out
              buff.seek(8);
              buff.writeUInt16BE(0);
              buff.writeUInt16BE(0);
              break;
            case 'authority':
              pos = 8;
              // seek to additional and clear it out
              buff.seek(10);
              buff.writeUInt16BE(0);
              break;
            case 'additional':
              pos = 10;
              break;
          }
          buff.seek(pos);
          buff.writeUInt16BE(count - 1);
          buff.seek(last_resource);
          state = 'END';
          break;
        case 'NAME_PACK':
          name_pack(name, buff, label_index);
          state = next;
          break;
        case 'QUESTION':
          val = packet.question[0];
          name = val.name;
          state = 'NAME_PACK';
          next = 'QUESTION_NEXT';
          break;
        case 'QUESTION_NEXT':
          buff.writeUInt16BE(val.type);
          buff.writeUInt16BE(val.class);
          state = 'RESOURCE_RECORD';
          section = 'answer';
          count = 0;
          break;
        case 'RESOURCE_RECORD':
          last_resource = buff.tell();
          if (packet[section].length == count) {
            switch (section) {
              case 'answer':
                section = 'authority';
                state = 'RESOURCE_RECORD';
                break;
              case 'authority':
                section = 'additional';
                state = 'RESOURCE_RECORD';
                break;
              case 'additional':
                state = 'END';
                break;
            }
            count = 0;
          } else {
            state = 'RESOURCE_WRITE';
          }
          break;
        case 'RESOURCE_WRITE':
          val = packet[section][count];
          name = val.name;
          state = 'NAME_PACK';
          next = 'RESOURCE_WRITE_NEXT';
          break;
        case 'RESOURCE_WRITE_NEXT':
          buff.writeUInt16BE(val.type);
          buff.writeUInt16BE(val.class);
          buff.writeUInt32BE(val.ttl);

          // where the rdata length goes
          rdata_pos = buff.tell();
          buff.writeUInt16BE(0);

          state = consts.QTYPE_TO_NAME[val.type];
          break;
        case 'RESOURCE_DONE':
          pos = buff.tell();
          buff.seek(rdata_pos);
          buff.writeUInt16BE(pos - rdata_pos - 2);
          buff.seek(pos);
          count += 1;
          state = 'RESOURCE_RECORD';
          break;
        case 'A':
        case 'AAAA':
          //TODO XXX FIXME -- assert that address is of proper type
          val = ipaddr.parse(val.address).toByteArray();
          val.forEach(function(b) {
            buff.writeUInt8(b);
          });
          state = 'RESOURCE_DONE';
          break;
        case 'NS':
        case 'CNAME':
        case 'PTR':
          name = val.data;
          state = 'NAME_PACK';
          next = 'RESOURCE_DONE';
          break;
        case 'TXT':
          //TODO XXX FIXME -- split on max char string and loop
          buff.writeUInt8(val.data.length);
          buff.write(val.data, val.data.length, 'ascii');
          state = 'RESOURCE_DONE';
          break;
        case 'MX':
          buff.writeUInt16BE(val.priority);
          name = val.exchange;
          state = 'NAME_PACK';
          next = 'RESOURCE_DONE';
          break;
        case 'SRV':
          buff.writeUInt16BE(val.priority);
          buff.writeUInt16BE(val.weight);
          buff.writeUInt16BE(val.port);
          name = val.target;
          state = 'NAME_PACK';
          next = 'RESOURCE_DONE';
          break;
        case 'SOA':
          name = val.primary;
          state = 'NAME_PACK';
          next = 'SOA_ADMIN';
          break;
        case 'SOA_ADMIN':
          name = val.admin;
          state = 'NAME_PACK';
          next = 'SOA_NEXT';
          break;
        case 'SOA_NEXT':
          buff.writeUInt32BE(val.serial);
          buff.writeInt32BE(val.refresh);
          buff.writeInt32BE(val.retry);
          buff.writeInt32BE(val.expiration);
          buff.writeInt32BE(val.minimum);
          state = 'RESOURCE_DONE';
          break;
        case 'OPT':
          while (packet.edns_options.length) {
            val = packet.edns_options.pop();
            buff.writeUInt16BE(val.code);
            buff.writeUInt16BE(val.data.length);
            for (pos = 0; pos < val.data.length; pos++) {
              buff.writeUInt8(val.data.readUInt8(pos));
            }
          }
          state = 'RESOURCE_DONE';
          break;
        case 'NAPTR':
          buff.writeUInt16BE(val.order);
          buff.writeUInt16BE(val.preference);
          buff.writeUInt8(val.flags.length);
          buff.write(val.flags, val.flags.length, 'ascii');
          buff.writeUInt8(val.service.length);
          buff.write(val.service, val.service.length, 'ascii');
          buff.writeUInt8(val.regexp.length);
          buff.write(val.regexp, val.regexp.length, 'ascii');
          buff.writeUInt8(val.replacement.length);
          buff.write(val.replacement, val.replacement.length, 'ascii');
          state = 'RESOURCE_DONE';
          break;
        case 'END':
          return buff.tell();
          break;
        default:
          throw new Error('WTF No State While Writing');
          break;
      }
    } catch (e) {
      if (e instanceof BufferCursorOverflow) {
        state = 'TRUNCATE';
      } else {
        throw e;
      }
    }
  }
};

Packet.parse = function(msg, socket) {
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
  state = 'HEADER';

  msg = BufferCursor(msg);
  len = msg.length;

  while (true) {
    switch (state) {
      case 'HEADER':
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
        state = 'QUESTION';
        break;
      case 'QUESTION':
        val = {};
        val.name = name_unpack(msg, label_index);
        val.type = msg.readUInt16BE();
        val.class = msg.readUInt16BE();
        packet.question.push(val);
        // TODO handle qdcount > 0 in practice no one sends this
        state = 'RESOURCE_RECORD';
        section = 'answer';
        count = 'ancount';
        break;
      case 'RESOURCE_RECORD':
        if (counts[count] === packet[section].length) {
          switch (section) {
            case 'answer':
              section = 'authority';
              count = 'nscount';
              break;
            case 'authority':
              section = 'additional';
              count = 'arcount';
              break;
            case 'additional':
              state = 'END';
              break;
          }
        } else {
          state = 'RR_UNPACK';
        }
        break;
      case 'RR_UNPACK':
        val = {};
        val.name = name_unpack(msg, label_index);
        val.type = msg.readUInt16BE();
        val.class = msg.readUInt16BE();
        val.ttl = msg.readUInt32BE();
        rdata_len = msg.readUInt16BE();
        rdata = msg.slice(rdata_len);
        state = consts.QTYPE_TO_NAME[val.type];
        break;
      case 'RESOURCE_DONE':
        packet[section].push(val);
        state = 'RESOURCE_RECORD';
        break;
      case 'A':
        val.address = new ipaddr.IPv4(rdata.toByteArray());
        val.address = val.address.toString();
        state = 'RESOURCE_DONE';
        break;
      case 'AAAA':
        val.address = new ipaddr.IPv6(rdata.toByteArray('readUInt16BE'));
        val.address = val.address.toString();
        state = 'RESOURCE_DONE';
        break;
      case 'NS':
      case 'CNAME':
      case 'PTR':
        pos = msg.tell();
        msg.seek(pos - rdata_len);
        val.data = name_unpack(msg, label_index);
        msg.seek(pos);
        state = 'RESOURCE_DONE';
        break;
      case 'TXT':
        val.data = '';
        while (!rdata.eof()) {
          val.data += rdata.toString('ascii', rdata.readUInt8());
        }
        state = 'RESOURCE_DONE';
        break;
      case 'MX':
        val.priority = rdata.readUInt16BE();
        pos = msg.tell();
        msg.seek(pos - rdata_len + rdata.tell());
        val.exchange = name_unpack(msg, label_index);
        msg.seek(pos);
        state = 'RESOURCE_DONE';
        break;
      case 'SRV':
        val.priority = rdata.readUInt16BE();
        val.weight = rdata.readUInt16BE();
        val.port = rdata.readUInt16BE();
        pos = msg.tell();
        msg.seek(pos - rdata_len + rdata.tell());
        val.target = name_unpack(msg, label_index);
        msg.seek(pos);
        state = 'RESOURCE_DONE';
        break;
      case 'SOA':
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
        state = 'RESOURCE_DONE';
        break;
      case 'OPT':
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
            data: rdata.slice(rdata.readUInt16BE()).buffer
          });
        }
        state = 'RESOURCE_RECORD';
        break;
      case 'NAPTR':
        val.order = rdata.readUInt16BE();
        val.preference = rdata.readUInt16BE();
        pos = rdata.readUInt8();
        val.flags = rdata.toString('ascii', pos);
        pos = rdata.readUInt8();
        val.service = rdata.toString('ascii', pos);
        pos = rdata.readUInt8();
        val.regexp = rdata.toString('ascii', pos);
        pos = rdata.readUInt8();
        val.replacement = rdata.toString('ascii', pos);
        state = 'RESOURCE_DONE';
        break;
      case 'END':
        return packet;
        break;
      default:
        //console.log(state, val);
        state = 'RESOURCE_DONE';
        break;
    }
  }
};
