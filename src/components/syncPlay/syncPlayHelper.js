/**
 * Module that offers some utility functions.
 * @module components/syncPlay/syncPlayHelper
 */

import events from 'events';

/**
 * Constants
 */
export const WaitForEventDefaultTimeout = 30000; // milliseconds
export const WaitForPlayerEventTimeout = 500; // milliseconds
export const TicksPerMillisecond = 10000.0;

/**
 * Waits for an event to be triggered on an object. An optional timeout can specified after which the promise is rejected.
 * @param {Object} emitter Object on which to listen for events.
 * @param {string} eventType Event name to listen for.
 * @param {number} timeout Time in milliseconds before rejecting promise if event does not trigger.
 * @returns {Promise} A promise that resolves when the event is triggered.
 */
export function waitForEventOnce(emitter, eventType, timeout) {
    return new Promise((resolve, reject) => {
        let rejectTimeout;
        if (timeout) {
            rejectTimeout = setTimeout(() => {
                reject('Timed out.');
            }, timeout);
        }
        const callback = () => {
            events.off(emitter, eventType, callback);
            if (rejectTimeout) {
                clearTimeout(rejectTimeout);
            }
            resolve(arguments);
        };
        events.on(emitter, eventType, callback);
    });
}
