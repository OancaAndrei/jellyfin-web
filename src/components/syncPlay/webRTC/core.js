/**
 * Module that manages WebRTC connections for SyncPlay.
 * @module components/syncPlay/webRTC/core
 */

import events from 'events';
import SyncPlayWebRTCPeersManager from 'syncPlayWebRTCPeersManager';
import TimeSyncPeer from 'timeSyncPeer';

var syncPlayManager;

/**
 * Class that stores peer data.
 */
class Peer {
    /**
     * Creates a new peer.
     * @param {SyncPlayWebRTCCore} webRTCCore Instance that manages this peer
     * @param {string} peerId Peer's id
     */
    constructor(webRTCCore, peerId) {
        this.webRTCCore = webRTCCore;
        this.peerId = peerId;
        this.timeSync = new TimeSyncPeer(webRTCCore, peerId);
        this.timeOffset = 0;
        this.ping = 0;
    }

    onConnected() {
        this.timeSync.stopPing();

        if (this.timeSync.rejectPingRequest) {
            this.timeSync.rejectPingRequest('Peer disconnected.');
            this.timeSync.resetCallbacks();
        }

        this.timeSync.startPing();
    }

    onDisconnected() {
        this.timeSync.stopPing();

        if (this.timeSync.rejectPingRequest) {
            this.timeSync.rejectPingRequest('Peer disconnected.');
            this.timeSync.resetCallbacks();
        }
    }

    onPingRequest(data, receivedAt) {
        if (!data || !data.requestSent) {
            console.error(`SyncPlay WebRTC onPingRequest: invalid ping-request from ${this.peerId}.`, data);
        } else {
            const responsePing = {
                type: 'ping-response',
                data: {
                    requestSent: data.requestSent,
                    requestReceived: receivedAt,
                    responseSent: new Date()
                }
            };
            this.webRTCCore.sendInternalMessage(this.peerId, responsePing);
        }
    }

    onPingResponse(data, receivedAt) {
        const { requestSent, requestReceived, responseSent } = data || {};
        if (!data || !requestSent || !requestReceived || !responseSent) {
            console.error(`SyncPlay WebRTC onPingResponse: invalid ping-response from ${this.peerId}.`, data);
        } else {
            if (this.timeSync.resolvePingRequest) {
                this.timeSync.resolvePingRequest({
                    requestSent: new Date(requestSent),
                    requestReceived: new Date(requestReceived),
                    responseSent: new Date(responseSent),
                    responseReceived: receivedAt
                });
                this.timeSync.resetCallbacks();
            }
        }
    }

    onTimeSyncServerUpdate(data) {
        const { timeOffset, ping } = data || {};
        if (!data || timeOffset === null || ping === null) {
            console.error(`SyncPlay WebRTC onTimeSyncServerUpdate: invalid time-sync-server-update from ${this.peerId}.`, data);
        } else {
            this.timeOffset = timeOffset;
            this.ping = ping;
        }
    }
}

class SyncPlayWebRTCCore {
    constructor(_syncPlayManager) {
        syncPlayManager = _syncPlayManager;
        this.peersManager = new SyncPlayWebRTCPeersManager(this);

        this.peers = {};
        this.peerIds = [];

        events.on(this, 'peer-helo', (event, peerId) => {
            this.onPeerConnected(peerId);
        });

        events.on(this, 'peer-message', (event, peerId, message, receivedAt) => {
            this.handlePeerMessage(peerId, message, receivedAt);
        });

        events.on(this, 'peer-bye', (event, peerId) => {
            this.onPeerDisconnected(peerId);
        });
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

    sendMessage(to, payload, type = 'external') {
        const message = {
            type: type,
            data: payload
        };
        if (to === 'all') {
            this.peerIds.forEach(peerId => {
                this.peersManager.sendMessage(peerId, message);
            });
        } else {
            this.peersManager.sendMessage(to, message);
        }
    }

    broadcastMessage(payload, type) {
        this.sendMessage('all', payload, type);
    }

    sendInternalMessage(to, payload) {
        this.sendMessage(to, payload, 'internal');
    }

    handlePeerMessage(peerId, message, receivedAt) {
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

    onExternalPeerMessage(peerId, message, receivedAt) {
        const peer = this.peers[peerId];
        if (!peer) {
            console.error(`SyncPlay WebRTC onExternalPeerMessage: ignoring message from unknown peer ${peerId}.`, message);
            return;
        }

        switch (message.type) {
            case 'time-sync-server-update':
                peer.onTimeSyncServerUpdate(message.data);
                break;
            default:
                console.error(`SyncPlay WebRTC onExternalPeerMessage: unknown internal message type from ${peerId}.`, message);
                break;
        }
    }

    onInternalPeerMessage(peerId, message, receivedAt) {
        const peer = this.peers[peerId];
        if (!peer) {
            console.error(`SyncPlay WebRTC onInternalPeerMessage: ignoring message from unknown peer ${peerId}.`, message);
            return;
        }

        switch (message.type) {
            case 'ping-request':
                peer.onPingRequest(message.data, receivedAt);
                break;
            case 'ping-response':
                peer.onPingResponse(message.data, receivedAt);
                break;
            default:
                console.error(`SyncPlay WebRTC onInternalPeerMessage: unknown internal message type from ${peerId}.`, message);
                break;
        }
    }

    onPeerConnected(peerId) {
        let peer = this.peers[peerId];
        if (!peer) {
            peer = new Peer(this, peerId);
            this.peers[peerId] = peer;
            this.peerIds.push(peerId);
        }

        peer.onConnected();
    }

    onPeerDisconnected(peerId) {
        const peer = this.peers[peerId];
        if (peer) {
            this.peers[peerId] = null;
            peer.onDisconnected();
            const index = this.peerIds.indexOf(peerId);
            this.peerIds.splice(index, 1);
        }
    }
}

export default SyncPlayWebRTCCore;
