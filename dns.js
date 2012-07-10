#!/usr/bin/env node
//
//  DNS
//  - node-protocols API
//  - default port is 53
//  
//  function sendRequest() {
//    console.error('sending request')
//    var lookup = dns.lookup('google.com', {
//      host: 'localhost',
//      port: 1337
//    }, function (err, addr) {
//      console.log(addr);
//    });
//  }
//  
//  //
//  // simple dummy server
//  //
//  var server = dns.createServer(function (req, res) {
//    var rr = new dns.ResourceRecord(req.questions[0].domain, new Buffer([127,0,0,1]));
//    rr.rrtype = req.questions[0].rrtype;
//    rr.rrclass = req.questions[0].rrclass;
//    res.answers.push(rr);
//    res.end();
//  });
//  //
//  // send request once we are listening
//  //
//  server.listen(1337, sendRequest)
//
var dgram = require('dgram');
var dns = exports;
var util = require('util');
var EventEmitter = require('events').EventEmitter;

dns.createServer = function (lookupCallback) {
   var server = new DNSServer();
   if (typeof lookupCallback === 'function') {
      server.on('request', lookupCallback);
   }
   return server;
}
function DNSServer() {
   Object.getPrototypeOf(DNSServer.prototype).constructor.call(this);
   return this;
}
util.inherits(DNSServer, EventEmitter);
dns.DNSServer = DNSServer;
DNSServer.prototype.listen = function (port, address, callback) {
   if (typeof address === 'function') {
      callback = address;
      address = null;
   }
   if (callback) {
      this.on('listening', callback);
   }
   this.server = dgram.createSocket('udp4');
   this.server.bind(port, address);
   var self = this;
   self.emit('listening');
   self.server.on('message', function (buffer, addr) {
      try {
         var incoming = DNSMessage.readFromBuffer(buffer);
      }
      catch (e) {
         self.emit('error', e);
         return;
      }
      self.emit('request', incoming, new DNSResponse(incoming, self.server, addr));
   });
}

function DNSResponse(req, server, addr) {
   if (!req) {
      throw new Error('DNSResponse must have a matching request');
   }
   Object.getPrototypeOf(DNSResponse.prototype).constructor.call(this);
   this.server = server;
   this.remoteAddress = addr;
   this.req = req;
   this.questions = req.questions;
   return this;
}
util.inherits(DNSResponse, DNSMessage);
dns.DNSResponse = DNSResponse;
DNSResponse.prototype.end = function end() {
   var packet = this.buffer;
   var addr = this.remoteAddress;
   return this.server.send(packet, 0, packet.length, addr.port, addr.address);
}

dns.KIND = {
   QUERY: 0,
   IQUERY: 1,
   STATUS: 2
}
dns.RRTYPE = {
   A: 1,
   NS: 2,
   MD: 3,
   MF: 4,
   CNAME: 5,
   SOA: 6,
   MB: 7,
   MG: 8,
   MR: 9,
   NULL: 10,
   WKS: 11,
   PTR: 12,
   HINFO: 13,
   MINFO: 14,
   MX: 15,
   TXT: 16,
   AAAA: 28,
   SRV: 33,
   //
   // QTypes
   //
   AXFR:  252,
   MAILB: 253,
   MAILA: 254,
   '*': 255
};
dns.RRCLASS = {
   IN: 1,
   CS: 2,
   CH: 3,
   HS: 4,
   //
   // QClasses
   //
   '*': 255
};

function DNSDomain(domain) {
   if (arguments.length) {
      domain = '' + domain;
      //
      // Cannot start with .
      // Must end with .
      // No empty labels
      // Cannot be empty
      //
      if (/^[.]|[^.]$|[.]{2}|^$/.test(domain)) {
         throw new Error('unknown domain format for "'+domain+'"');
      }
      var size = 1 + domain.length;
      var names = domain.split('.');
      var buff = new Buffer(size);
      var offset = 0;
      names.forEach(function (name, index, arr) {
         buff.writeUInt8(name.length, offset);
         offset += 1;
         buff.write(name, offset);
         offset += name.length;
      });
      this.string = domain;
      this.buffer = buff;
      return this;
   }
   else {
      return this;
   }
}
dns.DNSDomain = DNSDomain;
DNSDomain._readString = function (buff, originalOffset, parts, referenceBuffer) {
   var offset = originalOffset || 0;
   var segmentLength = buff.readUInt8(offset);
   offset += 1;
   while (segmentLength) {
      //
      // Special pointer compression;
      //
      if (segmentLength & 0xc0) {
         var pointer = ((segmentLength & 0x3f) << 8) | buff.readUInt8(offset);
         offset += 1;
         var s = DNSDomain._readString(referenceBuffer || buff, pointer, parts, referenceBuffer);
         break;
      }
      else {
         parts.push(buff.slice(offset, offset + segmentLength));
         offset += segmentLength;
         segmentLength = buff.readUInt8(offset);
         offset += 1;
      }
   }
   return buff.slice(originalOffset, offset);
}
DNSDomain.readFromBuffer = function (buff, originalOffset, referenceBuffer) {
   var offset = originalOffset || 0;
   var parts = [];
   var s = DNSDomain._readString(buff, offset, parts, referenceBuffer);
   offset += s.length;
   var domain = new DNSDomain();
   domain.string = parts.join('.')+'.';
   domain.buffer = buff.slice(originalOffset, offset);
   return domain;
}
DNSDomain.prototype.toString = function toString() {
   return this.string;
}
Object.defineProperty(DNSDomain.prototype, 'string', {
   enumerable: true,
   value: null
});
Object.defineProperty(DNSDomain.prototype, 'buffer', {
   enumerable: true,
   value: null
});
Object.defineProperty(DNSDomain.prototype, 'length', {
   enumerable: true,
   get: function () {
      return this.buffer.length;
   }
});
DNSDomain.prototype.toJSON = function () {
   return this.string;
}

function ResourceRecord(domain, data_buffer) {
   if (domain) {
      //
      // Destroy compression
      //
      domain = new DNSDomain(domain.string);
      data_buffer = data_buffer || new Buffer(0);
      var dataStart = domain.length + 2 + 2 + 4 + 2;
      var buffer = this.buffer = new Buffer(dataStart + data_buffer.length);
      buffer.fill(0, domain.length);
      domain.buffer.copy(buffer);
      buffer.writeUInt16BE(data_buffer.length, dataStart - 2);
      data_buffer.copy(buffer, dataStart);
      this.domain = domain;
      return this;
   }
   else {
      return this;
   }
}
dns.ResourceRecord = ResourceRecord;
ResourceRecord.readFromBuffer = function (buff, originalOffset, referenceBuffer) {
   var offset = originalOffset || 0;
   var domain = DNSDomain.readFromBuffer(buff, offset, referenceBuffer);
   offset += domain.length;
   var rrtype = buff.readUInt16BE(offset);
   offset += 2;
   var rrclass = buff.readUInt16BE(offset);
   offset += 2;
   var ttl = buff.readUInt32BE(offset);
   offset += 4;
   var dlength = buff.readUInt16BE(offset);
   offset += 2;
   offset += dlength;
   var rr = new ResourceRecord();
   rr.buffer = buff.slice(originalOffset, offset);
   rr.domain = domain;
   return rr;
}
Object.defineProperty(ResourceRecord.prototype, 'buffer', {
   enumerable: true,
   value: null
});
Object.defineProperty(ResourceRecord.prototype, 'domain', {
   enumerable: true,
   value: null
});
Object.defineProperty(ResourceRecord.prototype, 'length', {
   enumerable: true,
   get: function () {
      return this.buffer.length;
   }
});
Object.defineProperty(ResourceRecord.prototype, 'rrtype', {
   enumerable: true,
   get: function () {
      var index = this.domain.length;
      return this.buffer.readUInt16BE(index);
   },
   set: function (rrtype) {
      var index = this.domain.length;
      return this.buffer.writeUInt16BE(rrtype, index);
   }
});
Object.defineProperty(ResourceRecord.prototype, 'rrclass', {
   enumerable: true,
   get: function () {
      var index = this.domain.length + 2;
      return this.buffer.readUInt16BE(index);
   },
   set: function (rrclass) {
      var index = this.domain.length + 2;
      return this.buffer.writeUInt16BE(rrclass, index);
   }
});
Object.defineProperty(ResourceRecord.prototype, 'ttl', {
   enumerable: true,
   get: function () {
      var index = this.domain.length + 2 + 2;
      return this.buffer.readUInt32BE(index);
   },
   set: function (ttl) {
      var index = this.domain.length + 2 + 2;
      return this.buffer.writeUInt32BE(ttl, index);
   }
});
Object.defineProperty(ResourceRecord.prototype, 'data', {
   enumerable: true,
   get: function () {
      var start = this.domain.length + 2 + 2 + 4 + 2;
      var end = start + this.buffer.readUInt16BE(start - 2);
      return this.buffer.slice(start, end);
   }
});
ResourceRecord.prototype.toJSON = function () {
   return {
      domain: this.domain,
      rrtype: this.rrtype,
      rrclass: this.rrclass,
      ttl: this.ttl,
      data: [].slice.call(this.data)
   }
}

function DNSQuestion(domain) {
   if (arguments.length) {
      //
      // Destroy compression
      //
      domain = new DNSDomain(domain.string);
      var size = domain.length + 2 + 2;
      var buff = new Buffer(size);
      buff.fill(0, domain.length);
      domain.buffer.copy(buff);
      this.buffer = buff;
      this.domain = domain;
      return this;
   }
   else {
      return this;
   }
}
dns.DNSQuestion = DNSQuestion;
DNSQuestion.readFromBuffer = function (buff, originalOffset, referenceBuffer) {
   var offset = originalOffset || 0;
   //
   // Check the domain
   //
   var domain = DNSDomain.readFromBuffer(buff, offset, referenceBuffer);
   offset += domain.length;
   var recordTypeValue = buff.readUInt16BE(offset);
   offset += 2;
   var recordClassValue = buff.readUInt16BE(offset);
   offset += 2;
   var question = new DNSQuestion();
   question.buffer = buff.slice(originalOffset, offset);
   question.domain = domain;
   return question;
}
DNSQuestion.prototype.toJSON = function ( ) {
   return {
      domain: this.domain,
      rrtype: this.rrtype,
      rrclass: this.rrclass
   }
}
Object.defineProperty(DNSQuestion.prototype, 'buffer', {
   enumerable: true,
   value: null
});
Object.defineProperty(DNSQuestion.prototype, 'domain', {
   enumerable: true,
   value: null
});
Object.defineProperty(DNSQuestion.prototype, 'length', {
   enumerable: true,
   get: function () {
      return this.buffer.length;
   }
});
Object.defineProperty(DNSQuestion.prototype, 'rrtype', {
   enumerable: true,
   get: function () {
      var index = this.domain.length;
      return this.buffer.readUInt16BE(index);
   },
   set: function (rrtype) {
      var index = this.domain.length;
      return this.buffer.writeUInt16BE(rrtype, index);
   }
});
Object.defineProperty(DNSQuestion.prototype, 'rrclass', {
   enumerable: true,
   get: function () {
      var index = this.domain.length + 2;
      return this.buffer.readUInt16BE(index);
   },
   set: function (rrclass) {
      var index = this.domain.length + 2;
      return this.buffer.writeUInt16BE(rrclass, index);
   }
});

function DNSMessage(header) {
   this.header = header || new Buffer([0,0,0,0]);
   this.questions = [];
   this.answers = [];
   this.authorities = [];
   this.additional = [];
   return this;
}
dns.DNSMessage = DNSMessage;
DNSMessage.readFromBuffer = function (buff, offset, referenceBuffer) {
   var msg = new DNSMessage();
   offset = offset || 0;
   var originalOffset = offset;
   msg.header = buff.slice(offset, offset + 4);
   offset += 4;
   var num_questions = buff.readUInt16BE(offset);
   offset += 2;
   var num_answers = buff.readUInt16BE(offset);
   offset += 2;
   var num_authorities = buff.readUInt16BE(offset);
   offset += 2;
   var num_additional = buff.readUInt16BE(offset);
   offset += 2;
   for (var i = 0; i < num_questions; i++) {
      try {
         var question = DNSQuestion.readFromBuffer(buff, offset);
         offset += question.length;
         msg.questions.push(question);
      }
      catch (e) {
         e.origin = this;
         throw e;
      }
   }
   for (var i = 0; i < num_answers; i++) {
      try {
         var answer = ResourceRecord.readFromBuffer(buff, offset);
         offset += answer.length;
         msg.answers.push(answer);
      }
      catch (e) {
         e.origin = this;
         throw e;
      }
   }
   for (var i = 0; i < num_authorities; i++) {
      try {
         var authority = ResourceRecord.readFromBuffer(buff, offset);
         offset += authority.length;
         msg.authorities.push(authority);
      }
      catch (e) {
         e.origin = this;
         throw e;
      }
   }
   for (var i = 0; i < num_additional; i++) {
      try {
         var addition = ResourceRecord.readFromBuffer(buff, offset);
         offset += addition.length;
         msg.additional.push(addition);
      }
      catch (e) {
         e.origin = this;
         throw e;
      }
   }
   
   return msg;
}
//
//  Significantly faster than setting all individually
//
DNSMessage.prototype.setHeaders = function (options, req) {
   if (options) {
      var id = options.id != null ? options.id : req.id;
      var flags = 0x000
      | (((options.isResponse || req) && 1) << 15)
      | (((options.kind != null ? options.kind : req && req.kind) & 0x000f) << 11)
      | ((options.authoritativeAnswer != null ? options.authoritativeAnswer : req && req.authoritativeAnswer) && 0x0400)
      | (options.truncated && 0x0200)
      | (options.recursionDesired && 0x0100)
      | (options.recursionAvailable && 0x0080)
      | (options.responseCode & 0x000f);
      this.header.writeUInt16BE(id, 0);
      this.header.writeUInt16BE(flags, 2);
   }
   return this;
}
function totalLength(a, b) {
   return a + b.length;
}
Object.defineProperty(DNSMessage.prototype, 'buffer', {
   enumerable: true,
   get: function () {
      var size = 12
         + this.questions.reduce(totalLength, 0)
         + this.answers.reduce(totalLength, 0)
         + this.authorities.reduce(totalLength, 0)
         + this.additional.reduce(totalLength, 0);
      var buff = new Buffer(size);
      this.header.copy(buff);
      var offset = 4;
      buff.writeUInt16BE(this.questions.length, offset);
      offset += 2;
      buff.writeUInt16BE(this.answers.length, offset);
      offset += 2;
      buff.writeUInt16BE(this.authorities.length, offset);
      offset += 2;
      buff.writeUInt16BE(this.additional.length, offset);
      offset += 2;
      this.questions.forEach(function (question) {
         question.buffer.copy(buff, offset);
         offset += question.length;
      });
      this.answers.forEach(function (answer) {
         answer.buffer.copy(buff, offset);
         offset += answer.length;
      });
      this.authorities.forEach(function (authority) {
         authority.buffer.copy(buff, offset);
         offset += authority.length;
      });
      this.additional.forEach(function (additional) {
         additional.buffer.copy(buff, offset);
         offset += additional.length;
      });
      return buff;
   }
});
Object.defineProperty(DNSMessage.prototype, 'id', {
   enumerable: true,
   get: function () {
      var offset = 0;
      return this.header.readUInt16BE(offset);
   },
   set: function (id) {
      var offset = 0;
      return this.header.writeUInt16BE(id, offset);
   }
});
Object.defineProperty(DNSMessage.prototype, 'flags', {
   enumerable: true,
   get: function () {
      var offset = 2;
      return this.header.readUInt16BE(offset);
   },
   set: function (id) {
      var offset = 2;
      return this.header.writeUInt16BE(id, offset);
   }
});
Object.defineProperty(DNSMessage.prototype, 'isResponse', {
   enumerable: true,
   get: function () {
      return !!(this.flags | 0x8000);
   },
   set: function (isResponse) {
      this.flags = isResponse ? this.flags | 0x8000 : this.flags & 0x7fff;
   }
});
Object.defineProperty(DNSMessage.prototype, 'opCode', {
   enumerable: true,
   get: function () {
      return (0x7800 && this.flags) >> 11;
   },
   set: function (opCode) {
      this.flags = this.flags & 0x97ff | ((opCode & 0xf) << 11);
   }
});
Object.defineProperty(DNSMessage.prototype, 'authoritativeAnswer', {
   enumerable: true,
   get: function () {
      return !!(this.flags | 0x0400);
   },
   set: function (isAuthoritative) {
      this.flags = isAuthoritative ? this.flags | 0x0400 : this.flags & 0xfbff;
   }
});
Object.defineProperty(DNSMessage.prototype, 'truncation', {
   enumerable: true,
   get: function () {
      return !!(this.flags | 0x0200);
   },
   set: function (truncated) {
      this.flags = truncated ? this.flags | 0x0200 : this.flags & 0xfdff;
   }
});
Object.defineProperty(DNSMessage.prototype, 'recursionDesired', {
   enumerable: true,
   get: function () {
      return !!(this.flags | 0x0100);
   },
   set: function (recursionDesired) {
      this.flags = recursionDesired ? this.flags | 0x0100 : this.flags & 0xfeff;
   }
});
Object.defineProperty(DNSMessage.prototype, 'recursionAvailable', {
   enumerable: true,
   get: function () {
      return !!(this.flags | 0x0080);
   },
   set: function (recursionAvailable) {
      this.flags = recursionAvailable ? this.flags | 0x0080 : this.flags & 0xff7f;
   }
});
Object.defineProperty(DNSMessage.prototype, 'responseCode', {
   enumerable: true,
   get: function () {
      return this.flags & 0x000f;
   },
   set: function (responseCode) {
      this.flags = this.flags & 0xfff0 | (responseCode & 0xf);
   }
});

//
// Google public DNS
//
dns.nameservers = ['8.8.8.8', '8.8.4.4'];
//
// options
//  ttl - in milliseconds
//  protocol - udp4, udp6
//  host
//  port
//
dns.lookup = function lookup(domain, family, options, callback) {
   if (typeof options === 'function') {
      callback = options;
      options = {};
   }
   else if (typeof family === 'function') {
      callback = family;
      family = null;
   }
   if (typeof family === 'object') {
      options = family;
      family = null;
   }
   if (!/[.]$/.test(domain)) {
      domain = domain + '.';
   }
   options = options || {};
   domain = new DNSDomain(domain);
   var done = false;
   function finish (e, addr) {
      if (done) return;
      done = true;
      socket.close();
      clearTimeout(ttl);
      callback(e, addr);
   }
   var msg = new DNSMessage();
   msg.setHeaders({
      id: Math.floor(Math.random() * 256),
      recursionDesired: true
   });
   var q;
   if (family == 4 || family === null) {
      q = new DNSQuestion(domain);
      q.rrtype = dns.RRTYPE.A;
      q.rrclass = dns.RRCLASS.IN;
      msg.questions.push(q);
   }
   if (family == 6 || family === null) {
      q = new DNSQuestion(domain);
      q.rrtype = dns.RRTYPE.AAAA;
      q.rrclass = dns.RRCLASS.IN;
      msg.questions.push(q);
   }
   if (!q) {
      throw new Error('unknown DNS family');
   }
   var socket = require('dgram').createSocket(options.protocol || 'udp4');
   var packet = msg.buffer;
   var nameserver = options.host || dns.nameservers[Math.floor(Math.random() * dns.nameservers.length)];
   var port = options.port || 53;
   socket.send(packet, 0, packet.length, port, nameserver);
   socket.on('message', function (data) {
      try {
         var reply = DNSMessage.readFromBuffer(data);
         if (reply.responseCode === 0) {
            if (reply.answers.length) {
               var answer = reply.answers[0];
               finish(null, [].slice.call(answer.data).join(answer.rrtype === dns.RRTYPE.A ? '.' : ':'));
            }
         }
         else {
            finish(new Error('server was unable to handle request (statusCode "'+reply.responseCode+'")'));
         }
      }
      catch (e) {
         finish(new Error('unable to parse response'));
      }
   });
   socket.on('close', function () {
      finish(new Error('dgram closed'));
   });
   
   var ttl = setTimeout(function () {
      finish(new Error('No response'));
   }, options.ttl || 60 * 1000);
}
