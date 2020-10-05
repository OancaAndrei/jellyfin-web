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
            this.webRTCCore.sendInternalMessage(this.peerId, message);
        });
    }

    resetCallbacks() {
        this.resolvePingRequest = null;
        this.rejectPingRequest = null;
    }
}

export default TimeSyncPeer;
