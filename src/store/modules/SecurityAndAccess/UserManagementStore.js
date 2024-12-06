import api, { getResponseCount } from '@/store/api';
import i18n from '@/i18n';
import { REGEX_MAPPINGS } from '@/utilities/GlobalConstants';

const UserManagementStore = {
  namespaced: true,
  state: {
    allUsers: [],
    accountRoles: [],
    accountLockoutDuration: null,
    accountLockoutThreshold: null,
    accountMinPasswordLength: null,
    accountMaxPasswordLength: null,
    isGlobalMfaEnabled: false,
    isCurrentUserMfaBypassed: false,
    secretKeyInfo: null,
  },
  getters: {
    allUsers(state) {
      return state.allUsers;
    },
    accountRoles(state) {
      return state.accountRoles;
    },
    filteredAccountRoles(state) {
      return state.accountRoles.filter((role) => role !== 'OemIBMServiceAgent');
    },
    accountSettings(state) {
      return {
        lockoutDuration: state.accountLockoutDuration,
        lockoutThreshold: state.accountLockoutThreshold,
      };
    },
    accountPasswordRequirements(state) {
      return {
        minLength: state.accountMinPasswordLength,
        maxLength: state.accountMaxPasswordLength,
      };
    },
    isGlobalMfaEnabled(state) {
      return state.isGlobalMfaEnabled;
    },
    isCurrentUserMfaBypassed(state) {
      return state.isCurrentUserMfaBypassed;
    },
    secretKeyInfo(state) {
      return state.secretKeyInfo;
    },
  },
  mutations: {
    setUsers(state, allUsers) {
      state.allUsers = allUsers;
    },
    setAccountRoles(state, accountRoles) {
      state.accountRoles = accountRoles;
    },
    setLockoutDuration(state, lockoutDuration) {
      state.accountLockoutDuration = lockoutDuration;
    },
    setLockoutThreshold(state, lockoutThreshold) {
      state.accountLockoutThreshold = lockoutThreshold;
    },
    setAccountMinPasswordLength(state, minPasswordLength) {
      state.accountMinPasswordLength = minPasswordLength;
    },
    setAccountMaxPasswordLength(state, maxPasswordLength) {
      state.accountMaxPasswordLength = maxPasswordLength;
    },
    setIsGlobalMfaEnabled(state, isGlobalMfaEnabled) {
      state.isGlobalMfaEnabled = isGlobalMfaEnabled;
    },
    setIsCurrentUserMfaBypassed(state, isCurrentUserMfaBypassed) {
      state.isCurrentUserMfaBypassed = isCurrentUserMfaBypassed;
    },
    setSecretKeyInfo(state, secretKeyInfo) {
      state.secretKeyInfo = secretKeyInfo;
    },
  },
  actions: {
    async getUsers({ commit }) {
      return await api
        .get('/redfish/v1/AccountService/Accounts')
        .then((response) =>
          response.data.Members.map((user) => user['@odata.id'])
        )
        .then((userIds) => api.all(userIds.map((user) => api.get(user))))
        .then((users) => {
          const userData = users.map((user) => user.data);
          commit('setUsers', userData);
        })
        .catch((error) => {
          console.log(error);
          const message = i18n.t('pageUserManagement.toast.errorLoadUsers');
          throw new Error(message);
        });
    },
    getAccountSettings({ commit }) {
      api
        .get('/redfish/v1/AccountService')
        .then(({ data }) => {
          commit('setLockoutDuration', data.AccountLockoutDuration);
          commit('setLockoutThreshold', data.AccountLockoutThreshold);
          commit('setAccountMinPasswordLength', data.MinPasswordLength);
          commit('setAccountMaxPasswordLength', data.MaxPasswordLength);
          commit(
            'setIsGlobalMfaEnabled',
            data.MultiFactorAuth?.GoogleAuthenticator?.Enabled
          );
        })
        .catch((error) => {
          console.log(error);
          const message = i18n.t(
            'pageUserManagement.toast.errorLoadAccountSettings'
          );
          throw new Error(message);
        });
    },
    getAccountRoles({ commit }) {
      api
        .get('/redfish/v1/AccountService/Roles')
        .then(async ({ data: { Members = [] } = {} }) => {
          return await api.all(
            Members.map(async (member) => {
              return await api
                .get(member['@odata.id'])
                .then(async ({ data }) => {
                  return await data.Description;
                });
            })
          );
        })
        .then((res) => {
          commit('setAccountRoles', res);
        })
        .catch((error) => console.log(error));
    },
    async createUser({ dispatch }, { username, password, privilege, status }) {
      const data = {
        UserName: username,
        Password: password,
        RoleId: privilege,
        Enabled: status,
      };
      return await api
        .post('/redfish/v1/AccountService/Accounts', data)
        .then(() => dispatch('getUsers'))
        .then(() =>
          i18n.t('pageUserManagement.toast.successCreateUser', {
            username,
          })
        )
        .catch((error) => {
          console.log(error);

          const errorMsg = error.response?.data?.error?.code;

          switch (true) {
            case REGEX_MAPPINGS.propertyValueFormatError.test(errorMsg):
              throw new Error(
                i18n.t(
                  'pageUserManagement.toast.errorCreateUserPasswordNotAccepted',
                  {
                    username,
                  }
                )
              );
            case REGEX_MAPPINGS.createLimitReachedForResource.test(errorMsg):
              throw new Error(
                i18n.t('pageUserManagement.toast.errorCreateUserMaxUsers', {
                  username,
                })
              );
            default:
              throw new Error(
                i18n.t('pageUserManagement.toast.errorCreateUser', {
                  username,
                })
              );
          }
        });
    },
    async updateUserfromUserManagement(
      { dispatch },
      {
        originalUsername,
        currentUser,
        username,
        password,
        privilege,
        status,
        locked,
      }
    ) {
      const data = {};
      const notReadOnly =
        privilege !== 'ReadOnly' && currentUser.RoleId !== 'ReadOnly';
      if (username) data.UserName = username;
      if (password) data.Password = password;
      if (privilege && notReadOnly) {
        data.RoleId = privilege;
      } else if (
        privilege &&
        privilege === 'ReadOnly' &&
        currentUser.RoleId !== 'ReadOnly'
      ) {
        data.RoleId = privilege;
      }
      if (status !== undefined) data.Enabled = status;
      if (locked !== undefined) data.Locked = locked;
      return await api
        .patch(`/redfish/v1/AccountService/Accounts/${originalUsername}`, data)
        .then(() => dispatch('getUsers'))
        .then(() =>
          i18n.t('pageUserManagement.toast.successUpdateUser', {
            username: originalUsername,
          })
        )
        .catch((error) => {
          const messageId = error?.response?.data?.error?.code;
          const message = REGEX_MAPPINGS.propertyValueFormatError.test(
            messageId
          )
            ? i18n.t(
                'pageUserManagement.toast.errorUpdateUserPasswordNotAccepted',
                {
                  username: originalUsername,
                }
              )
            : i18n.t('pageUserManagement.toast.errorUpdateUser', {
                username: originalUsername,
              });
          throw new Error(message);
        });
    },
    async updateUser(
      { dispatch },
      { originalUsername, username, password, privilege, status, locked }
    ) {
      const data = {};
      if (username) data.UserName = username;
      if (password) data.Password = password;
      if (privilege) data.RoleId = privilege;
      if (status !== undefined) data.Enabled = status;
      if (locked !== undefined) data.Locked = locked;
      return await api
        .patch(`/redfish/v1/AccountService/Accounts/${originalUsername}`, data)
        .then(() => dispatch('getUsers'))
        .then(() =>
          i18n.t('pageUserManagement.toast.successUpdateUser', {
            username: originalUsername,
          })
        )
        .catch((error) => {
          console.log(error);

          const messageId =
            error.response.data['Password@Message.ExtendedInfo'][0].MessageId;

          const message = REGEX_MAPPINGS.propertyValueFormatError.test(
            messageId
          )
            ? i18n.t(
                'pageUserManagement.toast.errorUpdateUserPasswordNotAccepted',
                {
                  username: originalUsername,
                }
              )
            : i18n.t('pageUserManagement.toast.errorUpdateUser', {
                username: originalUsername,
              });
          throw new Error(message);
        });
    },
    async deleteUser({ dispatch }, username) {
      return await api
        .delete(`/redfish/v1/AccountService/Accounts/${username}`)
        .then(() => {
          dispatch('getUsers');
          return i18n.t('pageUserManagement.toast.successDeleteUser', {
            username,
          });
        })
        .catch((error) => {
          console.log(error);
          const message = i18n.t('pageUserManagement.toast.errorDeleteUser', {
            username,
          });
          throw new Error(message);
        });
    },
    async deleteUsers({ dispatch }, users) {
      const promises = users.map(({ username }) => {
        return api
          .delete(`/redfish/v1/AccountService/Accounts/${username}`)
          .catch((error) => {
            console.log(error);
            return error;
          });
      });
      return await api
        .all(promises)
        .then((response) => {
          dispatch('getUsers');
          return response;
        })
        .then(
          api.spread((...responses) => {
            const { successCount, errorCount } = getResponseCount(responses);
            let toastMessages = [];

            if (successCount) {
              const message = i18n.tc(
                'pageUserManagement.toast.successBatchDelete',
                successCount
              );
              toastMessages.push({ type: 'success', message });
            }

            if (errorCount) {
              const message = i18n.tc(
                'pageUserManagement.toast.errorBatchDelete',
                errorCount
              );
              toastMessages.push({ type: 'error', message });
            }

            return toastMessages;
          })
        );
    },
    async enableUsers({ dispatch }, users) {
      const data = {
        Enabled: true,
      };
      const promises = users.map(({ username }) => {
        return api
          .patch(`/redfish/v1/AccountService/Accounts/${username}`, data)
          .catch((error) => {
            console.log(error);
            return error;
          });
      });
      return await api
        .all(promises)
        .then((response) => {
          dispatch('getUsers');
          return response;
        })
        .then(
          api.spread((...responses) => {
            const { successCount, errorCount } = getResponseCount(responses);
            let toastMessages = [];

            if (successCount) {
              const message = i18n.tc(
                'pageUserManagement.toast.successBatchEnable',
                successCount
              );
              toastMessages.push({ type: 'success', message });
            }

            if (errorCount) {
              const message = i18n.tc(
                'pageUserManagement.toast.errorBatchEnable',
                errorCount
              );
              toastMessages.push({ type: 'error', message });
            }

            return toastMessages;
          })
        );
    },
    async disableUsers({ dispatch }, users) {
      const data = {
        Enabled: false,
      };
      const promises = users.map(({ username }) => {
        return api
          .patch(`/redfish/v1/AccountService/Accounts/${username}`, data)
          .catch((error) => {
            console.log(error);
            return error;
          });
      });
      return await api
        .all(promises)
        .then((response) => {
          dispatch('getUsers');
          return response;
        })
        .then(
          api.spread((...responses) => {
            const { successCount, errorCount } = getResponseCount(responses);
            let toastMessages = [];

            if (successCount) {
              const message = i18n.tc(
                'pageUserManagement.toast.successBatchDisable',
                successCount
              );
              toastMessages.push({ type: 'success', message });
            }

            if (errorCount) {
              const message = i18n.tc(
                'pageUserManagement.toast.errorBatchDisable',
                errorCount
              );
              toastMessages.push({ type: 'error', message });
            }

            return toastMessages;
          })
        );
    },
    async saveAccountSettings(
      { dispatch },
      { lockoutThreshold, lockoutDuration }
    ) {
      const data = {};
      if (lockoutThreshold !== undefined) {
        data.AccountLockoutThreshold = lockoutThreshold;
      }
      if (lockoutDuration !== undefined) {
        data.AccountLockoutDuration = lockoutDuration;
      }

      return await api
        .patch('/redfish/v1/AccountService', data)
        //GET new settings to update view
        .then(() => dispatch('getAccountSettings'))
        .then(() => i18n.t('pageUserManagement.toast.successSaveSettings'))
        .catch((error) => {
          console.log(error);
          const message = i18n.t('pageUserManagement.toast.errorSaveSettings');
          throw new Error(message);
        });
    },
    async updateGlobalMfa({ dispatch, commit }, { globalMfa }) {
      commit('setIsGlobalMfaEnabled', globalMfa);
      const requestBody = {
        MultiFactorAuth: {
          GoogleAuthenticator: {
            Enabled: globalMfa,
          },
        },
      };
      return await api
        .patch('/redfish/v1/AccountService', requestBody)
        .then(() => {
          dispatch('getUsers');
          if (globalMfa) {
            return i18n.t('pageUserManagement.toast.successEnableMfa');
          } else {
            return i18n.t('pageUserManagement.toast.successDisableMfa');
          }
        })
        .catch((error) => {
          commit('setIsGlobalMfaEnabled', !globalMfa);
          console.log('error', error);
          dispatch('getAccountSettings');
          if (globalMfa) {
            throw new Error(i18n.t('pageUserManagement.toast.errorEnableMfa'));
          } else {
            throw new Error(i18n.t('pageUserManagement.toast.errorDisableMfa'));
          }
        });
    },
    async clearSetSecretKey({ dispatch }, mfaObject) {
      return await api
        .post(mfaObject['@odata.id'] + '/Actions/ManagerAccount.ClearSecretKey')
        .then(() => {
          dispatch('getUsers');
          return i18n.t('pageUserManagement.toast.successClearSecretKey');
        })
        .catch((error) => {
          dispatch('getUsers');
          console.log('error', error);
          throw new Error(
            i18n.t('pageUserManagement.toast.errorClearSecretKey')
          );
        });
    },
    async updateMfaBypass({ dispatch }, mfaObject) {
      const requestBody = {
        MFABypass: {
          BypassTypes: mfaObject.mfa ? ['GoogleAuthenticator'] : ['None'],
        },
      };
      return await api
        .patch(mfaObject['@odata.id'], requestBody)
        .then(() => {
          if (mfaObject.mfa) {
            return i18n.t('pageUserManagement.toast.successEnableMfaBypass');
          } else {
            return i18n.t('pageUserManagement.toast.successDisableMfaBypass');
          }
        })
        .catch((error) => {
          dispatch('getUsers');
          console.log('error', error);
          if (mfaObject.mfa) {
            throw new Error(
              i18n.t('pageUserManagement.toast.errorEnableMfaBypass')
            );
          } else {
            throw new Error(
              i18n.t('pageUserManagement.toast.errorDisableMfaBypass')
            );
          }
        });
    },
    async updateMfaBypassNewUser({ dispatch }, { userData, mfaBypass }) {
      const requestBody = {
        MFABypass: {
          BypassTypes: mfaBypass ? ['GoogleAuthenticator'] : ['None'],
        },
      };
      return await api
        .patch(
          `/redfish/v1/AccountService/Accounts/${userData.username}`,
          requestBody
        )
        .then(() => dispatch('getUsers'))
        .catch((error) => {
          console.log('error', error);
          if (mfaBypass) {
            throw new Error(
              i18n.t('pageUserManagement.toast.errorEnableMfaBypass')
            );
          } else {
            throw new Error(
              i18n.t('pageUserManagement.toast.errorDisableMfaBypass')
            );
          }
        });
    },
    async checkCurrentUserMfaBypassed({ commit }, { uri }) {
      api.get(uri).then(({ data }) => {
        commit(
          'setIsCurrentUserMfaBypassed',
          data?.MFABypass?.BypassTypes.includes('GoogleAuthenticator')
        );
      });
    },
    async clearSecretKey({ commit }) {
      commit('setSecretKeyInfo', null);
      return;
    },
    async generateSecretKey({ commit }) {
      const currentUsername = localStorage.getItem('storedUsername');
      api
        .post(
          `redfish/v1/AccountService/Accounts/${currentUsername}/Actions/ManagerAccount.GenerateSecretKey`
        )
        .then(({ data }) => {
          commit('setSecretKeyInfo', data?.SecretKey);
        });
    },
    async verifyRegisterTotp({ dispatch }, { otpValue }) {
      const requestBody = {
        TimeBasedOneTimePassword: otpValue,
      };
      const currentUsername = localStorage.getItem('storedUsername');
      return await api
        .post(
          `/redfish/v1/AccountService/Accounts/${currentUsername}/Actions/ManagerAccount.VerifyTimeBasedOneTimePassword`,
          requestBody
        )
        .then(() => {
          dispatch('getUsers');
          return i18n.t('pageUserManagement.toast.successEnableMfa');
        })
        .catch(() => {
          throw new Error(i18n.t('pageUserManagement.toast.errorOtp'));
        });
    },
  },
};

export default UserManagementStore;
