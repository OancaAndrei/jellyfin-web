/**
 * Module that manages WebRTC connections for SyncPlay.
 * @module components/syncPlay/webRTC/peersManager
 */

import SyncPlayWebRTCPeer from 'syncPlayWebRTCPeer';

class SyncPlayWebRTCPeersManager {
    constructor(webRTCCore) {
        this.webRTCCore = webRTCCore;
        this.peers = {};
        this.enabled = false;
    }

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

    disable() {
        if (!this.enabled) {
            return;
        }

        // TODO: close all connections
        // this.peers.forEach(element => {
        //     element.close();
        // });

        this.peers = {};
        this.enabled = false;

        // TODO: already handled server-side,
        // consider this when user wants to disable WebRTC but not SyncPlay
        // const apiClient = window.connectionManager.currentApiClient();
        // apiClient.requestSyncPlayWebRTC({
        //     sessionLeaving: true
        // });
    }

    getConnectionByUserId(userId) {
        return this.peers[userId];
    }

    async addConnection(userId, isHost = false) {
        const connection = new SyncPlayWebRTCPeer(this.webRTCCore, userId, isHost);
        this.peers[userId] = connection;
        await connection.open();
    }

    removeConnection(userId) {
        const connection = this.getConnectionByUserId(userId);
        connection.close();
        this.peers[userId] = null;
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

    sendMessage(peerId, message) {
        let connection = this.getConnectionByUserId(peerId);
        if (!connection) {
            console.error(`SyncPlay WebRTC sendMessage: no connection found for peer ${peerId}.`);
            return;
        }

        connection.sendMessage(message);
    }
}

export default SyncPlayWebRTCPeersManager;
