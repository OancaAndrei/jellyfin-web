/**
 * Module that notifies user about SyncPlay messages using toasts.
 * @module components/syncPlay/syncPlayToasts
 */

import events from 'events';
import syncPlayManager from 'syncPlayManager';
import toast from 'toast';
import globalize from 'globalize';

/**
 * Class that notifies user about SyncPlay messages using toasts.
 */
class SyncPlayToasts {
    constructor() {
        events.on(syncPlayManager, 'show-message', (event, data) => {
            const { message, args = [] } = data;
            toast({
                text: globalize.translate(message, ...args)
            });
        });
    }
}

/** SyncPlayToasts singleton. */
const syncPlayToasts = new SyncPlayToasts();
export default syncPlayToasts;
