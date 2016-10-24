var async = require('async');
var squel = require('squel');

var db = require('../db.js');

var table = 'mind';
var nodeListColumns = ['id', 'name', 'subtitle', 'father', 'sort', 'type', 'importance', 'open', 
  'created_by', 'created_at', 'updated_at'];
var nodeDetailColumns = nodeListColumns.concat(['content']);
var updateColumns = ['name', 'subtitle', 'content', 'importance', 'open'];

squel.registerValueHandler(Date, function(date) {
  return date.getFullYear() + '-' + (date.getMonth() + 1) + '-' + date.getDate() + ' ' + 
    date.getHours() + ':' + date.getMinutes() + ':' + date.getSeconds();
});

squel.registerValueHandler('boolean', function(bool) {
  return bool ? 1 : 0;
});

function isNumeric(n) {
  return !isNaN(parseFloat(n)) && isFinite(n);
}

// public:

// C:

/**
 * Add a node
 * @param {number} node.father the id of its father node
 * @param {string} node.type the type of the node
 */
exports.addNode = function(node, done) {
  var date = new Date();
  var userId = 'admin'; // TODO

  // do query
  async.auto({
    getSisterSort: function(done) {
      var query = squel.select().from(table)
        .field('sort')
        .where('father = ?', parseInt(node.father))
        .order('sort', false)
        .limit(1);

      query = query.toParam();
  
      // do query
      db.get().query(query.text, query.values, function(err, result) {
        if (err) return done(err);
        var sort = result.length === 0 ? 0 : result[0].sort;
        done(null, sort);
      });
    },
    addNode: ['getSisterSort', function(results, done) {  // insert
      var query = squel.insert().into(table)
        .set('name', 'new node')
        .set('father', parseInt(node.father))
        .set('type', node.type)
        .set('sort', parseInt(results.getSisterSort) + 1)
        .set('created_by', userId)
        .set('created_at', date)
        .set('updated_at', date);

      query = query.toParam();
  
      // do query
      db.get().query(query.text, query.values, function(err, result) {
        if (err) return done(err);
        done(null, result.insertId);
      });
    }]
  }, function(err, results) {
    if (err) return done(err);
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
  node.open = node.open === 'true' ? true : false;
  for (var key in node) {
    if (updateColumns.indexOf(key) >= 0) {
      var value = node[key];
      value = isNumeric(value) ? parseFloat(value) : value;
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

/**
 * Get all descendant nodes of a node (with certain id) until open = false or to the end
 * @param {number} id the id of the father node
 */
exports.getDescendantNodesById = function(fatherId, done) {
  fatherId = fatherId ? fatherId : 1;

  var queryCurrentNode = squel.select().from(table)
    .where('id = ?', parseInt(fatherId));
  var queryChildNodes = squel.select().from(table)
    .where('father = ?', parseInt(fatherId))
    .order('sort', true);
  for (var index in nodeListColumns) {
    queryCurrentNode = queryCurrentNode.field(nodeListColumns[index]).field("NULLIF(content, '') IS NULL AS content_is_null");
    queryChildNodes = queryChildNodes.field(nodeListColumns[index]).field("NULLIF(content, '') IS NULL AS content_is_null");
  }

  queryCurrentNode = queryCurrentNode.toParam();
  queryChildNodes = queryChildNodes.toParam();


  // query current node which id = fatherId
  db.get().query(queryCurrentNode.text, queryCurrentNode.values, function(err, fatherRows) {
    if (err) return done(err);

    // requery if it is a link
    if (fatherRows[0].type == 'link') {
      async.auto({
        link: function(done) {
          queryLinkNode(fatherRows[0], done);
        }
      }, function(err, results) {
        if (err) return done(err);
        fatherRows[0] = results.link;
      });
    }

    // query child nodes of the current node
    db.get().query(queryChildNodes.text, queryChildNodes.values, function(err, rows) {
      if (err) return done(err);
      // get child nodes of each child node by uding getChildNodes function
      async.forEach(rows, getChildNodes, function(err, results) {
        if (err) return done(err);
        fatherRows[0].children = rows;
        done(null, fatherRows);
      });
    });
  });
};

exports.getNodeDetail = function(id, done) {
  var query = squel.select().from(table)
    .where('id = ?', parseInt(id));
  for (var index in nodeDetailColumns) {
    query = query.field(nodeDetailColumns[index]);
  }

  query = query.toParam();

  // do query
  db.get().query(query.text, query.values, function(err, node) {
    if (err) return done(err);
    node = node[0];

    async.parallel({
      node: function(done) {
        if (node.type === 'link') {
          queryLinkNode(node, done);
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

// private:

/**
 * Query link node again to get all the information
 */
function queryLinkNode(node, done) {
  var query = squel.select().from(table, 'l')
    .field('l.id').field('ori.id AS link_to')
    .field('ori.name').field('ori.subtitle')
    .field('l.father').field('l.sort').field('l.open')
    .field('ori.created_by').field('ori.created_at').field('ori.updated_at')
    .field('l.created_by AS linked_by').field('l.type').field('ori.importance')
    .where('l.id = ?', parseInt(node.id))
    .right_join(table, 'ori', 'ori.id = l.name');

  query = query.toParam();
  
  db.get().query(query.text, query.values, function(err, rows) {
    if (err) return done(err);
    done(null, rows[0]);
  });
}

/**
 * Get all child nodes of a father node
 * @param {Object} node the father node
 */
function getChildNodes(node, done) {
  
  // async.auto({
  //   link: function(done) {
  //     if (node.type === 'link') {
  //       queryLinkNode(node, done);
  //     } else {
  //       done(null, node);
  //     }
  //   },
  //   children: ['link', function(results, done) {
  //     var node = results.link;
      if (node.open) {
        var queryChildNodes = squel.select().from(table)
          .where('father = ?', parseInt(node.type === 'link' ? node.name : node.id))
          .order('sort', true);
        for (var index in nodeListColumns) {
          queryChildNodes = queryChildNodes.field(nodeListColumns[index]);
        }

        queryChildNodes = queryChildNodes.toParam();

        // do query
        db.get().query(queryChildNodes.text, queryChildNodes.values, function(err, rows) {
          if (err) return done(err);
          if (rows.length === 0) {
            done();
          } else {
            node.children = rows;
            async.forEach(node.children, getChildNodes, function(err, results) {
              if (err) return done(err);
              done();
            });
          }
        });
      } else {
        var queryCountChildNodes = squel.select().from(table)
          .field('COUNT(*)')
          .where('father = ?', parseInt(node.type === 'link' ? node.name : node.id));

        queryCountChildNodes = queryCountChildNodes.toParam();

        db.get().query(queryCountChildNodes.text, queryCountChildNodes.values, function(err, rows) {
          if (err) return done(err);
          if (rows[0].count !== 0) {
            node.isParent = true;
          } else {
            node.isParent = false;
          }
          done();
        });
      }
  //   }]
  // }, function(err, results) {
  //   if (err) return done(err);
  //   done();
  // });
}