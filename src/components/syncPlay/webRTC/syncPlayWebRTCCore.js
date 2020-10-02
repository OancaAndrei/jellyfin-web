/**
 * Module that manages WebRTC connections for SyncPlay.
 * @module components/syncPlay/webRTC/syncPlayWebRTCCore
 */

import SyncPlayWebRTCConnection from 'syncPlayWebRTCConnection';

var syncPlayManager;

class SyncPlayWebRTCCore {
    constructor(_syncPlayManager) {
        syncPlayManager = _syncPlayManager;
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
        const connection = new SyncPlayWebRTCConnection(userId, isHost);
        this.peers[userId] = connection;
        await connection.open();
    }

    removeConnection(userId) {
        const connection = this.getConnectionByUserId(userId);
        connection.close();
        this.peers[userId] = null;
    }

    /**
     * Handles a message received from the server.
     * @param {Object} apiClient The ApiClient.
     * @param {Object} message The new message.
     */
    async handleMessage(apiClient, message) {
        console.log(this, message);

        const from = message.From;
        if (message.NewSession) {
            console.debug('SyncPlay WebRTC handleMessage: new session.');
            await this.addConnection(from, true);
        } else if (message.SessionLeaving) {
            console.debug('SyncPlay WebRTC handleMessage: session leaving.');
            this.removeConnection(from);
        } else {
            let connection = this.getConnectionByUserId(from);
            if (!connection) {
                console.debug('SyncPlay WebRTC handleMessage: new connection received.');
                await this.addConnection(from);
            }
            connection = this.getConnectionByUserId(from);
            connection.handleMessage(apiClient, message);
        }
    }
}

export default SyncPlayWebRTCCore;
