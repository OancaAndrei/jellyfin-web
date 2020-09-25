/**
 * Module that manages the queue of SyncPlay.
 * @module components/syncPlay/syncPlayQueueManager
 */

import playbackManager from 'playbackManager';

function findPlaylistIndex(playlistItemId, list) {
    for (let i = 0, length = list.length; i < length; i++) {
        if (list[i].PlaylistItemId === playlistItemId) {
            return i;
        }
    }

    return -1;
}

class SyncPlayQueueManager {
    constructor() {
        this.internalPlaylist = [];
        this.reason = null;
        this.playlist = [];
        this.shuffleMode = 'Sorted';
        this.repeatMode = 'RepeatNone';
        this.lastUpdate = null;
        this.playingItemIndex = -1;
        this.startPositionTicks = 0;

        this.realPlaylistItemId = null;
        this.realPlaylistIndex = -1;
    }

    onSyncPlayShutdown() {
        this.internalPlaylist = [];
        this.reason = null;
        this.playlist = [];
        this.shuffleMode = 'Sorted';
        this.repeatMode = 'RepeatNone';
        this.lastUpdate = null;
        this.playingItemIndex = -1;
        this.startPositionTicks = 0;

        this.realPlaylistItemId = null;
        this.realPlaylistIndex = -1;
    }

    onPlayQueueUpdate(playQueueUpdate, serverId) {
        const itemIds = playQueueUpdate.Playlist.map(queueItem => queueItem.ItemId);

        if (!itemIds.length) {
            if (this.lastUpdate && playQueueUpdate.LastUpdate.getTime() <= this.lastUpdate.getTime()) {
                return Promise.reject('Trying to apply old update');
            }

            this.playlist = [];
            this.reason = playQueueUpdate.Reason;
            this.lastUpdate = playQueueUpdate.LastUpdate;
            this.internalPlaylist = playQueueUpdate.Playlist;
            this.playingItemIndex = playQueueUpdate.PlayingItemIndex;
            this.startPositionTicks = playQueueUpdate.StartPositionTicks;
            this.shuffleMode = playQueueUpdate.ShuffleMode;
            this.repeatMode = playQueueUpdate.RepeatMode;

            return Promise.resolve();
        }

        return playbackManager.getItemsForPlayback(serverId, {
            Ids: itemIds.join(',')
        }).then((result) => {
            return playbackManager.translateItemsForPlayback(result.Items, {
                ids: itemIds,
                serverId: serverId
            }).then((items) => {
                if (this.lastUpdate && playQueueUpdate.LastUpdate.getTime() <= this.lastUpdate.getTime()) {
                    throw new Error('Trying to apply old update');
                }

                for (let i = 0; i < items.length; i++) {
                    items[i].PlaylistItemId = playQueueUpdate.Playlist[i].PlaylistItemId;
                }

                this.playlist = items;
                this.reason = playQueueUpdate.Reason;
                this.lastUpdate = playQueueUpdate.LastUpdate;
                this.internalPlaylist = playQueueUpdate.Playlist;
                this.playingItemIndex = playQueueUpdate.PlayingItemIndex;
                this.startPositionTicks = playQueueUpdate.StartPositionTicks;
                this.shuffleMode = playQueueUpdate.ShuffleMode;
                this.repeatMode = playQueueUpdate.RepeatMode;
            });
        });
    }

    /**
     * Checks if playlist is empty.
     * @returns {boolean} _true_ if playlist is empty, _false_ otherwise.
     */
    isPlaylistEmpty() {
        return this.playlist.length === 0;
    }

    /**
     * Gets the last update time as date, if any.
     * @returns {Date} The date.
     */
    getLastUpdate() {
        return this.lastUpdate;
    }

    /**
     * Gets the time of when the queue has been updated.
     * @returns {number} The last update time.
     */
    getLastUpdateTime() {
        if (this.lastUpdate) {
            return this.lastUpdate.getTime();
        } else {
            return 0;
        }
    }

    /**
     * Gets the last reported start position ticks of playing item.
     * @returns {number} The start position ticks.
     */
    getStartPositionTicks() {
        return this.startPositionTicks;
    }

    /**
     * Gets the last playlist item id reported by playbackManager.
     * @returns {string} The playlist item id.
     */
    getRealPlaylistItemId() {
        return this.realPlaylistItemId;
    }

    /**
     * Gets the list of item ids in the playlist.
     * @returns {number} The list of item ids in the playlist.
     */
    getPlaylistAsItemIds() {
        return this.internalPlaylist.map(queueItem => queueItem.ItemId);
    }

    /**
     * Placeholder for original PlayQueueManager method.
     */
    getPlaylist() {
        return this.playlist.slice(0);
    }

    /**
     * Placeholder for original PlayQueueManager method.
     */
    setPlaylist(items) {
        console.warn('SyncPlay QueueManager setPlaylist:', items);
    }

    /**
     * Placeholder for original PlayQueueManager method.
     */
    queue(items) {
        console.warn('SyncPlay QueueManager queue:', items);
    }

    /**
     * Placeholder for original PlayQueueManager method.
     */
    shufflePlaylist() {
        console.warn('SyncPlay QueueManager shufflePlaylist:');
    }

    /**
     * Placeholder for original PlayQueueManager method.
     */
    sortShuffledPlaylist() {
        console.warn('SyncPlay QueueManager sortShuffledPlaylist:');
    }

    /**
     * Placeholder for original PlayQueueManager method.
     */
    clearPlaylist(clearCurrentItem = false) {
        console.warn('SyncPlay QueueManager clearPlaylist:', clearCurrentItem);
    }

    /**
     * Placeholder for original PlayQueueManager method.
     */
    queueNext(items) {
        console.warn('SyncPlay QueueManager queueNext:', items);
    }

    /**
     * Placeholder for original PlayQueueManager method.
     */
    getCurrentPlaylistIndex() {
        return this.playingItemIndex;
    }

    /**
     * Placeholder for original PlayQueueManager method.
     */
    getCurrentItem() {
        return this.playingItemIndex === -1 ? null : this.playlist[this.playingItemIndex];
    }

    /**
     * Placeholder for original PlayQueueManager method.
     */
    getCurrentPlaylistItemId() {
        return this.playingItemIndex === -1 ? null : this.playlist[this.playingItemIndex].PlaylistItemId;
    }

    /**
     * Placeholder for original PlayQueueManager method.
     */
    setPlaylistState(playlistItemId, playlistIndex) {
        console.warn('SyncPlay QueueManager setPlaylistState:', playlistItemId, playlistIndex);
        this.realPlaylistItemId = playlistItemId;
        this.realPlaylistIndex = findPlaylistIndex(playlistItemId, this.internalPlaylist);
    }

    /**
     * Placeholder for original PlayQueueManager method.
     */
    setPlaylistIndex(playlistIndex) {
        console.warn('SyncPlay QueueManager setPlaylistIndex:', playlistIndex);
        this.realPlaylistIndex = playlistIndex;
        this.realPlaylistItemId = this.internalPlaylist[playlistIndex].PlaylistItemId;
    }

    /**
     * Placeholder for original PlayQueueManager method.
     */
    removeFromPlaylist(playlistItemIds) {
        console.warn('SyncPlay QueueManager removeFromPlaylist:', playlistItemIds);
    }

    /**
     * Placeholder for original PlayQueueManager method.
     */
    movePlaylistItem(playlistItemId, newIndex) {
        console.warn('SyncPlay QueueManager movePlaylistItem:', playlistItemId, newIndex);
        return {
            result: 'noop'
        };
    }

    /**
     * Placeholder for original PlayQueueManager method.
     */
    reset() {
        console.warn('SyncPlay QueueManager reset:');
    }

    /**
     * Placeholder for original PlayQueueManager method.
     */
    setRepeatMode(value) {
        console.warn('SyncPlay QueueManager setRepeatMode:', value);
    }

    /**
     * Placeholder for original PlayQueueManager method.
     */
    getRepeatMode() {
        return this.repeatMode;
    }

    /**
     * Placeholder for original PlayQueueManager method.
     */
    setShuffleMode(value) {
        console.warn('SyncPlay QueueManager setShuffleMode:', value);
    }

    /**
     * Placeholder for original PlayQueueManager method.
     */
    toggleShuffleMode() {
        console.warn('SyncPlay QueueManager toggleShuffleMode:');
    }

    /**
     * Placeholder for original PlayQueueManager method.
     */
    getShuffleMode() {
        return this.shuffleMode;
    }

    /**
     * Placeholder for original PlayQueueManager method.
     */
    getNextItemInfo() {
        let newIndex;

        switch (this.getRepeatMode()) {
            case 'RepeatOne':
                newIndex = this.getCurrentPlaylistIndex();
                break;
            case 'RepeatAll':
                newIndex = this.getCurrentPlaylistIndex() + 1;
                if (newIndex >= this.playlist.length) {
                    newIndex = 0;
                }
                break;
            default:
                newIndex = this.getCurrentPlaylistIndex() + 1;
                break;
        }

        if (newIndex < 0 || newIndex >= this.playlist.length) {
            return null;
        }

        const item = this.playlist[newIndex];

        if (!item) {
            return null;
        }

        return {
            item: item,
            index: newIndex
        };
    }
}

export default SyncPlayQueueManager;
