var fs = require('fs');
var assert = require('assert');
var path = require('path');
var HTTPParser = require('../lib/parser.js').HTTPParser;

var fixtures = fs.readdirSync(path.join(__dirname, 'fixtures'));

function next() {
   if (fixtures.length) {
      var fixture = fixtures.shift();
      var files = fs.readdirSync(path.join(__dirname, 'fixtures', fixture));
      if (files.indexOf('events.json') !== -1) {
         var chunks = files.filter(function (file) {
            return /\.http\.\d+$/.test(file);
         });
         if (chunks.length === 0) {
            console.error('SKIPPED: Missing data for ', fixture);
            next();
            return;
         }
         var parser = new HTTPParser();
         var events = require(path.join(__dirname, 'fixtures', fixture, 'events.json'));
         var event_index = 0;
         var event = events[event_index++];
         function handleEvent() {
            // console.log('@',event[0])
            var event_arguments = arguments;
            event.slice(1).forEach(function(expected, index) {
               var actual = event_arguments[index];
               if (Buffer.isBuffer(actual)) {
                  actual = actual + '';
               }
               assert.deepEqual(expected, actual);
            });
            event = events[event_index++];
            if (event) {
               parser.once(event[0], handleEvent);
            }
         }
         parser.once(event[0], handleEvent);
         console.log('testing', fixture);
         chunks.forEach(function (file) {
            parser.consume(fs.readFileSync(path.join(__dirname, 'fixtures', fixture, file)));
         });
         parser.finalize();
         //
         // Were we still looking for an event?
         //
         if (event) {
            console.log('--> fail')
            console.error('did not find', event, 'for', fixture);
            console.error('STATE', Object.keys(HTTPParser.STATE).filter(function (state) {
                  return HTTPParser.STATE[state] === parser.state;
               })[0]
            )
         }
         else {
            console.log('--> pass')
         }
         next();
      }
      else {
         next();
      }
   }
}
next();