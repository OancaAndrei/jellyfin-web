/**
 * Module that manages the SyncPlay feature.
 * @module components/syncPlay/syncPlayManager
 */

import events from 'events';
import playbackManager from 'playbackManager';
import timeSyncManager from 'timeSyncManager';
import * as syncPlayHelper from 'syncPlayHelper';
import SyncPlayPlaybackCore from 'syncPlayPlaybackCore';
import SyncPlayQueueCore from 'syncPlayQueueCore';
import toast from 'toast';
import globalize from 'globalize';

/**
 * Class that manages the SyncPlay feature.
 */
class SyncPlayManager {
    constructor() {
        this.playbackCore = new SyncPlayPlaybackCore(this);
        this.queueCore = new SyncPlayQueueCore(this);

        this.syncMethod = 'None'; // used for stats

        this.groupInfo = null;
        this.syncPlayEnabledAt = null; // Server time of when SyncPlay has been enabled
        this.syncPlayReady = false; // SyncPlay is ready after first ping to server
        this.followingGroupPlayback = true; // Follow or ignore group playback

        this.queuedCommand = null; // Queued playback command, applied when SyncPlay is ready

        this.notifySyncPlayReady = false;

        events.on(timeSyncManager, 'update', (event, error, timeOffset, ping) => {
            if (error) {
                console.debug('SyncPlay, time update issue', error);
                return;
            }

            if (this.notifySyncPlayReady) {
                this.syncPlayReady = true;
                events.trigger(this, 'ready');
                this.notifySyncPlayReady = false;
            }

            // Report ping
            if (this.syncEnabled) {
                const apiClient = window.connectionManager.currentApiClient();
                apiClient.sendSyncPlayPing({
                    Ping: ping
                });
            }
        });

        events.on(this, 'playbackstop', (event, stopInfo) => {
            this.queuedCommand = null;
        });
    }

    /**
     * Handles a group update from the server.
     * @param {Object} cmd The group update.
     * @param {Object} apiClient The ApiClient.
     */
    processGroupUpdate(cmd, apiClient) {
        switch (cmd.Type) {
            case 'PlayQueue':
                this.queueCore.updatePlayQueue(apiClient, cmd.Data);
                break;
            case 'UserJoined':
                toast({
                    text: globalize.translate('MessageSyncPlayUserJoined', cmd.Data)
                });
                break;
            case 'UserLeft':
                toast({
                    text: globalize.translate('MessageSyncPlayUserLeft', cmd.Data)
                });
                break;
            case 'GroupJoined':
                this.enableSyncPlay(apiClient, cmd.Data, true);
                break;
            case 'NotInGroup':
            case 'GroupLeft':
                this.disableSyncPlay(true);
                break;
            case 'StateUpdate':
                events.trigger(syncPlayManager, 'group-state-update', [cmd.Data.State, cmd.Data.Reason]);
                console.debug('SyncPlay processGroupUpdate: StateUpdate', cmd.Data.State, cmd.Data.Reason);
                break;
            case 'GroupDoesNotExist':
                toast({
                    text: globalize.translate('MessageSyncPlayGroupDoesNotExist')
                });
                break;
            case 'CreateGroupDenied':
                toast({
                    text: globalize.translate('MessageSyncPlayCreateGroupDenied')
                });
                break;
            case 'JoinGroupDenied':
                toast({
                    text: globalize.translate('MessageSyncPlayJoinGroupDenied')
                });
                break;
            case 'LibraryAccessDenied':
                toast({
                    text: globalize.translate('MessageSyncPlayLibraryAccessDenied')
                });
                break;
            default:
                console.error('processSyncPlayGroupUpdate: command is not recognised: ' + cmd.Type);
                break;
        }
    }

    /**
     * Handles a playback command from the server.
     * @param {Object} cmd The playback command.
     * @param {Object} apiClient The ApiClient.
     */
    processCommand(cmd, apiClient) {
        if (cmd === null) return;

        if (!this.isSyncPlayEnabled()) {
            console.debug('SyncPlay processCommand: SyncPlay not enabled, ignoring command', cmd);
            return;
        }

        if (!this.syncPlayReady) {
            console.debug('SyncPlay processCommand: SyncPlay not ready, queued command', cmd);
            this.queuedCommand = cmd;
            return;
        }

        if (!this.isPlaybackActive()) {
            console.debug('SyncPlay processCommand: no active player!');
            return;
        }

        cmd.When = new Date(cmd.When);
        cmd.EmittedAt = new Date(cmd.EmittedAt);
        cmd.PositionTicks = cmd.PositionTicks ? parseInt(cmd.PositionTicks) : null;

        if (cmd.EmittedAt.getTime() < this.syncPlayEnabledAt.getTime()) {
            console.debug('SyncPlay processCommand: ignoring old command', cmd);
            return;
        }

        // Make sure command matches playing item in playlist
        const playlistItemId = this.queueCore.getCurrentPlaylistItemId();
        if (cmd.PlaylistItemId !== playlistItemId) {
            console.warn('SyncPlay processCommand: playlist item does not match!', cmd);
            return;
        }

        if (cmd.PositionTicks) {
            console.log('SyncPlay will', cmd.Command, 'at', cmd.When, '(in', cmd.When.getTime() - Date.now(), 'ms)', 'PositionTicks', cmd.PositionTicks);
        } else {
            console.log('SyncPlay will', cmd.Command, 'at', cmd.When, '(in', cmd.When.getTime() - Date.now(), 'ms)');
        }

        this.playbackCore.applyCommand(cmd);
    }

    /**
     * Handles a group state change.
     * @param {Object} update The group state update.
     * @param {Object} apiClient The ApiClient.
     */
    processStateChange(update, apiClient) {
        if (update === null || update.State === null || update.Reason === null) return;

        if (!this.isSyncPlayEnabled()) {
            console.debug('SyncPlay processStateChange: SyncPlay not enabled, ignoring group state update', update);
            return;
        }

        events.trigger(syncPlayManager, 'group-state-change', [update.State, update.Reason]);
    }

    /**
     * Notifies server that this client is following group's playback.
     * @param {Object} apiClient The ApiClient.
     * @returns {Promise} A Promise fulfilled upon request completion.
     */
    followGroupPlayback(apiClient) {
        this.followingGroupPlayback = true;

        return apiClient.requestSyncPlaySetIgnoreWait({
            IgnoreWait: false
        });
    }

    /**
     * Starts this client's playback and loads the group's play queue.
     * @param {Object} apiClient The ApiClient.
     */
    resumeGroupPlayback(apiClient) {
        this.followGroupPlayback(apiClient).then(() => {
            this.queueCore.startPlayback(apiClient);
        });
    }

    /**
     * Stops this client's playback and notifies server to be ignored in group wait.
     * @param {Object} apiClient The ApiClient.
     */
    haltGroupPlayback(apiClient) {
        this.followingGroupPlayback = false;

        apiClient.requestSyncPlaySetIgnoreWait({
            IgnoreWait: true
        });
        this.playbackCore.localStop();
    }

    /**
     * Whether this client is following group playback.
     * @returns {boolean} _true_ if client should play group's content, _false_ otherwise.
     */
    isFollowingGroupPlayback() {
        return this.followingGroupPlayback;
    }

    /**
     * Enables SyncPlay.
     * @param {Object} apiClient The ApiClient.
     * @param {Object} groupInfo The joined group's info.
     * @param {boolean} showMessage Display message.
     */
    enableSyncPlay(apiClient, groupInfo, showMessage = false) {
        // Convert string to date
        groupInfo.LastUpdatedAt = new Date(groupInfo.LastUpdatedAt);
        this.groupInfo = groupInfo;

        this.syncPlayEnabledAt = groupInfo.LastUpdatedAt;
        this.injectPlaybackManager();
        events.trigger(this, 'enabled', [true]);

        // Wait for time sync to be ready
        syncPlayHelper.waitForEventOnce(this, 'ready').then(() => {
            this.processCommand(this.queuedCommand, apiClient);
            this.queuedCommand = null;
        });

        this.syncPlayReady = false;
        this.notifySyncPlayReady = true;
        this.followingGroupPlayback = true;

        timeSyncManager.forceUpdate();

        if (showMessage) {
            toast({
                text: globalize.translate('MessageSyncPlayEnabled')
            });
        }
    }

    /**
     * Disables SyncPlay.
     * @param {boolean} showMessage Display message.
     */
    disableSyncPlay(showMessage = false) {
        this.syncPlayEnabledAt = null;
        this.syncPlayReady = false;
        this.followingGroupPlayback = true;
        this.queuedCommand = null;
        this.playbackCore.syncEnabled = false;
        events.trigger(this, 'enabled', [false]);
        this.restorePlaybackManager();

        if (showMessage) {
            toast({
                text: globalize.translate('MessageSyncPlayDisabled')
            });
        }
    }

    /**
     * Gets SyncPlay status.
     * @returns {boolean} _true_ if user joined a group, _false_ otherwise.
     */
    isSyncPlayEnabled() {
        return this.syncPlayEnabledAt !== null;
    }

    /**
     * Overrides some PlaybackManager's methods to intercept playback commands.
     */
    injectPlaybackManager() {
        if (!this.isSyncPlayEnabled()) return;
        if (playbackManager.syncPlayEnabled) return;

        // TODO: make this less hacky
        this.playbackCore.injectPlaybackManager();
        this.queueCore.injectPlaybackManager();

        playbackManager.syncPlayEnabled = true;
    }

    /**
     * Restores original PlaybackManager's methods.
     */
    restorePlaybackManager() {
        if (this.isSyncPlayEnabled()) return;
        if (!playbackManager.syncPlayEnabled) return;

        this.playbackCore.restorePlaybackManager();
        this.queueCore.restorePlaybackManager();

        playbackManager.syncPlayEnabled = false;
    }

    /**
     * Gets the group information.
     * @returns {Object} The group information, null if SyncPlay is disabled.
     */
    getGroupInfo() {
        return this.groupInfo;
    }

    /**
     * Gets SyncPlay stats.
     * @returns {Object} The SyncPlay stats.
     */
    getStats() {
        return {
            TimeOffset: this.playbackCore.timeOffsetWithServer.toFixed(2),
            PlaybackDiff: this.playbackCore.playbackDiffMillis.toFixed(2),
            SyncMethod: this.syncMethod
        };
    }

    /**
     * Gets playback status.
     * @returns {boolean} Whether a player is active.
     */
    isPlaybackActive() {
        return this.playbackCore.isPlaybackActive();
    }

    /**
     * Checks if playlist is empty.
     * @returns {boolean} _true_ if playlist is empty, _false_ otherwise.
     */
    isPlaylistEmpty() {
        return this.queueCore.isPlaylistEmpty();
    }

    /**
     * Emits an event to update the SyncPlay status icon.
     */
    showSyncIcon(syncMethod) {
        this.syncMethod = syncMethod;
        events.trigger(this, 'syncing', [true, this.syncMethod]);
    }

    /**
     * Emits an event to clear the SyncPlay status icon.
     */
    clearSyncIcon() {
        this.syncMethod = 'None';
        events.trigger(this, 'syncing', [false, this.syncMethod]);
    }
}

/** SyncPlayManager singleton. */
const syncPlayManager = new SyncPlayManager();
export default syncPlayManager;
