var express = require('express');
var router = express.Router();
var fs = require('fs');
var bodyParser = require('body-parser');
var path = require('path');
var mkdirp = require('mkdirp');

var model = require('../models/nodes.js');
var upload = require('../models/upload.js');

/**
 * Get all descendant nodes of a node (with certain id) until open = false or to the end
 * @param {number} query.id the id of the father node
 */
router.get('/', function(req, res, next) {
  model.getDescendantNodesById(req.query.id, function(err, nodes) {
    if (err) return next(err);
    res.json(nodes);
  });
});

router.get('/:id', function(req, res, next) {
  model.getNodeDetail(req.params.id, function(err, node) {
    if (err) return next(err);
    res.json(node);
  });
});

router.post('/add', function(req, res, next) {
  model.addNode(req.body, function(err, insertId) {
    if (err) return next(err);
    res.json({
      err: false,
      id: insertId
    });
  });
});

router.post('/update', function(req, res, next) {
  model.updateNode(req.body, function(err, result) {
    if (err) return next(err);
    res.json({
      err: false,
      id: req.body.id,
      tId: req.body.tId
    });
  });
});

router.post('/move', function(req, res, next) {
  model.moveNode(req.body.id, req.body.father, req.body.sister, function(err, result) {
    if (err) return next(err);
    res.json({
      err: false,
      id: req.body.id,
      tId: req.body.tId
    });
  });
});

router.delete('/:id', function(req, res, next) {
  model.removeNode(req.params.id, function(err, result) {
    if (err) return next(err);
    res.json({
      err: false,
      id: req.body.id,
      tId: req.body.tId
    });
  });
});

var UPLOAD_PATH = path.join(__dirname, '../upload');

router.post('/upload', function(req, res, next) {
  var ext = path.extname(req.headers['x-file-name']);
  req.query.ext = ext;
  upload.addUpload(req.query, function(err, result) {
    if (err) return next(err);

    var filepath = path.join(UPLOAD_PATH, req.query.type, result.toString().substr(-1));
    mkdirp(filepath, function(err) {
      if (err) return next(err);
      
      var filename = result + ext;
      var wstream = fs.createWriteStream(path.join(filepath, filename));
      wstream.write(req.body);
      wstream.end();

      res.json({
        err: false,
        id: result
      });
    });
  });
});

router.get('/upload/:id', function(req, res, next) {
  upload.getUpload(req.params.id, function(err, upload) {
    if (err) return next(err);

    var filepath = path.join(UPLOAD_PATH, upload.type, req.params.id.toString().substr(-1));
    console.log(path.join(filepath, req.params.id + upload.ext));
    res.sendFile(path.join(filepath, req.params.id + upload.ext));
  });
});

module.exports = router;
