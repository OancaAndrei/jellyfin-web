/**
 * Module that manages the playback of SyncPlay.
 * @module components/syncPlay/syncPlayPlaybackCore
 */

import events from 'events';
import * as syncPlayHelper from 'syncPlayHelper';
import syncPlaySettings from 'syncPlaySettings';

/**
 * Class that manages the playback of SyncPlay.
 */
class SyncPlayPlaybackCore {
    constructor() {
        this.manager = null;
        this.timeSyncCore = null;

        this.syncEnabled = false;
        this.playbackDiffMillis = 0; // Used for stats and remote time sync.
        this.syncAttempts = 0;
        this.lastSyncTime = new Date();
        this.enableSyncCorrection = true; // User setting to disable sync during playback.

        this.playerIsBuffering = false;

        this.lastCommand = null; // Last scheduled playback command, might not be the latest one.
        this.scheduledCommandTimeout = null;
        this.syncTimeout = null;

        this.loadPreferences();
    }

    /**
     * Initializes the core.
     * @param {SyncPlayManager} syncPlayManager The SyncPlay manager.
     */
    init(syncPlayManager) {
        this.manager = syncPlayManager;
        this.timeSyncCore = syncPlayManager.timeSyncCore;

        events.on(syncPlaySettings, 'update', (event) => {
            this.loadPreferences();
        });
    }

    /**
     * Loads preferences from saved settings.
     */
    loadPreferences() {
        // Minimum required delay for SpeedToSync to kick in, in milliseconds.
        this.minDelaySpeedToSync = syncPlaySettings.getFloat('minDelaySpeedToSync', 60.0);

        // Maximum delay after which SkipToSync is used instead of SpeedToSync, in milliseconds.
        this.maxDelaySpeedToSync = syncPlaySettings.getFloat('maxDelaySpeedToSync', 3000.0);

        // Time during which the playback is sped up, in milliseconds.
        this.speedToSyncDuration = syncPlaySettings.getFloat('speedToSyncDuration', 1000.0);

        // Minimum required delay for SkipToSync to kick in, in milliseconds.
        this.minDelaySkipToSync = syncPlaySettings.getFloat('minDelaySkipToSync', 400.0);

        // Whether SpeedToSync should be used.
        this.useSpeedToSync = syncPlaySettings.getBool('useSpeedToSync');

        // Whether SkipToSync should be used.
        this.useSkipToSync = syncPlaySettings.getBool('useSkipToSync');

        // Whether sync correction during playback is active.
        this.enableSyncCorrection = syncPlaySettings.getBool('enableSyncCorrection');
    }

    /**
     * Called by player wrapper when playback starts.
     */
    onPlaybackStart(player, state) {
        events.trigger(this.manager, 'playbackstart', [player, state]);
    }

    /**
     * Called by player wrapper when playback stops.
     */
    onPlaybackStop(stopInfo) {
        this.lastCommand = null;
        events.trigger(this.manager, 'playbackstop', [stopInfo]);
        this.manager.releaseCurrentPlayer();
    }

    /**
     * Called by player wrapper when playback unpauses.
     */
    onUnpause() {
        events.trigger(this.manager, 'unpause');
    }

    /**
     * Called by player wrapper when playback pauses.
     */
    onPause() {
        events.trigger(this.manager, 'pause');
    }

    /**
     * Called by player wrapper on playback progress.
     * @param {Object} event The time update event.
     * @param {Object} timeUpdateData The time update data.
     */
    onTimeUpdate(event, timeUpdateData) {
        this.syncPlaybackTime(timeUpdateData);
        events.trigger(this.manager, 'timeupdate', [event, timeUpdateData]);
    }

    /**
     * Called by player wrapper when player is ready to play.
     */
    onReady() {
        this.playerIsBuffering = false;
        this.sendBufferingRequest(false);
        events.trigger(this.manager, 'ready');
    }

    /**
     * Called by player wrapper when player is buffering.
     */
    onBuffering() {
        this.playerIsBuffering = true;
        this.sendBufferingRequest(true);
        events.trigger(this.manager, 'buffering');
    }

    /**
     * Sends a buffering request to the server.
     * @param {boolean} isBuffering Whether this client is buffering or not.
     */
    sendBufferingRequest(isBuffering = true) {
        const playerWrapper = this.manager.getPlayerWrapper();
        const currentPosition = playerWrapper.currentTime();
        const currentPositionTicks = Math.round(currentPosition * syncPlayHelper.TicksPerMillisecond);
        const isPlaying = playerWrapper.isPlaying();

        const currentTime = new Date();
        const now = this.timeSyncCore.localDateToRemote(currentTime);
        const playlistItemId = this.manager.getQueueCore().getCurrentPlaylistItemId();

        const apiClient = this.manager.getApiClient();
        apiClient.requestSyncPlayBuffering({
            When: now.toISOString(),
            PositionTicks: currentPositionTicks,
            IsPlaying: isPlaying,
            PlaylistItemId: playlistItemId,
            BufferingDone: !isBuffering
        });
    }

    /**
     * Gets playback buffering status.
     * @returns {boolean} _true_ if player is buffering, _false_ otherwise.
     */
    isBuffering() {
        return this.playerIsBuffering;
    }

    /**
     * Applies a command and checks the playback state if a duplicate command is received.
     * @param {Object} command The playback command.
     */
    applyCommand(command) {
        // Check if duplicate.
        if (this.lastCommand &&
            this.lastCommand.When.getTime() === command.When.getTime() &&
            this.lastCommand.PositionTicks === command.PositionTicks &&
            this.lastCommand.Command === command.Command &&
            this.lastCommand.PlaylistItemId === command.PlaylistItemId
        ) {
            // Duplicate command found, check playback state and correct if needed.
            console.debug('SyncPlay applyCommand: duplicate command received!', command);

            // Determine if past command or future one.
            const currentTime = new Date();
            const whenLocal = this.timeSyncCore.remoteDateToLocal(command.When);
            if (whenLocal > currentTime) {
                // Command should be already scheduled, not much we can do.
                // TODO: should re-apply or just drop?
                console.debug('SyncPlay applyCommand: command already scheduled.', command);
                return;
            } else {
                // Check if playback state matches requested command.
                const playerWrapper = this.manager.getPlayerWrapper();
                const currentPositionTicks = Math.round(playerWrapper.currentTime() * syncPlayHelper.TicksPerMillisecond);
                const isPlaying = playerWrapper.isPlaying();

                switch (command.Command) {
                    case 'Unpause':
                        // Check playback state only, as position ticks will be corrected by sync.
                        if (!isPlaying) {
                            this.scheduleUnpause(command.When, command.PositionTicks);
                        }
                        break;
                    case 'Pause':
                        // FIXME: check range instead of fixed value for ticks.
                        if (isPlaying || currentPositionTicks !== command.PositionTicks) {
                            this.schedulePause(command.When, command.PositionTicks);
                        }
                        break;
                    case 'Stop':
                        if (isPlaying) {
                            this.scheduleStop(command.When);
                        }
                        break;
                    case 'Seek':
                        // During seek, playback is paused.
                        // FIXME: check range instead of fixed value for ticks.
                        if (isPlaying || currentPositionTicks !== command.PositionTicks) {
                            // Account for player imperfections, we got half a second of tollerance we can play with
                            // (the server tollerates a range of values when client reports that is ready).
                            const rangeWidth = 100; // In milliseconds.
                            const randomOffsetTicks = Math.round((Math.random() - 0.5) * rangeWidth) * syncPlayHelper.TicksPerMillisecond;
                            this.scheduleSeek(command.When, command.PositionTicks + randomOffsetTicks);
                            console.debug('SyncPlay applyCommand: adding random offset to force seek:', randomOffsetTicks, command);
                        } else {
                            // All done, I guess?
                            this.sendBufferingRequest(false);
                        }
                        break;
                    default:
                        console.error('SyncPlay applyCommand: command is not recognised:', command);
                        break;
                }

                // All done.
                return;
            }
        }

        // Applying command.
        this.lastCommand = command;

        // Ignore if remote player has local SyncPlay manager.
        if (this.manager.isRemote()) {
            return;
        }

        switch (command.Command) {
            case 'Unpause':
                this.scheduleUnpause(command.When, command.PositionTicks);
                break;
            case 'Pause':
                this.schedulePause(command.When, command.PositionTicks);
                break;
            case 'Stop':
                this.scheduleStop(command.When);
                break;
            case 'Seek':
                this.scheduleSeek(command.When, command.PositionTicks);
                break;
            default:
                console.error('SyncPlay applyCommand: command is not recognised:', command);
                break;
        }
    }

    /**
     * Schedules a resume playback on the player at the specified clock time.
     * @param {Date} playAtTime The server's UTC time at which to resume playback.
     * @param {number} positionTicks The PositionTicks from where to resume.
     */
    scheduleUnpause(playAtTime, positionTicks) {
        this.clearScheduledCommand();
        const enableSyncTimeout = this.maxDelaySpeedToSync / 2.0;
        const currentTime = new Date();
        const playAtTimeLocal = this.timeSyncCore.remoteDateToLocal(playAtTime);

        const playerWrapper = this.manager.getPlayerWrapper();
        const currentPositionTicks = playerWrapper.currentTime() * syncPlayHelper.TicksPerMillisecond;

        if (playAtTimeLocal > currentTime) {
            const playTimeout = playAtTimeLocal - currentTime;

            // Seek only if delay is noticeable.
            if ((currentPositionTicks - positionTicks) > this.minDelaySkipToSync * syncPlayHelper.TicksPerMillisecond) {
                this.localSeek(positionTicks);
            }

            this.scheduledCommandTimeout = setTimeout(() => {
                this.localUnpause();
                events.trigger(this.manager, 'notify-osd', ['unpause']);

                this.syncTimeout = setTimeout(() => {
                    this.syncEnabled = true;
                }, enableSyncTimeout);
            }, playTimeout);

            console.debug('Scheduled unpause in', playTimeout / 1000.0, 'seconds.');
        } else {
            // Group playback already started.
            const serverPositionTicks = this.estimateCurrentTicks(positionTicks, playAtTime);
            syncPlayHelper.waitForEventOnce(this.manager, 'unpause').then(() => {
                this.localSeek(serverPositionTicks);
            });
            this.localUnpause();
            setTimeout(() => {
                events.trigger(this.manager, 'notify-osd', ['unpause']);
            }, 100);

            this.syncTimeout = setTimeout(() => {
                this.syncEnabled = true;
            }, enableSyncTimeout);

            console.debug(`SyncPlay scheduleUnpause: unpause now from ${serverPositionTicks} (was at ${currentPositionTicks}).`);
        }
    }

    /**
     * Schedules a pause playback on the player at the specified clock time.
     * @param {Date} pauseAtTime The server's UTC time at which to pause playback.
     * @param {number} positionTicks The PositionTicks where player will be paused.
     */
    schedulePause(pauseAtTime, positionTicks) {
        this.clearScheduledCommand();
        const currentTime = new Date();
        const pauseAtTimeLocal = this.timeSyncCore.remoteDateToLocal(pauseAtTime);

        const callback = () => {
            syncPlayHelper.waitForEventOnce(this.manager, 'pause', syncPlayHelper.WaitForPlayerEventTimeout).then(() => {
                this.localSeek(positionTicks);
            }).catch(() => {
                // Player was already paused, seeking.
                this.localSeek(positionTicks);
            });
            this.localPause();
        };

        if (pauseAtTimeLocal > currentTime) {
            const pauseTimeout = pauseAtTimeLocal - currentTime;
            this.scheduledCommandTimeout = setTimeout(callback, pauseTimeout);

            console.debug('Scheduled pause in', pauseTimeout / 1000.0, 'seconds.');
        } else {
            callback();
            console.debug('SyncPlay schedulePause: now.');
        }
    }

    /**
     * Schedules a stop playback on the player at the specified clock time.
     * @param {Date} stopAtTime The server's UTC time at which to stop playback.
     */
    scheduleStop(stopAtTime) {
        this.clearScheduledCommand();
        const currentTime = new Date();
        const stopAtTimeLocal = this.timeSyncCore.remoteDateToLocal(stopAtTime);

        const callback = () => {
            this.localStop();
        };

        if (stopAtTimeLocal > currentTime) {
            const stopTimeout = stopAtTimeLocal - currentTime;
            this.scheduledCommandTimeout = setTimeout(callback, stopTimeout);

            console.debug('Scheduled stop in', stopTimeout / 1000.0, 'seconds.');
        } else {
            callback();
            console.debug('SyncPlay scheduleStop: now.');
        }
    }

    /**
     * Schedules a seek playback on the player at the specified clock time.
     * @param {Date} seekAtTime The server's UTC time at which to seek playback.
     * @param {number} positionTicks The PositionTicks where player will be seeked.
     */
    scheduleSeek(seekAtTime, positionTicks) {
        this.clearScheduledCommand();
        const currentTime = new Date();
        const seekAtTimeLocal = this.timeSyncCore.remoteDateToLocal(seekAtTime);

        const callback = () => {
            this.localUnpause();
            this.localSeek(positionTicks);

            syncPlayHelper.waitForEventOnce(this.manager, 'ready', syncPlayHelper.WaitForEventDefaultTimeout).then(() => {
                this.localPause();
                this.sendBufferingRequest(false);
            }).catch((error) => {
                console.error(`Timed out while waiting for 'ready' event! Seeking to ${positionTicks}.`, error);
                this.localSeek(positionTicks);
            });
        };

        if (seekAtTimeLocal > currentTime) {
            const seekTimeout = seekAtTimeLocal - currentTime;
            this.scheduledCommandTimeout = setTimeout(callback, seekTimeout);

            console.debug('Scheduled seek in', seekTimeout / 1000.0, 'seconds.');
        } else {
            callback();
            console.debug('SyncPlay scheduleSeek: now.');
        }
    }

    /**
     * Clears the current scheduled command.
     */
    clearScheduledCommand() {
        clearTimeout(this.scheduledCommandTimeout);
        clearTimeout(this.syncTimeout);

        this.syncEnabled = false;
        const playerWrapper = this.manager.getPlayerWrapper();
        if (playerWrapper.hasPlaybackRate()) {
            playerWrapper.setPlaybackRate(1.0);
        }

        this.manager.clearSyncIcon();
    }

    /**
     * Unpauses the local player.
     */
    localUnpause() {
        // Ignore command when no player is active.
        if (!this.manager.isPlaybackActive()) {
            console.debug('SyncPlay localUnpause: no active player!');
            return;
        }

        const playerWrapper = this.manager.getPlayerWrapper();
        return playerWrapper.localUnpause();
    }

    /**
     * Pauses the local player.
     */
    localPause() {
        // Ignore command when no player is active.
        if (!this.manager.isPlaybackActive()) {
            console.debug('SyncPlay localPause: no active player!');
            return;
        }

        const playerWrapper = this.manager.getPlayerWrapper();
        return playerWrapper.localPause();
    }

    /**
     * Seeks the local player.
     */
    localSeek(positionTicks) {
        // Ignore command when no player is active.
        if (!this.manager.isPlaybackActive()) {
            console.debug('SyncPlay localSeek: no active player!');
            return;
        }

        const playerWrapper = this.manager.getPlayerWrapper();
        return playerWrapper.localSeek(positionTicks);
    }

    /**
     * Stops the local player.
     */
    localStop() {
        // Ignore command when no player is active.
        if (!this.manager.isPlaybackActive()) {
            console.debug('SyncPlay localStop: no active player!');
            return;
        }

        const playerWrapper = this.manager.getPlayerWrapper();
        return playerWrapper.localStop();
    }

    /**
     * Estimates current value for ticks given a past state.
     * @param {number} ticks The value of the ticks.
     * @param {Date} when The point in time for the value of the ticks.
     * @param {Date} currentTime The current time, optional.
     */
    estimateCurrentTicks(ticks, when, currentTime = new Date()) {
        const remoteTime = this.timeSyncCore.localDateToRemote(currentTime);
        return ticks + (remoteTime.getTime() - when.getTime()) * syncPlayHelper.TicksPerMillisecond;
    }

    /**
     * Attempts to sync playback time with estimated server time (or selected device for time sync).
     *
     * When sync is enabled, the following will be checked:
     *  - check if local playback time is close enough to the server playback time.
     * If it is not, then a playback time sync will be attempted.
     * Two strategies of syncing are available:
     * - SpeedToSync: speeds up the media for some time to catch up (default is one second)
     * - SkipToSync: seeks the media to the estimated correct time
     * SpeedToSync aims to reduce the delay as much as possible, whereas SkipToSync is less pretentious.
     * @param {Object} timeUpdateData The time update data that contains the current time as date and the current position in milliseconds.
     */
    syncPlaybackTime(timeUpdateData) {
        // See comments in constants section for more info
        const syncMethodThreshold = this.maxDelaySpeedToSync;
        let speedToSyncTime = this.speedToSyncDuration;

        // Ignore sync when no player is active
        if (!this.manager.isPlaybackActive()) {
            console.debug('SyncPlay syncPlaybackTime: no active player!');
            return;
        }

        // Attempt to sync only when media is playing.
        const { lastCommand } = this;

        if (!lastCommand || lastCommand.Command !== 'Unpause' || this.isBuffering()) return;

        const { currentTime, currentPosition } = timeUpdateData;

        // Get current PositionTicks.
        const currentPositionTicks = currentPosition * syncPlayHelper.TicksPerMillisecond;

        // Estimate PositionTicks on server.
        const serverPositionTicks = this.estimateCurrentTicks(lastCommand.PositionTicks, lastCommand.When, currentTime);

        // Measure delay that needs to be recovered.
        // Diff might be caused by the player internally starting the playback.
        const diffMillis = (serverPositionTicks - currentPositionTicks) / syncPlayHelper.TicksPerMillisecond;

        this.playbackDiffMillis = diffMillis;

        // Avoid overloading the browser.
        const elapsed = currentTime - this.lastSyncTime;
        if (elapsed < syncMethodThreshold / 2) return;

        this.lastSyncTime = currentTime;
        const playerWrapper = this.manager.getPlayerWrapper();

        if (this.syncEnabled && this.enableSyncCorrection) {
            const absDiffMillis = Math.abs(diffMillis);
            // TODO: SpeedToSync sounds bad on songs.
            // TODO: SpeedToSync is failing on Safari (Mojave); even if playbackRate is supported, some delay seems to exist.
            // TODO: both SpeedToSync and SpeedToSync seem to have a hard time keeping up on Android Chrome as well.
            if (playerWrapper.hasPlaybackRate() && this.useSpeedToSync && absDiffMillis >= this.minDelaySpeedToSync && absDiffMillis < this.maxDelaySpeedToSync) {
                // Fix negative speed when client is ahead of time more than speedToSyncTime.
                const MinSpeed = 0.2;
                if (diffMillis <= -speedToSyncTime * MinSpeed) {
                    speedToSyncTime = Math.abs(diffMillis) / (1.0 - MinSpeed);
                }

                // SpeedToSync strategy.
                const speed = 1 + diffMillis / speedToSyncTime;

                if (speed <= 0) {
                    console.error('SyncPlay error: speed should not be negative!', speed, diffMillis, speedToSyncTime);
                }

                playerWrapper.setPlaybackRate(speed);
                this.syncEnabled = false;
                this.syncAttempts++;
                this.manager.showSyncIcon(`SpeedToSync (x${speed.toFixed(2)})`);

                this.syncTimeout = setTimeout(() => {
                    playerWrapper.setPlaybackRate(1.0);
                    this.syncEnabled = true;
                    this.manager.clearSyncIcon();
                }, speedToSyncTime);

                console.log('SyncPlay SpeedToSync', speed);
            } else if (this.useSkipToSync && absDiffMillis >= this.minDelaySkipToSync) {
                // SkipToSync strategy.
                this.localSeek(serverPositionTicks);
                this.syncEnabled = false;
                this.syncAttempts++;
                this.manager.showSyncIcon(`SkipToSync (${this.syncAttempts})`);

                this.syncTimeout = setTimeout(() => {
                    this.syncEnabled = true;
                    this.manager.clearSyncIcon();
                }, syncMethodThreshold / 2);

                console.log('SyncPlay SkipToSync', serverPositionTicks);
            } else {
                // Playback is synced.
                if (this.syncAttempts > 0) {
                    console.debug('Playback has been synced after', this.syncAttempts, 'attempts.');
                }
                this.syncAttempts = 0;
            }
        }
    }
}

export default SyncPlayPlaybackCore;
