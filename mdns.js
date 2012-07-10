#!/usr/bin/env node
//
//  MDNS
//  - node-protocols API
//  - default port is 5353
//  - default broadcast is 224.0.0.251 and FF02::FB
//
//  function sendRequest() {
//    mdns.discover('_http._tcp.local.', function (err, response) {
//      console.log(response.addresses + ' port ' + response.service.port);
//    });
//  }
//  
//  //
//  // simple dummy server
//  //
//  var server = mdns.createServer(function (req, res) {
//    var domain = new dns.DNSDomain('simple http');
//    var data = new ServiceData(0, 0, 80, domain);
//    var rr = new dns.ResourceRecord(req.questions[0].domain, data.buffer);
//    rr.rrtype = req.questions[0].rrtype;
//    rr.rrclass = req.questions[0].rrclass;
//    res.answers.push(rr);
//    var rr = new dns.ResourceRecord(req.questions[0].domain, new Buffer([127,0,0,1]));
//    rr.rrtype = req.questions[0].rrtype;
//    rr.rrclass = req.questions[0].rrclass;
//    res.additional.push(rr);
//    res.end();
//  });
//  //
//  // send request once we are listening
//  //
//  server.listen(1337, sendRequest)
//

var dns = require('./dns.js');
var dgram = require('dgram');
var EventEmitter = require('events').EventEmitter;
var util = require('util');
var mdns = exports;

mdns.createServer = function createServer(requestCallback) {
   var server = new MDNSServer();
   if (typeof lookupCallback === 'function') {
      server.on('request', requestCallback);
   }
   return server;
}
function MDNSServer() {
   Object.getPrototypeOf(MDNSServer.prototype).constructor.call(this);
   return this;
}
util.inherits(MDNSServer, EventEmitter);
mdns.MDNSServer = MDNSServer;
MDNSServer.prototype.listen = function (port, address, callback) {
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
      console.error(arguments)
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

function ServiceData(priority, weight, port, domain) {
   if (arguments.length) {
      var buffer = this.buffer = new Buffer(2 + 2 + 2 + target.length);
      buffer.writeUInt16BE(priority, 0);
      buffer.writeUInt16BE(weight, 2);
      buffer.writeUInt16BE(port, 4);
      this.target = domain;
      this.target.buffer.copy(buffer, 2 + 2 + 2);
   }
   return this;
}
ServiceData.readFromBuffer = function (buff, originalOffset, referenceBuffer) {
   var srv = new ServiceData();
   var offset = originalOffset || 0;
   buff.readUInt16BE(offset);
   offset += 2;
   buff.readUInt16BE(offset);
   offset += 2;
   buff.readUInt16BE(offset);
   offset += 2;
   srv.target = dns.DNSDomain.readFromBuffer(buff, offset, referenceBuffer);
   srv.buffer = buff.slice(originalOffset, offset);
   return srv;
}
Object.defineProperty(ServiceData.prototype, 'target', {
   enumerable: true,
   value: null
});
Object.defineProperty(ServiceData.prototype, 'buffer', {
   enumerable: true,
   value: null
});
Object.defineProperty(ServiceData.prototype, 'length', {
   enumerable: true,
   get: function () {
      return this.buffer.length;
   }
});
Object.defineProperty(ServiceData.prototype, 'priority', {
   enumerable: true,
   get: function () {
      return this.buffer.readUInt16BE(0);
   }
});
Object.defineProperty(ServiceData.prototype, 'weight', {
   enumerable: true,
   get: function () {
      return this.buffer.readUInt16BE(2);
   }
});
Object.defineProperty(ServiceData.prototype, 'port', {
   enumerable: true,
   get: function () {
      return this.buffer.readUInt16BE(4);
   }
});


mdns.createMDNSQuery = function (service) {
   var msg = new dns.DNSMessage();
   return msg;
}
mdns.createMDNSSocket = function (protocol, port) {
   var socket=require('dgram').createSocket(protocol || 'udp4');
   socket.bind(port || 0);
   socket.setBroadcast(true);
   return socket;
}
mdns.discover = function (name, callback) {
   if (typeof family === 'function') {
      callback = family;
      family = null;
   }
   var id = Math.floor(Math.random() * 256);
   var domain = name;
   var done = false;
   function finish (e, addr) {
      if (done) return;
      done = true;
      socket.close();
      clearTimeout(ttl);
      callback(e, addr);
   }
   var msg = mdns.createMDNSQuery();
   msg.id = 0;
   var q = new dns.DNSQuestion(new dns.DNSDomain(name));
   q.rrclass = dns.RRCLASS.IN;
   q.rrtype = dns.RRTYPE.PTR;
   msg.questions.push(q);
   var socket = mdns.createMDNSSocket();
   var packet = msg.buffer;
                  console.error('224.0.0.251', 5353)
   socket.send(packet, 0, packet.length, 5353, '224.0.0.251');
   socket.on('message', function (data, addr) {
      try {
         var reply = dns.DNSMessage.readFromBuffer(data);
         if (reply.responseCode === 0) {
            if (reply.answers.length) {
               var answer = reply.answers[0];
               var name = dns.DNSDomain.readFromBuffer(answer.data, 0, data);
               var result = {
                  name: name
               }
               reply.additional.forEach(function (additional) {
                  var rrtype = additional.rrtype;
                  var isA = rrtype == dns.RRTYPE.A;
                  if (isA || rrtype == dns.RRTYPE.AAAA) {
                     result.addresses = result.addresses || [];
                     result.addresses.push([].slice.call(additional.data).join(isA ? '.' : ':'));
                  }
                  else if (rrtype == dns.RRTYPE.SRV) {
                     result.service = ServiceData.readFromBuffer(additional.data, 0, data);
                  }
               });
               if (result.addresses && result.service) {
                  finish(null, result);
               }
               else if (!result.addresses && result.service) {
                  var msg = mdns.createMDNSQuery();
                  var q;
                  q = new dns.DNSQuestion(result.service.target.string);
                  q.rrtype = dns.RRTYPE.A;
                  q.rrclass = dns.RRCLASS.IN;
                  msg.questions.push(q);
                  q = new dns.DNSQuestion(result.service.target.string);
                  q.rrclass = dns.RRCLASS.IN;
                  q.rrtype = dns.RRTYPE.AAAA;
                  msg.questions.push(q);
                  var socket = mdns.createMDNSSocket();
                  var packet = msg.buffer;
                  socket.send(packet, 0, packet.length, 5353, '224.0.0.251');
                  socket.on('message', function (data) {
                     var reply = dns.DNSMessage.readFromBuffer(data);
                     if (reply.responseCode === 0) {
                        if (reply.answers.length) {
                           var answer = reply.answers[0];
                           finish(null, [].slice.call(answer.data).join(answer.rrtype === dns.RRTYPE.A ? '.' : ':'));
                        }
                     }
                     else {
                        finish(new Error('server was unable to handle request (statusCode "'+reply.responseCode+'")'));
                     }
                  })
               }
               else {
                  finish(new Error('Message did not contain service to query for address'));
               }
            }
         }
         else {
            finish(new Error('server was unable to handle request (statusCode "'+reply.responseCode+'")'));
         }
      }
      catch (e) {
         finish(new Error('unable to parse response'), e);
      }
   });
   socket.on('close', function () {
      finish(new Error('dgram closed'));
   });
   
   var ttl = setTimeout(function () {
      finish(new Error('No response'));
   }, 60 * 1000);
}

  function sendRequest() {
    mdns.discover('_http._tcp.local.', function (err, response) {
      console.log(response.addresses + ' port ' + response.service.port);
    });
  }
  
  //
  // simple dummy server
  //
  var server = mdns.createServer(function (req, res) {
   console.error(arguments)
    var domain = new dns.DNSDomain('simple http');
    var data = new ServiceData(0, 0, 80, domain);
    var rr = new dns.ResourceRecord(req.questions[0].domain, data.buffer);
    rr.rrtype = req.questions[0].rrtype;
    rr.rrclass = req.questions[0].rrclass;
    res.answers.push(rr);
    var rr = new dns.ResourceRecord(req.questions[0].domain, new Buffer([127,0,0,1]));
    rr.rrtype = req.questions[0].rrtype;
    rr.rrclass = req.questions[0].rrclass;
    res.additional.push(rr);
    res.end();
  });
  //
  // send request once we are listening
  //
  server.listen(5353, '224.0.0.251', sendRequest)
  
  s = dgram.createSocket('udp4', console.log);
  s.bind(5355,'224.0.0.251');
  s.setBroadcast(true);
  
  s2 = dgram.createSocket('udp4', console.log);
  s2.bind(0);
  s2.setBroadcast(true);
  s2.send(new Buffer('hello'),0,5,5355,'224.0.0.251');
  