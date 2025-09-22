/////////////////////////////////////////////////////////////////////
// Copyright 2025 Autodesk Inc
// APS Bulk Create IFC Data Exchange
//
// Permission to use, copy, modify, and distribute this software in
// object code form for any purpose and without fee is hereby granted,
// provided that the above copyright notice appears in all copies and
// that both that copyright notice and the limited warranty and
// restricted rights notice below appear in all supporting
// documentation.
//
// AUTODESK PROVIDES THIS PROGRAM "AS IS" AND WITH ALL FAULTS.
// AUTODESK SPECIFICALLY DISCLAIMS ANY IMPLIED WARRANTY OF
// MERCHANTABILITY OR FITNESS FOR A PARTICULAR USE.  AUTODESK, INC.
// DOES NOT WARRANT THAT THE OPERATION OF THE PROGRAM WILL BE
// UNINTERRUPTED OR ERROR FREE.
/////////////////////////////////////////////////////////////////////

const express = require('express');
const session = require('express-session');

const app = express();
const server = require('http').Server(app);

// Session configuration
app.use(session({
  secret: 'aps-bulk-ifc-exchange',
  cookie: {
    httpOnly: true,
    secure: false,
    maxAge: 1000 * 60 * 60 * 24 // 24 hours
  },
  resave: false,
  saveUninitialized: true
}));

// Parse JSON request bodies
app.use(express.json({ limit: '50mb' }));

// Serve static files
app.use('/', express.static(__dirname + '/public'));

// API Routes
app.use('/api/aps', require('./routes/endpoints/oauth'));
app.use('/api/aps', require('./routes/endpoints/user'));
app.use('/api/aps', require('./routes/endpoints/datamanagement'));
app.use('/api/aps', require('./routes/endpoints/exchange'));

// Set port
app.set('port', process.env.PORT || 3000);

// Start server
server.listen(app.get('port'), function() {
});