/**
 * Module that manages SyncPlay settings.
 * @module components/syncPlay/settings/settings
 */

import events from 'events';
import appStorage from 'appStorage';

/**
 * Class that manages SyncPlay settings.
 */
class SyncPlaySettings {
    constructor() {
        // Do nothing
    }

    /**
     * Gets the key used to store a setting in the App Storage.
     * @param {string} name The name of the setting.
     * @returns {string} The key.
     */
    getKey(name) {
        return 'syncPlay-' + name;
    }

    /**
     * Gets the value of a setting.
     * @param {string} name The name of the setting.
     * @returns {string} The value.
     */
    get(name) {
        return appStorage.getItem(this.getKey(name));
    }

    /**
     * Sets the value of a setting. Triggers an update if the new value differs from the old one.
     * @param {string} name The name of the setting.
     * @param {Object} value The value of the setting.
     */
    set(name, value) {
        const oldValue = this.get(name);
        appStorage.setItem(this.getKey(name), value);
        const newValue = this.get(name);

        if (oldValue !== newValue) {
            events.trigger(this, name, [newValue, oldValue]);
        }

        console.debug(`SyncPlay Settings set: '${name}' from '${oldValue}' to '${newValue}'.`);
    }

    /**
     * Gets the value of a setting as boolean.
     * @param {string} name The name of the setting.
     * @returns {boolean} The value.
     */
    getBool(name) {
        return this.get(name) !== 'false';
    }

    /**
     * Gets the value of a setting as float number.
     * @param {string} name The name of the setting.
     * @returns {number} The value.
     */
    getFloat(name, defaultValue = 0) {
        const value = this.get(name);
        if (value === null || value === '' || isNaN(value)) {
            return defaultValue;
        } else {
            return Number.parseFloat(value);
        }
    }
}

/** SyncPlaySettings singleton. */
const syncPlaySettings = new SyncPlaySettings();
export default syncPlaySettings;
