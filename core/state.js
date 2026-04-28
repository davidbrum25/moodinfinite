/**
 * Central Application State
 * Stores all global mutable variables previously housed in script.js
 */
export const state = {
    // Project Management
    projects: [],
    activeProjectId: null,
    projectPendingClose: null,
    autoSaveTimeout: null,

    // Tools and Interaction
    currentTool: 'select',
    isDragging: false,
    isMovingItems: false,
    isConnectionMode: false,
    
    // Canvas Viewport
    offsetX: 0,
    offsetY: 0,
    zoom: 1,
    
    // Connection State
    connectingFromItem: null,
    connectingFromPort: null,
    hoveredPort: null,

    // Selection
    selectionBox: null,
    
    // Clipboard
    clipboard: null,
    internalClipboardTimestamp: 0,
    
    // UI State
    canvasBackgroundColor: '#0d0d0d',
    platformData: {
        isMac: navigator.platform.toUpperCase().indexOf('MAC') >= 0,
        isIOS: /iPad|iPhone|iPod/.test(navigator.userAgent) && !window.MSStream,
        isAndroid: /android/i.test(navigator.userAgent)
    }
};

export const CONSTANTS = {
    MAX_ZOOM: 5,
    MIN_ZOOM: 0.05,
    DEFAULT_CANVAS_BG: '#0d0d0d'
};
