var async = require('async');

var db = require('../db.js');
var b = require('./basic.js');
var squel = b.squel;

var table = 'mind';
var nodeListColumns = ['id', 'name', 'subtitle', 'father', 'sort', 'type', 'importance', 'open', 
  'created_by', 'created_at', 'updated_at', 'link_to'];
var nodeDetailColumns = nodeListColumns.concat(['content']);
var updateColumns = ['name', 'subtitle', 'content', 'importance', 'open', 'link_to'];



// public:

// C:

/**
 * Add a node
 * @param {number} node.father the id of its father node
 * @param {string} node.type the type of the node
 */
exports.addNode = function(node, done) {
  b.debug('modules.nodes', '[addNode](', node, ')');

  var date = new Date();
  var userId = 'admin'; // TODO

  // do query
  async.auto({
    getSisterSort: function(done) {
      b.debug('modules.nodes', 'get sister sort');
      var query = squel.select().from(table)
        .field('sort')
        .where('father = ?', parseInt(node.father))
        .order('sort', false)
        .limit(1);

      query = query.toParam();
      b.debug('modules.nodes', query);
  
      // do query
      db.get().query(query.text, query.values, function(err, result) {
        if (err) return done(err);
        var sort = result.length === 0 ? 0 : result[0].sort;
        b.debug('modules.nodes', 'result');
        b.debug('modules.nodes', sort);
        done(null, sort);
      });
    },
    addNode: ['getSisterSort', function(results, done) {  // insert
      b.debug('modules.nodes', 'add node');
      var query = squel.insert().into(table)
        .set('name', 'new node')
        .set('father', parseInt(node.father))
        .set('type', node.type)
        .set('open', true)
        .set('sort', parseInt(results.getSisterSort) + 1)
        .set('created_by', userId)
        .set('created_at', date)
        .set('updated_at', date);

      query = query.toParam();
      b.debug('modules.nodes', query);
  
      // do query
      db.get().query(query.text, query.values, function(err, result) {
        if (err) done(err);
        b.debug('modules.nodes', 'result');
        b.debug('modules.nodes', result);
        done(null, result.insertId);
      });
    }]
  }, function(err, results) {
    if (err) done(err);
    b.debug('modules.nodes', 'results');
    b.debug('modules.nodes', results);
    done(null, results.addNode);
  });
};

// U:

/**
 * Update node
 * 
 * @param {object} node the new node detail with the id of the node 
 * need to be updated
 */
exports.updateNode = function(node, done) {
  var query = squel.update().table(table);
  console.log(node);
  node.open = node.open === 'false' ? false : true;
  for (var key in node) {
    if (updateColumns.indexOf(key) >= 0) {
      var value = node[key];
      value = b.isNumeric(value) ? parseFloat(value) : value;
      query = query.set(key, value);
    }
  }
  query = query
    .set('updated_at', new Date())
    .where('id = ?', parseInt(node.id));

  query = query.toParam();
  console.log(query);
  
  // do query
  db.get().query(query.text, query.values, function(err, result) {
    if (err) return done(err);
    done(null);
  });
};

/**
 * Move node
 *
 * @param {number} id the id of the node need to be moved
 * @param {number} fatherId the father node id of the target
 * @param {number} sisterId the node just before the target
 */
exports.moveNode = function(id, fatherId, sisterId, done) {
  var date = new Date();

  // build query
  async.waterfall([
    db.beginTransaction,
    function(conn, done) {  // get sister node sort
      if (!sisterId) return done(null, 0, conn);
      var query = squel.select().from(table)
        .where('id = ?', parseInt(sisterId));
      
      query = query.toParam();

      // do query
      conn.query(query.text, query.values, function(err, result) {
        if (err) return done(err);
        done(null, result[0].sort, conn);
      });
    },
    function(sort, conn, done) {  // adjust other node
      var query = squel.update().table(table)
        .setFields({
          'sort = sort + 1': undefined
        })
        .where('sort > ?', parseInt(sort))
        .where('father = ?', parseInt(fatherId));
      
      query = query.toParam();

      // do query
      conn.query(query.text, query.values, function(err, result) {
        if (err) return done(err);
        done(null, sort, conn);
      });
    },
    function(sort, conn, done) {  // update node
      var query = squel.update().table(table)
        .set('father', parseInt(fatherId))
        .set('sort', parseInt(sort) + 1)
        .set('updated_at', date)
        .where('id = ?', id);
      
      query = query.toParam();

      // do query
      conn.query(query.text, query.values, function(err, result) {
        if (err) return done(err);
        done(null, conn);
      });
    },
    db.commit
  ], function(err, results) {
    if (err) return done(err);
    done(null);
  });

  
};

// R:

function getNodeInListQuery(id) {
  var query = squel.select().from(table, 'm')
    .where('id = ?', parseInt(id));
  for (var index in nodeListColumns) {
    query = query.field(nodeListColumns[index]);
  }
  query = query.field(
    squel.select().field('COUNT(id) >= 1').from(table, 'c').where('c.father = m.id'), 'isParent'
  );
  query = query.field("NULLIF(content, '') IS NULL AS content_is_null");
  return query;
}

/**
 * Get all descendant nodes of a node (with certain id) until open = false or to the end
 * @param {number} id the id of the father node
 */
exports.getDescendantNodesById = function(fatherId, done) {
  fatherId = fatherId ? fatherId : 1;

  var query = getNodeInListQuery(fatherId);
  query = query.toParam();

  // query current node which id = fatherId
  db.get().query(query.text, query.values, function(err, rows) {
    if (err) return done(err);

    async.auto({
      children: function(done) {
        getChildren(rows[0], done, true);
      }
    }, function(err, results) {
      done(null, rows);
    });
  });
};

function getChildren(node, done, force) {
  async.auto({
    link: function(done) {
      if (node.type === 'link') {
        var query = getNodeInListQuery(parseInt(node.link_to));
        query = query.toParam();
        
        db.get().query(query.text, query.values, function(err, rows) {
          if (err) return done(err);
          var target = rows[0];
          node.link_to = target.id;
          node.name = target.name;
          node.subtitle = target.subtitle;
          done();
        });
      } else {
        done();
      }
    },
    children: ['link', function(retuslts, done) {
      if (node.open || force) {
        var query = squel.select().from(table, 'm')
          .where('father = ?', node.type === 'link' ? node.link_to : node.id)
          .order('sort', true);
        for (var index in nodeListColumns) {
          query = query.field(nodeListColumns[index]);
        }
        query = query.field(
          squel.select().field('COUNT(id) >= 1').from(table, 'c').where('c.father = m.id'), 'isParent'
        );
        query = query.field("NULLIF(content, '') IS NULL AS content_is_null");

        query = query.toParam();
        db.get().query(query.text, query.values, function(err, children) {
          if (err) return done(err);
          node.children = children;

          async.eachOf(children, function(child, key, done) {
            getChildren(child, done);
          }, function(err) {
            if (err) return done(err);
            done();
          });
        });
      } else {
        done();
      }
    }]
  }, function(err, results) {
    if (err) return done(err);
    done();
  });
}

function getNodeDetailQuery(id) {
  var query = getNodeInListQuery(id);
  for (var index in nodeDetailColumns) {
    query = query.field(nodeDetailColumns[index]);
  }
  return query;
}

exports.getNodeDetail = function(id, done) {
  var query = getNodeDetailQuery(id);
  query = query.toParam();

  // do query
  db.get().query(query.text, query.values, function(err, node) {
    if (err) return done(err);
    node = node[0];

    async.parallel({
      node: function(done) {
        if (node.type === 'link') {
          var query = getNodeDetailQuery(node.link_to);
          query = query.toParam();

          // do query
          db.get().query(query.text, query.values, function(err, target) {
            if (err) return done(err);
            target = target[0];
            node.content = target.node;
            node.name = target.name;
            node.subtitle = target.subtitle;
            node.content = target.content;

            done(null, node);
          });
        } else {
          done(null, node);
        }
      },
      uploads: function(done) {
        var queryUpload = squel.select().from('upload')
          .where('node = ?', parseInt(id));

        queryUpload = queryUpload.toParam();

        db.get().query(queryUpload.text, queryUpload.values, function(err, uploads) {
          if (err) return done(err);
          done(null, uploads);
        });
      }
    }, function(err, results) {
      if (err) return done(err);
      results.node.uploads = results.uploads;
      done(null, results.node);
    });
  });
};

// D:

exports.removeNode = function(id, done) {
  async.waterfall([
    function(done) {  // check if it has child nodes
      var query = squel.select().from(table)
        .where('father = ?', parseInt(id));

      query = query.toParam();

      // do query
      db.get().query(query.text, query.values, function(err, nodes) {
        if (err) return done(err);
        done(null, nodes.length > 0);
      });
    },
    function(hasChildNodes, done) {
      if (!hasChildNodes) {
        var query = squel.delete().from(table)
          .where('id = ?', parseInt(id));

        query = query.toParam();

        // do query
        db.get().query(query.text, query.values, function(err, result) {
          if (err) return done(err);
          done(null, result);
        });
      } else {
        done({
          message: 'Cannot delete a node that has child node(s)'
        });
      }
    }
  ], function(err, result) {
    if (err) return done(err);
    done(null, result);
  });
  
};
