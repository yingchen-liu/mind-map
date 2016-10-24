var mysql = require('mysql');
var async = require('async');

var PRODUCTION_DB = 'mind';
var TEST_DB = 'test_mind';

exports.MODE_TEST = 'mode_test';
exports.MODE_PRODUCTION = 'mode_production';

var state = {
  pool: null,
  mode: null,
};

exports.connect = function(mode, done) {
  state.pool = mysql.createPool({
    host: 'localhost',
    user: 'root',
    password: 'root',
    database: mode === exports.MODE_PRODUCTION ? PRODUCTION_DB : TEST_DB
  });

  state.mode = mode;
  done();
};

exports.get = function() {
  return state.pool;
};

exports.beginTransaction = function(done) {
  state.pool.getConnection(function(err, conn) {
    if (err) return done(err);

    conn.beginTransaction(function(err) {
      if (err) {
        conn.rollback(function() {
          done(err);
        });
      }
      done(null, conn);
    });
  });
};

exports.commit = function(conn, done) {
  conn.commit(function(err) {
    if (err) {
      return conn.rollback(function() {
        done(err);
        conn.release();
      });
    }
    conn.release();
    done(null, conn);
  });
};

exports.fixtures = function(data) {
  var pool = state.pool;
  if (!pool) return done(new Error('Missing database connection.'));

  var names = Object.keys(data.tables);
  async.each(names, function(name, cb) {
    async.each(data.tables[name], function(row, cb) {
      var keys = Object.keys(row);
      var values = keys.map(function(key) { return "'" + row[key] + "'"; });

      pool.query('INSERT INTO ' + name + ' (' + keys.join(',') + ') VALUES (' + values.join(',') + ')', cb);
    }, cb);
  }, done);
};

exports.drop = function(tables, done) {
  var pool = state.pool;
  if (!pool) return done(new Error('Missing database connection.'));

  async.each(tables, function(name, cb) {
    pool.query('DELETE * FROM ' + name, cb);
  }, done);
};