/**
 * Module that manages the queue of SyncPlay.
 * @module components/syncPlay/syncPlayQueueCore
 */

// self\..* = function \(

import events from 'events';
import playbackManager from 'playbackManager';
import * as syncPlayHelper from 'syncPlayHelper';
import syncPlaySettings from 'syncPlaySettings';
import SyncPlayQueueManager from 'syncPlayQueueManager';
import toast from 'toast';
import globalize from 'globalize';

var syncPlayManager;

/**
 * Class that manages the queue of SyncPlay.
 */
class SyncPlayQueueCore {
    constructor(_syncPlayManager) {
        // FIXME: kinda ugly but does its job (it avoids circular dependencies)
        syncPlayManager = _syncPlayManager;
        this.playQueueManager = new SyncPlayQueueManager();
    }

    /**
     * Handles the change in the play queue.
     * @param {Object} apiClient The ApiClient.
     * @param {Object} newPlayQueue The new play queue.
     */
    updatePlayQueue(apiClient, newPlayQueue) {
        newPlayQueue.LastUpdate = new Date(newPlayQueue.LastUpdate);

        if (newPlayQueue.LastUpdate.getTime() <= this.playQueueManager.getLastUpdateTime()) {
            console.debug('SyncPlay updatePlayQueue: ignoring old update', newPlayQueue);
            return;
        }

        console.debug('SyncPlay updatePlayQueue:', newPlayQueue);

        const serverId = apiClient.serverInfo().Id;

        this.playQueueManager.onPlayQueueUpdate(newPlayQueue, serverId).then(() => {
            if (newPlayQueue.LastUpdate.getTime() < this.playQueueManager.getLastUpdateTime()) {
                console.warn('SyncPlay updatePlayQueue: trying to apply old update.', newPlayQueue);
                throw new Error('Trying to apply old update');
            }

            switch (newPlayQueue.Reason) {
                case 'NewPlaylist': {
                    if (!syncPlayManager.isFollowingGroupPlayback()) {
                        syncPlayManager.followGroupPlayback(apiClient).then(() => {
                            this.startPlayback(apiClient);
                        });
                    } else {
                        this.startPlayback(apiClient);
                    }
                    break;
                }
                case 'SetCurrentItem':
                case 'NextTrack':
                case 'PreviousTrack': {
                    const playlistItemId = this.playQueueManager.getCurrentPlaylistItemId();
                    this.localSetCurrentPlaylistItem(playlistItemId);
                    break;
                }
                case 'RemoveItems': {
                    const player = playbackManager.getCurrentPlayer();
                    if (player) {
                        events.trigger(player, 'playlistitemadd');
                    }
                    const realPlaylistItemId = this.playQueueManager.getRealPlaylistItemId();
                    const playlistItemId = this.playQueueManager.getCurrentPlaylistItemId();
                    if (realPlaylistItemId !== playlistItemId) {
                        this.localSetCurrentPlaylistItem(playlistItemId);
                    }
                    break;
                }
                case 'MoveItem':
                case 'Queue':
                case 'QueueNext': {
                    const player = playbackManager.getCurrentPlayer();
                    if (player) {
                        events.trigger(player, 'playlistitemadd');
                    }
                    break;
                }
                case 'RepeatMode':
                    this.localSetRepeatMode(this.playQueueManager.getRepeatMode());
                    break;
                case 'ShuffleMode':
                    this.localSetQueueShuffleMode(this.playQueueManager.getShuffleMode());
                    break;
                default:
                    console.error('SyncPlay updatePlayQueue: unknown reason for update:', newPlayQueue.Reason);
                    break;
            }
        }).catch((error) => {
            console.warn('SyncPlay updatePlayQueue:', error);
        });
    }

    /**
     * Sends a SyncPlayBuffering request on playback start.
     */
    scheduleReadyRequestOnPlaybackStart(origin) {
        const apiClient = window.connectionManager.currentApiClient();
        syncPlayHelper.waitForEventOnce(syncPlayManager, 'playbackstart', syncPlayHelper.WaitForEventDefaultTimeout).then(() => {
            console.debug('SyncPlay scheduleReadyRequestOnPlaybackStart: local pause and notify server.');
            syncPlayManager.playbackCore.localPause();

            const currentTime = new Date();
            const now = syncPlayManager.timeSyncCore.localDateToRemote(currentTime);
            const currentPositionTicks = playbackManager.currentTime() * syncPlayHelper.TicksPerMillisecond;
            const state = playbackManager.getPlayerState();

            apiClient.requestSyncPlayBuffering({
                When: now.toISOString(),
                PositionTicks: currentPositionTicks,
                IsPlaying: !state.PlayState.IsPaused,
                PlaylistItemId: this.getCurrentPlaylistItemId(),
                BufferingDone: true
            });
        }).catch((error) => {
            console.error('Timed out while waiting for `playbackstart` event!', origin, error);
            if (!syncPlayManager.isSyncPlayEnabled()) {
                toast({
                    text: globalize.translate('MessageSyncPlayErrorMedia')
                });
            }
            return;
        });
    }

    /**
     * Prepares this client for playback by loading the group's content.
     * @param {Object} apiClient The ApiClient.
     */
    startPlayback(apiClient) {
        if (this.isPlaylistEmpty()) {
            console.debug('SyncPlay startPlayback: empty playlist.');
            return;
        }

        const serverId = apiClient.serverInfo().Id;
        const oldStartPositionTicks = this.playQueueManager.getStartPositionTicks();
        const lastUpdate = this.playQueueManager.getLastUpdate();
        const startPositionTicks = syncPlayManager.playbackCore.estimateCurrentTicks(oldStartPositionTicks, lastUpdate);

        this.localPlay({
            ids: this.playQueueManager.getPlaylistAsItemIds(),
            startPositionTicks: startPositionTicks,
            startIndex: this.playQueueManager.getCurrentPlaylistIndex(),
            serverId: serverId,
            enableP2P: true,
            trackers: [
                syncPlaySettings.get('p2pTracker')
            ]
        }).then(() => {
            this.scheduleReadyRequestOnPlaybackStart('startPlayback');
        }).catch((error) => {
            console.error(error);
            toast({
                text: globalize.translate('MessageSyncPlayErrorMedia')
            });
        });
    }

    /**
     * Overrides some PlaybackManager's methods to intercept playback commands.
     */
    injectPlaybackManager() {
        // Save local callbacks
        playbackManager._localPlayQueueManager = playbackManager._playQueueManager;

        playbackManager._localPlay = playbackManager.play;
        playbackManager._localSetCurrentPlaylistItem = playbackManager.setCurrentPlaylistItem;
        playbackManager._localRemoveFromPlaylist = playbackManager.removeFromPlaylist;
        playbackManager._localMovePlaylistItem = playbackManager.movePlaylistItem;
        playbackManager._localQueue = playbackManager.queue;
        playbackManager._localQueueNext = playbackManager.queueNext;

        playbackManager._localNextTrack = playbackManager.nextTrack;
        playbackManager._localPreviousTrack = playbackManager.previousTrack;

        playbackManager._localSetRepeatMode = playbackManager.setRepeatMode;
        playbackManager._localSetQueueShuffleMode = playbackManager.setQueueShuffleMode;
        playbackManager._localToggleQueueShuffleMode = playbackManager.toggleQueueShuffleMode;

        // Override local callbacks
        playbackManager._playQueueManager = this.playQueueManager;

        playbackManager.play = this.playRequest;
        playbackManager.setCurrentPlaylistItem = this.setCurrentPlaylistItemRequest;
        playbackManager.removeFromPlaylist = this.removeFromPlaylistRequest;
        playbackManager.movePlaylistItem = this.movePlaylistItemRequest;
        playbackManager.queue = this.queueRequest;
        playbackManager.queueNext = this.queueNextRequest;

        playbackManager.nextTrack = this.nextTrackRequest;
        playbackManager.previousTrack = this.previousTrackRequest;

        playbackManager.setRepeatMode = this.setRepeatModeRequest;
        playbackManager.setQueueShuffleMode = this.setQueueShuffleModeRequest;
        playbackManager.toggleQueueShuffleMode = this.toggleQueueShuffleModeRequest;
    }

    /**
     * Restores original PlaybackManager's methods.
     */
    restorePlaybackManager() {
        playbackManager._playQueueManager = playbackManager._localPlayQueueManager;

        playbackManager.play = playbackManager._localPlay;
        playbackManager.setCurrentPlaylistItem = playbackManager._localSetCurrentPlaylistItem;
        playbackManager.removeFromPlaylist = playbackManager._localRemoveFromPlaylist;
        playbackManager.movePlaylistItem = playbackManager._localMovePlaylistItem;
        playbackManager.queue = playbackManager._localQueue;
        playbackManager.queueNext = playbackManager._localQueueNext;

        playbackManager.nextTrack = playbackManager._localNextTrack;
        playbackManager.previousTrack = playbackManager._localPreviousTrack;

        playbackManager.setRepeatMode = playbackManager._localSetRepeatMode;
        playbackManager.setQueueShuffleMode = playbackManager._localSetQueueShuffleMode;
        playbackManager.toggleQueueShuffleMode = playbackManager._localToggleQueueShuffleMode;

        this.playQueueManager.onSyncPlayShutdown();
    }

    /**
     * Overrides PlaybackManager's play method.
     */
    playRequest(options) {
        // TODO: implement access list to queue control
        const apiClient = window.connectionManager.currentApiClient();
        const sendPlayRequest = (items) => {
            const queue = items.map(item => item.Id);
            apiClient.requestSyncPlayPlay({
                PlayingQueue: queue.join(','),
                PlayingItemPosition: options.startIndex ? options.startIndex : 0,
                StartPositionTicks: options.startPositionTicks ? options.startPositionTicks : 0
            });
        };

        if (options.items) {
            playbackManager.translateItemsForPlayback(options.items, options).then(sendPlayRequest);
        } else {
            if (!options.serverId) {
                throw new Error('serverId required!');
            }

            playbackManager.getItemsForPlayback(options.serverId, {
                Ids: options.ids.join(',')
            }).then(function (result) {
                playbackManager.translateItemsForPlayback(result.Items, options).then(sendPlayRequest);
            });
        }
    }

    /**
     * Overrides PlaybackManager's setCurrentPlaylistItem method.
     */
    setCurrentPlaylistItemRequest(playlistItemId, player) {
        // TODO: implement access list to queue control
        const apiClient = window.connectionManager.currentApiClient();
        apiClient.requestSyncPlaySetPlaylistItem({
            PlaylistItemId: playlistItemId
        });
    }

    /**
     * Overrides PlaybackManager's removeFromPlaylist method.
     */
    removeFromPlaylistRequest(playlistItemIds, player) {
        // TODO: implement access list to queue control
        const apiClient = window.connectionManager.currentApiClient();
        apiClient.requestSyncPlayRemoveFromPlaylist({
            PlaylistItemIds: playlistItemIds
        });
    }

    /**
     * Overrides PlaybackManager's movePlaylistItem method.
     */
    movePlaylistItemRequest(playlistItemId, newIndex, player) {
        // TODO: implement access list to queue control
        const apiClient = window.connectionManager.currentApiClient();
        apiClient.requestSyncPlayMovePlaylistItem({
            PlaylistItemId: playlistItemId,
            NewIndex: newIndex
        });
    }

    /**
     * Internal method used to emulate PlaybackManager's queue method.
     */
    genericQueueRequest(options, player, mode) {
        // TODO: implement access list to queue control
        const apiClient = window.connectionManager.currentApiClient();
        if (options.items) {
            playbackManager.translateItemsForPlayback(options.items, options).then((items) => {
                const itemIds = items.map(item => item.Id);
                apiClient.requestSyncPlayQueue({
                    ItemIds: itemIds.join(','),
                    Mode: mode
                });
            });
        } else {
            if (!options.serverId) {
                throw new Error('serverId required!');
            }

            playbackManager.getItemsForPlayback(options.serverId, {
                Ids: options.ids.join(',')
            }).then(function (result) {
                playbackManager.translateItemsForPlayback(result.Items, options).then((items) => {
                    const itemIds = items.map(item => item.Id);
                    apiClient.requestSyncPlayQueue({
                        ItemIds: itemIds.join(','),
                        Mode: mode
                    });
                });
            });
        }
    }

    /**
     * Overrides PlaybackManager's queue method.
     */
    queueRequest(options, player) {
        syncPlayManager.queueCore.genericQueueRequest(options, player, 'default');
    }

    /**
     * Overrides PlaybackManager's queueNext method.
     */
    queueNextRequest(options, player) {
        syncPlayManager.queueCore.genericQueueRequest(options, player, 'next');
    }

    /**
     * Overrides PlaybackManager's nextTrack method.
     */
    nextTrackRequest(player) {
        const apiClient = window.connectionManager.currentApiClient();
        apiClient.requestSyncPlayNextTrack({
            PlaylistItemId: syncPlayManager.queueCore.playQueueManager.getCurrentPlaylistItemId()
        });
    }

    /**
     * Overrides PlaybackManager's previousTrack method.
     */
    previousTrackRequest(player) {
        const apiClient = window.connectionManager.currentApiClient();
        apiClient.requestSyncPlayPreviousTrack({
            PlaylistItemId: syncPlayManager.queueCore.playQueueManager.getCurrentPlaylistItemId()
        });
    }

    /**
     * Overrides PlaybackManager's setRepeatMode method.
     */
    setRepeatModeRequest(mode, player) {
        const apiClient = window.connectionManager.currentApiClient();
        apiClient.requestSyncPlaySetRepeatMode({
            Mode: mode
        });
    }

    /**
     * Overrides PlaybackManager's setQueueShuffleMode method.
     */
    setQueueShuffleModeRequest(mode, player) {
        const apiClient = window.connectionManager.currentApiClient();
        apiClient.requestSyncPlaySetShuffleMode({
            Mode: mode
        });
    }

    /**
     * Overrides PlaybackManager's toggleQueueShuffleMode method.
     */
    toggleQueueShuffleModeRequest(player) {
        let mode = syncPlayManager.queueCore.playQueueManager.getShuffleMode();
        mode = mode === 'Sorted' ? 'Shuffle' : 'Sorted';

        const apiClient = window.connectionManager.currentApiClient();
        apiClient.requestSyncPlaySetShuffleMode({
            Mode: mode
        });
    }

    /**
     * Calls original PlaybackManager's play method.
     */
    localPlay(options) {
        if (playbackManager.syncPlayEnabled) {
            return playbackManager._localPlay(options);
        } else {
            return playbackManager.play(options);
        }
    }

    /**
     * Calls original PlaybackManager's setCurrentPlaylistItem method.
     */
    localSetCurrentPlaylistItem(playlistItemId, player) {
        // Ignore command when client is not following playback
        if (!syncPlayManager.isFollowingGroupPlayback()) {
            console.debug('SyncPlay localSetCurrentPlaylistItem: ignoring, not following playback.');
            return;
        }

        syncPlayManager.queueCore.scheduleReadyRequestOnPlaybackStart('localSetCurrentPlaylistItem');

        if (playbackManager.syncPlayEnabled) {
            return playbackManager._localSetCurrentPlaylistItem(playlistItemId, player);
        } else {
            return playbackManager.setCurrentPlaylistItem(playlistItemId, player);
        }
    }

    /**
     * Calls original PlaybackManager's removeFromPlaylist method.
     */
    localRemoveFromPlaylist(playlistItemIds, player) {
        if (playbackManager.syncPlayEnabled) {
            return playbackManager._localRemoveFromPlaylist(playlistItemIds, player);
        } else {
            return playbackManager.removeFromPlaylist(playlistItemIds, player);
        }
    }

    /**
     * Calls original PlaybackManager's movePlaylistItem method.
     */
    localMovePlaylistItem(playlistItemId, newIndex, player) {
        if (playbackManager.syncPlayEnabled) {
            return playbackManager._localMovePlaylistItem(playlistItemId, newIndex, player);
        } else {
            return playbackManager.movePlaylistItem(playlistItemId, newIndex, player);
        }
    }

    /**
     * Calls original PlaybackManager's queue method.
     */
    localQueue(options, player) {
        if (playbackManager.syncPlayEnabled) {
            return playbackManager._localQueue(options, player);
        } else {
            return playbackManager.queue(options, player);
        }
    }

    /**
     * Calls original PlaybackManager's queueNext method.
     */
    localQueueNext(options, player) {
        if (playbackManager.syncPlayEnabled) {
            return playbackManager._localQueueNext(options, player);
        } else {
            return playbackManager.queueNext(options, player);
        }
    }

    /**
     * Calls original PlaybackManager's nextTrack method.
     */
    localNextTrack(player) {
        // Ignore command when client is not following playback
        if (!syncPlayManager.isFollowingGroupPlayback()) {
            console.debug('SyncPlay localSetCurrentPlaylistItem: ignoring, not following playback.');
            return;
        }

        syncPlayManager.queueCore.scheduleReadyRequestOnPlaybackStart('localNextTrack');

        if (playbackManager.syncPlayEnabled) {
            playbackManager._localNextTrack(player);
        } else {
            playbackManager.nextTrack(player);
        }
    }

    /**
     * Calls original PlaybackManager's previousTrack method.
     */
    localPreviousTrack(player) {
        // Ignore command when client is not following playback
        if (!syncPlayManager.isFollowingGroupPlayback()) {
            console.debug('SyncPlay localSetCurrentPlaylistItem: ignoring, not following playback.');
            return;
        }

        syncPlayManager.queueCore.scheduleReadyRequestOnPlaybackStart('localPreviousTrack');

        if (playbackManager.syncPlayEnabled) {
            playbackManager._localPreviousTrack(player);
        } else {
            playbackManager.previousTrack(player);
        }
    }

    /**
     * Calls original PlaybackManager's setRepeatMode method.
     */
    localSetRepeatMode(value, player) {
        if (playbackManager.syncPlayEnabled) {
            playbackManager._localSetRepeatMode(value, player);
        } else {
            playbackManager.setRepeatMode(value, player);
        }
    }

    /**
     * Calls original PlaybackManager's setQueueShuffleMode method.
     */
    localSetQueueShuffleMode(value, player) {
        if (playbackManager.syncPlayEnabled) {
            playbackManager._localSetQueueShuffleMode(value, player);
        } else {
            playbackManager.setQueueShuffleMode(value, player);
        }
    }

    /**
     * Checks if playlist is empty.
     * @returns {boolean} _true_ if playlist is empty, _false_ otherwise.
     */
    isPlaylistEmpty() {
        return this.playQueueManager.isPlaylistEmpty();
    }

    /**
     * Gets the playlist item id of the playing item.
     * @returns {string} The playlist item id.
     */
    getCurrentPlaylistItemId() {
        return this.playQueueManager.getCurrentPlaylistItemId();
    }
}

export default SyncPlayQueueCore;
