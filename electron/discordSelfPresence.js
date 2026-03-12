const { spawn } = require('child_process');
const path = require('path');
const fs = require('fs');

const SERVICE_NAME = 'SanctionTV';
const TOKEN_ACCOUNT = 'discord_self_token';
const MIN_UPDATE_INTERVAL_MS = 1000;
const RESTART_BACKOFF_MS = 5000;

function safeJsonParse(value) {
  try {
    return JSON.parse(value);
  } catch {
    return null;
  }
}

function redactToken(value) {
  if (!value || typeof value !== 'string') return value;
  if (value.length < 8) return '***';
  return `${value.slice(0, 4)}***${value.slice(-4)}`;
}

class DiscordSelfPresenceService {
  constructor(options = {}) {
    this.onStatusChange = options.onStatusChange || (() => {});
    this.helperProcess = null;
    this.stdoutBuffer = '';
    this.enabled = false;
    this.showProviderQuality = false;
    this.status = { state: 'disabled' };
    this.lastPresenceSignature = null;
    this.lastPresenceSentAt = 0;
    this.lastPresencePayload = null;
    this.isShuttingDown = false;
    this.restartTimer = null;
    this.helperReady = false;
    this.pendingInitToken = null;
    this.keytar = null;
    this.keytarAvailable = false;
    this._loadKeytar();
  }

  _loadKeytar() {
    try {
      this.keytar = require('keytar');
      this.keytarAvailable = true;
    } catch (error) {
      this.keytarAvailable = false;
      this.keytar = null;
      console.warn('[discord-self] keytar unavailable:', error && error.message ? error.message : error);
    }
  }

  _setStatus(next) {
    this.status = next;
    try {
      this.onStatusChange(next);
    } catch {}
  }

  getStatus() {
    return this.status;
  }

  async getConfig() {
    const tokenPresent = this.keytarAvailable ? !!(await this.getToken()) : false;
    return {
      enabled: this.enabled,
      tokenPresent,
      showProviderQuality: this.showProviderQuality,
      keytarAvailable: this.keytarAvailable,
    };
  }

  async saveToken(token) {
    if (!this.keytarAvailable || !this.keytar) {
      return { ok: false, error: 'OS keychain unavailable (keytar not installed or failed to load)' };
    }
    if (!token || typeof token !== 'string') {
      return { ok: false, error: 'Token is required' };
    }
    try {
      await this.keytar.setPassword(SERVICE_NAME, TOKEN_ACCOUNT, token.trim());
      if (this.enabled) {
        await this.startIfConfigured();
      }
      return { ok: true };
    } catch (error) {
      return { ok: false, error: error instanceof Error ? error.message : 'Failed to save token' };
    }
  }

  async deleteToken() {
    if (!this.keytarAvailable || !this.keytar) {
      return { ok: false, error: 'OS keychain unavailable (keytar not installed or failed to load)' };
    }
    try {
      await this.keytar.deletePassword(SERVICE_NAME, TOKEN_ACCOUNT);
      await this.clearPresence();
      this.stopHelper();
      this._setStatus(this.enabled ? { state: 'token_missing' } : { state: 'disabled' });
      return { ok: true };
    } catch (error) {
      return { ok: false, error: error instanceof Error ? error.message : 'Failed to delete token' };
    }
  }

  async getToken() {
    if (!this.keytarAvailable || !this.keytar) return null;
    try {
      return await this.keytar.getPassword(SERVICE_NAME, TOKEN_ACCOUNT);
    } catch (error) {
      console.error('[discord-self] Failed to read token from keychain:', error);
      return null;
    }
  }

  async setEnabled(enabled) {
    this.enabled = !!enabled;
    if (!this.enabled) {
      await this.clearPresence();
      this.stopHelper();
      this._setStatus({ state: 'disabled' });
      return;
    }
    await this.startIfConfigured();
  }

  setShowProviderQuality(show) {
    this.showProviderQuality = !!show;
  }

  async setConfig(config = {}) {
    if (typeof config.showProviderQuality === 'boolean') {
      this.showProviderQuality = config.showProviderQuality;
    }
    if (typeof config.enabled === 'boolean') {
      await this.setEnabled(config.enabled);
    }
  }

  async startIfConfigured() {
    if (!this.enabled) {
      this._setStatus({ state: 'disabled' });
      return;
    }

    if (!this.keytarAvailable) {
      this._setStatus({ state: 'helper_error', message: 'keytar unavailable for secure token storage' });
      return;
    }

    const token = await this.getToken();
    if (!token) {
      this._setStatus({ state: 'token_missing' });
      return;
    }

    if (this.helperProcess && !this.helperProcess.killed) {
      if (!this.helperReady && this.pendingInitToken !== token) {
        this.sendCommand({ type: 'init', token, logLevel: 'info' });
        this.pendingInitToken = token;
      }
      return;
    }

    this.spawnHelper(token);
  }

  _getHelperPath() {
    return path.join(__dirname, 'python', 'discord_presence_helper.py');
  }

  _resolvePythonCommand() {
    const explicitPython = process.env.CINESTREAM_DISCORD_PYTHON;
    if (explicitPython && explicitPython.trim()) {
      return { command: explicitPython.trim(), args: [] };
    }

    if (process.platform === 'win32') {
      // Prefer known-working versions for discord.py-self before falling back to the latest.
      // `py -3` may pick Python 3.14, which currently breaks some discord.py-self deps.
      const preferredVersion = process.env.CINESTREAM_DISCORD_PY_VERSION || '3.12';
      return { command: 'py', args: [`-${preferredVersion}`] };
    }
    return { command: 'python3', args: [] };
  }

  spawnHelper(token) {
    const helperPath = this._getHelperPath();
    if (!fs.existsSync(helperPath)) {
      this._setStatus({ state: 'python_missing', message: `Helper script not found: ${helperPath}` });
      return;
    }

    const { command, args } = this._resolvePythonCommand();
    const finalArgs = [...args, helperPath];
    this.stdoutBuffer = '';
    this.helperReady = false;
    this.pendingInitToken = token;
    this.isShuttingDown = false;
    this._setStatus({ state: 'starting' });

    const child = spawn(command, finalArgs, {
      cwd: process.cwd(),
      stdio: ['pipe', 'pipe', 'pipe'],
      windowsHide: true,
    });

    this.helperProcess = child;

    child.on('spawn', () => {
      this.sendCommand({ type: 'init', token, logLevel: 'info' });
    });

    child.stdout.on('data', (chunk) => {
      this._handleStdout(chunk.toString());
    });

    child.stderr.on('data', (chunk) => {
      const text = chunk.toString().trim();
      if (!text) return;
      const sanitized = text.replace(/[A-Za-z0-9_\-]{20,}\.[A-Za-z0-9_\-]{6,}\.[A-Za-z0-9_\-]{20,}/g, '[REDACTED_TOKEN]');
      console.warn('[discord-self helper stderr]', sanitized);
      if (this.status.state === 'starting') {
        this._setStatus({ state: 'helper_error', message: sanitized.slice(0, 240) });
      }
    });

    child.on('error', (error) => {
      this.helperProcess = null;
      const msg = error instanceof Error ? error.message : String(error);
      const state = msg.toLowerCase().includes('enoent') ? 'python_missing' : 'helper_error';
      this._setStatus({ state, message: msg });
    });

    child.on('exit', (code, signal) => {
      const wasIntentional = this.isShuttingDown;
      this.helperProcess = null;
      this.helperReady = false;

      if (!this.enabled) {
        this._setStatus({ state: 'disabled' });
        return;
      }

      if (wasIntentional) {
        this._setStatus({ state: 'disconnected', message: 'Helper stopped' });
        return;
      }

      this._setStatus({ state: 'disconnected', message: `Helper exited (${code ?? 'null'}${signal ? `, ${signal}` : ''})` });
      this._scheduleRestart();
    });
  }

  _scheduleRestart() {
    if (!this.enabled) return;
    if (this.restartTimer) return;
    this.restartTimer = setTimeout(async () => {
      this.restartTimer = null;
      await this.startIfConfigured();
      if (this.lastPresencePayload) {
        this.updatePresence(this.lastPresencePayload);
      }
    }, RESTART_BACKOFF_MS);
  }

  _handleStdout(text) {
    this.stdoutBuffer += text;
    let idx;
    while ((idx = this.stdoutBuffer.indexOf('\n')) !== -1) {
      const line = this.stdoutBuffer.slice(0, idx).trim();
      this.stdoutBuffer = this.stdoutBuffer.slice(idx + 1);
      if (!line) continue;
      const msg = safeJsonParse(line);
      if (!msg) {
        console.warn('[discord-self] Non-JSON helper output:', line.slice(0, 200));
        continue;
      }
      this._handleHelperMessage(msg);
    }
  }

  _handleHelperMessage(msg) {
    if (msg.type === 'status') {
      if (msg.state === 'connected') {
        this.helperReady = true;
        if (this.lastPresencePayload) {
          // Re-send the latest presence now that the helper is actually ready.
          setTimeout(() => {
            this.updatePresence(this.lastPresencePayload).catch((error) => {
              console.error('[discord-self] resend after connect failed:', error);
            });
          }, 250);
        }
      }
      this._setStatus({
        state: msg.state || 'helper_error',
        ...(msg.message ? { message: String(msg.message) } : {}),
      });
      return;
    }
    if (msg.type === 'error') {
      const detail = [msg.message, msg.details].filter(Boolean).join(' - ');
      this._setStatus({ state: 'helper_error', message: String(detail || 'Unknown helper error') });
      return;
    }
    if (msg.type === 'ack') {
      // Keep debug visibility without changing status away from connected.
      return;
    }
  }

  sendCommand(command) {
    if (!this.helperProcess || this.helperProcess.killed || !this.helperProcess.stdin.writable) return false;
    try {
      const payload = { ...command };
      if (payload.token) {
        // Keep token out of logs if debugging is added later.
        payload._redacted = redactToken(payload.token);
      }
      this.helperProcess.stdin.write(`${JSON.stringify(command)}\n`);
      return true;
    } catch (error) {
      console.error('[discord-self] Failed to send command:', error);
      return false;
    }
  }

  _buildPresenceText(payload) {
    const title = String(payload.discordTitle || payload.title || 'Unknown').trim();
    const isTv = payload.mediaType === 'tv';
    const episodeName = String(payload.episodeName || '').trim();

    let details = episodeName;
    if (!details && isTv) {
      details = payload.season && payload.episode ? `S${payload.season}E${payload.episode}` : '';
    }

    let stateText =
      payload.playbackState === 'paused'
        ? 'Paused'
        : payload.playbackState === 'buffering'
          ? 'Buffering'
          : 'Playing';

    if (this.showProviderQuality) {
      const extras = [payload.provider, payload.quality].filter(Boolean).join(' - ');
      if (extras) stateText = `${stateText} - ${extras}`;
    }

    return {
      name: title.slice(0, 120),
      details: details.slice(0, 120),
      stateText: stateText.slice(0, 120),
    };
  }

  async updatePresence(payload) {
    if (!this.enabled) return;
    this.lastPresencePayload = payload;

    if (!payload || !payload.title || !payload.mediaType) return;

    await this.startIfConfigured();
    if (!this.helperProcess) return;
    if (!this.helperReady) return;

    const signature = JSON.stringify({
      m: payload.mediaType,
      id: payload.tmdbId,
      t: payload.title,
      dt: payload.discordTitle || null,
      s: payload.season || null,
      e: payload.episode || null,
      en: payload.episodeName || null,
      p: payload.playbackState,
      c: typeof payload.currentTimeSec === 'number' ? Math.floor(payload.currentTimeSec) : null,
      d: typeof payload.durationSec === 'number' ? Math.floor(payload.durationSec) : null,
      stm: payload.startTimestampMs || null,
      etm: payload.endTimestampMs || null,
      b: Array.isArray(payload.buttons) ? payload.buttons.length : 0,
      raw: !!payload.forceRawRich,
      rat: payload.rawActivityType || null,
      pr: this.showProviderQuality ? payload.provider || null : null,
      q: this.showProviderQuality ? payload.quality || null : null,
    });

    const now = Date.now();
    const forceImmediate = !!payload.forceImmediate;
    if (!forceImmediate && signature === this.lastPresenceSignature && now - this.lastPresenceSentAt < 15000) {
      return;
    }
    if (!forceImmediate && now - this.lastPresenceSentAt < MIN_UPDATE_INTERVAL_MS) {
      return;
    }

    const mapped = this._buildPresenceText(payload);
    const defaultAppId =
      process.env.CINESTREAM_DISCORD_APP_ID ||
      process.env.CINESTREAM_DISCORD_TEST_APP_ID ||
      undefined;
    const defaultLargeImage =
      process.env.CINESTREAM_DISCORD_LARGE_IMAGE ||
      process.env.CINESTREAM_DISCORD_TEST_LARGE_IMAGE ||
      undefined;
    const defaultLargeText =
      process.env.CINESTREAM_DISCORD_LARGE_TEXT ||
      process.env.CINESTREAM_DISCORD_TEST_LARGE_TEXT ||
      'SanctionTV';
    const smallImageByState =
      payload.playbackState === 'paused'
        ? (process.env.CINESTREAM_DISCORD_SMALL_IMAGE_PAUSED || process.env.CINESTREAM_DISCORD_TEST_SMALL_IMAGE || undefined)
        : payload.playbackState === 'buffering'
          ? (process.env.CINESTREAM_DISCORD_SMALL_IMAGE_BUFFERING || process.env.CINESTREAM_DISCORD_TEST_SMALL_IMAGE || undefined)
          : (process.env.CINESTREAM_DISCORD_SMALL_IMAGE_PLAYING || process.env.CINESTREAM_DISCORD_TEST_SMALL_IMAGE || undefined);
    const sent = this.sendCommand({
      type: 'set_presence',
      payload: {
        mediaType: payload.mediaType,
        tmdbId: payload.tmdbId,
        title: payload.title,
        discordTitle: payload.discordTitle,
        episodeName: payload.episodeName,
        season: payload.season,
        episode: payload.episode,
        playbackState: payload.playbackState,
        currentTimeSec: payload.currentTimeSec,
        durationSec: payload.durationSec,
        startTimestampMs: payload.startTimestampMs,
        endTimestampMs: payload.endTimestampMs,
        buttons: payload.buttons,
        forceRawRich: payload.forceRawRich,
        forceImmediate: payload.forceImmediate,
        rawActivityType: payload.rawActivityType,
        applicationId: payload.applicationId || defaultAppId,
        largeImage: payload.largeImage || defaultLargeImage,
        largeText: payload.largeText || defaultLargeText,
        smallImage: payload.smallImage || smallImageByState,
        smallText: payload.smallText || mapped.stateText,
        name: mapped.name,
        details: mapped.details,
        stateText: mapped.stateText,
      },
    });
    if (sent) {
      this.lastPresenceSignature = signature;
      this.lastPresenceSentAt = now;
    }
  }

  async clearPresence() {
    this.lastPresenceSignature = null;
    this.lastPresencePayload = null;
    if (this.helperProcess && !this.helperProcess.killed) {
      this.sendCommand({ type: 'clear_presence' });
    }
  }

  stopHelper() {
    if (this.restartTimer) {
      clearTimeout(this.restartTimer);
      this.restartTimer = null;
    }
    if (!this.helperProcess || this.helperProcess.killed) {
      this.helperProcess = null;
      this.helperReady = false;
      return;
    }
    this.isShuttingDown = true;
    this.sendCommand({ type: 'shutdown' });
    setTimeout(() => {
      if (this.helperProcess && !this.helperProcess.killed) {
        this.helperProcess.kill();
      }
    }, 1500);
  }

  async shutdown() {
    this.enabled = false;
    await this.clearPresence();
    this.stopHelper();
    this._setStatus({ state: 'disabled' });
  }
}

module.exports = { DiscordSelfPresenceService };
