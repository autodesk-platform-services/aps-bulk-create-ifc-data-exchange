/////////////////////////////////////////////////////////////////////
// Copyright 2025 Autodesk Inc
// APS Bulk Create IFC Data Exchange - Exchange Creation Endpoint
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
const { OAuth } = require('../services/oauth');
let router = express.Router();

// Simple function to convert file URN to lineage URN format
function convertFileUrnToLineageUrn(urn) {
    try {
        // Check if URN is provided
        if (!urn || typeof urn !== 'string') {
            console.error('Invalid URN input:', urn);
            return null;
        }
        
        // URN is always base64 encoded, so decode it
        let decodedUrn;
        try {
            decodedUrn = Buffer.from(urn, 'base64').toString('utf-8');
        } catch (e) {
            console.error('Failed to decode base64 URN:', e.message);
            return null;
        }
    
        if (decodedUrn.includes('fs.file:vf.')) {
            const lineageUrn = decodedUrn
                .replace('fs.file:vf.', 'dm.lineage:')
                .replace(/\?version=\d+$/, '');
            
            return lineageUrn;
        }
        
        console.error('Invalid URN format (not a file URN):', decodedUrn);
        return null;
        
    } catch (error) {
        console.error('Error converting URN:', error);
        return null;
    }
}

// Create Exchange endpoint
router.post('/exchange/create', async (req, res) => {
    
    try {
        const {
            ifcFiles,
            hubId,
            projectId,
            hubRegion,
            exchangeLocationFolderUrn,
            filters
        } = req.body;
        
          // Create filterString from filters array
          let filterString = '';
          if (filters && filters.length > 0) {
              const filterParts = filters.map(filter => {
                  const encodedKey = encodeURIComponent(filter.key);
                  const encodedValues = filter.values.map(value => encodeURIComponent(value)).join(',');
                  return `${encodedKey}=in=(${encodedValues})`;
              });
              filterString = `(${filterParts.join(';')})`;
          }
         
         
         // Create targetFolderId: base64 encoded value of fold~<hubId>~<projectId>~<exchangeLocationFolderUrn>
         const targetFolderIdString = `fold~${hubId}~${projectId}~${exchangeLocationFolderUrn}`;
         const targetFolderId = Buffer.from(targetFolderIdString, 'utf-8').toString('base64');
        
        // Get access token from OAuth service
        const oauth = new OAuth(req.session);
        const tokenData = await oauth.getInternalToken();
        const accessToken = tokenData.access_token;
        
        const exchangeResults = [];
        const failedExchanges = [];
        
        // GraphQL mutation for creating exchange (same for all files)
        const mutation = `
            mutation CreateExchange(
                $filter: String
                $sourceFileId: String!
                $targetExchangeName: String!
                $targetFolderId: String!
            ) {
                createExchange(
                    input: {
                        filter: $filter
                        source: { fileId: $sourceFileId }
                        target: { name: $targetExchangeName, folderId: $targetFolderId }
                    }
                ) {
                    exchange {
                        id
                        name
                        elements {
                            results {
                                id
                                name
                            }
                        }
                    }
                }
            }
        `;
        
        for (const file of ifcFiles) {
            // Convert file URN to lineage URN and throw error if fails
            const fileLineageUrn = convertFileUrnToLineageUrn(file.urn);
            if (!fileLineageUrn) {
                throw new Error(`Failed to convert file URN to lineage format: ${file.urn}`);
            }
            
            // Create sourceId: base64 encoded value of item~<hubId>~<projectId>~<ifc folder urn>~<lineage urn>
            const sourceIdString = `item~${hubId}~${projectId}~${file.folderUrn}~${fileLineageUrn}`;
            const sourceId = Buffer.from(sourceIdString, 'utf-8').toString('base64');
            
            const variables = {
                filter: filterString || null,
                sourceFileId: sourceId,
                targetExchangeName: file.exchangeName,
                targetFolderId: targetFolderId
            };
            
            const response = await fetch('https://developer.api.autodesk.com/dataexchange/2023-05/graphql', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${accessToken}`,
                    'region': hubRegion || 'US'
                },
                body: JSON.stringify({
                    query: mutation,
                    variables: variables
                })
            });
            
            if (!response.ok) {
                const errorText = await response.text();
                failedExchanges.push({
                    exchangeName: file.exchangeName,
                    error: `Server error: HTTP ${response.status}: ${response.statusText} - ${errorText}`
                });
                continue;
            }
            
            const result = await response.json();
            
            if (result.errors) {
                failedExchanges.push({
                    exchangeName: file.exchangeName,
                    error: `${result.errors[0].message}`
                });
                continue;
            }
            
            exchangeResults.push({
                exchangeName: file.exchangeName,
                result: result.data.createExchange
            });
        }
        
        
        // Always return 200 status with detailed results
        const totalFailed = failedExchanges.length;
        
        let message;
        if (totalFailed === 0) {
            message = 'Exchanges created successfully';
        } else if (exchangeResults.length === 0) {
            message = 'Failed to create exchanges';
        } else {
            message = `Exchange created successfully partially`;
        }
        
        const response = {
            message: message,
            failedExchanges: failedExchanges
        };
        
        res.status(200).json(response);
        
    } catch (error) {
        console.error('Error processing exchange creation:', error);
        res.status(500).json({
            message: 'Internal server error'
        });
    }
});

module.exports = router;
