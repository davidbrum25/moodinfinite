/**
 * Moodinfinite — Google Drive Cloud Sync
 * =======================================
 * Uses Google Identity Services (token-based flow) + Drive REST API v3.
 * Requires a GCP Client ID embedded below (public / non-secret for browser flows).
 *
 * SETUP: Replace GOOGLE_CLIENT_ID with your own OAuth 2.0 Client ID from
 *        https://console.cloud.google.com/  (no backend required).
 */

const CloudSync = (() => {

    // ─── CONFIGURATION ──────────────────────────────────────────────────────
    const GOOGLE_CLIENT_ID = '437663034251-o3spsku9k6ud9p6un3og7s97vklt9vas.apps.googleusercontent.com';
    const DRIVE_API = 'https://www.googleapis.com/drive/v3';
    const UPLOAD_API = 'https://www.googleapis.com/upload/drive/v3';
    const SCOPES = 'https://www.googleapis.com/auth/drive.file openid email profile';
    const FOLDER_NAME = 'Moodinfinite';

    const BOARD_TYPE_LABELS = {
        'moodinfinite': 'Moodboard',
        'colorseeker': 'Moodtone',
        'storyflow': 'Moodflow',
        'moodgantt': 'Moodgantt',
        'moodlist': 'Moodlist',
        'moodprompt': 'Moodprompt',
        'unknown': 'Unknown Board'
    };

    const BOARD_TYPE_ICONS = {
        'moodinfinite': 'lucide:image',
        'colorseeker': 'lucide:swatch-book',
        'storyflow': 'lucide:clapperboard',
        'moodgantt': 'lucide:gantt-chart',
        'moodlist': 'lucide:list-check',
        'moodprompt': 'lucide:pen-tool',
        'unknown': 'lucide:help-circle'
    };

    const BOARD_TYPE_COLORS = {
        'moodinfinite': '#D4A359',
        'colorseeker': '#ec4899',
        'storyflow': '#eab308',
        'moodgantt': '#10b981',
        'moodlist': '#8b5cf6',
        'moodprompt': '#f97316',
        'unknown': '#B8AFA0'
    };

    // ─── LIFECYCLE / QUOTA CONSTANTS ────────────────────────────────────────
    const HIDDEN_SUSPEND_DELAY_MS = 60_000;
    const IDLE_SUSPEND_DELAY_MS = 180_000;
    const WAKE_CHECK_COOLDOWN_MS = 60_000;
    const POLL_INTERVALS_MS = [120_000, 180_000, 300_000];
    const BACKOFF_BASE_MS = 120_000;
    const BACKOFF_MAX_MS = 1_800_000;
    const STORAGE_CACHE_TTL_MS = 300_000;
    const ACTIVITY_THROTTLE_MS = 10_000;

    // ─── STATE ──────────────────────────────────────────────────────────────
    let _tokenClient = null;
    let _accessToken = null;
    let _tokenExpiry = 0;          // epoch ms
    let _userInfo = null;       // { name, email, picture }
    let _folderId = null;       // Drive folder ID (cached)
    let _ready = false;      // GIS script loaded
    let _syncTimer = null;         // Timeout for adaptive background sync polling
    let _hiddenTimer = null;       // Grace timer before suspending hidden tab
    let _idleTimer = null;         // Inactivity timer before suspending idle tab
    let _isSuspended = false;
    let _suspendReason = null;     // 'hidden' | 'idle' | 'offline' | null
    let _lastCheckTime = 0;        // Last time we checked for remote updates
    let _pollStep = 0;
    let _backoffAttempts = 0;
    let _backoffUntil = 0;
    let _isCheckingRemote = false;
    let _isAutoSaving = false;
    let _pendingAutoSave = false;
    let _storageCache = null;      // { data, fetchedAt, email }
    let _storageInFlight = null;
    let _lastActivityReport = 0;
    let _lifecycleWired = false;
    const _webpBlobCache = window._webpBlobCache || {};     // Share the in-memory cache with script.js

    // Pending callback queues after auth
    let _pendingAuthQueue = [];

    // ─── HELPERS ────────────────────────────────────────────────────────────
    function _isTokenValid() {
        return _accessToken && Date.now() < _tokenExpiry - 60_000; // 1-min buffer
    }

    function _driveHeaders() {
        return {
            Authorization: `Bearer ${_accessToken}`,
            'Content-Type': 'application/json',
        };
    }

    function _createDriveError(status, message, retryAfterSec = null) {
        const err = new Error(message);
        err.status = status;
        err.isRateLimit = status === 429;
        err.isTransient = status === 429 || (status >= 500 && status < 600);
        err.retryAfterSec = retryAfterSec;
        return err;
    }

    function _parseRetryAfter(res) {
        const raw = res?.headers?.get?.('Retry-After');
        if (!raw) return null;
        const sec = parseInt(raw, 10);
        return Number.isFinite(sec) && sec >= 0 ? sec : null;
    }

    async function _fetchDrive(url, options = {}) {
        const { retry = true, ...fetchOptions } = options;
        const maxAttempts = retry ? 3 : 1;

        for (let attempt = 0; attempt < maxAttempts; attempt++) {
            const res = await fetch(url, fetchOptions);
            if (res.ok) return res;

            const text = await res.text().catch(() => '');
            const retryAfterSec = _parseRetryAfter(res);
            const err = _createDriveError(res.status, `Drive API error ${res.status}: ${text}`, retryAfterSec);

            if (err.isTransient && attempt < maxAttempts - 1) {
                const jitter = Math.floor(Math.random() * 250);
                const delay = (retryAfterSec !== null && retryAfterSec <= 10)
                    ? retryAfterSec * 1000
                    : (1000 * Math.pow(2, attempt) + jitter);
                await new Promise(r => setTimeout(r, delay));
                continue;
            }
            throw err;
        }
    }

    async function _fetchJSON(url, options = {}) {
        const res = await _fetchDrive(url, options);
        return res.json();
    }

    function _getActiveLinkedProject() {
        const activeProject = window.projects?.find(p => p.id === window.activeProjectId);
        return activeProject?.data?._cloudFileId ? activeProject : null;
    }

    function _hasSyncableContext() {
        return Boolean(_userInfo && _isTokenValid() && _getActiveLinkedProject() && navigator.onLine !== false);
    }

    function _clearSyncTimer() {
        if (_syncTimer) {
            clearTimeout(_syncTimer);
            _syncTimer = null;
        }
    }

    function _invalidateStorageCache() {
        _storageCache = null;
        _storageInFlight = null;
    }

    function _resolvePendingAuth(token) {
        const queue = _pendingAuthQueue.splice(0);
        queue.forEach(entry => entry.resolve(token));
    }

    function _rejectPendingAuth(err) {
        const queue = _pendingAuthQueue.splice(0);
        queue.forEach(entry => entry.reject(err));
    }

    function _escapeHTML(str) {
        return String(str ?? '')
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;')
            .replace(/'/g, '&#39;');
    }

    // ─── GIS INIT ───────────────────────────────────────────────────────────
    function _initGIS() {
        if (!window.google?.accounts?.oauth2) {
            console.warn('[CloudSync] Google Identity Services not yet loaded.');
            return;
        }
        _tokenClient = window.google.accounts.oauth2.initTokenClient({
            client_id: GOOGLE_CLIENT_ID,
            scope: SCOPES,
            callback: _handleTokenResponse,
            error_callback: _handleTokenError,
        });
        _ready = true;

        // ── Restore UI from cached session (no token request on page load) ──
        // Token is fetched lazily on the first Drive action the user triggers.
        const cached = localStorage.getItem('moodinfinite_cloud_user');
        if (cached) {
            try {
                _userInfo = JSON.parse(cached);
                _updateUI_loggedIn();
            } catch (e) {
                localStorage.removeItem('moodinfinite_cloud_user');
            }
        }
    }

    function _handleTokenResponse(response) {
        if (response.error) {
            _handleTokenError(response);
            return;
        }
        const hadUser = Boolean(_userInfo);
        _accessToken = response.access_token;
        _tokenExpiry = Date.now() + (response.expires_in * 1000);

        // Fetch user profile
        fetch('https://www.googleapis.com/oauth2/v3/userinfo', {
            headers: { Authorization: `Bearer ${_accessToken}` }
        })
            .then(r => {
                if (!r.ok) throw new Error(`UserInfo HTTP ${r.status}`);
                return r.json();
            })
            .then(info => {
                _userInfo = { name: info.name, email: info.email, picture: info.picture };
                // Persist so UI survives page refresh
                localStorage.setItem('moodinfinite_cloud_user', JSON.stringify(_userInfo));
                _updateUI_loggedIn();
                if (!hadUser) {
                    showCloudToast('Signed in to Google Drive ✓', 'success');
                }
                if (_hasSyncableContext() && !_isSuspended) {
                    _scheduleNextPoll();
                }
                _resolvePendingAuth(_accessToken);
            })
            .catch(err => {
                console.error('[CloudSync] Failed to fetch user info:', err);
                _rejectPendingAuth(err);
            });
    }

    function _handleTokenError(err) {
        console.warn('[CloudSync] Auth error:', err);
        _accessToken = null;
        showCloudToast('Sign-in cancelled or failed.', 'error');
        _rejectPendingAuth(err);
    }

    // ─── AUTH FLOW ──────────────────────────────────────────────────────────
    /**
     * Requests an access token. Resolves immediately if token is valid,
     * otherwise opens the Google sign-in popup.
     * If GIS hasn't finished loading yet, waits up to 8 s before failing.
     */
    function _ensureAuth() {
        return new Promise((resolve, reject) => {
            if (_isTokenValid()) return resolve(_accessToken);

            const enqueueAndRequest = () => {
                const alreadyWaiting = _pendingAuthQueue.length > 0;
                _pendingAuthQueue.push({ resolve, reject });
                if (!alreadyWaiting) {
                    _tokenClient.requestAccessToken({ prompt: _userInfo ? '' : 'select_account' });
                }
            };

            // If GIS is not ready yet, wait briefly for it instead of failing immediately.
            // This covers the case where the user triggers an action before the async
            // GIS script has fully initialised.
            if (!_ready) {
                const deadline = Date.now() + 8000;
                const waitPoll = setInterval(() => {
                    if (_ready) {
                        clearInterval(waitPoll);
                        enqueueAndRequest();
                    } else if (Date.now() >= deadline) {
                        clearInterval(waitPoll);
                        reject(new Error('Google Identity Services not loaded. Refresh and try again.'));
                    }
                }, 150);
                return;
            }

            enqueueAndRequest();
        });
    }

    // ─── DRIVE FOLDER ───────────────────────────────────────────────────────
    async function _ensureFolder() {
        if (_folderId) return _folderId;

        // Search for existing Moodinfinite folder
        const q = encodeURIComponent(
            `mimeType='application/vnd.google-apps.folder' and name='${FOLDER_NAME}' and trashed=false`
        );
        const result = await _fetchJSON(
            `${DRIVE_API}/files?q=${q}&fields=files(id,name)`,
            { headers: _driveHeaders() }
        );

        if (result.files && result.files.length > 0) {
            _folderId = result.files[0].id;
            return _folderId;
        }

        // Create the folder
        const created = await _fetchJSON(`${DRIVE_API}/files`, {
            method: 'POST',
            headers: _driveHeaders(),
            body: JSON.stringify({
                name: FOLDER_NAME,
                mimeType: 'application/vnd.google-apps.folder',
            }),
        });
        _folderId = created.id;
        return _folderId;
    }

    // ─── LIST DRIVE FILES ───────────────────────────────────────────────────
    async function listFiles() {
        await _ensureAuth();
        // With drive.file scope the parent folder ID is unreliable across sessions,
        // so we search all accessible files and exclude folders by mimeType.
        const q = encodeURIComponent(
            `(name contains '.mood' or name contains '.zip') ` +
            `and mimeType != 'application/vnd.google-apps.folder' ` +
            `and trashed=false`
        );
        const result = await _fetchJSON(
            `${DRIVE_API}/files?q=${q}&fields=files(id,name,modifiedTime,size,createdTime,appProperties)&orderBy=modifiedTime desc`,
            { headers: _driveHeaders() }
        );
        return result.files || [];
    }

    // ─── DRIVE STORAGE INFO ────────────────────────────────────────────────
    /**
     * Returns { appBytes, totalBytes, usedBytes } for the storage meter.
     */
    async function getDriveStorageInfo() {
        await _ensureAuth();
        const about = await _fetchJSON(
            `${DRIVE_API}/about?fields=storageQuota`,
            { headers: _driveHeaders() }
        );
        const quota = about.storageQuota || {};
        const totalBytes = parseInt(quota.limit || 0, 10);
        const usedBytes = parseInt(quota.usage || 0, 10);

        let appBytes = 0;
        try {
            const files = await listFiles();
            appBytes = files.reduce((sum, f) => sum + (parseInt(f.size || 0, 10)), 0);
        } catch (_) { }

        return { appBytes, totalBytes, usedBytes };
    }

    function _fmtBytes(bytes) {
        if (!bytes || bytes <= 0) return '0 B';
        const units = ['B', 'KB', 'MB', 'GB', 'TB'];
        const i = Math.floor(Math.log(bytes) / Math.log(1024));
        return (bytes / Math.pow(1024, i)).toFixed(i === 0 ? 0 : 1) + ' ' + units[i];
    }

    // ─── UPLOAD FILE ────────────────────────────────────────────────────────
    /**
     * Uploads a Blob to Drive. Uses a single PATCH when existingFileId is known;
     * otherwise resolves the folder/file by name and checks for conflicts.
     * Returns { id, modifiedTime, version, keptDrive? } or null if cancelled.
     */
    async function uploadFile(blob, fileName, boardType, isAutoSave = false, existingFileId = null, needsConflictPrompt = false, existingModifiedTime = null) {
        if (isAutoSave) {
            if (!_isTokenValid()) {
                console.warn('[CloudSync] Autosave cancelled: Google token expired or invalid.');
                return null;
            }
        } else {
            await _ensureAuth();
        }

        // Fast path: 1 request when file ID is already linked
        if (existingFileId) {
            if (needsConflictPrompt && !isAutoSave) {
                const driveDate = existingModifiedTime ? new Date(existingModifiedTime).toLocaleString() : 'Unknown';
                const choice = await _showConflictDialog(fileName, driveDate);
                if (choice === 'cancel') return null;
                if (choice === 'keep-drive') return { id: existingFileId, keptDrive: true };
            }
            try {
                return await _patchFile(existingFileId, blob);
            } catch (err) {
                // If file was deleted remotely, fall back to folder lookup / create
                if (err.status !== 404) throw err;
            }
        }

        const fId = await _ensureFolder();

        // Check if file already exists by name
        const q = encodeURIComponent(
            `name='${fileName}' and '${fId}' in parents and trashed=false`
        );
        const existing = await _fetchJSON(
            `${DRIVE_API}/files?q=${q}&fields=files(id,name,modifiedTime,version,appProperties)`,
            { headers: _driveHeaders() }
        );

        if (existing.files && existing.files.length > 0) {
            const driveFile = existing.files[0];
            const driveDate = new Date(driveFile.modifiedTime).toLocaleString();

            let choice = 'keep-local';
            if (!isAutoSave) {
                choice = await _showConflictDialog(fileName, driveDate);
            }
            if (choice === 'cancel') return null;
            if (choice === 'keep-drive') {
                return {
                    id: driveFile.id,
                    modifiedTime: driveFile.modifiedTime,
                    version: driveFile.version,
                    keptDrive: true,
                };
            }
            // choice === 'keep-local' → overwrite below
            const patched = await _patchFile(driveFile.id, blob);
            if (boardType && driveFile.appProperties?.boardType !== boardType) {
                await _updateMetadata(driveFile.id, boardType);
            }
            return patched;
        }

        // New file upload
        return await _createFile(blob, fileName, boardType, fId);
    }

    async function _createFile(blob, fileName, boardType, folderId) {
        const metadata = {
            name: fileName,
            parents: [folderId]
        };
        if (boardType) {
            metadata.appProperties = { boardType: boardType };
        }
        const form = new FormData();
        form.append('metadata', new Blob([JSON.stringify(metadata)], { type: 'application/json' }));
        form.append('file', blob);

        const res = await _fetchDrive(`${UPLOAD_API}/files?uploadType=multipart&fields=id,modifiedTime,version`, {
            method: 'POST',
            headers: { Authorization: `Bearer ${_accessToken}` },
            body: form,
        });
        const json = await res.json();
        return {
            id: json.id,
            modifiedTime: json.modifiedTime,
            version: json.version,
        };
    }

    async function _patchFile(fileId, blob) {
        const res = await _fetchDrive(`${UPLOAD_API}/files/${fileId}?uploadType=media&fields=id,modifiedTime,version`, {
            method: 'PATCH',
            headers: {
                Authorization: `Bearer ${_accessToken}`,
                'Content-Type': blob.type || 'application/octet-stream',
            },
            body: blob,
        });
        const json = await res.json();
        return {
            id: json.id,
            modifiedTime: json.modifiedTime,
            version: json.version,
        };
    }

    async function _updateMetadata(fileId, boardType) {
        if (!boardType) return;
        try {
            const metadata = {
                appProperties: {
                    boardType: boardType
                }
            };
            await _fetchDrive(`${DRIVE_API}/files/${fileId}`, {
                method: 'PATCH',
                headers: _driveHeaders(),
                body: JSON.stringify(metadata),
            });
        } catch (err) {
            console.warn(`[CloudSync] Error updating metadata for file ${fileId}:`, err);
        }
    }

    // ─── DOWNLOAD FILE ──────────────────────────────────────────────────────
    async function downloadFile(fileId) {
        await _ensureAuth();
        const res = await _fetchDrive(`${DRIVE_API}/files/${fileId}?alt=media`, {
            headers: { Authorization: `Bearer ${_accessToken}` },
        });
        return res.blob();
    }

    // ─── DELETE FILE ────────────────────────────────────────────────────────
    async function deleteFile(fileId) {
        await _ensureAuth();
        await _fetchDrive(`${DRIVE_API}/files/${fileId}`, {
            method: 'DELETE',
            headers: { Authorization: `Bearer ${_accessToken}` },
        });
        return true;
    }

    // ─── CONFLICT DIALOG ────────────────────────────────────────────────────
    function _showConflictDialog(fileName, driveDate) {
        return new Promise(resolve => {
            const overlay = document.getElementById('cloud-conflict-overlay');
            const fileNameEl = document.getElementById('cloud-conflict-filename');
            const driveDateEl = document.getElementById('cloud-conflict-drivedate');
            const keepLocalBtn = document.getElementById('cloud-conflict-keep-local');
            const keepDriveBtn = document.getElementById('cloud-conflict-keep-drive');
            const cancelBtn = document.getElementById('cloud-conflict-cancel');

            fileNameEl.textContent = fileName;
            driveDateEl.textContent = driveDate;
            overlay.style.display = 'flex';

            function cleanup() {
                overlay.style.display = 'none';
                keepLocalBtn.removeEventListener('click', onLocal);
                keepDriveBtn.removeEventListener('click', onDrive);
                cancelBtn.removeEventListener('click', onCancel);
            }
            function onLocal() { cleanup(); resolve('keep-local'); }
            function onDrive() { cleanup(); resolve('keep-drive'); }
            function onCancel() { cleanup(); resolve('cancel'); }

            keepLocalBtn.addEventListener('click', onLocal);
            keepDriveBtn.addEventListener('click', onDrive);
            cancelBtn.addEventListener('click', onCancel);
        });
    }

    // ─── DELETE CONFIRM DIALOG ───────────────────────────────────────────────
    function _showDeleteConfirmDialog(fileName) {
        return new Promise(resolve => {
            const overlay     = document.getElementById('cloud-delete-confirm-overlay');
            const descEl      = document.getElementById('cloud-delete-confirm-desc');
            const confirmBtn  = document.getElementById('cloud-delete-confirm-btn');
            const cancelBtn   = document.getElementById('cloud-delete-cancel-btn');

            if (descEl) descEl.textContent = `Are you sure you want to permanently delete "${fileName}" from Google Drive? This action cannot be undone.`;
            overlay.style.display = 'flex';

            function cleanup() {
                overlay.style.display = 'none';
                confirmBtn.removeEventListener('click', onConfirm);
                cancelBtn.removeEventListener('click', onCancel);
                overlay.removeEventListener('click', onOverlay);
            }
            function onConfirm() { cleanup(); resolve(true); }
            function onCancel()  { cleanup(); resolve(false); }
            function onOverlay(e) { if (e.target === overlay) { cleanup(); resolve(false); } }

            confirmBtn.addEventListener('click', onConfirm);
            cancelBtn.addEventListener('click', onCancel);
            overlay.addEventListener('click', onOverlay);
        });
    }

    // ─── SIGN OUT ────────────────────────────────────────────────────────────
    function signOut() {
        if (_accessToken) {
            window.google?.accounts?.oauth2?.revoke(_accessToken, () => { });
        }
        _accessToken = null;
        _tokenExpiry = 0;
        _userInfo = null;
        _folderId = null;
        _clearSyncTimer();
        _invalidateStorageCache();
        _backoffAttempts = 0;
        _backoffUntil = 0;
        _pollStep = 0;
        _pendingAutoSave = false;
        // Clear persisted session
        localStorage.removeItem('moodinfinite_cloud_user');
        _updateUI_loggedOut();
        showCloudToast('Signed out from Google Drive.', 'success');
    }

    // ─── SWITCH ACCOUNT ─────────────────────────────────────────────────────
    function switchAccount() {
        if (_accessToken) {
            window.google?.accounts?.oauth2?.revoke(_accessToken, () => { });
        }
        _accessToken = null;
        _tokenExpiry = 0;
        _userInfo = null;
        _folderId = null;
        _clearSyncTimer();
        _invalidateStorageCache();
        _backoffAttempts = 0;
        _backoffUntil = 0;
        _pollStep = 0;
        _pendingAutoSave = false;
        // Clear persisted session so we show the account picker freshly
        localStorage.removeItem('moodinfinite_cloud_user');
        _updateUI_loggedOut();
        if (!_ready || !_tokenClient) {
            showCloudToast('Google sign-in is still loading. Try again in a moment.', 'error');
            return;
        }
        // Force account picker on next request
        _tokenClient.requestAccessToken({ prompt: 'select_account' });
    }

    // ─── PUBLIC SAVE & LOAD ─────────────────────────────────────────────────
    function _applySavedProjectMeta(project, result) {
        if (!project) return;
        if (!project.data) project.data = {};
        project.data._cloudSaved = Date.now();
        project.data._cloudFileId = result.id;
        if (result.modifiedTime) project.data._cloudModifiedTime = result.modifiedTime;
        if (result.version) project.data._cloudVersion = result.version;
        project.data._isDirty = false;
        project.data._needsMergeOrReload = false;
    }

    /**
     * Called when the user triggers "Save to Drive".
     * Serialises the current active project into a .mood blob and uploads it.
     */
    async function saveCurrentProject(isAutoSave = false) {
        try {
            setCloudStatus('syncing');

            if (!isAutoSave) {
                await _ensureAuth();
            } else if (!_isTokenValid()) {
                setCloudStatus('idle');
                return;
            }

            showCloudToast('Saving to Google Drive…', 'info');

            const activeProject = window.projects?.find(p => p.id === window.activeProjectId);
            const blob = await _buildProjectBlob(activeProject);
            if (!blob) { setCloudStatus('idle'); return; }

            const fileName = `${(activeProject?.name || 'moodboard').replace(/[^a-z0-9 _-]/gi, '_')}.mood`;
            const existingFileId = activeProject?.data?._cloudFileId || null;
            const needsConflict = Boolean(activeProject?.data?._needsMergeOrReload);
            const existingModifiedTime = activeProject?.data?._cloudModifiedTime || null;

            const result = await uploadFile(
                blob,
                fileName,
                activeProject?.type || 'moodinfinite',
                isAutoSave,
                existingFileId,
                needsConflict,
                existingModifiedTime
            );

            if (result?.keptDrive) {
                if (activeProject?.data?._needsMergeOrReload && result.id) {
                    const meta = (result.modifiedTime && result.version)
                        ? result
                        : await _fetchJSON(`${DRIVE_API}/files/${result.id}?fields=modifiedTime,version`, { headers: _driveHeaders() });
                    await _reloadActiveProject(result.id, meta, activeProject.id);
                } else {
                    setCloudStatus('synced');
                }
                return;
            }

            if (result?.id) {
                _applySavedProjectMeta(activeProject, result);
                _invalidateStorageCache();
                _pollStep = 0;
                _backoffAttempts = 0;
                _backoffUntil = 0;
                _lastCheckTime = Date.now();

                showCloudToast(`Saved "${fileName}" to Drive ✓`, 'success');
                setCloudStatus('synced');
                _scheduleNextPoll();
            } else {
                setCloudStatus('idle');
            }
        } catch (err) {
            console.error('[CloudSync] Save error:', err);
            showCloudToast('Failed to save to Drive.', 'error');
            setCloudStatus('error');
        }
    }

    /**
     * Opens a Drive file picker dialog showing files in the Moodinfinite folder,
     * then loads the selected file into the app.
     */
    async function openFromDrive() {
        try {
            setCloudStatus('syncing');
            const files = await listFiles();

            if (files.length === 0) {
                showCloudToast('No projects found in your Moodinfinite Drive folder.', 'error');
                setCloudStatus('idle');
                return;
            }

            const fileId = await _showDriveFilePicker(files);
            if (!fileId) { setCloudStatus('idle'); return; }

            showCloudToast('Loading project from Drive…', 'info');

            // Get metadata first to store version/modifiedTime
            const meta = await _fetchJSON(`${DRIVE_API}/files/${fileId}?fields=id,name,modifiedTime,version,appProperties`, { headers: _driveHeaders() });

            const blob = await downloadFile(fileId);
            const file = new File([blob], meta.name || 'project.mood');

            // Reuse the existing loadFileFromObject function (returns Promise<project>)
            const newProj = await window.loadFileFromObject(file);
            if (!newProj) {
                throw new Error('Failed to unpack loaded project');
            }

            if (!newProj.data) newProj.data = {};
            newProj.data._cloudFileId = fileId;
            newProj.data._cloudModifiedTime = meta.modifiedTime;
            newProj.data._cloudVersion = meta.version;
            newProj.data._cloudSaved = Date.now();
            newProj.data._isDirty = false;
            newProj.data._needsMergeOrReload = false;
            _pollStep = 0;
            _backoffAttempts = 0;
            _backoffUntil = 0;
            _lastCheckTime = Date.now();
            updateBottomLeftIndicator();
            _scheduleNextPoll();

            // If boardType is not set in Drive metadata, update it now
            if (newProj.type && (!meta.appProperties || !meta.appProperties.boardType)) {
                _updateMetadata(fileId, newProj.type);
            }

            setCloudStatus('synced');
        } catch (err) {
            console.error('[CloudSync] Load error:', err);
            showCloudToast('Failed to load from Drive.', 'error');
            setCloudStatus('error');
        }
    }

    // ─── DRIVE FILE PICKER ───────────────────────────────────────────────────
    function _showDriveFilePicker(files) {
        return new Promise(resolve => {
            const overlay    = document.getElementById('cloud-picker-overlay');
            const list       = document.getElementById('cloud-picker-list');
            const cancelBtn  = document.getElementById('cloud-picker-cancel');
            const sortSel    = document.getElementById('cloud-picker-sort');
            const storageEl  = document.getElementById('cloud-picker-storage');

            let currentFiles = [...files];
            let currentSort = sortSel?.value || 'modified-desc';

            // ── Compute app storage directly from the files list (no extra API call) ──
            function _updateStorageLabel() {
                const totalAppBytes = currentFiles.reduce((s, f) => s + parseInt(f.size || 0, 10), 0);
                if (storageEl) {
                    storageEl.textContent = `${currentFiles.length} project${currentFiles.length !== 1 ? 's' : ''} · ${_fmtBytes(totalAppBytes)} used by Moodinfinite`;
                }
            }
            _updateStorageLabel();

            function _sortFiles(arr, key) {
                const sorted = [...arr];
                switch (key) {
                    case 'modified-desc': sorted.sort((a, b) => new Date(b.modifiedTime) - new Date(a.modifiedTime)); break;
                    case 'modified-asc':  sorted.sort((a, b) => new Date(a.modifiedTime) - new Date(b.modifiedTime)); break;
                    case 'created-desc':  sorted.sort((a, b) => new Date(b.createdTime)  - new Date(a.createdTime));  break;
                    case 'size-desc':     sorted.sort((a, b) => parseInt(b.size || 0) - parseInt(a.size || 0));        break;
                    case 'size-asc':      sorted.sort((a, b) => parseInt(a.size || 0) - parseInt(b.size || 0));        break;
                    case 'name-asc':      sorted.sort((a, b) => a.name.localeCompare(b.name));                         break;
                    case 'name-desc':     sorted.sort((a, b) => b.name.localeCompare(a.name));                         break;
                    case 'type-asc':
                        sorted.sort((a, b) => {
                            const typeA = BOARD_TYPE_LABELS[a.appProperties?.boardType] || BOARD_TYPE_LABELS['unknown'];
                            const typeB = BOARD_TYPE_LABELS[b.appProperties?.boardType] || BOARD_TYPE_LABELS['unknown'];
                            const cmp = typeA.localeCompare(typeB);
                            if (cmp !== 0) return cmp;
                            return a.name.localeCompare(b.name);
                        });
                        break;
                    case 'type-desc':
                        sorted.sort((a, b) => {
                            const typeA = BOARD_TYPE_LABELS[a.appProperties?.boardType] || BOARD_TYPE_LABELS['unknown'];
                            const typeB = BOARD_TYPE_LABELS[b.appProperties?.boardType] || BOARD_TYPE_LABELS['unknown'];
                            const cmp = typeB.localeCompare(typeA);
                            if (cmp !== 0) return cmp;
                            return a.name.localeCompare(b.name);
                        });
                        break;
                }
                return sorted;
            }

            function _renderList(arr) {
                list.innerHTML = '';
                const sorted = _sortFiles(arr, currentSort);
                if (sorted.length === 0) {
                    list.innerHTML = `<div class="cloud-picker-empty"><span>No projects found</span></div>`;
                    return;
                }
                sorted.forEach(f => {
                    const item = document.createElement('div');
                    item.className = 'cloud-picker-item';
                    const date = new Date(f.modifiedTime).toLocaleDateString();
                    const sizeStr = _fmtBytes(parseInt(f.size || 0, 10));

                    const boardType = f.appProperties?.boardType || 'unknown';
                    const typeLabel = BOARD_TYPE_LABELS[boardType] || BOARD_TYPE_LABELS['unknown'];
                    const typeIcon  = BOARD_TYPE_ICONS[boardType] || BOARD_TYPE_ICONS['unknown'];
                    const typeColor = BOARD_TYPE_COLORS[boardType] || BOARD_TYPE_COLORS['unknown'];

                    item.innerHTML = `
                        <iconify-icon class="cloud-picker-icon" icon="${_escapeHTML(typeIcon)}" style="color: ${_escapeHTML(typeColor)}; font-size: 18px; width: 18px; height: 18px;" width="18" height="18"></iconify-icon>
                        <div class="cloud-picker-info">
                            <span class="cloud-picker-name">${_escapeHTML(f.name)}</span>
                            <span class="cloud-picker-meta">${_escapeHTML(date)} · ${_escapeHTML(sizeStr)} · ${_escapeHTML(typeLabel)}</span>
                        </div>
                        <button class="cloud-picker-delete-btn"><iconify-icon icon="lucide:trash-2"></iconify-icon></button>
                    `;
                    item.addEventListener('click', (e) => {
                        if (!e.target.closest('.cloud-picker-delete-btn')) { cleanup(); resolve(f.id); }
                    });
                    item.querySelector('.cloud-picker-delete-btn').addEventListener('click', async (e) => {
                        e.stopPropagation();
                        if (await _showDeleteConfirmDialog(f.name)) {
                            try {
                                await deleteFile(f.id);
                                currentFiles = currentFiles.filter(itemFile => itemFile.id !== f.id);
                                _invalidateStorageCache();
                                _updateStorageLabel();
                                _renderList(currentFiles);
                            } catch (err) {
                                console.error('[CloudSync] Delete error:', err);
                                showCloudToast('Failed to delete file from Drive.', 'error');
                            }
                        }
                    });
                    list.appendChild(item);
                });
            }

            _renderList(currentFiles);
            overlay.style.display = 'flex';
            if (sortSel) sortSel.onchange = () => { currentSort = sortSel.value; _renderList(currentFiles); };
            function cleanup() { overlay.style.display = 'none'; }
            cancelBtn.onclick = () => { cleanup(); resolve(null); };
        });
    }

    // ─── BUILD PROJECT BLOB ──────────────────────────────────────────────────
    /**
     * Replicates the zip-building logic from saveProject() but returns a Blob
     * instead of triggering a download.
     */
    function _buildProjectBlob(t) {
        return new Promise((resolve, reject) => {
            if (!t) { resolve(null); return; }

            const zip = new window.JSZip();
            const folderName = t.name.replace(/[^a-z0-9]/gi, '_').toLowerCase() || 'moodboard';
            const rootDir = zip.folder(folderName);

            if (t.type === 'moodinfinite') {
                const items = t.data.items;
                const imgFolder = rootDir.folder('images');
                const eJSON = {
                    items: window.serializeItems(items),
                    cameraOffset: t.data.cameraOffset,
                    cameraZoom: t.data.cameraZoom,
                    canvasBackgroundColor: t.data.canvasBackgroundColor,
                    accentColor: t.data.accentColor,
                    gridColor: t.data.gridColor,
                    showGrid: t.data.showGrid,
                    snapToGrid: t.data.snapToGrid,
                    showDropShadow: t.data.showDropShadow,
                    gridSize: t.data.gridSize,
                    gridOpacity: t.data.gridOpacity,
                };

                const cache = window.globalImageCache || {};
                const videoCache = window.globalVideoCache || {};
                const usedIds = new Set();
                const usedVideoIds = new Set();
                const extractIds = arr => arr?.forEach(i => {
                    if (i.type === 'image' && i.imageId) usedIds.add(i.imageId);
                    if (i.type === 'video' && i.videoId) usedVideoIds.add(i.videoId);
                    if (i.type === 'group' && i.items) extractIds(i.items);
                });
                extractIds(items);

                const localCache = {};
                const localVideoCache = {};
                const promises = Array.from(usedIds).map(id => new Promise(res => {
                    const b64 = cache[id];
                    if (!b64 || !b64.startsWith('data:image')) { localCache[id] = b64; return res(); }

                    // Check WebP Blob cache first
                    if (_webpBlobCache[id]) {
                        imgFolder.file(`${id}.webp`, _webpBlobCache[id]);
                        localCache[id] = `images/${id}.webp`;
                        return res();
                    }

                    const img = new Image();
                    img.onload = () => {
                        const c = document.createElement('canvas');
                        c.width = img.width; c.height = img.height;
                        c.getContext('2d').drawImage(img, 0, 0);
                        c.toBlob(blob => {
                            if (blob) {
                                _webpBlobCache[id] = blob; // Cache the compressed blob
                                imgFolder.file(`${id}.webp`, blob);
                                localCache[id] = `images/${id}.webp`;
                            } else {
                                localCache[id] = b64;
                            }
                            res();
                        }, 'image/webp', 0.9);
                    };
                    img.onerror = res;
                    img.src = b64;
                }));

                const videoFolder = rootDir.folder('videos');
                const videoPromises = Array.from(usedVideoIds).map(id => new Promise(res => {
                    const videoData = videoCache[id];
                    if (!videoData) return res();
                    if (videoData instanceof Blob) {
                        videoFolder.file(`${id}.bin`, videoData);
                        localVideoCache[id] = `videos/${id}.bin`;
                        res();
                    } else {
                        localVideoCache[id] = videoData;
                        res();
                    }
                }));

                Promise.all([...promises, ...videoPromises]).then(() => {
                    eJSON.globalImageCache = localCache;
                    eJSON.globalVideoCache = localVideoCache;
                    rootDir.file('data.json', JSON.stringify(eJSON, null, 2));
                    zip.generateAsync({ type: 'blob' }).then(resolve).catch(reject);
                }).catch(reject);

            } else if (t.type === 'moodprompt' || t.type === 'storyflow' || t.type === 'colorseeker' || t.type === 'moodgantt' || t.type === 'moodlist') {
                rootDir.file('data.json', JSON.stringify(t.data, null, 2));
                zip.generateAsync({ type: 'blob' }).then(resolve).catch(reject);
            } else {
                resolve(null);
            }
        });
    }

    // ─── TOAST HELPER ────────────────────────────────────────────────────────
    /**
     * Shows a cloud-specific toast.  Falls back to the app's showToast if available.
     */
    function showCloudToast(msg, type = 'success') {
        if (typeof window.showToast === 'function') {
            const icon = type === 'info' ? 'lucide:cloud' : undefined;
            window.showToast(msg, type === 'info' ? 'success' : type);
        }
    }

    // ─── CLOUD STATUS INDICATOR ──────────────────────────────────────────────
    function setCloudStatus(state) {
        // Delegate to updateBottomLeftIndicator to ensure both indicators remain synced
        updateBottomLeftIndicator(state);
    }

    // ─── BOTTOM-LEFT SYNC INDICATOR ──────────────────────────────────────────
    function updateBottomLeftIndicator(forceState = null) {
        const indicator = document.getElementById('cloud-sync-indicator');
        if (!indicator) return;

        // Show indicator on all tabs!
        indicator.classList.add('visible');

        // Determine active project
        const activeProject = window.projects?.find(p => p.id === window.activeProjectId);

        // Determine state
        let state = forceState;
        if (state === 'idle') state = null; // mapping 'idle' to fallback

        if (!state) {
            if (!_userInfo) {
                state = 'not-logged-in';
            } else if (!activeProject || !activeProject.data || !activeProject.data._cloudFileId) {
                state = 'not-synced';
            } else if (activeProject.data._needsMergeOrReload) {
                state = 'remote-change';
            } else if (_isSuspended) {
                state = 'paused';
            } else {
                state = 'synced'; // default state
            }
        }

        // Apply state classes to bottom-left indicator
        indicator.classList.remove('synced', 'syncing', 'error', 'remote-change', 'not-synced', 'not-logged-in', 'paused');
        indicator.classList.add(state);

        // Update icon attribute
        const iconEl = indicator.querySelector('#cloud-sync-icon');
        if (iconEl) {
            if (state === 'remote-change' || state === 'error') {
                iconEl.setAttribute('icon', 'lucide:cloud-alert');
            } else if (state === 'syncing') {
                iconEl.setAttribute('icon', 'lucide:cloud-sync');
            } else if (state === 'not-synced' || state === 'not-logged-in' || (state === 'paused' && _suspendReason === 'offline')) {
                iconEl.setAttribute('icon', 'lucide:cloud-off');
            } else {
                iconEl.setAttribute('icon', 'lucide:cloud');
            }
        }

        // Update text
        const textEl = indicator.querySelector('.cloud-sync-text');
        if (textEl) {
            if (state === 'remote-change') {
                textEl.textContent = 'Remote changes detected. Save to merge or reload.';
            } else if (state === 'syncing') {
                textEl.textContent = 'Syncing with Drive...';
            } else if (state === 'error') {
                textEl.textContent = 'Sync error';
            } else if (state === 'not-synced') {
                textEl.textContent = 'Local board. Click to sync to Drive.';
            } else if (state === 'not-logged-in') {
                textEl.textContent = 'Sign in to sync with Google Drive.';
            } else if (state === 'paused') {
                textEl.textContent = _suspendReason === 'offline'
                    ? 'Offline · Sync paused'
                    : 'Sync paused (idle) · Click to sync';
            } else {
                textEl.textContent = 'Cloud Synced';
            }
        }

        // Also update the toolbar status dot to match the active tab state!
        const statusDot = document.getElementById('cloud-status-dot');
        if (statusDot) {
            statusDot.className = 'cloud-status-dot';
            if (state === 'syncing') {
                statusDot.classList.add('syncing');
            } else if (state === 'synced') {
                statusDot.classList.add('synced');
            } else if (state === 'error') {
                statusDot.classList.add('error');
            } else if (state === 'remote-change') {
                statusDot.classList.add('remote-change');
            } else if (state === 'paused') {
                statusDot.classList.add('paused');
            }
        }

        // Reconcile adaptive polling when switching tabs or updating indicator
        if (!forceState) {
            if (!_hasSyncableContext()) {
                _clearSyncTimer();
            } else if (!_isSuspended && !_syncTimer) {
                _scheduleNextPoll();
            }
        }
    }

    // ─── SMART SUSPENSION & ADAPTIVE BACKGROUND SYNC ─────────────────────────
    function _scheduleNextPoll(overrideDelayMs = null) {
        _clearSyncTimer();
        if (_isSuspended || !_hasSyncableContext()) return;

        let delay;
        if (overrideDelayMs != null) {
            delay = Math.max(1000, overrideDelayMs);
        } else if (_backoffAttempts > 0) {
            const expDelay = Math.min(BACKOFF_MAX_MS, BACKOFF_BASE_MS * Math.pow(2, _backoffAttempts - 1));
            const jitter = Math.floor(Math.random() * 5000);
            delay = Math.max(expDelay + jitter, _backoffUntil - Date.now());
        } else {
            delay = POLL_INTERVALS_MS[Math.min(_pollStep, POLL_INTERVALS_MS.length - 1)];
        }

        _syncTimer = setTimeout(_checkRemoteChanges, delay);
    }

    function _suspendSync(reason) {
        if (_isSuspended && _suspendReason === reason) return;
        _isSuspended = true;
        _suspendReason = reason;
        _clearSyncTimer();
        if (_idleTimer) {
            clearTimeout(_idleTimer);
            _idleTimer = null;
        }
        updateBottomLeftIndicator();
    }

    function _resetIdleTimer() {
        if (_idleTimer) {
            clearTimeout(_idleTimer);
            _idleTimer = null;
        }
        if (document.hidden || navigator.onLine === false) return;
        _idleTimer = setTimeout(() => {
            if (!document.hidden && navigator.onLine !== false && !_isSuspended) {
                _suspendSync('idle');
            }
        }, IDLE_SUSPEND_DELAY_MS);
    }

    function _resumeSync(triggerCheck = true) {
        if (document.hidden || navigator.onLine === false) return;
        const wasSuspended = _isSuspended;
        _isSuspended = false;
        _suspendReason = null;
        _resetIdleTimer();

        if (wasSuspended) {
            _pollStep = 0;
            updateBottomLeftIndicator();

            if (_pendingAutoSave && _autosaveEnabled) {
                _pendingAutoSave = false;
                runAutoSave();
            }

            if (triggerCheck && _hasSyncableContext()) {
                const elapsed = Date.now() - _lastCheckTime;
                if (elapsed >= WAKE_CHECK_COOLDOWN_MS) {
                    _checkRemoteChanges();
                } else {
                    _scheduleNextPoll(WAKE_CHECK_COOLDOWN_MS - elapsed);
                }
            } else {
                _scheduleNextPoll();
            }
        } else if (_hasSyncableContext() && !_syncTimer) {
            _scheduleNextPoll();
        }
    }

    function _wireLifecycleEvents() {
        if (_lifecycleWired) return;
        _lifecycleWired = true;

        document.addEventListener('visibilitychange', () => {
            if (document.hidden) {
                if (_hiddenTimer) clearTimeout(_hiddenTimer);
                if (_idleTimer) {
                    clearTimeout(_idleTimer);
                    _idleTimer = null;
                }
                _hiddenTimer = setTimeout(() => {
                    _hiddenTimer = null;
                    if (document.hidden) _suspendSync('hidden');
                }, HIDDEN_SUSPEND_DELAY_MS);
            } else {
                if (_hiddenTimer) {
                    clearTimeout(_hiddenTimer);
                    _hiddenTimer = null;
                }
                _resumeSync(true);
            }
        });

        const onUserActivity = () => {
            if (document.hidden || navigator.onLine === false) return;
            if (_isSuspended && _suspendReason === 'idle') {
                _lastActivityReport = Date.now();
                _resumeSync(true);
                return;
            }
            const now = Date.now();
            if (now - _lastActivityReport >= ACTIVITY_THROTTLE_MS) {
                _lastActivityReport = now;
                _resetIdleTimer();
            }
        };

        ['pointerdown', 'keydown', 'wheel', 'touchstart'].forEach(evt => {
            window.addEventListener(evt, onUserActivity, { passive: true });
        });

        window.addEventListener('offline', () => {
            if (_hiddenTimer) {
                clearTimeout(_hiddenTimer);
                _hiddenTimer = null;
            }
            _suspendSync('offline');
        });

        window.addEventListener('online', () => {
            if (!document.hidden) _resumeSync(true);
        });

        if (navigator.onLine === false) {
            _suspendSync('offline');
        } else if (document.hidden) {
            _hiddenTimer = setTimeout(() => {
                _hiddenTimer = null;
                if (document.hidden) _suspendSync('hidden');
            }, HIDDEN_SUSPEND_DELAY_MS);
        } else {
            _resetIdleTimer();
        }
    }

    async function _checkRemoteChanges() {
        if (_isCheckingRemote || _isSuspended || !_hasSyncableContext()) return;

        const activeProject = _getActiveLinkedProject();
        if (!activeProject) return;

        const fileId = activeProject.data._cloudFileId;
        const localModifiedTime = activeProject.data._cloudModifiedTime;

        _isCheckingRemote = true;
        _lastCheckTime = Date.now();

        try {
            const meta = await _fetchJSON(
                `${DRIVE_API}/files/${fileId}?fields=modifiedTime,version`,
                { headers: _driveHeaders(), retry: false }
            );

            _backoffAttempts = 0;
            _backoffUntil = 0;

            if (meta.modifiedTime !== localModifiedTime) {
                console.log(`[CloudSync] Remote change detected for ${fileId}. Local: ${localModifiedTime}, Remote: ${meta.modifiedTime}`);
                _pollStep = 0;

                // If local is not dirty, we can auto-reload
                if (!activeProject.data._isDirty) {
                    await _reloadActiveProject(fileId, meta, activeProject.id);
                } else {
                    // Local is dirty, notify user
                    activeProject.data._needsMergeOrReload = true;
                    setCloudStatus('remote-change');
                }
            } else {
                _pollStep = Math.min(_pollStep + 1, POLL_INTERVALS_MS.length - 1);
                if (activeProject.data._needsMergeOrReload) {
                    activeProject.data._needsMergeOrReload = false;
                    setCloudStatus('idle');
                }
            }
        } catch (err) {
            if (err.status === 401) {
                _accessToken = null;
                _tokenExpiry = 0;
                _clearSyncTimer();
                updateBottomLeftIndicator('error');
                showCloudToast('Google Drive session expired. Click to sign in again.', 'error');
                return;
            }
            if (err.isTransient || err.status === 404) {
                _backoffAttempts = Math.min(_backoffAttempts + 1, 5);
                if (err.retryAfterSec != null) {
                    _backoffUntil = Date.now() + err.retryAfterSec * 1000;
                }
            }
            console.warn('[CloudSync] Sync check failed:', err);
        } finally {
            _isCheckingRemote = false;
            _scheduleNextPoll();
        }
    }

    async function _reloadActiveProject(fileId, meta, targetProjectId = null) {
        const expectedProjectId = targetProjectId ?? window.activeProjectId;
        try {
            setCloudStatus('syncing');
            const blob = await downloadFile(fileId);
            const targetProject = window.projects?.find(p => p.id === expectedProjectId);
            if (!targetProject) {
                setCloudStatus('idle');
                return;
            }

            if (typeof window.reloadCurrentProjectFromBlob === 'function') {
                const ok = await window.reloadCurrentProjectFromBlob(blob, expectedProjectId);
                if (ok === false) {
                    throw new Error('reloadCurrentProjectFromBlob returned false');
                }
            } else {
                console.warn('[CloudSync] reloadCurrentProjectFromBlob is not available.');
                setCloudStatus('idle');
                return;
            }

            if (targetProject.data) {
                targetProject.data._cloudModifiedTime = meta.modifiedTime;
                targetProject.data._cloudVersion = meta.version;
                targetProject.data._cloudSaved = Date.now();
                targetProject.data._isDirty = false;
                targetProject.data._needsMergeOrReload = false;
            }
            setCloudStatus('synced');
            showCloudToast('Project synced with remote changes ✓', 'success');
        } catch (err) {
            console.error('[CloudSync] Reload failed:', err);
            setCloudStatus('error');
        }
    }

    // ─── UI: LOGGED IN / LOGGED OUT ──────────────────────────────────────────
    function _updateUI_loggedIn() {
        const loginBtn = document.getElementById('cloud-login-btn');
        const avatarImg = document.getElementById('cloud-avatar-img');
        const avatarIcon = document.getElementById('cloud-avatar-icon');
        const menuAvatar = document.getElementById('cloud-menu-avatar');
        const menuEmail = document.getElementById('cloud-menu-email');
        const menuName = document.getElementById('cloud-menu-name');

        if (!_userInfo) return;

        if (avatarImg) {
            avatarImg.src = _userInfo.picture || '';
            avatarImg.style.display = _userInfo.picture ? 'block' : 'none';
        }
        if (menuAvatar) {
            menuAvatar.src = _userInfo.picture || '';
            menuAvatar.style.display = _userInfo.picture ? 'block' : 'none';
        }
        if (avatarIcon) avatarIcon.style.display = _userInfo.picture ? 'none' : 'flex';
        if (menuEmail) menuEmail.textContent = _userInfo.email;
        if (menuName) menuName.textContent = _userInfo.name;
        if (loginBtn) loginBtn.title = `Signed in as ${_userInfo.email}`;
        updateBottomLeftIndicator();
    }

    // Loads the storage meter — cached in memory for 5 min to avoid redundant API calls
    async function _loadStorageMeter(forceRefresh = false) {
        const storageMeter = document.getElementById('cloud-menu-storage');
        if (!storageMeter || !_isTokenValid()) return;

        const renderStorage = ({ appBytes, totalBytes, usedBytes }) => {
            const appPct  = totalBytes > 0 ? (appBytes  / totalBytes) * 100 : 0;
            const usedPct = totalBytes > 0 ? (usedBytes / totalBytes) * 100 : 0;
            const barColor = appPct > 80 ? '#E8A0A0' : appPct > 50 ? '#D4A359' : '#2589BD';
            storageMeter.innerHTML = `
                <div class="cloud-storage-row">
                    <iconify-icon icon="lucide:database" width="13" height="13"></iconify-icon>
                    <span class="cloud-storage-label">Drive Storage</span>
                    <span class="cloud-storage-value">${_fmtBytes(usedBytes)} / ${_fmtBytes(totalBytes)}</span>
                </div>
                <div class="cloud-storage-track">
                    <div class="cloud-storage-bar" style="width:${Math.min(usedPct,100).toFixed(1)}%; background:rgba(244,241,234,0.25);"></div>
                    <div class="cloud-storage-bar cloud-storage-bar--app" style="width:${Math.min(appPct,100).toFixed(1)}%; background:${barColor};"></div>
                </div>
                <div class="cloud-storage-row" style="margin-top:2px;">
                    <span class="cloud-storage-dot" style="background:${barColor};"></span>
                    <span class="cloud-storage-label">Moodinfinite: ${_fmtBytes(appBytes)}</span>
                </div>
            `;
        };

        const accountEmail = _userInfo?.email || null;
        storageMeter.style.display = 'block';
        if (!forceRefresh && _storageCache && _storageCache.email === accountEmail && (Date.now() - _storageCache.fetchedAt < STORAGE_CACHE_TTL_MS)) {
            renderStorage(_storageCache.data);
            return;
        }

        storageMeter.innerHTML = `<span class="cloud-storage-label">Loading storage…</span>`;
        try {
            if (!_storageInFlight || forceRefresh) {
                _storageInFlight = getDriveStorageInfo().finally(() => {
                    _storageInFlight = null;
                });
            }
            const info = await _storageInFlight;
            if (!_userInfo || _userInfo.email !== accountEmail) return;
            _storageCache = { data: info, fetchedAt: Date.now(), email: accountEmail };
            renderStorage(info);
        } catch (_) {
            storageMeter.style.display = 'none';
        }
    }

    function _updateUI_loggedOut() {
        const avatarImg = document.getElementById('cloud-avatar-img');
        const avatarIcon = document.getElementById('cloud-avatar-icon');
        const menuAvatar = document.getElementById('cloud-menu-avatar');
        const menuEmail = document.getElementById('cloud-menu-email');
        const menuName = document.getElementById('cloud-menu-name');
        const storageMeter = document.getElementById('cloud-menu-storage');

        if (avatarImg) { avatarImg.removeAttribute('src'); avatarImg.style.display = 'none'; }
        if (menuAvatar) { menuAvatar.removeAttribute('src'); menuAvatar.style.display = 'none'; }
        if (avatarIcon) avatarIcon.style.display = 'flex';
        if (menuEmail) menuEmail.textContent = '';
        if (menuName) menuName.textContent = '';
        if (storageMeter) { storageMeter.innerHTML = ''; storageMeter.style.display = 'none'; }
        updateBottomLeftIndicator();
    }

    // ─── SIGN-IN (PUBLIC ENTRY POINT) ─────────────────────────────────────
    async function signIn() {
        try {
            setCloudStatus('syncing');
            await _ensureAuth();
            setCloudStatus('idle');
            return true;
        } catch (err) {
            console.error('[CloudSync] signIn error:', err);
            setCloudStatus('error');
            return false;
        }
    }

    // ─── INIT ────────────────────────────────────────────────────────────────
    function init() {
        // cloud.js is loaded at the bottom of <body>, so the 'load' event has
        // already fired by the time init() runs. Poll immediately instead.
        if (window.google?.accounts?.oauth2) {
            _initGIS();
        } else {
            // Poll for up to 15 s (75 × 200 ms) for the async GIS script to load.
            let attempts = 0;
            const poll = setInterval(() => {
                if (window.google?.accounts?.oauth2) {
                    clearInterval(poll);
                    _initGIS();
                } else if (++attempts > 75) {
                    clearInterval(poll);
                    console.warn('[CloudSync] GIS library failed to load after 15 s.');
                }
            }, 200);
        }

        // Wire up the user account menu and tab lifecycle listeners
        _wireMenuEvents();
        _wireLifecycleEvents();
    }

    function _wireMenuEvents() {
        // Login button → toggle menu if logged in, else sign in
        document.getElementById('cloud-login-btn')?.addEventListener('click', (e) => {
            e.stopPropagation();
            if (_userInfo) {
                const menu = document.getElementById('cloud-user-menu');
                if (menu) {
                    const isOpening = !menu.classList.contains('open');
                    
                    if (isOpening) {
                        const btn = e.currentTarget;
                        const rect = btn.getBoundingClientRect();
                        menu.style.top = (rect.bottom + 8) + 'px';
                        menu.style.right = (window.innerWidth - rect.right) + 'px';
                        _loadStorageMeter();
                    }
                    
                    menu.classList.toggle('open');
                }
            } else {
                signIn();
            }

        });

        // Close menu on outside click
        document.addEventListener('click', () => {
            document.getElementById('cloud-user-menu')?.classList.remove('open');
        });

        // Menu item: Save to Drive
        document.getElementById('cloud-menu-save')?.addEventListener('click', async () => {
            document.getElementById('cloud-user-menu')?.classList.remove('open');
            if (!_userInfo) {
                const ok = await signIn();
                if (!ok) return;
            }
            saveCurrentProject();
        });

        // Menu item: Open from Drive
        document.getElementById('cloud-menu-open')?.addEventListener('click', () => {
            document.getElementById('cloud-user-menu')?.classList.remove('open');
            openFromDrive();
        });

        // Menu item: ComfyUI Settings
        document.getElementById('cloud-menu-settings')?.addEventListener('click', () => {
            document.getElementById('cloud-user-menu')?.classList.remove('open');
            if (window.MoodComfy) window.MoodComfy.openSettingsDialog();
        });

        // Menu item: Switch account
        document.getElementById('cloud-menu-switch')?.addEventListener('click', () => {
            document.getElementById('cloud-user-menu')?.classList.remove('open');
            switchAccount();
        });

        // Menu item: Sign out
        document.getElementById('cloud-menu-signout')?.addEventListener('click', () => {
            document.getElementById('cloud-user-menu')?.classList.remove('open');
            signOut();
        });

        // Bottom-left sync indicator click
        document.getElementById('cloud-sync-indicator')?.addEventListener('click', () => {
            const activeProject = window.projects?.find(p => p.id === window.activeProjectId);
            if (!_userInfo) {
                signIn();
            } else if (activeProject) {
                saveCurrentProject();
            }
        });

        // Conflict dialog buttons handled inside _showConflictDialog

        // Drive file picker cancel
        document.getElementById('cloud-picker-cancel')?.addEventListener('click', () => {
            document.getElementById('cloud-picker-overlay').style.display = 'none';
        });

        // Autosave UI
        _initAutosaveUI();
    }

    let _autosaveTimer = null;
    let _autosaveEnabled = false;
    let _autosaveInterval = 5;

    function _initAutosaveUI() {
        const toggle = document.getElementById('cloud-autosave-toggle');
        const intervalSelect = document.getElementById('cloud-autosave-interval');
        if (!toggle || !intervalSelect) return;

        let settings = { enabled: false, interval: 5 };
        try {
            settings = JSON.parse(localStorage.getItem('moodinfinite_cloud_autosave') || '{"enabled":false, "interval":5}');
        } catch (err) {
            console.warn('[CloudSync] Ignoring unreadable autosave settings.');
        }
        _autosaveEnabled = settings.enabled;
        _autosaveInterval = settings.interval;

        toggle.checked = _autosaveEnabled;
        intervalSelect.value = _autosaveInterval;

        toggle.addEventListener('change', (e) => {
            _autosaveEnabled = e.target.checked;
            _saveAutosaveSettings();
            _updateAutosaveTimer();
        });

        intervalSelect.addEventListener('change', (e) => {
            _autosaveInterval = parseInt(e.target.value, 10);
            _saveAutosaveSettings();
            _updateAutosaveTimer();
        });

        _updateAutosaveTimer();
    }

    function _saveAutosaveSettings() {
        localStorage.setItem('moodinfinite_cloud_autosave', JSON.stringify({
            enabled: _autosaveEnabled,
            interval: _autosaveInterval
        }));
    }

    function _updateAutosaveTimer() {
        if (_autosaveTimer) {
            clearInterval(_autosaveTimer);
            _autosaveTimer = null;
        }
        if (_autosaveEnabled && _autosaveInterval > 0) {
            _autosaveTimer = setInterval(runAutoSave, _autosaveInterval * 60 * 1000);
        }
    }

    async function runAutoSave() {
        if (!_userInfo || !_isTokenValid() || _isAutoSaving) return;
        if (_isSuspended || navigator.onLine === false) {
            _pendingAutoSave = true;
            return;
        }

        _isAutoSaving = true;
        try {
            let savedAny = false;
            for (const proj of window.projects || []) {
                // Only autosave boards already linked to Google Drive
                if (!proj.data || !proj.data._cloudFileId) continue;
                if (proj.data._needsMergeOrReload) continue;

                const localMod = proj.data._localModified || 0;
                const cloudSave = proj.data._cloudSaved || 0;
                if (!proj.data._isDirty && localMod <= cloudSave) continue;

                const oldCloudSaved = proj.data._cloudSaved;
                proj.data._cloudSaved = Date.now();
                console.log(`[CloudSync] Autosaving "${proj.name}"...`);
                const blob = await _buildProjectBlob(proj);
                if (blob) {
                    const fileName = `${(proj.name || 'moodboard').replace(/[^a-z0-9 _-]/gi, '_')}.mood`;
                    const result = await uploadFile(blob, fileName, proj.type, true, proj.data._cloudFileId);
                    if (result?.id) {
                        _applySavedProjectMeta(proj, result);
                        savedAny = true;
                    } else {
                        proj.data._cloudSaved = oldCloudSaved;
                    }
                } else {
                    proj.data._cloudSaved = oldCloudSaved;
                }
            }

            if (savedAny) {
                _invalidateStorageCache();
                _pollStep = 0;
                _backoffAttempts = 0;
                _backoffUntil = 0;
                _lastCheckTime = Date.now();
                setCloudStatus('synced');
                _scheduleNextPoll();
            }
        } catch (err) {
            console.warn('[CloudSync] Autosave failed:', err);
        } finally {
            _isAutoSaving = false;
        }
    }

    // ─── PUBLIC API ──────────────────────────────────────────────────────────
    return {
        init,
        signIn,
        signOut,
        switchAccount,
        saveCurrentProject,
        openFromDrive,
        runAutoSave,
        setCloudStatus,
        showCloudToast,
        updateIndicator: updateBottomLeftIndicator,
        get isLoggedIn() { return !!_userInfo; },
        get userInfo() { return _userInfo; },
        get isSuspended() { return _isSuspended; },
        get suspendReason() { return _suspendReason; },
        get lastCheckTime() { return _lastCheckTime; },
        buildProjectBlob: _buildProjectBlob,
    };

})();

window.CloudSync = CloudSync;

// Auto-initialise on DOM ready
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', CloudSync.init);
} else {
    CloudSync.init();
}
