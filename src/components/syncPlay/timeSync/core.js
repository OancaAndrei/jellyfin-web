/**
 * Module that manages time syncing with several devices.
 * @module components/syncPlay/timeSync/core
 */

import events from 'events';
import syncPlaySettings from 'syncPlaySettings';
import TimeSyncServer from 'timeSyncServer';
import TimeSyncPeer from 'timeSyncPeer';

/**
 * Class that manages time syncing with several devices.
 */
class TimeSyncCore {
    constructor(webRTCCore) {
        this.webRTCCore = webRTCCore;
        this.timeSyncServer = new TimeSyncServer();
        this.peers = {};
        this.peerIds = [];
        this.activePeerId = 'server';
        this.extraTimeOffset = syncPlaySettings.getFloat('extraTimeOffset', 0.0);

        events.on(this.webRTCCore, 'peer-helo', (event, peerId) => {
            this.onPeerConnected(peerId);
        });

        events.on(this.webRTCCore, 'peer-bye', (event, peerId) => {
            this.onPeerDisconnected(peerId);
        });

        events.on(this.webRTCCore, 'peer-message', (event, peerId, message, receivedAt) => {
            this.onPeerMessage(peerId, message, receivedAt);
        });

        events.on(this.timeSyncServer, 'update', (event, error, timeOffset, ping) => {
            if (error) {
                console.debug('SyncPlay TimeSyncCore: time sync with server issue:', error);
                return;
            }

            // Notify peers
            this.webRTCCore.broadcastMessage({
                type: 'time-sync-server-update',
                data: {
                    timeOffset: timeOffset,
                    ping: ping
                }
            });

            events.trigger(this, 'time-sync-server-update', [timeOffset, ping]);
        });

        events.on(syncPlaySettings, 'timeSyncDevice', (event, value, oldValue) => {
            this.setActiveDevice(value);
        });

        events.on(syncPlaySettings, 'extraTimeOffset', (event, value, oldValue) => {
            this.extraTimeOffset = syncPlaySettings.getFloat('extraTimeOffset', 0.0);
        });
    }

    /**
     * Forces time update with server.
     */
    forceUpdate() {
        this.timeSyncServer.forceUpdate();
    }

    /**
     * Handles a new connected peer.
     * @param {string} peerId The id of the peer.
     */
    onPeerConnected(peerId) {
        let peer = this.peers[peerId];
        if (!peer) {
            peer = new TimeSyncPeer(this.webRTCCore, peerId);
            this.peers[peerId] = peer;
            this.peerIds.push(peerId);
        }

        peer.onConnected();
        events.trigger(this, 'refresh-devices');
    }

    /**
     * Handles a disconnected peer.
     * @param {string} peerId The id of the peer.
     */
    onPeerDisconnected(peerId) {
        const peer = this.peers[peerId];
        if (peer) {
            peer.onDisconnected();
            this.peers[peerId] = null;
            const index = this.peerIds.indexOf(peerId);
            this.peerIds.splice(index, 1);

            events.trigger(this, 'refresh-devices');
        }
    }

    /**
     * Handles a message from a peer.
     * @param {string} peerId The id of the peer.
     * @param {Object} message The received message.
     * @param {Date} receivedAt When the message has been received.
     */
    onPeerMessage(peerId, message, receivedAt) {
        const peer = this.peers[peerId];
        if (!peer) {
            console.error(`SyncPlay TimeSyncCore onPeerMessage: ignoring message from unknown peer ${peerId}.`, message);
            return;
        }

        let triggerRefresh = true;

        switch (message.type) {
            case 'time-sync-server-update':
                peer.onTimeSyncServerUpdate(message.data);
                break;
            case 'ping-request':
                peer.onPingRequest(message.data, receivedAt);
                break;
            case 'ping-response':
                peer.onPingResponse(message.data, receivedAt);
                break;
            default:
                console.debug(`SyncPlay TimeSyncCore onPeerMessage: ignoring message from ${peerId}.`, message);
                triggerRefresh = false;
                break;
        }

        if (triggerRefresh) {
            events.trigger(this, 'refresh-devices');
        }
    }

    /**
     * Gets the list of available devices for time sync.
     * @returns {Array} The list of devices.
     */
    getDevices() {
        const devices = this.peerIds.map(peerId => {
            return this.peers[peerId];
        }).map(peer => {
            return {
                type: 'peer',
                id: peer.getPeerId(),
                timeOffset: peer.getTimeOffset(),
                ping: peer.getPing(),
                peerTimeOffset: peer.getPeerTimeOffset(),
                peerPing: peer.getPeerPing()
            }
        });

        devices.unshift({
            type: 'server',
            id: 'server',
            timeOffset: this.timeSyncServer.getTimeOffset(),
            ping: this.timeSyncServer.getPing(),
            peerTimeOffset: 0,
            peerPing: 0
        })

        return devices;
    }

    /**
     * Sets the active device selected for time sync if available. Default value is 'server'.
     * @param {string} deviceId The id of the device.
     */
    setActiveDevice(deviceId) {
        const isPeer = this.peerIds.indexOf(deviceId) !== -1;
        if (isPeer) {
            this.activePeerId = deviceId;
        } else {
            this.activePeerId = 'server';
        }

        console.debug(`SyncPlay TimeSyncCore setActiveDevice: ${this.activePeerId} with ${this.getTimeOffset()} ms of total time offset.`);
    }

    /**
     * Gets the active device selected for time sync. Default value is 'server'.
     * @returns {string} The id of the device.
     */
    getActiveDevice() {
        return this.activePeerId;
    }

    /**
     * Gets a peer by its peer id.
     * @param {string} peerId The id of the peer.
     * @returns {TimeSyncPeer} The peer if found, null otherwise.
     */
    getPeerById(peerId) {
        return this.peers[peerId];
    }

    /**
     * Converts server time to local time. Local time can be affected by peer time syncing.
     * @param {Date} remote The time to convert.
     * @returns {Date} Local time.
     */
    remoteDateToLocal(remote) {
        let date;
        if (this.activePeerId !== 'server') {
            const peer = this.getPeerById(this.activePeerId);
            if (!peer) {
                this.activePeerId = 'server';
                date = this.remoteDateToLocal(remote);
            } else {
                const peerDate = peer.serverDateToPeer(remote);
                date = peer.remoteDateToLocal(peerDate);
            }
        } else {
            date = this.timeSyncServer.remoteDateToLocal(remote);
        }

        return this.offsetDate(date, -this.extraTimeOffset);
    }

    /**
     * Converts local time to server time. Local time can be affected by peer time syncing.
     * @param {Date} local The time to convert.
     * @returns {Date} Server time.
     */
    localDateToRemote(local) {
        let date;
        if (this.activePeerId !== 'server') {
            const peer = this.getPeerById(this.activePeerId);
            if (!peer) {
                this.activePeerId = 'server';
                date = this.localDateToRemote(local);
            } else {
                const peerDate = peer.localDateToRemote(local);
                date = peer.peerDateToServer(peerDate);
            }
        } else {
            date = this.timeSyncServer.localDateToRemote(local);
        }

        return this.offsetDate(date, this.extraTimeOffset);
    }

    /**
     * Gets time offset that should be used for time syncing, in milliseconds. Takes into account server and active device selected for syncing.
     * @returns {number} The time offset.
     */
    getTimeOffset() {
        const peer = this.getPeerById(this.activePeerId);
        if (peer) {
            return peer.getTimeOffset() + peer.getPeerTimeOffset() + this.extraTimeOffset;
        } else {
            return this.timeSyncServer.getTimeOffset() + this.extraTimeOffset;
        }
    }

    /**
     * Offsets a given date by a given ammount of milliseconds.
     * @param {Date} date The date.
     * @param {number} offset The offset, in milliseconds.
     * @returns {Date} The offset date.
     */
    offsetDate(date, offset) {
        return new Date(date.getTime() + offset);
    }
}

export default TimeSyncCore;
