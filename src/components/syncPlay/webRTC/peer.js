/**
 * Module that manages a single WebRTC connection for SyncPlay.
 * @module components/syncPlay/webRTC/peer
 */

import events from 'events';

class SyncPlayWebRTCPeer {
    constructor(webRTCCore, sessionId, isHost = false) {
        this.webRTCCore = webRTCCore;
        this.sessionId = sessionId;
        this.isHost = isHost;
        this.peerConnection = null;
        this.iceCandidates = [];
    }

    async open() {
        this.initPeerConnection();
        if (this.isHost) {
            await this.sendOffer();
        }
    }

    close() {
    }

    initPeerConnection() {
        const apiClient = window.connectionManager.currentApiClient();

        const configuration = {
            iceServers: []
        };
        this.peerConnection = new RTCPeerConnection(configuration);
        if (this.isHost) {
            console.debug(`SyncPlay WebRTC initPeerConnection: peer ${this.sessionId} is our guest, creating data channel.`);
            const channel = this.peerConnection.createDataChannel('channel');
            this.setDataChannel(channel);
        } else {
            console.debug(`SyncPlay WebRTC initPeerConnection: peer ${this.sessionId} is our host, waiting for data channel.`);
        }

        this.peerConnection.addEventListener('icecandidate', (event) => {
            if (event.candidate) {
                apiClient.requestSyncPlayWebRTC({
                    To: this.sessionId,
                    ICECandidate: JSON.stringify(event.candidate)
                });
            }
        });

        this.peerConnection.addEventListener('connectionstatechange', (event) => {
            if (this.peerConnection.connectionState === 'connected') {
                console.log(`SyncPlay WebRTC: connected with peer ${this.sessionId}!`);
            } else {
                console.debug(`SyncPlay WebRTC: connection state changed with peer ${this.sessionId}:`, this.peerConnection.connectionState);
            }
        });

        this.peerConnection.addEventListener('datachannel', (event) => {
            console.debug(`SyncPlay WebRTC initPeerConnection: new data channel received from peer ${this.sessionId}.`);
            this.setDataChannel(event.channel);
        });
    }

    setDataChannel(channel) {
        this.dataChannel = channel;

        this.dataChannel.addEventListener('open', (event) => {
            console.log(`SyncPlay WebRTC: data channel is open with peer ${this.sessionId}!`, event);
            events.trigger(this.webRTCCore, 'peer-helo', [this.sessionId]);
        });

        this.dataChannel.addEventListener('message', (event) => {
            const messageReceivedAt = new Date();
            if (event.data && typeof event.data === 'string') {
                try {
                    const message = JSON.parse(event.data);
                    console.debug(`SyncPlay WebRTC: peer ${this.sessionId} sent a message:`, message);
                    events.trigger(this.webRTCCore, 'peer-message', [this.sessionId, message, messageReceivedAt]);
                } catch (error) {
                    console.error(`SyncPlay WebRTC: error while loading message from peer ${this.sessionId}:`, error, event.data);
                }
            } else if (event.data) {
                console.warn(`SyncPlay WebRTC: unknown message from peer ${this.sessionId}:`, event.data);
            }
        });

        this.dataChannel.addEventListener('close', (event) => {
            console.debug(`SyncPlay WebRTC: data channel for peer ${this.sessionId} has been closed.`, event);
            events.trigger(this.webRTCCore, 'peer-bye', [this.sessionId]);
        });
    }

    async sendOffer() {
        const offer = await this.peerConnection.createOffer();
        await this.peerConnection.setLocalDescription(offer);

        const apiClient = window.connectionManager.currentApiClient();
        apiClient.requestSyncPlayWebRTC({
            To: this.sessionId,
            Offer: JSON.stringify(offer)
        });
    }

    async sendAnswer() {
        const answer = await this.peerConnection.createAnswer();
        await this.peerConnection.setLocalDescription(answer);

        const apiClient = window.connectionManager.currentApiClient();
        apiClient.requestSyncPlayWebRTC({
            To: this.sessionId,
            Answer: JSON.stringify(answer)
        });
    }

    async onRemoteICECandidate(iceCandidate) {
        if (!this.peerConnection || !this.peerConnection.remoteDescription || !this.peerConnection.remoteDescription.type) {
            this.iceCandidates.push(iceCandidate);
        } else {
            await this.peerConnection.addIceCandidate(iceCandidate);
        }
    }

    async setICECandidatesQueue() {
        for (const iceCandidate of this.iceCandidates) {
            await this.peerConnection.addIceCandidate(iceCandidate);
        }
        this.iceCandidates = [];
    }

    /**
     * Handles a signaling message received from the server.
     * @param {Object} apiClient The ApiClient.
     * @param {Object} message The new message.
     */
    async onSignalingMessage(apiClient, message) {
        if (message.Answer) {
            const answer = JSON.parse(message.Answer);
            console.debug(`SyncPlay WebRTC onSignalingMessage: received answer from peer ${this.sessionId}.`, answer);

            const remoteDesc = new RTCSessionDescription(answer);
            await this.peerConnection.setRemoteDescription(remoteDesc);
        } else if (message.Offer) {
            const offer = JSON.parse(message.Offer);
            console.debug(`SyncPlay WebRTC onSignalingMessage: received offer from peer ${this.sessionId}.`, offer);

            const remoteDesc = new RTCSessionDescription(offer);
            await this.peerConnection.setRemoteDescription(remoteDesc);
            await this.setICECandidatesQueue();
            await this.sendAnswer();
        } else if (message.ICECandidate) {
            const iceCandidate = JSON.parse(message.ICECandidate);
            console.debug(`SyncPlay WebRTC onSignalingMessage: received ICECandidate from peer ${this.sessionId}.`, iceCandidate);

            try {
                await this.onRemoteICECandidate(iceCandidate);
            } catch (error) {
                console.error(`SyncPlay WebRTC onSignalingMessage: error adding ICECandidate from peer ${this.sessionId}.`, error);
            }
        }
    }

    sendMessage(message) {
        if (this.dataChannel) {
            this.dataChannel.send(JSON.stringify(message));
        } else {
            console.error(`SyncPlay WebRTC sendMessage: peer ${this.sessionId} has no data channel open!`);
            // TODO: queue message?
        }
    }
}

export default SyncPlayWebRTCPeer;
