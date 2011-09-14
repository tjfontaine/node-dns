var dns = require('../dns')

dns.resolve('www.google.com', function(err, results) {
  if (!err) {
    for (var i in results) {
      console.log(results[i].name, results[i].address)
    }
  } else {
    console.log(err)
  }
  process.exit()
})
