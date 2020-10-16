/**
 * Module that displays an editor for changing SyncPlay settings.
 * @module components/syncPlay/settings/editor
 */

import events from 'events';
import dialogHelper from 'dialogHelper';
import loading from 'loading';
import layoutManager from 'layoutManager';
import syncPlaySettings from 'syncPlaySettings';
import globalize from 'globalize';
import 'emby-input';
import 'emby-select';
import 'emby-button';
import 'css!./../../formdialog';

function centerFocus(elem, horiz, on) {
    import('scrollHelper').then((scrollHelper) => {
        const fn = on ? 'on' : 'off';
        scrollHelper.centerFocus[fn](elem, horiz);
    });
}

/**
 * Class that displays an editor for changing SyncPlay settings.
 */
class SyncPlaySettingsEditor {
    constructor(timeSyncCore, options) {
        this.timeSyncCore = timeSyncCore;
        this.options = options;
        this.embed();

        events.on(this.timeSyncCore, 'refresh-devices', (event) => {
            this.refreshTimeSyncDevices();
        });

        events.on(this.timeSyncCore, 'time-sync-server-update', (event) => {
            this.refreshTimeSyncDevices();
        });
    }

    async embed() {
        const dialogOptions = {
            removeOnClose: true,
            scrollY: true
        };

        if (layoutManager.tv) {
            dialogOptions.size = 'fullscreen';
        } else {
            dialogOptions.size = 'small';
        }

        this.context = dialogHelper.createDialog(dialogOptions);
        this.context.classList.add('formDialog');

        const { default: template } = await import('text!./settings.template.html');
        this.context.innerHTML = globalize.translateHtml(template, 'core');

        this.context.querySelector('form').addEventListener('submit', (event) => {
            this.onSubmit(event);
        });

        this.initEditor();

        this.context.querySelector('.btnCancel').addEventListener('click', () => {
            dialogHelper.close(this.context);
        });

        if (layoutManager.tv) {
            centerFocus(this.context.querySelector('.formDialogContent'), false, true);
        }

        return dialogHelper.open(this.context).then(() => {
            if (layoutManager.tv) {
                centerFocus(this.context.querySelector('.formDialogContent'), false, false);
            }

            if (this.context.submitted) {
                return Promise.resolve();
            }

            return Promise.reject();
        });
    }

    initEditor() {
        const { context } = this;
        context.querySelector('#txtGroupName').value = this.options.groupName;
        context.querySelector('#chkWebRTC').checked = syncPlaySettings.getBool('enableWebRTC');
        context.querySelector('#txtP2PTracker').value = syncPlaySettings.get('p2pTracker');
        context.querySelector('#txtExtraTimeOffset').value = syncPlaySettings.getFloat('extraTimeOffset', 0.0);
        context.querySelector('#chkSyncCorrection').checked = syncPlaySettings.getBool('enableSyncCorrection');
        context.querySelector('#txtMinDelaySpeedToSync').value = syncPlaySettings.getFloat('minDelaySpeedToSync', 60.0);
        context.querySelector('#txtMaxDelaySpeedToSync').value = syncPlaySettings.getFloat('maxDelaySpeedToSync', 3000.0);
        context.querySelector('#txtSpeedToSyncDuration').value = syncPlaySettings.getFloat('speedToSyncDuration', 1000.0);
        context.querySelector('#txtMinDelaySkipToSync').value = syncPlaySettings.getFloat('minDelaySkipToSync', 400.0);
        context.querySelector('#chkSpeedToSync').checked = syncPlaySettings.getBool('useSpeedToSync');
        context.querySelector('#chkSkipToSync').checked = syncPlaySettings.getBool('useSkipToSync');

        this.refreshTimeSyncDevices();
        const timeSyncSelect = context.querySelector('#selectTimeSync');
        timeSyncSelect.value = this.timeSyncCore.getActiveDevice();
    }

    refreshTimeSyncDevices() {
        const { context } = this;
        const timeSyncSelect = context.querySelector('#selectTimeSync');
        const devices = this.timeSyncCore.getDevices();

        timeSyncSelect.innerHTML = devices.map(device => {
            return `<option value="${device.id}">${device.id} (time offset: ${device.timeOffset} ms; ping: ${device.ping} ms)</option>`;
        }).join('');
    }

    onSubmit(event) {
        this.save();
        dialogHelper.close(this.context);
        // Disable default form submission
        if (event) {
            event.preventDefault();
        }
        return false;
    }

    async save() {
        loading.show();
        await this.saveToAppSettings();
        loading.hide();
        import('toast').then(({ default: toast }) => {
            toast(globalize.translate('SettingsSaved'));
        });
        events.trigger(this, 'saved');
    }

    async saveToAppSettings() {
        const { context } = this;
        const groupName = context.querySelector('#txtGroupName').value;
        const enableWebRTC = context.querySelector('#chkWebRTC').checked;
        const p2pTracker = context.querySelector('#txtP2PTracker').value;
        const timeSyncDevice = context.querySelector('#selectTimeSync').value;
        const extraTimeOffset = context.querySelector('#txtExtraTimeOffset').value;
        const syncCorrection = context.querySelector('#chkSyncCorrection').checked;
        const minDelaySpeedToSync = context.querySelector('#txtMinDelaySpeedToSync').value;
        const maxDelaySpeedToSync = context.querySelector('#txtMaxDelaySpeedToSync').value;
        const speedToSyncDuration = context.querySelector('#txtSpeedToSyncDuration').value;
        const minDelaySkipToSync = context.querySelector('#txtMinDelaySkipToSync').value;
        const useSpeedToSync = context.querySelector('#chkSpeedToSync').checked;
        const useSkipToSync = context.querySelector('#chkSkipToSync').checked;

        syncPlaySettings.set('enableWebRTC', enableWebRTC);
        syncPlaySettings.set('p2pTracker', p2pTracker);
        syncPlaySettings.set('timeSyncDevice', timeSyncDevice);
        syncPlaySettings.set('extraTimeOffset', extraTimeOffset);
        syncPlaySettings.set('enableSyncCorrection', syncCorrection);
        syncPlaySettings.set('minDelaySpeedToSync', minDelaySpeedToSync);
        syncPlaySettings.set('maxDelaySpeedToSync', maxDelaySpeedToSync);
        syncPlaySettings.set('speedToSyncDuration', speedToSyncDuration);
        syncPlaySettings.set('minDelaySkipToSync', minDelaySkipToSync);
        syncPlaySettings.set('useSpeedToSync', useSpeedToSync);
        syncPlaySettings.set('useSkipToSync', useSkipToSync);

        events.trigger(syncPlaySettings, 'update');

        // TODO: Update group name
        // const apiClient = window.connectionManager.getApiClient(this.options.serverId);
    }
}

export default SyncPlaySettingsEditor;
