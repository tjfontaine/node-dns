var dns = require('../dns')

var request = dns.resolve('www.google.com', function(err, results) {
  if (!err) {
    for (var i in results) {
      console.log('www.google.com', results[i])
    }
  } else {
    console.log(err)
  }
})

request = dns.lookup('www.yahoo.com', function(err, family, result) {
  console.log('www.yahoo.com', 4, result)
})
