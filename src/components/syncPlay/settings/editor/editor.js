/**
 * Module that displays an editor for changing SyncPlay settings.
 * @module components/syncPlay/settings/editor
 */

import events from 'events';
import dialogHelper from 'dialogHelper';
import loading from 'loading';
import layoutManager from 'layoutManager';
import * as syncPlayHelper from 'syncPlayHelper';
import syncPlaySettings from 'syncPlaySettings';
import toast from 'toast';
import globalize from 'globalize';
import 'emby-input';
import 'emby-select';
import 'emby-button';
import 'emby-checkbox';
import 'listViewStyle';
import 'css!./../../../formdialog';
import 'css!./invitesListItem';
import 'css!./accessListItem';

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
    constructor(apiClient, timeSyncCore, options = {}) {
        this.apiClient = apiClient;
        this.timeSyncCore = timeSyncCore;
        this.options = options;

        this.newGroup = !options.groupInfo;
        this.canEditGroup = options.canEditGroup || this.newGroup;

        this.tabNames = [];
        this.tabs = {};

        this.embed();

        events.on(this.timeSyncCore, 'refresh-devices', (event) => {
            this.refreshTimeSyncDevices();
        });

        events.on(this.timeSyncCore, 'time-sync-server-update', (event) => {
            this.refreshTimeSyncDevices();
        });
    }

    insertBefore(newNode, existingNode) {
        existingNode.parentNode.insertBefore(newNode, existingNode);
    }

    addTab(name, tab) {
        this.tabNames.push(name);
        this.tabs[name] = tab;
    }

    showTab(tabName) {
        this.tabNames.forEach(id => {
            this.tabs[id].style.display = 'none';
            this.context.querySelector('#show-' + id).classList.remove('ui-btn-active');
        });

        const tab = this.tabs[tabName];
        if (tab) {
            tab.style.display = 'block';
            this.context.querySelector('#show-' + tabName).classList.add('ui-btn-active');
        }
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

        const { default: template } = await import('text!./editor.html');
        this.context.innerHTML = globalize.translateHtml(template, 'core');
        const footer = this.context.querySelector('#footer');
        const saveButtonText = this.context.querySelector('#saveButtonText');

        if (this.newGroup) {
            saveButtonText.innerHTML = globalize.translate('LabelSyncPlaySettingsCreateGroup');
        }

        // Create tabs
        const groupTab = await this.importTemplate('./groupTab.html');
        const localTab = await this.importTemplate('./localTab.html');
        const advancedTab = await this.importTemplate('./advancedTab.html');

        this.insertBefore(groupTab, footer);
        this.insertBefore(localTab, footer);
        this.insertBefore(advancedTab, footer);

        // Switch tabs using nav
        this.addTab('groupTab', groupTab);
        this.addTab('localTab', localTab);
        this.addTab('advancedTab', advancedTab);

        if (this.canEditGroup) {
            this.showTab('groupTab');
        } else {
            this.showTab('localTab');
        }

        const tabButtons = this.context.querySelectorAll('.controlGroupButton');
        tabButtons.forEach(button => {
            button.addEventListener('click', (event) => {
                const tabName = event.target.getAttribute('data-showTab');
                if (tabName) {
                    this.showTab(tabName);
                }
            });
        });

        // Set callbacks for form submission
        this.context.querySelector('form').addEventListener('submit', (event) => {
            // Disable default form submission
            if (event) {
                event.preventDefault();
            }
            return false;
        });

        this.context.querySelector('.btnSave').addEventListener('click', () => {
            this.onSubmit();
        });

        this.context.querySelector('.btnCancel').addEventListener('click', () => {
            dialogHelper.close(this.context);
        });

        await this.initEditor();

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

    async initEditor() {
        const { context } = this;
        const txtGroupName = context.querySelector('#txtGroupName');
        const selectGroupVisibility = context.querySelector('#selectGroupVisibility');
        const chkOpenPlaybackAccess = context.querySelector('#chkOpenPlaybackAccess');
        const chkOpenPlaylistAccess = context.querySelector('#chkOpenPlaylistAccess');

        let groupName = '';
        let visibility = 'Public';
        let playbackAccess = true;
        let playlistAccess = true;

        if (this.newGroup) {
            groupName = this.options.groupName;
            visibility = this.options.visibility || 'Public';
            playbackAccess = this.options.playbackAccess || true;
            playlistAccess = this.options.playlistAccess || true;
        } else {
            const { groupInfo } = this.options;
            groupName = groupInfo.GroupName;
            visibility = groupInfo.Visibility;
            playbackAccess = groupInfo.OpenPlaybackAccess;
            playlistAccess = groupInfo.OpenPlaylistAccess;
        }

        txtGroupName.value = groupName;
        selectGroupVisibility.value = visibility;
        chkOpenPlaybackAccess.checked = playbackAccess;
        chkOpenPlaylistAccess.checked = playlistAccess;
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

        if (!this.canEditGroup) {
            txtGroupName.disabled = true;
            selectGroupVisibility.disabled = true;
            chkOpenPlaybackAccess.disabled = true;
            chkOpenPlaylistAccess.disabled = true;
        }

        selectGroupVisibility.addEventListener('change', () => {
            this.onGroupVisibilityChange();
            this.refreshInvitedUsersList();
        });

        this.onGroupVisibilityChange();
        await this.refreshInvitedUsersList();

        this.refreshTimeSyncDevices();
        const timeSyncSelect = context.querySelector('#selectTimeSync');
        timeSyncSelect.value = this.timeSyncCore.getActiveDevice();

        await this.refreshAccessList();
    }

    onGroupVisibilityChange() {
        const { context } = this;
        const selectGroupVisibility = context.querySelector('#selectGroupVisibility');
        const openAccessContainer = context.querySelector('#openAccessContainer');
        const invitesListContainer = context.querySelector('#invitesListContainer');
        const accessListContainer = context.querySelector('#accessListContainer');

        if (selectGroupVisibility.value === 'Public') {
            openAccessContainer.style.display = 'block';
            invitesListContainer.style.display = 'none';
            if (this.newGroup) {
                accessListContainer.style.display = 'none';
            } else {
                accessListContainer.style.display = 'block';
            }
        } else if (selectGroupVisibility.value === 'InviteOnly') {
            openAccessContainer.style.display = 'block';
            invitesListContainer.style.display = 'block';
            accessListContainer.style.display = 'block';
            if (this.newGroup) {
                accessListContainer.style.display = 'none';
            } else {
                accessListContainer.style.display = 'block';
            }
        } else if (selectGroupVisibility.value === 'Private') {
            openAccessContainer.style.display = 'none';
            invitesListContainer.style.display = 'none';
            accessListContainer.style.display = 'none';
        } else {
            openAccessContainer.style.display = 'none';
            invitesListContainer.style.display = 'none';
            accessListContainer.style.display = 'none';
        }
    }

    refreshTimeSyncDevices() {
        const { context } = this;
        const timeSyncSelect = context.querySelector('#selectTimeSync');
        const devices = this.timeSyncCore.getDevices();

        timeSyncSelect.innerHTML = devices.map(device => {
            return `<option value="${device.id}">${device.id} (time offset: ${device.timeOffset} ms; ping: ${device.ping} ms)</option>`;
        }).join('');
    }

    /**
     * @param {string} html HTML string representing a single element.
     * @return {Element} The element.
     */
    htmlToElement(html) {
        var template = document.createElement('template');
        html = html.trim(); // Never return a text node of whitespace as the result
        template.innerHTML = html;
        return template.content.firstChild;
    }

    async importTemplate(file) {
        const { default: template } = await import('text!' + file);
        const translatedTemplate = globalize.translateHtml(template, 'core');
        return this.htmlToElement(translatedTemplate);
    }

    /**
     * Whether the given user is invited to join this group.
     * @param {string} userId The id of the user.
     * @returns {boolean} _true_ if the user is invited, _false_ otherwise.
     */
    isUserInvited(userId) {
        if (this.newGroup) {
            return false;
        }

        const { groupInfo } = this.options;
        return groupInfo.InvitedUsers.indexOf(userId) !== -1;
    }

    async refreshInvitedUsersList() {
        const { context } = this;
        const selectGroupVisibility = context.querySelector('#selectGroupVisibility');
        const invitesList = context.querySelector('#invitesList');
        const invitesListHeader = context.querySelector('#invitesListHeader');
        const invitesListIsEmpty = context.querySelector('#invitesListIsEmpty');

        invitesList.innerHTML = '';
        invitesListHeader.style.display = 'flex';
        invitesListIsEmpty.style.display = 'none';

        if (selectGroupVisibility.value !== 'InviteOnly') {
            return;
        }

        loading.show();

        await this.apiClient.getAvailableSyncPlayUsers().then((response) => {
            return response.json();
        }).then(async (users) => {
            this.availableUserIds = [];

            for (let i = 0; i < users.length; i++) {
                const user = users[i];
                if (this.isUserAdministrator(user.UserId) || (this.newGroup && this.isCurrentUser(user.UserId))) {
                    continue;
                }

                const item = await this.importTemplate('./invitesListItem.html');
                const userName = item.querySelector('#userName');
                const invite = item.querySelector('#invite');

                userName.id = 'userName-' + user.UserId;
                invite.id = 'invite-' + user.UserId;

                userName.innerHTML = user.UserName;
                invite.checked = this.isUserInvited(user.UserId);

                if (!this.canEditGroup) {
                    invite.disabled = true;
                }

                invitesList.appendChild(item);
                this.availableUserIds.push(user.UserId);
            }

            if (this.availableUserIds.length === 0) {
                invitesListHeader.style.display = 'none';
                invitesListIsEmpty.style.display = 'block';
            }

            loading.hide();
        }).catch((error) => {
            console.error(error);
            loading.hide();
        });
    }

    /**
     * Whether the given user is an administrator for the group.
     * @param {string} userId The id of the user.
     * @returns {boolean} _true_ if the user is an administrator, _false_ otherwise.
     */
    isUserAdministrator(userId) {
        if (!this.newGroup) {
            return this.options.groupInfo.Administrators.indexOf(userId) !== -1;
        } else {
            return false;
        }
    }

    /**
     * Whether the given user is the one currently logged in.
     * @param {string} userId The id of the user.
     * @returns {boolean} _true_ if the user is the one currently logged in, _false_ otherwise.
     */
    isCurrentUser(userId) {
        const currentUserId = syncPlayHelper.stringToGuid(this.apiClient.getCurrentUserId());
        return userId === currentUserId;
    }

    async refreshAccessList() {
        const { context } = this;
        const accessList = context.querySelector('#accessList');
        const accessListHeader = context.querySelector('#accessListHeader');
        const accessListIsEmpty = context.querySelector('#accessListIsEmpty');

        accessList.innerHTML = '';
        accessListHeader.style.display = 'flex';
        accessListIsEmpty.style.display = 'none';

        if (this.newGroup) {
            return false;
        }

        const { groupInfo } = this.options;

        let accessListItemsCount = 0;

        for (let i = 0; i < groupInfo.Participants.length; i++) {
            const userId = groupInfo.Participants[i];
            if (this.isUserAdministrator(userId)) {
                continue;
            } else {
                accessListItemsCount++;
            }

            const item = await this.importTemplate('./accessListItem.html');
            const userName = item.querySelector('#userName');
            const playbackAccess = item.querySelector('#playbackAccess');
            const playlistAccess = item.querySelector('#playlistAccess');

            userName.id = 'userName-' + userId;
            playbackAccess.id = 'playbackAccess-' + userId;
            playlistAccess.id = 'playlistAccess-' + userId;

            userName.innerHTML = groupInfo.UserNames[i];
            const permissions = groupInfo.AccessList[userId];
            if (permissions) {
                playbackAccess.checked = permissions.PlaybackAccess;
                playlistAccess.checked = permissions.PlaylistAccess;
            } else {
                playbackAccess.checked = false;
                playlistAccess.checked = false;
            }

            if (!this.canEditGroup) {
                playbackAccess.disabled = true;
                playlistAccess.disabled = true;
            }

            accessList.appendChild(item);
        }

        if (accessListItemsCount === 0) {
            accessListHeader.style.display = 'none';
            accessListIsEmpty.style.display = 'block';
        }
    }

    onSubmit() {
        this.save();
        dialogHelper.close(this.context);
    }

    async save() {
        loading.show();
        await this.saveToAppSettings();
        loading.hide();
        if (!this.newGroup) {
            toast(globalize.translate('SettingsSaved'));
        }
        events.trigger(this, 'saved');
    }

    async saveToAppSettings() {
        const { context } = this;
        const groupName = context.querySelector('#txtGroupName').value;
        const groupVisibility = context.querySelector('#selectGroupVisibility').value;
        const openPlaybackAccess = context.querySelector('#chkOpenPlaybackAccess').checked;
        const openPlaylistAccess = context.querySelector('#chkOpenPlaylistAccess').checked;
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

        if (this.canEditGroup) {
            const invitedUsers = this.readInvitedUsers();
            const newAccessList = this.readAccessList();

            if (this.newGroup) {
                await this.apiClient.createSyncPlayGroup({
                    GroupName: groupName,
                    Visibility: groupVisibility,
                    InvitedUsers: invitedUsers.join(','),
                    OpenPlaybackAccess: openPlaybackAccess,
                    OpenPlaylistAccess: openPlaylistAccess
                });
            } else {
                await this.apiClient.updateSyncPlayGroupSettings({
                    GroupName: groupName,
                    Visibility: groupVisibility,
                    InvitedUsers: invitedUsers.join(','),
                    OpenPlaybackAccess: openPlaybackAccess,
                    OpenPlaylistAccess: openPlaylistAccess,
                    AccessListUserIds: newAccessList.userIds.join(','),
                    AccessListPlayback: newAccessList.playback,
                    AccessListPlaylist: newAccessList.playlist
                });
            }
        }
    }

    readAccessList() {
        const { context } = this;
        const newAccessList = {
            userIds: [],
            playback: [],
            playlist: []
        };

        if (!this.newGroup) {
            const { groupInfo } = this.options;

            groupInfo.Participants.forEach(userId => {
                const playbackAccess = context.querySelector('#playbackAccess-' + userId);
                const playlistAccess = context.querySelector('#playlistAccess-' + userId);
                if (playbackAccess !== null && playlistAccess !== null) {
                    newAccessList.userIds.push(userId);
                    newAccessList.playback.push(playbackAccess.checked);
                    newAccessList.playlist.push(playlistAccess.checked);
                }
            });
        }

        return newAccessList;
    }

    readInvitedUsers() {
        const { context } = this;
        const invitedUsers = [];

        if (this.availableUserIds) {
            this.availableUserIds.forEach(userId => {
                const invite = context.querySelector('#invite-' + userId);
                if (invite && invite.checked) {
                    invitedUsers.push(userId);
                }
            });
        }

        return invitedUsers;
    }
}

export default SyncPlaySettingsEditor;
