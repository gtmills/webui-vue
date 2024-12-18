import api from '@/store/api';
import Cookies from 'js-cookie';
import router from '@/router';

const AuthenticationStore = {
  namespaced: true,
  state: {
    loginPageDetails: {},
    authError: false,
    unauthError: false,
    xsrfCookie: Cookies.get('XSRF-TOKEN'),
    isAuthenticatedCookie: Cookies.get('IsAuthenticated'),
    isGenerateOtpRequired: false,
    isGlobalMfaEnabled: false,
  },
  getters: {
    loginPageDetails: (state) => state.loginPageDetails,
    authError: (state) => state.authError,
    unauthError: (state) => state.unauthError,
    isGenerateOtpRequired: (state) => state.isGenerateOtpRequired,
    isGlobalMfaEnabled: (state) => state.isGlobalMfaEnabled,
    isLoggedIn: (state) => {
      return (
        state.xsrfCookie !== undefined || state.isAuthenticatedCookie == 'true'
      );
    },
    token: (state) => state.xsrfCookie,
  },
  mutations: {
    setIsGlobalMfaEnabled: (state, isGlobalMfaEnabled) =>
      (state.isGlobalMfaEnabled = isGlobalMfaEnabled),
    setIsGenerateOtpRequired: (state, isGenerateOtpRequired) =>
      (state.isGenerateOtpRequired = isGenerateOtpRequired),
    setLoginPageDetails: (state, loginPageDetails) =>
      (state.loginPageDetails = loginPageDetails),
    authSuccess(state) {
      state.authError = false;
      state.unauthError = false;
      state.xsrfCookie = Cookies.get('XSRF-TOKEN');
    },
    authError(state, authError = true) {
      state.authError = authError;
    },
    unauthError(state, unauthError = true) {
      state.unauthError = unauthError;
    },
    logout(state) {
      Cookies.remove('XSRF-TOKEN');
      Cookies.remove('IsAuthenticated');
      localStorage.removeItem('storedModelType');
      localStorage.removeItem('storedUsername');
      localStorage.removeItem('storedCurrentUser');
      localStorage.removeItem('storedHmcManagedValue');
      localStorage.removeItem('storedLanguage');
      state.xsrfCookie = undefined;
      state.isAuthenticatedCookie = undefined;
    },
  },
  actions: {
    login({ commit }, { username, password, otpInfo }) {
      commit('setIsGenerateOtpRequired', false);
      commit('authError', false);
      commit('unauthError', false);
      let requestBody = {};
      if (otpInfo === '') {
        requestBody = { UserName: username, Password: password };
      } else {
        requestBody = {
          UserName: username,
          Password: password,
          Token: otpInfo,
        };
      }
      return api
        .post('/redfish/v1/SessionService/Sessions', requestBody)
        .then((response) => {
          if (
            response.data['@Message.ExtendedInfo'] &&
            response.data['@Message.ExtendedInfo'][0].MessageId.endsWith(
              'GenerateSecretKeyRequired'
            )
          ) {
            commit('setIsGenerateOtpRequired', true);
          }
          commit('authSuccess');
        })
        .catch((error) => {
          commit('authError');
          throw new Error(error);
        });
    },
    unauthlogin({ commit }) {
      commit('unauthError');
    },
    logout({ commit }) {
      api
        .post('/logout', { data: [] })
        .then(() => commit('logout'))
        .then(() => router.replace('/login'))
        .catch((error) => console.log(error));
    },
    async checkPasswordChangeRequired(_, username) {
      return api
        .get(`/redfish/v1/AccountService/Accounts/${username}`)
        .then(({ data: { PasswordChangeRequired } }) => {
          return PasswordChangeRequired;
        })
        .catch((error) => {
          console.log(error);
        });
    },
    async dateAndTime({ commit }) {
      return api
        .get(`/redfish/v1/`)
        .then((response) => response.data.Oem.IBM)
        .then((data) => {
          const loginPageDetails = {
            dateTime: new Date(data.DateTime),
            model: data.Model,
            serial: data.SerialNumber,
            acfWindowActive: data.ACFWindowActive,
          };
          commit('setLoginPageDetails', loginPageDetails);
          commit('setIsGlobalMfaEnabled', data.MultiFactorAuthEnabled);
        })
        .catch((error) => console.log(error));
    },
    resetStoreState({ state }) {
      state.authError = false;
      state.unauthError = false;
      state.xsrfCookie = Cookies.get('XSRF-TOKEN');
      state.isAuthenticatedCookie = Cookies.get('IsAuthenticated');
    },
  },
};

export default AuthenticationStore;
