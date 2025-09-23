/////////////////////////////////////////////////////////////////////
// Copyright 2025 Autodesk Inc
// APS Bulk Create IFC Data Exchange OAuth Endpoints
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

const config = require('../config');
const { OAuth } = require('../services/oauth');

let router = express.Router();

router.get('/callback/oauth', async (req, res, next) => {
    const { code } = req.query;
    const oauth = new OAuth(req.session);
    try {
        await oauth.setCode(code);
        res.redirect('/');
    } catch(err) {
        next(err);
    }
});

router.get('/oauth/url', (req, res) => {
    // Check if credentials are configured
    if (!config.credentials.client_id || !config.credentials.callback_url) {
        console.error('Missing APS credentials. Please set APS_CLIENT_ID and APS_CALLBACK_URL environment variables.');
        return res.status(500).json({ error: 'Server configuration error: Missing APS credentials' });
    }
    
    const url =
        'https://developer.api.autodesk.com' +
        '/authentication/v2/authorize?response_type=code' +
        '&client_id=' + config.credentials.client_id +
        '&redirect_uri=' + config.credentials.callback_url +
        '&scope=' + config.scopes.internal.join(' ');
    res.end(url);
});

router.get('/oauth/signout', (req, res) => {
    // Clear session data
    if (req.session) {
        req.session.destroy((err) => {
            if (err) {
                console.error('Error destroying session:', err);
            }
        });
    }
    
    // Clear session object
    req.session = null;
    
    // Clear cookies
    res.clearCookie('connect.sid'); // Default session cookie name
    
    res.redirect('/');
});

// Endpoint to return a 2-legged access token
router.get('/oauth/token', async (req, res, next) => {
    const oauth = new OAuth(req.session);
    if (!oauth.isAuthorized()) {
        res.status(401).end();
        return;
    }

    try {
        const accessToken = await oauth.getPublicToken();
        res.json(accessToken);
    } catch(err) {
        next(err);
    }
});

router.get('/oauth/clientId', (req, res) => {
    res.json({ clientId: config.credentials.client_id });
});

module.exports = router;
