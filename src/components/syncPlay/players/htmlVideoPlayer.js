/**
 * Module that manages the HtmlVideoPlayer for SyncPlay.
 * @module components/syncPlay/players/htmlVideoPlayer
 */

import events from 'events';
import SyncPlayNoActivePlayer from 'syncPlayNoActivePlayer';

/**
 * Class that manages the HtmlVideoPlayer for SyncPlay.
 */
class SyncPlayHtmlVideoPlayer extends SyncPlayNoActivePlayer {
    static type = 'htmlvideoplayer';

    constructor(player, syncPlayManager) {
        super(player, syncPlayManager);
        this.isPlayerActive = false;
        this.savedPlaybackRate = 1.0;
        this.minBufferingThresholdMillis = 3000;
    }

    /**
     * Binds to the player's events. Overrides parent method.
     * @param {Object} player The player.
     */
    localBindToPlayer() {
        super.localBindToPlayer();

        const self = this;

        this._onPlaybackStart = (player, state) => {
            self.isPlayerActive = true;
            self.onPlaybackStart(player, state);
        };

        this._onPlaybackStop = (stopInfo) => {
            self.isPlayerActive = false;
            self.onPlaybackStop(stopInfo);
        };

        this._onUnpause = () => {
            self.onUnpause();
        };

        this._onPause = () => {
            self.onPause();
        };

        this._onTimeUpdate = (e) => {
            const currentTime = new Date();
            const currentPosition = self.player.currentTime();
            self.onTimeUpdate(e, {
                currentTime: currentTime,
                currentPosition: currentPosition
            });
        };

        this._onPlaying = () => {
            clearTimeout(self.notifyBuffering);
            self.onReady();
        };

        this._onWaiting = (e) => {
            clearTimeout(self.notifyBuffering);
            self.notifyBuffering = setTimeout(() => {
                self.onBuffering();
            }, self.minBufferingThresholdMillis);
        };

        events.on(this.player, 'playbackstart', this._onPlaybackStart);
        events.on(this.player, 'playbackstop', this._onPlaybackStop);
        events.on(this.player, 'unpause', this._onUnpause);
        events.on(this.player, 'pause', this._onPause);
        events.on(this.player, 'timeupdate', this._onTimeUpdate);
        events.on(this.player, 'playing', this._onPlaying);
        events.on(this.player, 'waiting', this._onWaiting);

        this.savedPlaybackRate = this.player.getPlaybackRate();
    }

    /**
     * Removes the bindings from the player's events. Overrides parent method.
     */
    localUnbindFromPlayer() {
        super.localUnbindFromPlayer();

        events.off(this.player, 'playbackstart', this._onPlaybackStart);
        events.off(this.player, 'playbackstop', this._onPlaybackStop);
        events.off(this.player, 'unpause', this._onPlayerUnpause);
        events.off(this.player, 'pause', this._onPlayerPause);
        events.off(this.player, 'timeupdate', this._onTimeUpdate);
        events.off(this.player, 'playing', this._onPlaying);
        events.off(this.player, 'waiting', this._onWaiting);

        this.player.setPlaybackRate(this.savedPlaybackRate);
    }

    /**
     * Called when changes are made to the play queue.
     */
    onQueueUpdate() {
        // TODO: find a more generic event? Tests show that this is working for now.
        events.trigger(this.player, 'playlistitemadd');
    }

    /**
     * Gets player status.
     * @returns {boolean} Whether the player has some media loaded.
     */
    isPlaybackActive() {
        return this.isPlayerActive;
    }

    /**
     * Gets playback status.
     * @returns {boolean} Whether the playback is unpaused.
     */
    isPlaying() {
        return !this.player.paused();
    }

    /**
     * Gets playback position.
     * @returns {number} The player position, in milliseconds.
     */
    currentTime() {
        return this.player.currentTime();
    }

    /**
     * Checks if player has playback rate support.
     * @returns {boolean} _true _ if playback rate is supported, false otherwise.
     */
    hasPlaybackRate() {
        return true;
    }

    /**
     * Sets the playback rate, if supported.
     * @param {number} value The playback rate.
     */
    setPlaybackRate(value) {
        this.player.setPlaybackRate(value);
    }

    /**
     * Gets the playback rate.
     * @returns {number} The playback rate.
     */
    getPlaybackRate() {
        return this.player.getPlaybackRate();
    }
}

export default SyncPlayHtmlVideoPlayer;
