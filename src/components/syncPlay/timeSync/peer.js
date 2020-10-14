/**
 * Module that manages time syncing with a peer.
 * @module components/syncPlay/timeSync/peer
 */

import TimeSync from 'timeSync';

/**
 * Class that manages time syncing with a peer.
 */
class TimeSyncPeer extends TimeSync {
    constructor(webRTCCore, peerId) {
        super();
        this.webRTCCore = webRTCCore;
        this.peerId = peerId;
        this.peerTimeOffset = 0; // peer's time offset with server
        this.peerPing = 0; // peer's ping with server
    }

    /**
     * Sends a ping request to the peer.
     */
    requestPing() {
        return new Promise((resolve, reject) => {
            this.resolvePingRequest = resolve;
            this.rejectPingRequest = reject;

            const message = {
                type: 'ping-request',
                data: {
                    requestSent: new Date()
                }
            };
            this.webRTCCore.sendMessage(this.peerId, message);
        });
    }

    /**
     * Gets the id of the managed peer.
     * @returns {string} The id.
     */
    getPeerId() {
        return this.peerId;
    }

    /**
     * Gets the time offset between the peer and the server, in milliseconds.
     * @returns {number} The time offset.
     */
    getPeerTimeOffset() {
        return this.peerTimeOffset;
    }

    /**
     * Gets the ping between the peer and the server, in milliseconds.
     * @returns {number} The ping.
     */
    getPeerPing() {
        return this.peerPing;
    }

    /**
     * Resets promise callbacks used for ping request.
     */
    resetCallbacks() {
        this.resolvePingRequest = null;
        this.rejectPingRequest = null;
    }

    /**
     * Handles peer connection established event.
     */
    onConnected() {
        this.stopPing();

        if (typeof this.rejectPingRequest === 'function') {
            this.rejectPingRequest('Peer disconnected.');
            this.resetCallbacks();
        }

        this.startPing();
    }

    /**
     * Handles peer connection closed event.
     */
    onDisconnected() {
        this.stopPing();

        if (typeof this.rejectPingRequest === 'function') {
            this.rejectPingRequest('Peer disconnected.');
            this.resetCallbacks();
        }
    }

    /**
     * Handles ping-request message from peer.
     * @param {Object} data The request data.
     * @param {Date} receivedAt When the message has been received.
     */
    onPingRequest(data, receivedAt) {
        if (!data || !data.requestSent) {
            console.error(`SyncPlay TimeSyncPeer onPingRequest: invalid ping-request from ${this.peerId}.`, data);
        } else {
            const responsePing = {
                type: 'ping-response',
                data: {
                    requestSent: data.requestSent,
                    requestReceived: receivedAt,
                    responseSent: new Date()
                }
            };
            this.webRTCCore.sendMessage(this.peerId, responsePing);
        }
    }

    /**
     * Handles ping-response message from peer.
     * @param {Object} data The response data.
     * @param {Date} receivedAt When the message has been received.
     */
    onPingResponse(data, receivedAt) {
        const { requestSent, requestReceived, responseSent } = data || {};
        if (!data || !requestSent || !requestReceived || !responseSent) {
            console.error(`SyncPlay TimeSyncPeer onPingResponse: invalid ping-response from ${this.peerId}.`, data);
        } else {
            if (typeof this.resolvePingRequest === 'function') {
                this.resolvePingRequest({
                    requestSent: new Date(requestSent),
                    requestReceived: new Date(requestReceived),
                    responseSent: new Date(responseSent),
                    responseReceived: receivedAt
                });
                this.resetCallbacks();
            } else {
                console.warn(`SyncPlay TimeSyncPeer onPingResponse: missing promise to resolve for peer ${this.peerId}.`, data, receivedAt, this);
            }
        }
    }

    /**
     * Handles time-sync-server-update message from peer.
     * @param {Object} data The update data.
     */
    onTimeSyncServerUpdate(data) {
        const { timeOffset, ping } = data || {};
        if (!data || timeOffset === null || ping === null) {
            console.error(`SyncPlay TimeSyncPeer onTimeSyncServerUpdate: invalid time-sync-server-update from ${this.peerId}.`, data);
        } else {
            this.peerTimeOffset = timeOffset;
            this.peerPing = ping;
        }
    }

    /**
     * Converts server time to peer's local time.
     * @param {Date} server The time to convert.
     * @returns {Date} Peer's local time.
     */
    serverDateToPeer(server) {
        return new Date(server.getTime() - this.getPeerTimeOffset());
    }

    /**
     * Converts peer's local time to server time.
     * @param {Date} peer The time to convert.
     * @returns {Date} Server time.
     */
    peerDateToServer(peer) {
        return new Date(peer.getTime() + this.getPeerTimeOffset());
    }
}

export default TimeSyncPeer;
