var util = require('util');
var http = require('http');
var path = require('path');
var url = require('url');
var spawn = require('child_process').spawn;
var cgi = module.exports;

function mixin(object) {
   var toMix = Array.prototype.slice.call(arguments, 1);
   toMix.forEach(function(child) {
      Object.keys(child).forEach(function (key) {
         object[key] = child[key];
      });
   });
   return object;
}

cgi.createServer = function createServer(options) {
   return new CGIServer(options);
}

function CGIServer(options) {
   options = options || {};
   var self = this;
   Object.getPrototypeOf(CGIServer.prototype).constructor.call(this);
   this.on('request', this._onRequest);
   this.cwd = process.cwd();
   this.files = {};
   if (options.files) Object.keys(options.files).forEach(function (extension) {
      self.files[extension] = options.files[extension];
   });
   this.env = {
      SERVER_SOFTWARE: 'http-server',
      GATEWAY_INTERFACE: 'CGI/1.1'
   };
   if (options.env) Object.keys(options.env).forEach(function (variable) {
      self.env[extension] = options.env[variable];
   });
   return this;
}
util.inherits(CGIServer, http.Server);

var _listen = http.Server.prototype.listen;
CGIServer.prototype.listen = function listen() {
   var result = _listen.apply(this, arguments);
   if (!this.env.SERVER_PORT) {
      this.env.SERVER_PORT = this.address().port;
   }
   return result;
}

CGIServer.prototype._onRequest = function _onRequest(req, res) {
   var self = this;
   var env = Object.create(self.env);
   var reqUrl = url.parse(req.url);
   var parts = reqUrl.pathname.split('/');
   var cmd;
   for(var i = 0; i < parts.length; i++) {
      var part = parts[i];
      var extension = path.extname(part);
      if (self.files[extension]) {
         cmd = self.files[extension];
         i++;
         break;
      }
   }
   var scriptName = parts.slice(0, i).join('/');
   var pathInfo = i != parts.length ? parts.slice(i).join('/') : null;
   mixin(env, {
      SERVER_PROTOCOL: 'HTTP/' + req.httpVersion,
      REQUEST_METHOD: req.method,
      SCRIPT_NAME: scriptName,
      QUERY_STRING: reqUrl.query || '',
      REMOTE_ADDR: req.connection.remoteAddress,
      PATH_INFO: pathInfo || ''
   });
   env.PATH_TRANSLATED = path.join(self.cwd, path.normalize(scriptName));
   if (req.headers['content-type']) {
      env.CONTENT_TYPE = req.headers['content-type'];
   }
   if (req.headers['content-length']) {
      env.CONTENT_TYPE = req.headers['content-length'];
   }
   Object.keys(req.headers).forEach(function (header) {
      env['HTTP_' + header.replace(/\W/g,'_').toUpperCase()] = req.headers[header];
   });
   var options = {
      env: env,
      cwd: self.cwd
   };
   this.handle(req, res, options);
}

CGIServer.prototype.handle = function handle(req, res, options) {
   var bin = spawn('bash', [], options);
   var headersEnd = 0;
   var firstReturn = true;
   var firstNewline = true;
   var secondReturn = false;
   var secondNewline = false;
   var buffers = [];
   var headers;
   bin.stdout.on('data', function (data) {
      for (var i = 0; i < data.length; i++) {
         var c = data[i];
         switch(c) {
            default:
               if (secondReturn || secondNewline) {
                  headers = buffers + '' + data.slice(0, i);
                  data = data.slice(i);
                  break;
               }
               else {
                  firstReturn = false;
                  firstNewline = false;
                  secondReturn = false;
                  secondNewline = false;
               }
               break;
            case '\r'.charCodeAt(0):
               if (firstReturn) {
                  secondReturn = true;
               }
               else {
                  firstReturn = true;
               }
               break;
            case '\n'.charCodeAt(0):
               if (firstNewline) {
                  secondNewline = true;
               }
               else {
                  firstNewline = true;
               }
               break;
         }
      }
      buffers.push(data);
   });
   function finish() {
      if (!res.connection.destroyed) res.connection.end();
   }
   req.pipe(bin.stdin);
   bin.on('disconnect', finish);
   bin.on('exit', finish);
}

cgi.createServer({files:{'.cgi':'bash'}}).listen(1337);
