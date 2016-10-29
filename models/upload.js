var async = require('async');

var db = require('../db.js');
var basic = require('./basic.js');
var squel = basic.squel;

var table = 'upload';
var columns = ['id', 'node', 'name', 'description', 'uploaded_at', 'uploaded_by', 'type'];
var updateColumns = ['name', 'description'];

// public:

// C:

/**
 * Add a upload
 */
exports.addUpload = function(upload, done) {
  var date = new Date();
  var userId = 'admin'; // TODO

  var query = squel.insert().into(table)
    .set('node', parseInt(upload.node))
    .set('type', upload.type)
    .set('uploaded_by', userId)
    .set('uploaded_at', date)
    .set('updated_at', date)
    .set('ext', upload.ext);

  query = query.toParam();
  
  // do query
  db.get().query(query.text, query.values, function(err, result) {
    if (err) return done(err);
    done(null, result.insertId);
  });
};

exports.getUpload = function(id, done) {
  var query = squel.select().from(table)
    .where('id = ?', parseInt(id));

  query = query.toParam();
  
  // do query
  db.get().query(query.text, query.values, function(err, upload) {
    if (err) return done(err);
    done(null, upload[0]);
  });
};