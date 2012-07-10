#!/usr/bin/env node
//
//  DHCP
//  - node-protocols API
//  - standard server port is 67
//
var dgram = require('dgram');
var dhcp = exports;

dhcp.BOOTREQUEST = 1;
dhcp.BOOTREPLY = 2;

dhcp.HTYPES = {
   ETHERNET: 1,
   IEEE802: 6
}
dhcp.HLENS = {
   ETHERNET: 6,
   IEEE802: 6
}

dhcp.createServer = function createServer() {
   var server = new DHCPServer();
   return server;
}

function DHCPServer() {
   var self = this;
   dgram.Socket.call(self);
   server.on('message', function checkMessage(buff) {
      var msg = new DHCPMessage(buff);
      if (msg.op === dhcp.BOOTREQUEST) {
         self.emit('request', msg, new DHCPReply(msg, self));
      }
   });
   return self;
}

function DHCPMessage(buffer) {
   this.buffer = buffer;
   // 99, 130, 83 and 99
}
// DHCPMessage.prototype.op =
Object.defineProperty(DHCPMessage.prototype, 'op', {
   enumerable: true,
   get: function getOp() {
      return this.buffer.readUInt8(0);
   }
});
// DHCPMessage.prototype.htype =
Object.defineProperty(DHCPMessage.prototype, 'htype', {
   enumerable: true,
   get: function getHtype() {
      return this.buffer.readUInt8(1);
   }
});
// DHCPMessage.prototype.hlen =
Object.defineProperty(DHCPMessage.prototype, 'hlen', {
   enumerable: true,
   get: function getHlen() {
      return this.buffer.readUInt8(2);
   }
});
// DHCPMessage.prototype.hops =
Object.defineProperty(DHCPMessage.prototype, 'hops', {
   enumerable: true,
   get: function getHops() {
      return this.buffer.readUInt8(3);
   }
});
// DHCPMessage.prototype.xid =
Object.defineProperty(DHCPMessage.prototype, 'xid', {
   enumerable: true,
   get: function getXid() {
      return this.buffer.readUInt32BE(4);
   }
});
// DHCPMessage.prototype.secs =
Object.defineProperty(DHCPMessage.prototype, 'sec', {
   enumerable: true,
   get: function getSecs() {
      return this.buffer.readUInt16BE(8);
   }
});
// DHCPMessage.prototype.flags =
Object.defineProperty(DHCPMessage.prototype, 'flags', {
   enumerable: true,
   get: function getFlags() {
      return this.buffer.readUInt16BE(10);
   }
});
// DHCPMessage.prototype.ciaddr =
Object.defineProperty(DHCPMessage.prototype, 'ciaddr', {
   enumerable: true,
   get: function getCiaddr() {
      return this.buffer.readUInt32BE(12);
   }
});
// DHCPMessage.prototype.yiaddr =
Object.defineProperty(DHCPMessage.prototype, 'yiaddr', {
   enumerable: true,
   get: function getYiaddr() {
      return this.buffer.readUInt32BE(16);
   }
});
// DHCPMessage.prototype.siaddr =
Object.defineProperty(DHCPMessage.prototype, 'siaddr', {
   enumerable: true,
   get: function getSiaddr() {
      return this.buffer.readUInt32BE(20);
   }
});
// DHCPMessage.prototype.giaddr =
Object.defineProperty(DHCPMessage.prototype, 'giaddr', {
   enumerable: true,
   get: function getGiaddr() {
      return this.buffer.readUInt32BE(24);
   }
});
// DHCPMessage.prototype.chaddr =
Object.defineProperty(DHCPMessage.prototype, 'chaddr', {
   enumerable: true,
   get: function getChaddr() {
      return this.buffer.slice(28, 44);
   }
});
// DHCPMessage.prototype.sname =
Object.defineProperty(DHCPMessage.prototype, 'sname', {
   enumerable: true,
   get: function getSname() {
      return this.buffer.slice(44, 108);
   }
});
// DHCPMessage.prototype.file =
Object.defineProperty(DHCPMessage.prototype, 'file', {
   enumerable: true,
   get: function getFile() {
      return this.buffer.slice(108, 236);
   }
});
// DHCPMessage.prototype.options =
Object.defineProperty(DHCPMessage.prototype, 'options', {
   enumerable: true,
   get: function getOptions() {
      //
      // Skip the magic cookie
      //
      return this.buffer.slice(240);
   }
});


function DHCPReply(msg, server) {
   this.req = msg;
   this.server = server;
}
DHCPReply.prototype.end = function () {}

