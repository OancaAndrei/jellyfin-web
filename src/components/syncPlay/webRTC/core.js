/**
 * Module that manages WebRTC connections for SyncPlay.
 * @module components/syncPlay/webRTC/core
 */

import events from 'events';
import syncPlaySettings from 'syncPlaySettings';
import SyncPlayWebRTCPeer from 'syncPlayWebRTCPeer';

class SyncPlayWebRTCCore {
    constructor() {
        this.connections = {};
        this.connectionsArray = [];
        this.peerIds = [];
        this.enabled = false;

        // Update WebRTC status based on user preferences
        events.on(syncPlaySettings, 'enableWebRTC', (event, value, oldValue) => {
            if (value !== 'false') {
                this.enable();
            } else {
                this.disable(true);
            }
        });
    }

    /**
     * Enables the WebRTC feature. Notifies server.
     */
    enable() {
        if (this.enabled) {
            return;
        }

        this.enabled = true;
        const apiClient = window.connectionManager.currentApiClient();
        apiClient.requestSyncPlayWebRTC({
            NewSession: true
        });
    }

    /**
     * Disables the WebRTC feature. Closes all active connections. Might notify server.
     * @param {boolean} notifyServer Whether to notify server or not. Default to 'false'.
     */
    disable(notifyServer = false) {
        if (!this.enabled) {
            return;
        }

        // Close all connections
        this.connectionsArray.forEach(userId => {
            const connection = this.getConnectionByUserId(userId);
            connection.close();
        });

        this.connections = {};
        this.connectionsArray = [];
        this.enabled = false;

        if (notifyServer) {
            const apiClient = window.connectionManager.currentApiClient();
            apiClient.requestSyncPlayWebRTC({
                SessionLeaving: true
            });
        }
    }

    /**
     * Gets the connection to a user, if available.
     * @param {string} userId The id of the connection.
     * @returns {SyncPlayWebRTCPeer} The connection.
     */
    getConnectionByUserId(userId) {
        return this.connections[userId];
    }

    /**
     * Called when a new user has joined the group.
     * @param {string} userId The id of the user.
     * @param {boolean} isHost Whether this end will be managing the connection or not.
     */
    async addConnection(userId, isHost = false) {
        const oldConnection = this.connections[userId];
        if (oldConnection) {
            this.removeConnection(userId);
        }

        const connection = new SyncPlayWebRTCPeer(this, userId, isHost);
        this.connections[userId] = connection;
        this.connectionsArray.push(userId);
        await connection.open();
    }

    /**
     * Called when a user has left the group.
     * @param {string} userId The id of the user.
     */
    removeConnection(userId) {
        const connection = this.getConnectionByUserId(userId);
        connection.close();
        this.connections[userId] = null;
        const index = this.connectionsArray.indexOf(userId);
        this.connectionsArray.splice(index, 1);
    }

    /**
     * Handles a signaling message received from the server.
     * @param {Object} apiClient The ApiClient.
     * @param {Object} message The new message.
     */
    async handleSignalingMessage(apiClient, message) {
        const from = message.From;
        if (message.NewSession) {
            console.debug(`SyncPlay WebRTC handleSignalingMessage: new session: ${from}.`);
            await this.addConnection(from, true);
        } else if (message.SessionLeaving) {
            console.debug(`SyncPlay WebRTC handleSignalingMessage: session leaving: ${from}.`);
            this.removeConnection(from);
        } else {
            let connection = this.getConnectionByUserId(from);
            if (!connection) {
                console.debug(`SyncPlay WebRTC handleSignalingMessage: new connection received: ${from}.`);
                await this.addConnection(from);
            }
            connection = this.getConnectionByUserId(from);
            connection.onSignalingMessage(apiClient, message);
        }
    }

    /**
     * Sends a message through WebRTC connection. Internal use only.
     * @param {string} peerId The id of the peer.
     * @param {Object} message The message.
     */
    _sendMessage(peerId, message) {
        let connection = this.getConnectionByUserId(peerId);
        if (!connection) {
            console.error(`SyncPlay WebRTC sendMessage: no connection found for peer ${peerId}.`);
            return;
        }

        connection.sendMessage(message);
    }

    /**
     * Sends a message to a peer.
     * @param {string} to The id of the peer.
     * @param {Object} payload The message.
     * @param {string} type The message type, whether 'internal' or 'external'.
     */
    sendMessage(to, payload, type = 'external') {
        const message = {
            type: type,
            data: payload
        };
        if (to === 'all') {
            this.peerIds.forEach(peerId => {
                this._sendMessage(peerId, message);
            });
        } else {
            this._sendMessage(to, message);
        }
    }

    /**
     * Sends a message to all connected peers.
     * @param {Object} payload The message.
     * @param {string} type The message type, whether 'internal' or 'external'.
     */
    broadcastMessage(payload, type) {
        this.sendMessage('all', payload, type);
    }

    /**
     * Sends an internal WebRTC message to a peer.
     * @param {string} to The id of the peer.
     * @param {Object} payload The message.
     */
    sendInternalMessage(to, payload) {
        this.sendMessage(to, payload, 'internal');
    }

    /**
     * Handles an application-level message from a peer. Triggers a 'peer-message' event.
     * @param {string} peerId The id of the peer.
     * @param {Object} message The internal message.
     * @param {Date} receivedAt When the message has been received.
     */
    onExternalPeerMessage(peerId, message, receivedAt) {
        const peer = this.connections[peerId];
        if (!peer) {
            console.error(`SyncPlay WebRTC onExternalPeerMessage: ignoring message from unknown peer ${peerId}.`, message);
            return;
        }

        if (typeof message.type !== 'string') {
            console.error(`SyncPlay WebRTC onExternalPeerMessage: ignoring unknown message type from peer ${peerId}.`, message);
            return;
        }

        events.trigger(this, 'peer-message', [peerId, message, receivedAt]);
    }

    /**
     * Handles an internal WebRTC message from a peer.
     * @param {string} peerId The id of the peer.
     * @param {Object} message The internal message.
     * @param {Date} receivedAt When the message has been received.
     */
    onInternalPeerMessage(peerId, message, receivedAt) {
        const peer = this.connections[peerId];
        if (!peer) {
            console.error(`SyncPlay WebRTC onInternalPeerMessage: ignoring message from unknown peer ${peerId}.`, message);
            return;
        }

        switch (message.type) {
            default:
                console.error(`SyncPlay WebRTC onInternalPeerMessage: unknown internal message type from ${peerId}.`, message);
                break;
        }
    }

    /**
     * Called when a message is received from a peer.
     * @param {string} peerId The id of the peer.
     * @param {Object} message The received message.
     * @param {Date} receivedAt When the message has been received.
     */
    onPeerMessage(peerId, message, receivedAt) {
        switch (message.type) {
            case 'external':
                this.onExternalPeerMessage(peerId, message.data, receivedAt);
                break;
            case 'internal':
                this.onInternalPeerMessage(peerId, message.data, receivedAt);
                break;
            default:
                console.error(`SyncPlay WebRTC handlePeerMessage: unknown message type from ${peerId}.`, message);
                break;
        }
    }

    /**
     * Called when the data channel with a peer is opened. Triggers a 'peer-helo' event.
     * @param {string} peerId The id of the peer.
     */
    onPeerConnected(peerId) {
        const isPeerConnected = this.peerIds.indexOf(peerId) >= 0;
        if (!isPeerConnected) {
            this.peerIds.push(peerId);
            events.trigger(this, 'peer-helo', [peerId]);
        }
    }

    /**
     * Called when the data channel with a peer is closed. Triggers a 'peer-bye' event.
     * @param {string} peerId The id of the peer.
     */
    onPeerDisconnected(peerId) {
        const isPeerConnected = this.peerIds.indexOf(peerId) >= 0;
        if (isPeerConnected) {
            const index = this.peerIds.indexOf(peerId);
            this.peerIds.splice(index, 1);
            events.trigger(this, 'peer-bye', [peerId]);
        }
    }
}

export default SyncPlayWebRTCCore;
