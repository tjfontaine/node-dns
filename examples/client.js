"use strict";

var dns = require('../dns');

var request = dns.resolve('www.google.com', function (err, results) {
  var i;
  if (!err) {
    for (i = 0; i < results.length; i++) {
      console.log('www.google.com', results[i]);
    }
  } else {
    console.log(err);
  }
});

request = dns.lookup('www.yahoo.com', function (err, family, result) {
  console.log('www.yahoo.com', family, result);
});

request = dns.resolveMx('microsoft.com', function (err, results) {
  results.forEach(function (result) {
    console.log(result);
  });
});

request = dns.resolveTxt('aol.com', function (err, results) {
  results.forEach(function (result) {
    console.log('aol.com txt:', result);
  });
});
