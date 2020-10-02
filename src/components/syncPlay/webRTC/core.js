/**
 * Module that manages WebRTC connections for SyncPlay.
 * @module components/syncPlay/webRTC/core
 */

import SyncPlayWebRTCPeersManager from 'syncPlayWebRTCPeersManager';

var syncPlayManager;

class SyncPlayWebRTCCore {
    constructor(_syncPlayManager) {
        syncPlayManager = _syncPlayManager;
        this.peersManager = new SyncPlayWebRTCPeersManager(this);
    }

    enable() {
        this.peersManager.enable();

    }

    disable() {
        this.peersManager.disable();
    }

    /**
     * Handles a signaling message received from the server.
     * @param {Object} apiClient The ApiClient.
     * @param {Object} message The new message.
     */
    async handleSignalingMessage(apiClient, message) {
        return this.peersManager.handleSignalingMessage(apiClient, message);
    }

    sendMessage(peerId, message) {
        return this.peersManager.sendMessage(peerId, message);
    }
}

export default SyncPlayWebRTCCore;
