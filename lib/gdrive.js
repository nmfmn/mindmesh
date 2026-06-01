// MindMesh Google Drive Sync — uses drive.appdata scope

const GDrive = {
  FILE_NAME: 'mindmesh-sync.json',
  _fileId: null,

  // --- Auth ---
  async getToken(interactive = false) {
    return new Promise((resolve, reject) => {
      chrome.identity.getAuthToken({ interactive }, (token) => {
        if (chrome.runtime.lastError) {
          reject(new Error(chrome.runtime.lastError.message));
        } else {
          resolve(token);
        }
      });
    });
  },

  async removeCachedToken() {
    return new Promise((resolve) => {
      chrome.identity.getAuthToken({}, (token) => {
        if (token) {
          chrome.identity.removeCachedAuthToken({ token }, resolve);
        } else {
          resolve();
        }
      });
    });
  },

  // --- Drive API helpers ---
  async _fetch(url, options = {}, retryAuth = true) {
    const token = await this.getToken(false);
    const res = await fetch(url, {
      ...options,
      headers: {
        ...options.headers,
        'Authorization': `Bearer ${token}`
      }
    });

    // Token expired — refresh and retry once
    if (res.status === 401 && retryAuth) {
      await this.removeCachedToken();
      return this._fetch(url, options, false);
    }

    return res;
  },

  // Find or create the sync file in Drive
  async _findFile() {
    if (this._fileId) return this._fileId;

    const res = await this._fetch(
      'https://www.googleapis.com/drive/v3/files?fields=files(id,name)&q=' +
      encodeURIComponent(`name='${this.FILE_NAME}' and trashed=false`)
    );
    const data = await res.json();

    if (data.files && data.files.length > 0) {
      this._fileId = data.files[0].id;
      return this._fileId;
    }
    return null;
  },

  // --- Read sync data from Drive ---
  async pull() {
    try {
      const fileId = await this._findFile();
      if (!fileId) return null; // No data on Drive yet

      const res = await this._fetch(
        `https://www.googleapis.com/drive/v3/files/${fileId}?alt=media`
      );
      if (!res.ok) return null;
      return await res.json();
    } catch (e) {
      console.warn('GDrive pull failed:', e.message);
      return null;
    }
  },

  // --- Write sync data to Drive ---
  async push(data) {
    try {
      const token = await this.getToken(true); // Interactive on first push
      const fileId = await this._findFile();
      const body = JSON.stringify(data);

      const metadata = {
        name: this.FILE_NAME,
        mimeType: 'application/json'
      };

      // Build multipart request
      const boundary = 'mindmesh_boundary_' + Date.now();
      let multipartBody =
        `--${boundary}\r\n` +
        `Content-Type: application/json; charset=UTF-8\r\n\r\n` +
        `${JSON.stringify(metadata)}\r\n` +
        `--${boundary}\r\n` +
        `Content-Type: application/json\r\n\r\n` +
        `${body}\r\n` +
        `--${boundary}--`;

      let url, method;
      if (fileId) {
        // Update existing file
        url = `https://www.googleapis.com/upload/drive/v3/files/${fileId}?uploadType=multipart`;
        method = 'PATCH';
      } else {
        // Create new file in appdata
        url = 'https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart&fields=id';
        method = 'POST';
      }

      const res = await fetch(url, {
        method,
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': `multipart/related; boundary=${boundary}`
        },
        body: multipartBody
      });

      if (res.status === 401) {
        await this.removeCachedToken();
        throw new Error('Token expired, please retry');
      }

      if (!res.ok) {
        const errText = await res.text();
        throw new Error(`Drive upload failed (${res.status}): ${errText}`);
      }

      if (!fileId) {
        const result = await res.json();
        this._fileId = result.id;
      }

      return true;
    } catch (e) {
      console.warn('GDrive push failed:', e.message);
      throw e;
    }
  },

  // --- Check if user is connected ---
  async isConnected() {
    try {
      const token = await this.getToken(false);
      return !!token;
    } catch {
      return false;
    }
  },

  // --- Disconnect (remove cached token) ---
  async disconnect() {
    await this.removeCachedToken();
    this._fileId = null;
  }
};
