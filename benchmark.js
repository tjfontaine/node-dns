var mine = require('./dns');
var theirs = require('dns');
var EventEmitter = require('events').EventEmitter;
var util = require('util');

//XXX XXX XXX I guess if you want to make it fair disable caching
// mine.platform.cache = false;
//
// results with caching
// stock took 15.838 seconds to run 10000 queries -- 631.3928526329082 queries / second
// native-dns took 0.653 seconds to run 10000 queries -- 15313.935681470137 queries / second
//
// results without caching
// stock took 15.847 seconds to run 10000 queries -- 631.0342651605982 queries / second
// native-dns took 16.688 seconds to run 10000 queries -- 599.2329817833174 queries / second

var names = [
  'www.google.com',
  'www.facebook.com',
  'www.intel.com',
  'www.amd.com',
  'www.yahoo.com',
  'www.msnbc.com',
  'www.microsoft.com',
  'www.apple.com',
  'www.youtube.com',
  'www.amazon.com',
  'www.twitter.com',
  'www.ebay.com',
  'www.ask.com',
  'www.aol.com',
];

var Bench = function(name, library, count, concurrency) {
  this.name = name;
  this.library = library;
  this.count = count;
  this.completed = 0;
  this.concurrency = concurrency;
  this.ended = false;
};
util.inherits(Bench, EventEmitter);

Bench.prototype.start = function() {
  var i, self = this;

  this.start = Date.now();

  for (i = 0; i < this.concurrency; i++) {
    process.nextTick(function() {
      self.query();
    });
  }
};

Bench.prototype.query = function() {
  var self = this;

  if (this.count <= 0) {
    this.end();
  } else {
    this.library.resolve(names[this.count % names.length], 'A', function (err, res) {
      self.done = Date.now();
      if (err) {
        self.count = 0;
        console.log(err);
        console.log(err.stack);
        self.end();
      } else {
        self.completed += 1;
        self.count -=1 ;
        self.query();
      }
    });
  }
};

Bench.prototype.end = function() {
  if (this.ended) return;

  this.ended = true;

  var total_seconds = (this.done - this.start) / 1000;
  console.log(this.name, "took", total_seconds, "seconds to run",
    this.completed, "queries --", this.completed/total_seconds,
    "queries / second");

  this.emit('end');
};

var COUNT = 10000;
var CON = 10;

var a = new Bench('stock', theirs, COUNT, CON);
var b = new Bench('native-dns', mine, COUNT, CON);

a.on('end', function() {
  var check = function() {
    if (!mine.platform.ready) {
      process.nextTick(function() {
        check();
      });
    } else {
      b.start();
    }
  }
  check();
});

a.start();
