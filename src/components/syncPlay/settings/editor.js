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
        context.querySelector('#chkSyncCorrection').checked = syncPlaySettings.getBool('enableSyncCorrection');

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
        const timeSyncDevice = context.querySelector('#selectTimeSync').value;
        const syncCorrection = context.querySelector('#chkSyncCorrection').checked;

        syncPlaySettings.set('enableWebRTC', enableWebRTC);
        syncPlaySettings.set('timeSyncDevice', timeSyncDevice);
        syncPlaySettings.set('enableSyncCorrection', syncCorrection);

        // TODO: Update group name
        // const apiClient = window.connectionManager.getApiClient(this.options.serverId);
    }
}

export default SyncPlaySettingsEditor;
