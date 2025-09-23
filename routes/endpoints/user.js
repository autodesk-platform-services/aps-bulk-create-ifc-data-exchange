/////////////////////////////////////////////////////////////////////
// Copyright 2025 Autodesk Inc
// APS Bulk Create IFC Data Exchange User Endpoints
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
const { UserProfileApi } = require('forge-apis');

const { OAuth } = require('../services/oauth');

let router = express.Router();

router.get('/user/profile', async (req, res) => {
    try {
        const oauth = new OAuth(req.session);
        const internalToken = await oauth.getInternalToken();
        const user = new UserProfileApi();
        const profile = await user.getUserProfile(oauth.getClient(), internalToken);
        
        // Debug: log the profile data to see what we're getting
        
        // Check different possible field names for the user's name
        let userName = 'Unknown User';
        if (profile.body.firstName && profile.body.lastName) {
            userName = profile.body.firstName + ' ' + profile.body.lastName;
        } else if (profile.body.name) {
            userName = profile.body.name;
        } else if (profile.body.displayName) {
            userName = profile.body.displayName;
        } else if (profile.body.emailId) {
            // Use email as fallback if no name fields available
            userName = profile.body.emailId.split('@')[0];
        }
        
        res.json({
            name: userName,
            picture: profile.body.profileImages && profile.body.profileImages.sizeX40 ? profile.body.profileImages.sizeX40 : 'data:image/svg+xml;base64,PHN2ZyB3aWR0aD0iNDAiIGhlaWdodD0iNDAiIHZpZXdCb3g9IjAgMCA0MCA0MCIgZmlsbD0ibm9uZSIgeG1sbnM9Imh0dHA6Ly93d3cudzMub3JnLzIwMDAvc3ZnIj4KPHJlY3Qgd2lkdGg9IjQwIiBoZWlnaHQ9IjQwIiBmaWxsPSIjRTVFN0VCIi8+CjxjaXJjbGUgY3g9IjIwIiBjeT0iMTYiIHI9IjYiIGZpbGw9IiM5Q0E0QUYiLz4KPHBhdGggZD0iTTggMzJDOCAyNi40NzcxIDEyLjQ3NzEgMjIgMTggMjJIMjJDMjcuNTIyOSAyMiAzMiAyNi40NzcxIDMyIDMyVjMySDhWMzJaIiBmaWxsPSIjOUNBNEFGIi8+Cjwvc3ZnPgo='
        });
    } catch (error) {
        console.error('Error fetching user profile:', error);
        res.status(500).json({ error: 'Failed to fetch user profile' });
    }
});

module.exports = router;
