var squel = require('squel');

// db
function getDateStr(date) {
  return date.getFullYear() + '-' + (date.getMonth() + 1) + '-' + date.getDate() + ' ' + 
    date.getHours() + ':' + date.getMinutes() + ':' + date.getSeconds();
}

squel.registerValueHandler(Date, function(date) {
  return getDateStr(date);
});

// str
exports.isNumeric = function(n) {
  return !isNaN(parseFloat(n)) && isFinite(n);
};

// log
exports.err = function(tag) {
  //console.error(tag, Array.prototype.slice.call(arguments, 1));
};

exports.info = function(tag, content) {
  //console.info(tag, Array.prototype.slice.call(arguments, 1));
};

exports.debug = function(tag, content) {
  //console.log(tag, Array.prototype.slice.call(arguments, 1));
};

exports.squel = squel;