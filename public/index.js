/////////////////////////////////////////////////////////////////////
// Copyright 2025 Autodesk Inc
// APS Bulk Create IFC Data Exchange - Main Application Logic
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

let currentUser = null;
let exchangeItems = []; // Store added exchange items
let selectedFolderData = null; // Store selected folder for exchange location
let globalExchangeLocation = ''; // Global exchange location for all items

$(document).ready(function () {
    
    // First, check if current visitor is signed in (following reference pattern)
    jQuery.ajax({
        url: '/api/aps/oauth/token',
        success: function (res) {
            // Yes, it is signed in...
            $('#signOut').show();
            
            // Prepare sign out (simplified, no iframe)
            $('#signOut').click(function () {
                
                // Clear local session
                jQuery.ajax({
                    url: '/api/aps/oauth/signout',
                    success: function() {
                        // Reset UI immediately
                        currentUser = null;
                        showAuthSection();
                    },
                    error: function() {
                        // Force logout on client side even if server fails
                        currentUser = null;
                        showAuthSection();
                    }
                });
            });
            
            // Show main content and load user data
            showMainContent();
            showUser();
            
                // Load hubs and setup dropdowns
                loadHubsDropdown();
                setupDropdownHandlers();
                setupGlobalLocationHandler();
                setupExchangeTableHandlers();
                setupFilterHandlers();
        },
        error: function() {
            // Not signed in, show authentication section
            showAuthSection();
        }
    });
    
    // Setup sign-in button (following reference pattern)
    $('#autodeskSigninButton').click(function () {
        jQuery.ajax({
            url: '/api/aps/oauth/url',
            success: function (url) {
                location.href = url;
            },
            error: function(xhr, status, error) {
                console.error('Error getting OAuth URL:', error);
                showUnifiedNotification('Error', 'Failed to get authentication URL. Please try again.', 'error', 5000);
            }
        });
    });
    
});

function showUser() {
    jQuery.ajax({
        url: '/api/aps/user/profile',
        success: function (profile) {
            var img = '<img src="' + profile.picture + '" height="30px" class="rounded-circle me-2">';
            $('#userInfo').html(img + profile.name);
            
            // Store user data
            currentUser = profile;
        }
    });
}

// UI State Management
function showAuthSection() {
    $('#authSection').show();
    $('#mainContent').hide();
    $('#signOut').hide();
    $('#userInfo').empty();
}

function showMainContent() {
    $('#authSection').hide();
    $('#mainContent').show();
}

// Unified Yellow Top Toast Notification System
function showUnifiedNotification(title, message, type = 'info', autoCloseTime = 3000) {
    const toast = $('#unifiedToast');
    const icon = $('#toastIcon');
    const titleElement = $('#toastTitle');
    const messageElement = $('#toastMessage');

    // Set icon based on type
    const icons = {
        success: 'fas fa-check-circle toast-icon-success',
        error: 'fas fa-exclamation-circle toast-icon-error',
        warning: 'fas fa-exclamation-triangle toast-icon-warning',
        info: 'fas fa-info-circle toast-icon-info',
        added: 'fas fa-plus-circle toast-icon-success',
        updated: 'fas fa-edit toast-icon-success',
        removed: 'fas fa-trash-alt toast-icon-success',
        cancelled: 'fas fa-times-circle toast-icon-warning',
        duplicate: 'fas fa-copy toast-icon-warning'
    };

    // Update toast content
    icon.removeClass().addClass(icons[type] || icons.info);
    titleElement.text(title);
    messageElement.text(message);

    // Show the toast
    const bsToast = new bootstrap.Toast(toast[0], {
        autohide: true,
        delay: autoCloseTime
    });

    // Add auto-closing animation
    if (autoCloseTime > 0) {
        toast.addClass('auto-closing');
        toast[0].style.setProperty('--close-time', autoCloseTime + 'ms');
        
        // Remove auto-closing class after animation
        setTimeout(() => {
            toast.removeClass('auto-closing');
        }, autoCloseTime);
    }

    bsToast.show();
    
}

// Legacy function for compatibility - now redirects to unified system
function showNotification(title, message, type = 'info') {
    showUnifiedNotification(title, message, type);
}

// Load hubs into dropdown
function loadHubsDropdown() {
    jQuery.ajax({
        url: '/api/aps/datamanagement?id=%23', // %23 is URL encoded #
        dataType: 'json',
        success: function(hubs) {
            const hubSelect = $('#hubSelect');
            hubSelect.empty();
            hubSelect.append('<option value="">Select a hub...</option>');
            
            hubs.forEach(hub => {
                hubSelect.append(`<option value="${hub.id}" data-type="${hub.type}" data-region="${hub.region || 'US'}">${hub.text}</option>`);
            });
            
        },
        error: function(error) {
            console.error('Error loading hubs:', error);
            $('#hubSelect').html('<option value="">Error loading hubs</option>');
        }
    });
}

// Setup dropdown event handlers
function setupDropdownHandlers() {
    // Hub selection handler
    $('#hubSelect').change(function() {
        const selectedHubId = $(this).val();
        const projectSelect = $('#projectSelect');
        
        if (selectedHubId) {
            loadProjectsForHub(selectedHubId);
        } else {
            projectSelect.prop('disabled', true).html('<option value="">Select a hub first</option>');
            clearProjectFiles();
        }
    });
    
    // Project selection handler
    $('#projectSelect').change(function() {
        const selectedProjectId = $(this).val();
        const selectedHubId = $('#hubSelect').val();
        
        if (selectedProjectId && selectedHubId) {
            loadProjectFileTree(selectedHubId, selectedProjectId);
        } else {
            clearProjectFiles();
        }
    });
    
    // Setup refresh button
    $('#refreshTree').show().click(function() {
        const hubId = $('#hubSelect').val();
        const projectId = $('#projectSelect').val();
        
        if (hubId && projectId) {
            loadProjectFileTree(hubId, projectId);
        }
    });
}

// Load projects for selected hub
function loadProjectsForHub(hubId) {
    const projectSelect = $('#projectSelect');
    projectSelect.prop('disabled', true).html('<option value="">Loading projects...</option>');
    
    jQuery.ajax({
        url: `/api/aps/datamanagement?id=${encodeURIComponent(hubId)}`,
        dataType: 'json',
        success: function(projects) {
            projectSelect.empty();
            projectSelect.append('<option value="">Select a project...</option>');
            
            projects.forEach(project => {
                projectSelect.append(`<option value="${project.id}" data-type="${project.type}">${project.text}</option>`);
            });
            
            projectSelect.prop('disabled', false);
        },
        error: function(error) {
            console.error('Error loading projects:', error);
            projectSelect.html('<option value="">Error loading projects</option>');
        }
    });
}

// Load file tree for selected project
function loadProjectFileTree(hubId, projectId) {
    // Show loading state
    $('#projectFiles').html(`
        <div class="text-center p-4">
            <div class="spinner-border text-primary" role="status">
                <span class="visually-hidden">Loading...</span>
            </div>
            <div class="mt-2">Loading project files...</div>
        </div>
    `);
    
    // Initialize jsTree for project files
    const projectUrl = `${hubId}/projects/${projectId.split('/').pop()}`;
    
    $('#projectFiles').jstree('destroy').jstree({
            'core': {
                'themes': { "icons": true },
                'multiple': false,
                'data': {
                    "url": '/api/aps/datamanagement',
                    "dataType": "json",
                    'cache': false,
                    'data': function (node) {
                        if (node.id === '#') {
                            // Start with project root folders
                            return { "id": projectUrl };
                        } else {
                            return { "id": node.id };
                        }
                    },
                    'success': function(nodes) {
                        // Hide loading message when data loads
                        if (nodes && nodes.length === 0) {
                        }
                        return nodes;
                    }
                }
            },
        'types': {
            'default': { 'icon': 'fas fa-question-circle' },
            'folders': { 'icon': 'far fa-folder text-warning' },
            'items': { 'icon': 'far fa-file text-secondary' },
            'bim360documents': { 'icon': 'far fa-clock text-info' },
            'versions': { 'icon': 'far fa-clock text-success' },
            'unsupported': { 'icon': 'fas fa-ban text-danger' }
        },
        "sort": function (a, b) {
            var a1 = this.get_node(a);
            var b1 = this.get_node(b);
            var parent = this.get_node(a1.parent);
            if (parent.type === 'items') { // sort by version number
                var id1 = Number.parseInt(a1.text.substring(a1.text.indexOf('v') + 1, a1.text.indexOf(':')))
                var id2 = Number.parseInt(b1.text.substring(b1.text.indexOf('v') + 1, b1.text.indexOf(':')));
                return id1 > id2 ? 1 : -1;
            }
            else if (a1.type !== b1.type) return a1.icon < b1.icon ? 1 : -1; // types are different inside folder, so sort by icon (files/folders)
            else return a1.text > b1.text ? 1 : -1; // basic name/text sort
        },
        "plugins": ["types", "sort"]
    }).bind("activate_node.jstree", function (evt, data) {
        if (data != null && data.node != null && data.node.type == 'items') {
            // Handle item clicks - get latest IFC version
            handleItemClick(data.node);
        }
    });
}

// Clear project files display
function clearProjectFiles() {
    $('#projectFiles').html(`
        <div class="text-center p-4 text-muted">
            <i class="fas fa-info-circle mb-2"></i>
            <div>Select a project to view IFC files</div>
            <small class="text-muted">Only IFC files (.ifc, .ifcxml, .ifczip) will be shown</small>
        </div>
    `);
}

// Check if the selected file is an IFC file
function isIfcFile(filename) {
    const ifcExtensions = ['.ifc', '.ifcxml', '.ifczip'];
    const lowerName = filename.toLowerCase();
    return ifcExtensions.some(ext => lowerName.includes(ext));
}


// Get complete nested file path from jsTree  
function getFilePath(node) {
    const tree = $('#projectFiles').jstree(true);
    let path = [];
    let currentNode = tree.get_node(node.parent); // Start from parent folder
    
    while (currentNode && currentNode.id !== '#') {
        if (currentNode.type === 'folders') {
            path.unshift(currentNode.text);
        }
        currentNode = tree.get_node(currentNode.parent);
    }
    
    // Include all folder levels to show complete nested path
    return path.join(' > ') || 'Project Files';
}

// Get folder URN from the parent folder of a file node
function getFolderUrnFromNode(node) {
    const tree = $('#projectFiles').jstree(true);
    const parentNode = tree.get_node(node.parent);
    
    if (parentNode && parentNode.type === 'folders') {
        // Extract folder URN from the parent folder's href
        return extractFolderUrnFromHref(parentNode.id);
    }
    
    return null; // No parent folder found
}

// Handle clicking on an item (file) to get its latest IFC version
function handleItemClick(node) {
    
    // Get the folder path for this file
    const filePath = getFilePath(node);
    
    // Get the folder URN from the parent folder
    const folderUrn = getFolderUrnFromNode(node);
    
    // Parse the item URL to get project ID and item ID
    const itemUrl = node.id;
    const urlParts = itemUrl.split('/');
    const projectId = urlParts[urlParts.length - 3]; // projects/{projectId}/items/{itemId}
    const itemId = urlParts[urlParts.length - 1];
    
    // Call API to get latest IFC version
    jQuery.ajax({
        url: `/api/aps/datamanagement/item/${projectId}/${itemId}/latest-ifc`,
        method: 'GET',
        success: function(versionData) {
            
        // Generate automatic exchange name: filename_epochMilliseconds
        const baseFileName = versionData.displayName.replace(/\.[^/.]+$/, ""); // Remove file extension
        const epochTime = Date.now();
        const autoExchangeName = `${baseFileName}_${epochTime}`;
        
        // Create file data object
        const fileData = {
            filename: versionData.displayName,
            urn: versionData.urn,
            projectId: versionData.projectId,
            itemId: itemId,
            lastModified: versionData.lastModified,
            lastModifiedBy: versionData.lastModifiedBy,
            filePath: filePath,
            folderUrn: folderUrn
        };
        
        // Add directly to exchange with auto-generated name
        addToExchange(fileData, autoExchangeName);
        updateCreateExchangeButtonState();
        updateHubProjectSelectionState();
        },
        error: function(xhr, status, error) {
            console.error('Error getting latest IFC version:', error);
            
            if (xhr.status === 404) {
            }
            // Other errors are logged to console but no user notification shown
        }
    });
}


// Setup global exchange location handler
function setupGlobalLocationHandler() {
    $('#selectGlobalLocationBtn').click(function() {
        openGlobalFolderSelectionModal();
    });
    
    // Setup global folder selection modal handlers
    $('#confirmLocationBtn').click(function() {
        if (selectedFolderData) {
            globalExchangeLocation = selectedFolderData.urn;
            $('#globalExchangeLocation').val(selectedFolderData.fullPath); // Display the path for user
            bootstrap.Modal.getInstance(document.getElementById('folderSelectionModal')).hide();
            updateCreateExchangeButtonState();
        }
    });
    
    // Setup clear all button
    $('#clearAllExchanges').click(function() {
        clearAllExchanges();
    });
}

// Setup exchange table event handlers with delegation
function setupExchangeTableHandlers() {
    
    // Edit exchange name button
    $(document).on('click', '.edit-exchange-btn', function(e) {
        e.preventDefault();
        e.stopPropagation();
        
        const container = $(this).closest('.editable-exchange-name');
        const index = container.data('index');
        
        if (index !== undefined) {
            editExchangeName(index);
        } else {
            console.error('Index not found for edit button');
        }
    });
    
    // Save exchange name button
    $(document).on('click', '.save-exchange-btn', function(e) {
        e.preventDefault();
        e.stopPropagation();
        
        const container = $(this).closest('.editable-exchange-name');
        const index = container.data('index');
        
        if (index !== undefined) {
            saveExchangeName(index);
        } else {
            console.error('Index not found for save button');
        }
    });
    
    // Cancel exchange name edit button
    $(document).on('click', '.cancel-exchange-btn', function(e) {
        e.preventDefault();
        e.stopPropagation();
        
        const container = $(this).closest('.editable-exchange-name');
        const index = container.data('index');
        
        if (index !== undefined) {
            cancelEditExchangeName(index);
        } else {
            console.error('Index not found for cancel button');
        }
    });
    
    // Remove exchange item button
    $(document).on('click', '.remove-exchange-btn', function(e) {
        e.preventDefault();
        e.stopPropagation();
        
        const itemId = $(this).data('item-id');
        
        if (itemId) {
            removeFromExchange(itemId);
        } else {
            console.error('Item ID not found for remove button');
            console.error('All data attributes:', $(this).data());
        }
    });
}

// Add file to exchange list
function addToExchange(fileData, exchangeName) {
    
    // Check maximum limit of 10 files
    if (exchangeItems.length >= 10) {
        showUnifiedNotification('', `Maximum 10 files allowed`, 'warning', 3000);
        return;
    }
    
    // Check if file with same URN already exists
    const existingItem = exchangeItems.find(item => item.id === fileData.urn);
    if (existingItem) {
        showUnifiedNotification('', `${fileData.filename} already added with exchange name ${existingItem.exchangeName}`, 'duplicate', 3000);
        return;
    }
    
    const exchangeItem = {
        id: fileData.urn, // Use URN as unique identifier
        exchangeName: exchangeName,
        sourceFileName: fileData.filename,
        urn: fileData.urn,
        projectId: fileData.projectId,
        itemId: fileData.itemId,
        lastModified: fileData.lastModified,
        lastModifiedBy: fileData.lastModifiedBy,
        filePath: fileData.filePath,
        folderUrn: fileData.folderUrn,
        dateAdded: new Date().toISOString()
    };
    
    exchangeItems.push(exchangeItem);
    updateExchangeDisplay();
    
}

// Update the exchange display
function updateExchangeDisplay() {
    
    const tableBody = $('#exchangeTableBody');
    const exchangeCounter = $('#exchangeCounter');
    
    
    if (exchangeItems.length === 0) {
        // Show empty state row and hide clear button
        const emptyStateHtml = `
            <tr id="emptyStateRow">
                <td colspan="3" class="text-center text-muted p-4">
                    <i class="fas fa-exchange-alt fa-2x mb-3"></i>
                    <small>Click on IFC files in the hierarchy to add them (limit: 10 files)</small>
                </td>
            </tr>
        `;
        tableBody.html(emptyStateHtml);
        $('#clearAllExchanges').hide();
        exchangeCounter.html('<strong>No IFC files selected</strong>');
        return;
    }
    
    $('#clearAllExchanges').show();
    
    // Build table rows for exchange items
    let exchangeRowsHtml = '';
    exchangeItems.forEach((item, index) => {
        exchangeRowsHtml += `
            <tr>
                <td>
                    <div>
                        <i class="fas fa-file-alt text-primary me-2"></i>
                        ${item.sourceFileName}
                    </div>
                    <div class="text-muted small mt-1" style="margin-left: 1.5rem;">
                        <i class="fas fa-folder text-muted me-1"></i>
                        ${item.filePath}
                    </div>
                </td>
                <td>
                    <div class="editable-exchange-name" data-index="${index}">
                        <span class="exchange-name-display">${item.exchangeName}</span>
                        <input type="text" class="form-control exchange-name-input d-none" value="${item.exchangeName}">
                        <button class="btn btn-sm btn-link p-0 ms-2 edit-exchange-btn" title="Edit Exchange Name">
                            <i class="fas fa-edit text-secondary"></i>
                        </button>
                    </div>
                </td>
                <td>
                    <button class="btn btn-sm btn-outline-danger remove-exchange-btn" data-item-id="${item.id}" title="Remove">
                        <i class="fas fa-times"></i>
                    </button>
                </td>
            </tr>
        `;
    });
    
    // Completely replace table body content
    tableBody.html(exchangeRowsHtml);
    
    // Update counter
    exchangeCounter.html(`<strong>${exchangeItems.length}</strong> IFC File(s) selected`);
}

// Remove item from exchange
function removeFromExchange(itemId) {
    
    if (confirm('Remove this IFC file from the exchange?')) {
        // Find the item index by URN (string comparison)
        const itemIndex = exchangeItems.findIndex(item => item.id === itemId);
        
        if (itemIndex === -1) {
            console.error('Item not found with URN:', itemId);
            console.error('Available URNs:', exchangeItems.map(item => item.id));
            return;
        }
        
        const removedItem = exchangeItems.splice(itemIndex, 1)[0];
        updateExchangeDisplay();
        updateCreateExchangeButtonState();
        updateHubProjectSelectionState();
    }
}

// Clear all exchange items
function clearAllExchanges() {
    if (confirm('Remove all IFC files from the exchange?')) {
        const itemCount = exchangeItems.length;
        exchangeItems = [];
        updateExchangeDisplay();
        updateCreateExchangeButtonState();
        updateHubProjectSelectionState();
        showRemovalSuccessModal(`All ${itemCount} IFC file(s) cleared from exchange`);
    }
}


// Debug function to check if UI is responsive
function checkUIResponsive() {
    const modals = $('.modal.show').length;
    const backdrops = $('.modal-backdrop').length;
    const bodyClasses = $('body').attr('class');
    
    console.log('UI Debug Info:', {
        activeModals: modals,
        backdrops: backdrops,
        bodyClasses: bodyClasses,
        bodyOverflow: $('body').css('overflow'),
        bodyPadding: $('body').css('padding-right')
    });
    
    if (modals > 0 || backdrops > 0) {
        $('.modal').modal('hide');
        $('.modal-backdrop').remove();
        $('body').removeClass('modal-open').css('overflow', '').css('padding-right', '');
    }
}

// Open folder selection modal
function openFolderSelectionModal() {
    // Reset selection
    selectedFolderData = null;
    $('#selectedFolderPath').html('<em class="text-muted">No folder selected</em>');
    $('#confirmLocationBtn').prop('disabled', true);
    
    // Get current hub and project from the main tree
    const hubId = $('#hubSelect').val();
    const projectId = $('#projectSelect').val();
    
    if (!hubId || !projectId) {
        return;
    }
    
    // Show modal
    const modal = new bootstrap.Modal(document.getElementById('folderSelectionModal'));
    modal.show();
    
    // Load folder tree
    loadFolderTree(hubId, projectId);
}

// Open global folder selection modal
function openGlobalFolderSelectionModal() {
    // Reset selection
    selectedFolderData = null;
    $('#selectedFolderPath').html('<em class="text-muted">No folder selected</em>');
    $('#confirmLocationBtn').prop('disabled', true);
    
    // Get current hub and project from the main tree
    const hubId = $('#hubSelect').val();
    const projectId = $('#projectSelect').val();
    
    if (!hubId || !projectId) {
        return;
    }
    
    // Show modal
    const modal = new bootstrap.Modal(document.getElementById('folderSelectionModal'));
    modal.show();
    
    // Load folder tree
    loadFolderTree(hubId, projectId);
}

// Load folder-only tree
function loadFolderTree(hubId, projectId) {
    $('#folderTree').html(`
        <div class="text-center p-4 text-muted">
            <i class="fas fa-spinner fa-spin fa-2x mb-3"></i>
            <div>Loading folder structure...</div>
        </div>
    `);
    
    const projectUrl = `${hubId}/projects/${projectId.split('/').pop()}`;
    
    $('#folderTree').jstree('destroy').jstree({
        'core': {
            'themes': { "icons": true },
            'multiple': false,
            'data': {
                "url": '/api/aps/datamanagement',
                "dataType": "json",
                'cache': false,
                'data': function (node) {
                    if (node.id === '#') {
                        return { "id": projectUrl, "foldersOnly": "true" };
                    } else {
                        return { "id": node.id, "foldersOnly": "true" };
                    }
                }
            }
        },
        'types': {
            'default': { 'icon': 'fas fa-question-circle' },
            'folders': { 'icon': 'far fa-folder text-warning' }
        },
        "sort": function (a, b) {
            var a1 = this.get_node(a);
            var b1 = this.get_node(b);
            return a1.text > b1.text ? 1 : -1; // alphabetical sort
        },
        "plugins": ["types", "sort"]
    }).bind("activate_node.jstree", function (evt, data) {
        if (data != null && data.node != null && data.node.type === 'folders') {
            // Extract folder URN from the href URL
            const folderUrn = extractFolderUrnFromHref(data.node.id);
            
            // Store selected folder data
            selectedFolderData = {
                id: data.node.id,
                path: data.node.text,
                fullPath: getFolderPath(data.node),
                urn: folderUrn
            };
            
            $('#selectedFolderPath').html(`<i class="fas fa-folder text-warning me-2"></i>${selectedFolderData.fullPath}`);
            $('#confirmLocationBtn').prop('disabled', false);
        }
    });
}

// Extract folder URN from href URL
function extractFolderUrnFromHref(href) {
    // The href format is typically: /project/v1/hubs/{hubId}/projects/{projectId}/folders/{folderId}
    // We need to extract the folderId
    const urlParts = href.split('/');
    const folderId = urlParts[urlParts.length - 1];
    
    // Check if folderId is already a URN, if so return it as-is
    if (folderId.startsWith('urn:')) {
        return folderId;
    }
    
    // If not a URN, convert to URN format: urn:adsk.wipprod:fs.folder:co.{folderId}
    return `urn:adsk.wipprod:fs.folder:co.${folderId}`;
}

// Get full folder path
function getFolderPath(node) {
    const tree = $('#folderTree').jstree(true);
    let path = [];
    let currentNode = node;
    
    while (currentNode && currentNode.id !== '#') {
        if (currentNode.type === 'folders') {
            path.unshift(currentNode.text);
        }
        currentNode = tree.get_node(currentNode.parent);
    }
    
    return path.join(' / ') || node.text;
}

// Edit exchange name functionality
function editExchangeName(index) {
    
    const container = $(`.editable-exchange-name[data-index="${index}"]`);
    
    if (container.length === 0) {
        console.error('Container not found for index:', index);
        return;
    }
    
    const displaySpan = container.find('.exchange-name-display');
    const inputField = container.find('.exchange-name-input');
    const editBtn = container.find('.edit-exchange-btn');
    
    
    // Switch to edit mode
    displaySpan.addClass('d-none');
    inputField.removeClass('d-none').focus().select();
    
    // Change edit button to save/cancel buttons
    editBtn.html(`
        <button class="btn btn-sm btn-link p-0 me-1 save-exchange-btn" title="Save">
            <i class="fas fa-check text-success"></i>
        </button>
        <button class="btn btn-sm btn-link p-0 cancel-exchange-btn" title="Cancel">
            <i class="fas fa-times text-danger"></i>
        </button>
    `);
    
    // Handle Enter key to save
    inputField.off('keypress').on('keypress', function(e) {
        if (e.which === 13) { // Enter key
            saveExchangeName(index);
        }
    });
    
    // Handle Escape key to cancel
    inputField.off('keyup').on('keyup', function(e) {
        if (e.which === 27) { // Escape key
            cancelEditExchangeName(index);
        }
    });
    
}

function saveExchangeName(index) {
    
    const container = $(`.editable-exchange-name[data-index="${index}"]`);
    
    if (container.length === 0) {
        console.error('Container not found for save with index:', index);
        return;
    }
    
    const displaySpan = container.find('.exchange-name-display');
    const inputField = container.find('.exchange-name-input');
    const editBtn = container.find('.edit-exchange-btn');
    const newName = inputField.val().trim();
    
    
    if (!newName) {
        inputField.focus();
        return;
    }
    
    // Check for duplicate exchange names (not URNs)
    const isDuplicate = exchangeItems.some((item, idx) => 
        idx !== index && item.exchangeName.toLowerCase() === newName.toLowerCase()
    );
    
    if (isDuplicate) {
        inputField.focus().select();
        return;
    }
    
    // Update the exchange item
    exchangeItems[index].exchangeName = newName;
    
    // Switch back to display mode
    displaySpan.text(newName).removeClass('d-none');
    inputField.addClass('d-none');
    
    // Restore edit button
    editBtn.html(`
        <button class="btn btn-sm btn-link p-0 ms-2 edit-exchange-btn" title="Edit Exchange Name">
            <i class="fas fa-edit text-secondary"></i>
        </button>
    `);
    
}

function cancelEditExchangeName(index) {
    
    const container = $(`.editable-exchange-name[data-index="${index}"]`);
    
    if (container.length === 0) {
        console.error('Container not found for cancel with index:', index);
        return;
    }
    
    const displaySpan = container.find('.exchange-name-display');
    const inputField = container.find('.exchange-name-input');
    const editBtn = container.find('.edit-exchange-btn');
    
    // Reset input field to original value
    inputField.val(exchangeItems[index].exchangeName);
    
    // Switch back to display mode
    displaySpan.removeClass('d-none');
    inputField.addClass('d-none');
    
    // Restore edit button
    editBtn.html(`
        <button class="btn btn-sm btn-link p-0 ms-2 edit-exchange-btn" title="Edit Exchange Name">
            <i class="fas fa-edit text-secondary"></i>
        </button>
    `);
    
}

// Show duplicate file modal
function showDuplicateFileModal(fileName, existingExchangeName) {
    
    // Update modal content
    $('#duplicateFileName').text(fileName);
    $('#duplicateExchangeName').text(existingExchangeName);
    
    // Show the modal
    const modal = new bootstrap.Modal(document.getElementById('duplicateFileModal'), {
        backdrop: 'static', // Prevent closing by clicking outside
        keyboard: true      // Allow closing with Escape key
    });
    modal.show();
    
    // Log for debugging
}

// Show removal success modal
function showRemovalSuccessModal(exchangeName) {
    
    // Update modal content
    $('#removalMessage').text(`"${exchangeName}" removed from exchange`);
    
    // Show the modal
    const modal = new bootstrap.Modal(document.getElementById('removalSuccessModal'), {
        backdrop: false,    // Allow clicking outside to close
        keyboard: true      // Allow closing with Escape key
    });
    modal.show();
    
    // Auto-close after 3 seconds
    setTimeout(() => {
        modal.hide();
    }, 3000);
    
    // Log for debugging
}

// Show update success modal
function showUpdateSuccessModal(newName) {
    
    // Update modal content
    $('#updateMessage').text(`Exchange name updated to "${newName}"`);
    
    // Show the modal
    const modal = new bootstrap.Modal(document.getElementById('updateSuccessModal'), {
        backdrop: false,
        keyboard: true
    });
    modal.show();
    
    // Auto-close after 3 seconds
    setTimeout(() => {
        modal.hide();
    }, 3000);
    
}

// Show cancel edit modal
function showCancelEditModal() {
    
    // Show the modal
    const modal = new bootstrap.Modal(document.getElementById('cancelEditModal'), {
        backdrop: false,
        keyboard: true
    });
    modal.show();
    
    // Auto-close after 2 seconds (shorter for cancel)
    setTimeout(() => {
        modal.hide();
    }, 2000);
    
}

// Show add success modal
function showAddSuccessModal(fileName, exchangeName) {
    
    // Update modal content
    $('#addMessage').text(`"${fileName}" added to exchange "${exchangeName}"`);
    
    // Show the modal
    const modal = new bootstrap.Modal(document.getElementById('addSuccessModal'), {
        backdrop: false,
        keyboard: true
    });
    modal.show();
    
    // Auto-close after 3 seconds
    setTimeout(() => {
        modal.hide();
    }, 3000);
    
}

// Exchange Filter functionality
let exchangeFilters = []; // Store active filters
let filteredExchangeItems = []; // Store filtered results

// Setup filter event handlers
function setupFilterHandlers() {
    
    // Add filter button
    $('#addFilterBtn').click(function() {
        addNewFilter();
    });
    
    // Clear all filters button
    $('#clearAllFiltersBtn').click(function() {
        clearAllFilters();
    });
    
    // Create Exchange button
    $('#createExchangeBtn').click(function() {
        createExchange();
    });
    
    // Initialize filtered items with all items
    filteredExchangeItems = [...exchangeItems];
    
    // Initialize button state
    updateCreateExchangeButtonState();
}

// Add a new filter row
function addNewFilter() {
    const filterId = 'filter_' + Date.now();
    const filterRow = `
        <tr data-filter-id="${filterId}">
            <td>
                <input type="text" class="form-control form-control-sm filter-key" 
                       placeholder="Enter filter key" 
                       title="Define your own filter key">
            </td>
            <td>
                <input type="text" class="form-control form-control-sm filter-values" 
                       placeholder="value1, value2, value3" 
                       title="Enter comma-separated values">
            </td>
            <td>
                <button type="button" class="btn btn-sm btn-outline-danger remove-filter-btn" 
                        data-filter-id="${filterId}" title="Remove Filter">
                    <i class="fas fa-times"></i>
                </button>
            </td>
        </tr>
    `;
    
    // Hide empty state and add the new row
    $('#emptyFilterRow').hide();
    $('#filterTableBody').append(filterRow);
    
    // Add event listeners for auto-filtering
    const newRow = $(`tr[data-filter-id="${filterId}"]`);
    newRow.find('.filter-key, .filter-values').on('input', function() {
        autoApplyFilters();
        updateCreateExchangeButtonState();
    });
    
}

// Remove a filter row
function removeFilter(filterId) {
    $(`tr[data-filter-id="${filterId}"]`).remove();
    
    // Show empty state if no filters remain
    if ($('#filterTableBody tr[data-filter-id]').length === 0) {
        $('#emptyFilterRow').show();
    }
    
    // Auto-apply filters after removal
    autoApplyFilters();
    updateCreateExchangeButtonState();
}

// Clear all filters
function clearAllFilters() {
    
    // Remove all filter rows
    $('#filterTableBody tr[data-filter-id]').remove();
    
    // Show empty state
    $('#emptyFilterRow').show();
    
    // Reset filtered items to all items and update display
    filteredExchangeItems = [...exchangeItems];
    updateFilteredExchangeDisplay();
    updateCreateExchangeButtonState();
}

// Auto-apply filters (called on any filter change)
function autoApplyFilters() {
    
    // Collect all active filters
    exchangeFilters = [];
    $('#filterTableBody tr[data-filter-id]').each(function() {
        const filterKey = $(this).find('.filter-key').val().trim();
        const filterValues = parseFilterValues($(this).find('.filter-values').val());
        
        if (filterKey && filterValues.length > 0) {
            exchangeFilters.push({
                key: filterKey,
                values: filterValues
            });
        }
    });
    
    
    // If no filters, show all items
    if (exchangeFilters.length === 0) {
        filteredExchangeItems = [...exchangeItems];
    } else {
        // Apply filters with AND logic between different filters, OR logic within each filter
        filteredExchangeItems = exchangeItems.filter(item => {
            return exchangeFilters.every(filter => {
                // Search in all item properties for the user-defined filter key
                const searchTargets = [
                    item.sourceFileName.toLowerCase(),
                    item.exchangeName.toLowerCase(),
                    item.filePath.toLowerCase()
                ];
                
                // Check if the filter key matches any part of the search targets
                // and if any of the filter values match
                return filter.values.some(filterValue => {
                    return searchTargets.some(target => {
                        // Check if the target contains both the filter key concept and the filter value
                        return target.includes(filterValue) || 
                               (filter.key === 'filename' && target === item.sourceFileName.toLowerCase() && target.includes(filterValue)) ||
                               (filter.key === 'exchange' && target === item.exchangeName.toLowerCase() && target.includes(filterValue)) ||
                               (filter.key === 'path' && target === item.filePath.toLowerCase() && target.includes(filterValue));
                    });
                });
            });
        });
    }
    
    updateFilteredExchangeDisplay();
    updateCreateExchangeButtonState();
}

// Parse comma-separated values
function parseFilterValues(inputValue) {
    if (!inputValue || inputValue.trim() === '') return [];
    return inputValue.split(',').map(val => val.trim()).filter(val => val !== '');
}


// Update display with exchange items (no filtering applied)
function updateFilteredExchangeDisplay() {
    
    const tableBody = $('#exchangeTableBody');
    const exchangeCounter = $('#exchangeCounter');
    
    if (exchangeItems.length === 0) {
        const emptyStateHtml = `
            <tr id="emptyStateRow">
                <td colspan="3" class="text-center text-muted p-4">
                    <i class="fas fa-exchange-alt fa-2x mb-3"></i>
                    <small>Click on IFC files in the hierarchy to add them (limit: 10 files)</small>
                </td>
            </tr>
        `;
        tableBody.html(emptyStateHtml);
        $('#clearAllExchanges').hide();
        exchangeCounter.html('<strong>No IFC files selected</strong>');
        return;
    }
    
    $('#clearAllExchanges').show();
    
    // Build table rows for exchange items
    let exchangeRowsHtml = '';
    exchangeItems.forEach((item, index) => {
        exchangeRowsHtml += `
            <tr>
                <td>
                    <div>
                        <i class="fas fa-file-alt text-primary me-2"></i>
                        ${item.sourceFileName}
                    </div>
                    <div class="text-muted small mt-1" style="margin-left: 1.5rem;">
                        <i class="fas fa-folder text-muted me-1"></i>
                        ${item.filePath}
                    </div>
                </td>
                <td>
                    <div class="editable-exchange-name" data-index="${index}">
                        <span class="exchange-name-display">${item.exchangeName}</span>
                        <input type="text" class="form-control exchange-name-input d-none" value="${item.exchangeName}">
                        <button class="btn btn-sm btn-link p-0 ms-2 edit-exchange-btn" title="Edit Exchange Name">
                            <i class="fas fa-edit text-secondary"></i>
                        </button>
                    </div>
                </td>
                <td>
                    <button class="btn btn-sm btn-outline-danger remove-exchange-btn" data-item-id="${item.id}" title="Remove">
                        <i class="fas fa-times"></i>
                    </button>
                </td>
            </tr>
        `;
    });
    
    tableBody.html(exchangeRowsHtml);
    
    // Update counter to show selected files
    const counterText = exchangeItems.length === 0 ? 
        `<strong>No IFC files selected</strong>` : 
        `<strong>${exchangeItems.length}</strong> IFC File(s) selected`;
    exchangeCounter.html(counterText);
    
    // Enable/disable hub and project selection based on selected files
    updateHubProjectSelectionState();
    
}

// Update hub and project selection state based on selected files
function updateHubProjectSelectionState() {
    const hasSelectedFiles = exchangeItems.length > 0;
    const hubSelect = $('#hubSelect');
    const projectSelect = $('#projectSelect');
    
    if (hasSelectedFiles) {
        // Disable hub and project selection when files are selected
        hubSelect.prop('disabled', true);
        projectSelect.prop('disabled', true);
    } else {
        // Enable hub and project selection when no files are selected
        hubSelect.prop('disabled', false);
        // Project selection depends on hub selection
        if (hubSelect.val() === '') {
            projectSelect.prop('disabled', true);
        } else {
            projectSelect.prop('disabled', false);
        }
    }
}

// Event delegation for remove filter buttons
$(document).on('click', '.remove-filter-btn', function() {
    const filterId = $(this).data('filter-id');
    removeFilter(filterId);
});

// Override the original updateExchangeDisplay to work without filtering
const originalUpdateExchangeDisplay = updateExchangeDisplay;
updateExchangeDisplay = function() {
    // Always start with all items
    filteredExchangeItems = [...exchangeItems];
    
    // Use the filtered display function but without actual filtering
    updateFilteredExchangeDisplay();
    updateCreateExchangeButtonState();
};

// Update Create Exchange button state based on requirements
function updateCreateExchangeButtonState() {
    const hasExchangeFiles = exchangeItems.length > 0;
    const hasFilters = exchangeFilters.length > 0;
    const hasLocation = globalExchangeLocation && globalExchangeLocation.trim() !== '';
    
    const isEnabled = hasExchangeFiles && hasFilters && hasLocation;
    const button = $('#createExchangeBtn');
    const status = $('#createExchangeStatus');
    
    button.prop('disabled', !isEnabled);
    
    if (isEnabled) {
        button.removeClass('btn-secondary').addClass('btn-success');
        status.text('Ready to create exchange with ' + exchangeItems.length + ' IFC File(s)');
    } else {
        button.removeClass('btn-success').addClass('btn-secondary');
        
        status.text('Add IFC files, configure filters, and select location to enable');
    }
    
    console.log('Button state updated:', {
        hasExchangeFiles,
        hasFilters, 
        hasLocation,
        isEnabled,
        missing: !hasExchangeFiles ? 'files' : !hasFilters ? 'filters' : !hasLocation ? 'location' : 'none'
    });
}

// Show error details in a modal
function showErrorDetails(errorMessage) {
    const modalHtml = `
        <div class="modal fade" id="errorDetailsModal" tabindex="-1" aria-labelledby="errorDetailsModalLabel" aria-hidden="true">
            <div class="modal-dialog">
                <div class="modal-content">
                    <div class="modal-header bg-danger text-white">
                        <h5 class="modal-title" id="errorDetailsModalLabel">
                            <i class="fas fa-exclamation-triangle me-2"></i>Error Details
                        </h5>
                        <button type="button" class="btn-close btn-close-white" data-bs-dismiss="modal" aria-label="Close"></button>
                    </div>
                    <div class="modal-body">
                        <div class="alert alert-danger">
                            <i class="fas fa-times-circle me-2"></i>
                            <strong>Error:</strong>
                        </div>
                        <div class="bg-light p-3 rounded">
                            <code>${errorMessage}</code>
                        </div>
                    </div>
                    <div class="modal-footer">
                        <button type="button" class="btn btn-secondary" data-bs-dismiss="modal">Close</button>
                    </div>
                </div>
            </div>
        </div>
    `;
    
    // Remove existing modal if present
    $('#errorDetailsModal').remove();
    
    // Add modal to body
    $('body').append(modalHtml);
    
    // Show modal
    const modal = new bootstrap.Modal(document.getElementById('errorDetailsModal'));
    modal.show();
}

// Clear exchange data (IFC files, location, filters)
function clearExchangeData() {
    // Clear IFC files table (exchange table)
    $('#exchangeTableBody').empty();
    $('#exchangeTableBody').html(`
        <tr id="emptyStateRow">
            <td colspan="3" class="text-center text-muted p-4">
                <i class="fas fa-exchange-alt fa-2x mb-3"></i>
                <small>Click on IFC files in the hierarchy to add them (limit: 10 files)</small>
            </td>
        </tr>
    `);
    
    // Clear exchange items array
    exchangeItems = [];
    
    // Clear exchange location
    $('#globalExchangeLocation').val('');
    
    // Clear filters table
    $('#filterTableBody').empty();
    $('#filterTableBody').html(`
        <tr id="emptyFilterRow">
            <td colspan="3" class="text-center text-muted p-3">
                <i class="fas fa-filter fa-lg mb-2"></i>
                <div>No filters added</div>
                <small>Click "Add Filter" to create exchange filters</small>
            </td>
        </tr>
    `);
    
    // Update exchange counter
    $('#exchangeCounter').html('<strong>No IFC files selected</strong>');
    
    // Update UI state
    updateCreateExchangeButtonState();
    
    // Close the modal
    const modal = bootstrap.Modal.getInstance(document.getElementById('exchangeResultsModal'));
    if (modal) {
        modal.hide();
    }
}

// Show exchange results table
function showExchangeResultsTable(response) {
    const failedExchanges = response.failedExchanges || [];
    const failedExchangeNames = failedExchanges.map(f => f.exchangeName);
    
    // Create results data
    const resultsData = exchangeItems.map(item => {
        const isFailed = failedExchangeNames.includes(item.exchangeName);
        return {
            ifcFile: item.sourceFileName,
            exchangeName: item.exchangeName,
            status: isFailed ? 'Failed' : 'Success',
            error: isFailed ? failedExchanges.find(f => f.exchangeName === item.exchangeName)?.error : null
        };
    });
    
    // Create modal HTML
    const modalHtml = `
        <div class="modal fade" id="exchangeResultsModal" tabindex="-1" aria-labelledby="exchangeResultsModalLabel" aria-hidden="true">
            <div class="modal-dialog modal-lg">
                <div class="modal-content">
                                <div class="modal-header">
                                    <h5 class="modal-title" id="exchangeResultsModalLabel">
                                        <i class="fas fa-exchange-alt me-2"></i>Exchange Results
                                    </h5>
                                    <button type="button" class="btn-close" aria-label="Close" onclick="clearExchangeData()"></button>
                                </div>
                    <div class="modal-body">
                        <div class="table-responsive">
                            <table class="table table-striped table-hover">
                                <thead class="table-dark">
                                    <tr>
                                        <th>IFC File</th>
                                        <th>Exchange Name</th>
                                        <th>Status</th>
                                        <th>Error Details</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    ${resultsData.map(result => `
                                        <tr>
                                            <td>
                                                <i class="fas fa-file-alt text-primary me-2"></i>
                                                ${result.ifcFile}
                                            </td>
                                            <td>${result.exchangeName}</td>
                                            <td>
                                                <span class="badge ${result.status === 'Success' ? 'bg-success' : 'bg-danger'}">
                                                    <i class="fas ${result.status === 'Success' ? 'fa-check' : 'fa-times'} me-1"></i>
                                                    ${result.status}
                                                </span>
                                            </td>
                                            <td>
                                                ${result.error ? `
                                                    <button class="btn btn-sm btn-outline-info" 
                                                            data-bs-toggle="tooltip" 
                                                            data-bs-placement="top" 
                                                            title="${result.error}"
                                                            onclick="showErrorDetails('${result.error.replace(/'/g, "\\'")}')">
                                                        <i class="fas fa-eye"></i>
                                                    </button>
                                                ` : '-'}
                                            </td>
                                        </tr>
                                    `).join('')}
                                </tbody>
                            </table>
                        </div>
                    </div>
                </div>
            </div>
        </div>
    `;
    
    // Remove existing modal if present
    $('#exchangeResultsModal').remove();
    
    // Add modal to body
    $('body').append(modalHtml);
    
    // Show modal
    const modal = new bootstrap.Modal(document.getElementById('exchangeResultsModal'));
    modal.show();
}

// Create Exchange function
function createExchange() {
    
    // Get current hub and project IDs and extract just the IDs from URLs
    const hubIdUrl = $('#hubSelect').val();
    const projectIdUrl = $('#projectSelect').val();
    
    // Extract IDs from URLs (e.g., "https://developer.api.autodesk.com/project/v1/hubs/b.025e101b-ac13-41c7-92f4-59b133457c22" -> "b.025e101b-ac13-41c7-92f4-59b133457c22")
    const hubId = hubIdUrl.split('/').pop();
    const projectId = projectIdUrl.split('/').pop();
    
    // Get hub region from selected option
    const hubRegion = $('#hubSelect option:selected').data('region') || 'US';
    
    // Prepare IFC file data with URNs (urn, exchangeName, and folderUrn)
    const ifcFiles = exchangeItems.map(item => ({
        urn: item.urn,
        exchangeName: item.exchangeName,
        folderUrn: item.folderUrn
    }));
    
    // Prepare exchange data
    const exchangeData = {
        ifcFiles: ifcFiles,
        hubId: hubId,
        projectId: projectId,
        hubRegion: hubRegion,
        exchangeLocationFolderUrn: globalExchangeLocation,
        filters: exchangeFilters.map(filter => ({
            key: filter.key,
            values: filter.values
        }))
    };
    
    
    // Show loading spinner on button
    const createButton = $('#createExchangeBtn');
    const originalButtonText = createButton.html();
    createButton.prop('disabled', true).html(`
        <span class="spinner-border spinner-border-sm me-2" role="status" aria-hidden="true"></span>
        Creating Exchanges...
    `);
    
    // Send data to server
    jQuery.ajax({
        url: '/api/aps/exchange/create',
        method: 'POST',
        contentType: 'application/json',
        data: JSON.stringify(exchangeData),
        success: function(response, textStatus, xhr) {
            
            // Show notification with the message from response
            const message = response.message || 'Exchange operation completed!';
            
            // Determine notification type based on message content
            if (message.includes('partially')) {
                showUnifiedNotification('Partial Success', message, 'warning', 7000);
            } else if (message.includes('Failed to')) {
                showUnifiedNotification('Exchange Failed', message, 'error', 7000);
            } else {
                showUnifiedNotification('Exchanges Created', message, 'success', 5000);
            }
            
            // Show detailed results table
            showExchangeResultsTable(response);
            
            // Restore button to original state
            createButton.prop('disabled', false).html(originalButtonText);
        },
        error: function(xhr, status, error) {
            console.error('Error creating exchange:', error);
            
            // Try to parse error response for better error message
            let errorMessage = 'Error creating exchange. Please try again.';
            try {
                if (xhr.responseJSON && xhr.responseJSON.message) {
                    errorMessage = xhr.responseJSON.message;
                }
            } catch (e) {
                // Use default error message if parsing fails
            }
            
            showUnifiedNotification('Error', errorMessage, 'error', 5000);
            
            // Restore button to original state
            createButton.prop('disabled', false).html(originalButtonText);
        }
    });
}
