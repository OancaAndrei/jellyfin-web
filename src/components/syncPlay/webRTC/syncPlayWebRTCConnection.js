/**
 * Module that manages a single WebRTC connection for SyncPlay.
 * @module components/syncPlay/webRTC/syncPlayWebRTCConnection
 */

class SyncPlayWebRTCConnection {
    constructor(sessionId, isHost = false) {
        this.sessionId = sessionId;
        this.peerConnection = null;
        this.isHost = isHost;
        this.iceCandidates = [];
    }

    async open() {
        this.initPeerConnection();
        if (this.isHost) {
            await this.sendOffer();
        }
    }

    close() {
        // TODO: notify peer?
        if (!this.dataChannel) {
            return;
        }

        this.dataChannel.send({
            message: 'bye'
        });
    }

    initPeerConnection() {
        const apiClient = window.connectionManager.currentApiClient();

        const configuration = {
            iceServers: []
        };
        this.peerConnection = new RTCPeerConnection(configuration);
        if (this.isHost) {
            // Important to create the channel before sending offers as ICE will fail otherwise
            const channel = this.peerConnection.createDataChannel('channel');
            this.setDataChannel(channel);
        } else {
            console.debug('SyncPlay WebRTC initPeerConnection: guest peer, no data channel created yet.');
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
                console.log('SyncPlay WebRTC: peers connected!');
            } else {
                console.log('SyncPlay WebRTC: connection state changed:', this.peerConnection.connectionState);
            }
        });

        this.peerConnection.addEventListener('datachannel', (event) => {
            console.debug('SyncPlay WebRTC initPeerConnection: new data channel received.');
            this.setDataChannel(event.channel);
        });
    }

    setDataChannel(channel) {
        this.dataChannel = channel;

        this.dataChannel.addEventListener('open', (event) => {
            console.log('SyncPlay WebRTC: data channel is open!', event);
            this.dataChannel.send(JSON.stringify({
                message: 'helo'
            }));
        });

        this.dataChannel.addEventListener('message', (event) => {
            console.log('SyncPlay WebRTC: message received:', event);
            if (event.data) {
                try {
                const message = JSON.parse(event.data);
                console.log('SyncPlay WebRTC: message data:', message);
                } catch (error) {
                    console.log('SyncPlay WebRTC: error parsing JSON:', error, event.data);
                }
            }
        });

        this.dataChannel.addEventListener('close', (event) => {
            console.log('SyncPlay WebRTC: data channel has closed.', event);
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
     * Handles a message received from the server.
     * @param {Object} apiClient The ApiClient.
     * @param {Object} message The new message.
     */
    async handleMessage(apiClient, message) {
        if (message.Answer) {
            const answer = JSON.parse(message.Answer);
            const remoteDesc = new RTCSessionDescription(answer);
            await this.peerConnection.setRemoteDescription(remoteDesc);
        } else if (message.Offer) {
            const offer = JSON.parse(message.Offer);
            const remoteDesc = new RTCSessionDescription(offer);
            await this.peerConnection.setRemoteDescription(remoteDesc);
            await this.setICECandidatesQueue();
            await this.sendAnswer();
        } else if (message.ICECandidate) {
            const iceCandidate = JSON.parse(message.ICECandidate);
            try {
                await this.onRemoteICECandidate(iceCandidate);
            } catch (error) {
                console.error('SyncPlay WebRTC handleMessage: error adding received ICE candidate.', error);
            }
        }
    }
}

export default SyncPlayWebRTCConnection;
