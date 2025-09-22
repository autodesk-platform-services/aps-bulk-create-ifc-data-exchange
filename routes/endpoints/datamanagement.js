/////////////////////////////////////////////////////////////////////
// Copyright 2025 Autodesk Inc
// APS Bulk Create IFC Data Exchange - Data Management
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
const { HubsApi, ProjectsApi, FoldersApi, ItemsApi } = require('forge-apis');

const { OAuth } = require('../services/oauth');

let router = express.Router();

// Get latest IFC version for an item
router.get('/datamanagement/item/:projectId/:itemId/latest-ifc', async (req, res) => {
    const { projectId, itemId } = req.params;
    
    try {
        const oauth = new OAuth(req.session);
        const internalToken = await oauth.getInternalToken();
        const items = new ItemsApi();
        const versions = await items.getItemVersions(projectId, itemId, {}, oauth.getClient(), internalToken);
        
        // Filter to only IFC versions and get the latest one
        const ifcVersions = versions.body.data.filter((version) => {
            const displayName = version.attributes.displayName || '';
            const name = version.attributes.name || '';
            const fileName = version.attributes.fileName || '';
            
            return isIfcFile(displayName) || isIfcFile(name) || isIfcFile(fileName);
        });
        
        if (ifcVersions.length === 0) {
            return res.status(404).json({ error: 'No IFC versions found for this item' });
        }
        
        // Get the latest version (first in the array, as they're typically sorted by date)
        const latestVersion = ifcVersions[0];
        const based64Urn = (latestVersion.relationships != null && latestVersion.relationships.derivatives != null ? 
                           latestVersion.relationships.derivatives.data.id : null);
        
        res.json({
            id: latestVersion.id,
            urn: based64Urn,
            projectId: projectId,
            displayName: latestVersion.attributes.displayName || latestVersion.attributes.name,
            lastModified: latestVersion.attributes.lastModifiedTime,
            lastModifiedBy: latestVersion.attributes.lastModifiedUserName
        });
        
    } catch (error) {
        console.error('Error getting latest IFC version:', error);
        res.status(500).json({ error: 'Failed to get latest IFC version' });
    }
});

router.get('/datamanagement', async (req, res) => {
    // The id querystring parameter contains what was selected on the UI tree, make sure it's valid
    const href = decodeURIComponent(req.query.id);
    if (href === '') {
        res.status(500).end();
        return;
    }

    // Check if this is a folders-only request (for folder selection modal)
    const foldersOnly = req.query.foldersOnly === 'true';

    // Get the access token
    const oauth = new OAuth(req.session);
    const internalToken = await oauth.getInternalToken();
    if (href === '#') {
        // If href is '#', it's the root tree node
        getHubs(oauth.getClient(), internalToken, res);
    } else {
        // Otherwise let's break it by '/'
        const params = href.split('/');
        const resourceName = params[params.length - 2];
        const resourceId = params[params.length - 1];
        switch (resourceName) {
            case 'hubs':
                getProjects(resourceId, oauth.getClient(), internalToken, res);
                break;
            case 'projects':
                // For a project, first we need the top/root folder
                const hubId = params[params.length - 3];
                getFolders(hubId, resourceId/*project_id*/, oauth.getClient(), internalToken, res);
                break;
            case 'folders':
                {
                    const projectId = params[params.length - 3];
                    if (foldersOnly) {
                        getFolderContentsOnlyFolders(projectId, resourceId/*folder_id*/, oauth.getClient(), internalToken, res);
                    } else {
                        getFolderContents(projectId, resourceId/*folder_id*/, oauth.getClient(), internalToken, res);
                    }
                    break;
                }
            case 'items':
                {
                    const projectId = params[params.length - 3];
                    // Return empty array since we don't want to show versions in hierarchy
                    res.json([]);
                    break;
                }
        }
    }
});

async function getHubs(oauthClient, credentials, res) {
    const hubs = new HubsApi();
    const data = await hubs.getHubs({}, oauthClient, credentials);
    res.json(data.body.data.map((hub) => {
        let hubType;
        switch (hub.attributes.extension.type) {
            case 'hubs:autodesk.core:Hub':
                hubType = 'hubs';
                break;
            case 'hubs:autodesk.a360:PersonalHub':
                hubType = 'personalHub';
                break;
            case 'hubs:autodesk.bim360:Account':
                hubType = 'bim360Hubs';
                break;
        }
        return createTreeNode(
            hub.links.self.href,
            hub.attributes.name,
            hubType,
            true,
            hub.attributes.region || 'US' // Include region field, default to 'US'
        );
    }));
}

async function getProjects(hubId, oauthClient, credentials, res) {
    const projects = new ProjectsApi();
    const data = await projects.getHubProjects(hubId, {}, oauthClient, credentials);
    res.json(data.body.data.map((project) => {
        let projectType = 'projects';
        switch (project.attributes.extension.type) {
            case 'projects:autodesk.core:Project':
                projectType = 'a360projects';
                break;
            case 'projects:autodesk.bim360:Project':
                if (project.attributes.extension.data.projectType == 'ACC') {
                    projectType = 'accprojects';
                } else {
                    projectType = 'bim360projects';
                }
                break;
        }
        return createTreeNode(
            project.links.self.href,
            project.attributes.name,
            projectType,
            true
        );
    }));
}

async function getFolders(hubId, projectId, oauthClient, credentials, res) {
    const projects = new ProjectsApi();
    const folders = await projects.getProjectTopFolders(hubId, projectId, oauthClient, credentials);
    res.json(folders.body.data.map((item) => {
        return createTreeNode(
            item.links.self.href,
            item.attributes.displayName == null ? item.attributes.name : item.attributes.displayName,
            item.type,
            true
        );
    }));
}

async function getFolderContents(projectId, folderId, oauthClient, credentials, res) {
    const folders = new FoldersApi();
    const contents = await folders.getFolderContents(projectId, folderId, {}, oauthClient, credentials);
    
    const treeNodes = [];
    let ifcFileCount = 0;
    
    for (const item of contents.body.data) {
        var name = (item.attributes.name == null ? item.attributes.displayName : item.attributes.name);
        if (name !== '') { // BIM 360 Items with no displayName also don't have storage, so not file to transfer
            // Always include folders for navigation
            if (item.type === 'folders') {
                treeNodes.push(createTreeNode(
                    item.links.self.href,
                    name,
                    item.type,
                    true
                ));
            }
            // For items (files), check if they actually contain IFC versions
            else if (item.type === 'items') {
                const hasIfcVersions = await checkItemHasIfcVersions(projectId, item.id, oauthClient, credentials);
                if (hasIfcVersions) {
                    treeNodes.push(createTreeNode(
                        item.links.self.href,
                        name,
                        item.type,
                        false  // Don't show children (versions) for items
                    ));
                    ifcFileCount++;
                }
            }
        }
    }
    res.json(treeNodes);
}

async function getFolderContentsOnlyFolders(projectId, folderId, oauthClient, credentials, res) {
    const folders = new FoldersApi();
    const contents = await folders.getFolderContents(projectId, folderId, {}, oauthClient, credentials);
    
    const treeNodes = [];
    
    for (const item of contents.body.data) {
        var name = (item.attributes.name == null ? item.attributes.displayName : item.attributes.name);
        if (name !== '' && item.type === 'folders') {
            // Only include folders for the folder selection modal
            treeNodes.push(createTreeNode(
                item.links.self.href,
                name,
                item.type,
                true
            ));
        }
    }
    res.json(treeNodes);
}

async function getVersions(projectId, itemId, oauthClient, credentials, res) {
    const items = new ItemsApi();
    const versions = await items.getItemVersions(projectId, itemId, {}, oauthClient, credentials);
    
    // Filter to only show IFC file versions
    const ifcVersions = versions.body.data.filter((version) => {
        // Check multiple possible sources for the filename
        const displayName = version.attributes.displayName || '';
        const name = version.attributes.name || '';
        const fileName = version.attributes.fileName || '';
        
        // Check all possible name sources
        return isIfcFile(displayName) || isIfcFile(name) || isIfcFile(fileName);
    }).map((version) => {
        const dateFormated = new Date(version.attributes.lastModifiedTime).toLocaleString();
        const versionst = version.id.match(/^(.*)\?version=(\d+)$/)[2];
        const based64Urn = (version.relationships != null && version.relationships.derivatives != null ? version.relationships.derivatives.data.id : null);
        return createTreeNode(
            `${version.id}|${based64Urn}|${projectId}`,
            decodeURI('v' + versionst + ': ' + dateFormated + ' by ' + version.attributes.lastModifiedUserName),
            (based64Urn != null ? 'versions' : 'unsupported'),
            false
        );
    });
    
    res.json(ifcVersions);
}

// Simple cache for IFC check results to avoid repeated API calls
const ifcCheckCache = new Map();

// Check if an item has any IFC versions
async function checkItemHasIfcVersions(projectId, itemId, oauthClient, credentials) {
    // Create cache key
    const cacheKey = `${projectId}:${itemId}`;
    
    // Check cache first
    if (ifcCheckCache.has(cacheKey)) {
        return ifcCheckCache.get(cacheKey);
    }
    
    try {
        const items = new ItemsApi();
        const versions = await items.getItemVersions(projectId, itemId, {}, oauthClient, credentials);
        
        // Check if any version is an IFC file
        const hasIfcVersions = versions.body.data.some((version) => {
            const displayName = version.attributes.displayName || '';
            const name = version.attributes.name || '';
            const fileName = version.attributes.fileName || '';
            
            return isIfcFile(displayName) || isIfcFile(name) || isIfcFile(fileName);
        });
        
        // Cache the result
        ifcCheckCache.set(cacheKey, hasIfcVersions);
        
        return hasIfcVersions;
    } catch (error) {
        // Cache negative result to avoid repeated failed attempts
        ifcCheckCache.set(cacheKey, false);
        return false; // If we can't check, don't include the item
    }
}

// Check if a filename is an IFC file
function isIfcFile(filename) {
    if (!filename) return false;
    const ifcExtensions = ['.ifc', '.ifcxml', '.ifczip'];
    const lowerName = filename.toLowerCase();
    return ifcExtensions.some(ext => lowerName.includes(ext));
}

// Format data for tree
function createTreeNode(_id, _text, _type, _children, _region) {
    return { id: _id, text: _text, type: _type, children: _children, region: _region };
}

module.exports = router;
