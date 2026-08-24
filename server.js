const cds = require('@sap/cds');
const express = require('express');
const path = require('path');

cds.on('bootstrap', (app) => {
  // Serve static files from app folder
  app.use(express.static(path.join(__dirname, 'app')));
  
  // Redirect root / to /dashboard/index.html
  app.get('/', (req, res, next) => {
    if (req.path === '/') {
      return res.redirect('/dashboard/index.html');
    }
    next();
  });
});

module.exports = cds.server;
