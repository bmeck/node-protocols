#!/usr/bin/env node
//
//  WHOIS
//  - node-protocols API
//  - standard port is 43
//
//  RFC http://tools.ietf.org/html/rfc2167
//
//  //
//  // get ready to send request
//  //
//  function sendRequest() {
//    var lookup = whois.lookup('Alan', {
//      host: 'localhost',
//      port: 1337
//    });
//    lookup.on('data', function (data) {
//      process.stdout.write(data);
//    });
//    lookup.on('end', function () {
//      server.close();
//    });
//  }
//  
//  //
//  // simple dummy server
//  //
//  var server = whois.createServer(function (id, conn) {
//    conn.write('I don\'t know a ' + id);
//    conn.end();
//  });
//  //
//  // preventing overbuffering
//  //
//  server.on('buffer.id', function (id, stream) {
//    if (id.length > 1024) conn.end();
//  });
//  //
//  // send request once we are listening
//  //
//  server.listen(1337, sendRequest);
//
  

var net = require('net');
var util = require('util');
var whois = exports;

whois.createServer = function createServer(requestCallback) {
   var server = new WhoisServer();
   if (typeof requestCallback === 'function') {
      server.on('request', requestCallback);
   }
   return server;
}

function WhoisServer() {
   var self = this;
   net.Server.call(self);
   self.on('connection', function setupIdReading(conn) {
      var id = '';
      conn.on('data', function (buff) {
         id += buff + '';
         self.emit('buffer.id', id, conn);
         if (!conn.writable) return;
         var index = id.indexOf('\r\n');
         if (index != -1) {
            id = id.slice(0, index);
            self.emit('request', id, conn);
         }
      });
   })
   return self;
}
util.inherits(WhoisServer, net.Server);

whois.lookup = function lookup(id, options) {
   options = options || {};
   if (!options.host) {
      options.host = id.match(/[.][^.]*$/).toString().slice(1) + '.whois-servers.net';
   }
   var conn = net.createConnection(options.port || 43, options.host, function sendId() {
      conn.write(id + '\r\n');
   });
   return conn;
}
