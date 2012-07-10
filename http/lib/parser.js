var util = require('util');
var EventEmitter = require('events').EventEmitter;
var uid = 0;
exports.HTTPParser = HTTPParser;
function HTTPParser() {
   this.state = HTTPParser.STATE.READING_METHOD;
   this.comment_depth = 0;
   this.reading_string = false;
   this.reading_quote = false;
   this.saw_carraige = false;
   this.saw_newline = false;
   this.buffers = [];
   this.start = 0;
   this.save = true;
   this.key = '';
   this.chunked = false;
   this.chunk_length = 0;
   this.content_length = null;
   this.content_read = 0;
   
   this.method = '';
   this.uri = '';
   this.protocol = '';
   
   return this;
}
util.inherits(HTTPParser, EventEmitter);

//
// inlineable helpers
//
function code(c) {
   return c.charCodeAt(0);
}
function isChar(charCode) {
   return charCode <= 127;
}
function isUpperCase(charCode) {
   return charCode >= code('A') && charCode <= code('Z');
}
function isLowerCase(charCode) {
   return charCode >= code('a') && charCode <= code('z');
}
function isAlpha(charCode) {
   return isLowerCase(charCode) || isUpperCase(charCode);
}
function isDigit(charCode) {
   return charCode >= code('0') && charCode <= code('9');
}
function isControl(charCode) {
   return charCode <= 31 || charCode === 127;
}
function isHorizontalTab(charCode) {
   return charCode === code('\x09');
}
function isWhitespace(charCode) {
   return charCode === code(' ') || isHorizontalTab(charCode);
}
function isText(charCode) {
   return charCode === '\x09' || !isControl(charCode);
}
function isHexidecimal(charCode) {
   return (charCode >= code('0') && charCode <= code('9'))
   || (charCode >= code('a') && charCode <= code('f'))
   || (charCode >= code('A') && charCode <= code('F'));
}
function isSeparator(charCode) {
   // : ; < = > ? @
   return (charCode >= code(':') && charCode <= code('@'))
   // [ \ ]
   || (charCode >= code('[') && charCode <= code(']'))
   || charCode === '"'
   || charCode === ','
   || charCode === '/'
   || charCode === '('
   || charCode === ')'
   || charCode === '{'
   || charCode === '}'
   || charCode === ' '
   || charCode === '\x09';
}
function isToken(charCode) {
   return !(isControl(charCode) || isSeparator(charCode));
}

HTTPParser.prototype._error = function error(msg, charCode) {
   this.state = HTTPParser.STATE.ERROR;
   this.emit('error', new Error(msg), charCode);
}

HTTPParser.prototype.value = function (tail) {
   var value = this.buffers.join('') + tail;
   this.buffers = [];
   this.save = false;
   return value;
}

HTTPParser.prototype.consume = function consume(buffer) {
   var self = this;
   function handleHeader(value) {
      var key = self.key.toLowerCase();
      self.key = '';
      if (key === 'transfer-encoding') {
         if (self.chunked) {
            return 'cannot have multiple transfer-encoding headers';
         }
         if (value === 'chunked') {
            self.chunked = true;
         }
      }
      else if (key === 'content-length') {
         if (self.content_length !== null) {
            return 'cannot have multiple content-length headers';
         }
         self.content_length = +value;
         if (isNaN(this.content_length)) {
            return 'invalid content-length';
         }
      }
      self.emit('header', key, value);
      return '';
   }
   function readNewline(charCode) {
      // console.trace()
      if (charCode === code('\n')) {
         if (self.saw_newline) {
            self.state = HTTPParser.STATE.READING_BODY;
            self.emit('body.start');
         }
         else {
            self.saw_newline = true;
            self.state = HTTPParser.STATE.READING_HEADER_NAME_START;
         }
         return true;
      }
      else if (charCode !== code('\r')) {
         if (isToken(charCode)) {
            self.state = HTTPParser.STATE.READING_HEADER_NAME;
            start = i;
            self.saw_carraige = false;
            self.saw_newline = false;
            return true;
         }
         self._error('unexpected character while looking for newline');
         return false;
      }
      else {
         if (self.saw_carraige && !self.saw_newline) {
            if (self.key) {
               var value = self.value(buffer.slice(start, i - 1));
               handleHeader(value);
            }
            self.state = HTTPParser.STATE.READING_BODY;
            self.emit('body.start');
         }
         else {
            self.saw_carraige = true;
         }
         return true;
      }
   }
   if (this.state === HTTPParser.STATE.READING_BODY) {
      this.emit('data', buffer);
   }
   var start = 0;
   var end = 0;
   for(var i = 0; i < buffer.length; i++) {
      var charCode = buffer[i];
      // console.error(charCode, String.fromCharCode(charCode))
      switch (this.state) {
         case HTTPParser.STATE.READING_METHOD:
            if (charCode === code(' ')) {
               this.state = HTTPParser.STATE.READING_URL;
               this.protocol = this.value(buffer.slice(start, i));
            }
            else if (!isToken(charCode)) return this._error('Invalid method character');
            break;
         case HTTPParser.STATE.READING_URL:
            if (charCode === code(' ')) {
               this.state = HTTPParser.STATE.READING_HTTP;
               this.uri = this.value(buffer.slice(start, i));
            }
            else if (!isToken(charCode)) return this._error('Invalid url character');
            break;
         case HTTPParser.STATE.READING_HTTP:
            if (!isToken(charCode)) {
               if (readNewline(charCode)) {
                  this.protocol = this.protocol || this.value(buffer.slice(start, i));
                  break;
               }
               return this._error('Invalid protocol character');
            }
            else if (this.saw_carraige) {
               readNewline(charCode);
            }
            break;
         case HTTPParser.STATE.READING_HEADER_NAME_START:
            if (isWhitespace(charCode)) {
               if (this.key) this.state = HTTPParser.STATE.READING_HEADER_VALUE_START;
               else return this._error('Invalid point for leading white space character');
            }
            else {
               if (this.key) {
                  var value = this.value(buffer.slice(start, end));
                  handleHeader(value);
                  end = 0;
               }
            }
            if (!isToken(charCode)) {
               if (readNewline(charCode)) {
                  if (this.state === HTTPParser.STATE.READING_BODY) {
                     start = i + 1;
                     var remaining = buffer.length - start;
                     var hasLength = this.content_length !== null;
                     if (hasLength && remaining < this.content_length) {
                        end = buffer.length;
                        this.content_length -= remaining;
                     }
                     else {
                        if (!hasLength) {
                           this.emit('data', buffer.slice(start));
                        }
                        else if (remaining) {
                           this.emit('data', buffer.slice(start, start + this.content_length));
                        }
                        if (hasLength && remaining > this.content_length) {
                           this._error('too much content');
                        }
                        else {
                           this.emit('body.end');
                        }
                     }
                     return undefined;
                  }
               }
               else return this._error('Invalid character when starting header name');
            }
            else {
               this.state = HTTPParser.STATE.READING_HEADER_NAME;
               start = i;
               this.save = true;
               this.saw_newline = false;
               this.saw_carraige = false;
            }
            break;
         case HTTPParser.STATE.READING_HEADER_NAME:
            if (!isToken(charCode)) {
               if (charCode === code(':')) {
                  this.key = this.value(buffer.slice(start, i));
                  this.state = HTTPParser.STATE.READING_HEADER_VALUE_START;
               }
               else return this._error('Invalid header character');
            }
            break;
         case HTTPParser.STATE.READING_HEADER_VALUE_START:
            if (isWhitespace(charCode)) break;
            this.state = HTTPParser.STATE.READING_HEADER_VALUE;
            start = i;
            this.save = true;
         case HTTPParser.STATE.READING_HEADER_VALUE:
            if (this.reading_quote) {
               this.reading_quote = false;
            }
            else if (this.reading_string && charCode === code('\\')) {
               this.reading_quote = true;
               this.buffers[this.buffers.length] = buffer.slice(start, i);
               start = i;
               break;
            }
            else if (!isText(charCode)) {
               if (charCode === code('"')) {
                  if (this.reading_string) {
                     this.reading_string = false;
                  }
                  else {
                     this.reading_string = true;
                  }
               }
               else if (isSeparator(charCode)) {
                  break;
               }
               else if (readNewline(charCode)) {
                  end = end || i;
               }
            }
            break;
      }
   }
   if (this.save) {
      this.buffers = this.buffers.concat(buffer.slice(start));
   }
   return undefined;
}
HTTPParser.prototype.finalize = function finalize() {
   if (this.state !== HTTPParser.STATE.READING_BODY) {
      this._error('unexpected end');
   }
}
HTTPParser.STATE = {
   READING_METHOD: ++uid,
   READING_URL: ++uid,
   READING_HTTP: ++uid,
   //
   // Check newlines
   //
   READING_HEADER_NAME_START: ++uid,
   READING_HEADER_NAME: ++uid,
   //
   // Consume leading whitespace
   //
   READING_HEADER_VALUE_START: ++uid,
   READING_HEADER_VALUE: ++uid,
   READING_BODY: ++uid,
   
   ERROR: ++uid
}
