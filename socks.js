var net = require('net');
var util = require('util');

function SocksRequest(version) {
   if (arguments.length) {
      this.version = version;
      if (version === 4) {
         this.authorized = true;
      }
   }
   return this;
}
SocksRequest.readFromBuffer = function readFromBuffer(buffer, offset) {
   offset = offset || 0;
   var version = buffer.readUInt8(offset);
   offset += 1;
   if (version === 4) {
      var command = buffer.readUInt8(offset);
      offset += 1;
      var port = buffer.readUInt6BE(offset);
      offset += 2;
      var host = buffer.readUInt32BE(offset);
      offset += 4;
      var id;
      for(var i = offset; i < buffer.length; i++) {
         var c = data[i];
         if (c === 0) {
            id = data.slice(offset, offset + i);
            break;
         }
      }
      if (!id) {
         return null;
      }
      offset += i;
      //
      // Check for socks4a
      //
      var domain;
      if (host & 0x000000ff) {
         for(var i = offset; i < buffer.length; i++) {
            var c = data[i];
            if (c === 0) {
               domain = data.slice(offset, offset + i);
               break;
            }
         }
         if (!id) {
            return null;
         }
      }
      
      var req = new SocksRequest(version);
      req.port = port;
      req.host = host;
      req.id = id;
      if (domain) req.domain = domain;
      return req;
   }
   else if (version === 5) {
      var num_auth_methods = buffer.readUInt8(offset);
      offset += 1;
      var authMethods = [].slice.call(buffer.slice(offset, offset + num_auth_methods));
      var req = new SocksRequest(version);
      req.authMethods = authMethods;
      return req;
   }
   else {
      return null;
   }
}
SocksRequest.prototype.auth = function (method, stream, cb) {
   if (this.version < 5) {
      cb();
      return;
   }
   if (this.authorized) {
      cb(new Error('SocksRequest is already authorized'));
   }
   var buffer = new Buffer([this.version, method]);
   var self = this;
   stream.on('data', function readConnectionRequest(buffer) {
      var offset = 0;
      var version = buffer.readUInt8(offset);
      if (version !== self.version) {
         stream.
         stream.removeListener('data', readConnectionRequest);
         return;
      }
      offset += 1;
      var command = buffer.readUInt8(offset);
      offset += 1;
      var port = buffer.readUInt6BE(offset);
      offset += 2;
      var host = buffer.readUInt32BE(offset);
      offset += 4;
      var id;
      for(var i = offset; i < buffer.length; i++) {
         var c = data[i];
         if (c === 0) {
            id = data.slice(offset, offset + i);
            break;
         }
      }
      if (!id) {
         return null;
      }
      offset += i;
      //
      // Check for socks4a
      //
      var domain;
      if (host & 0x000000ff) {
         for(var i = offset; i < buffer.length; i++) {
            var c = data[i];
            if (c === 0) {
               domain = data.slice(offset, offset + i);
               break;
            }
         }
         if (!id) {
            return null;
         }
      }
      
      var req = new SocksRequest(version);
      req.port = port;
      req.host = host;
      req.id = id;
      if (domain) req.domain = domain;
      return req;
   })
   stream.write(buffer);
}

function SocksResponse() {
   
}

function SocksServer() {
   net.Server.call(this);
   this.on('connection', function connectionSession(conn) {
      conn.on('data', function readRequest(data) {
         var req = SocksRequest.readFromBuffer(data);
      });
   })
   return this;
}
util.inherits(SocksServer, net.Server);