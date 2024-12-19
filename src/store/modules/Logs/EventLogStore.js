import api, { getResponseCount } from '@/store/api';
import i18n from '@/i18n';

const getHealthStatus = (events, loadedEvents) => {
  let status = loadedEvents ? 'OK' : '';
  for (const event of events) {
    if (event.severity === 'Critical' && !event.status) {
      status = 'Critical';
      break;
    } else if (event.severity === 'Warning' && !event.status) {
      status = 'Warning';
    }
  }
  return status;
};

// TODO: High priority events should also check if Log
// is resolved when the property is available in Redfish
const getHighPriorityEvents = (events) =>
  events.filter(({ severity }) => severity === 'Critical');

const EventLogStore = {
  namespaced: true,
  state: {
    allEvents: [],
    ceLogs: [],
    loadedEvents: false,
    eventlogs: [],
  },
  getters: {
    allEvents: (state) => state.allEvents.concat(state.ceLogs),
    ceLogs: (state) => state.ceLogs,
    highPriorityEvents: (state) => getHighPriorityEvents(state.allEvents),
    healthStatus: (state) =>
      getHealthStatus(state.allEvents, state.loadedEvents),
    eventlogs: (state) => state.allEvents.concat(state.ceLogs),
  },
  mutations: {
    setAllEvents: (state, allEvents) => (
      (state.allEvents = allEvents), (state.loadedEvents = true)
    ),
    setCeLogs: (state, ceLogs) => (
      (state.ceLogs = ceLogs), (state.loadedEvents = true)
    ),
    eventlogs: (state, eventlogs) => (
      (state.eventlogs = eventlogs), (state.loadedEvents = true)
    ),
  },
  actions: {
    async initializeLogs({ commit }) {
      let eventLogs = [];
      commit('eventlogs', eventLogs);
      commit('setCeLogs', eventLogs);
    },
    async getEventLogData({ commit }) {
      return await api
        .get('/redfish/v1/Systems/system/LogServices/EventLog/Entries')
        .then(({ data: { Members = [] } = {} }) => {
          let eventLogs = Members.map((log) => {
            const {
              Id,
              EventId,
              Severity,
              Created,
              EntryType,
              Message,
              Name,
              Modified,
              Resolution,
              Resolved,
              AdditionalDataURI,
            } = log;
            return {
              id: Id,
              eventId: EventId,
              severity: Severity,
              date: new Date(Created),
              type: EntryType,
              description: Message,
              name: Name,
              modifiedDate: new Date(Modified),
              resolution: Resolution,
              uri: log['@odata.id'],
              filterByStatus: Resolved ? 'Resolved' : 'Unresolved',
              status: Resolved, //true or false
              additionalDataUri: AdditionalDataURI,
            };
          });
          commit('eventlogs', eventLogs);
          commit('setAllEvents', eventLogs);
        })
        .catch((error) => {
          console.log('Event Log Data:', error);
        });
    },
    async getCELogData({ commit }) {
      return await api
        .get('/redfish/v1/Systems/system/LogServices/CELog/Entries')
        .then(({ data: { Members = [] } = {} }) => {
          const eventLogs = Members.map((log) => {
            const {
              Id,
              EventId,
              Severity,
              Created,
              EntryType,
              Message,
              Name,
              Modified,
              Resolution,
              Resolved,
              AdditionalDataURI,
            } = log;
            return {
              id: Id,
              eventId: EventId,
              severity: Severity,
              date: new Date(Created),
              type: EntryType,
              description: Message,
              name: Name,
              modifiedDate: new Date(Modified),
              resolution: Resolution,
              uri: log['@odata.id'],
              filterByStatus: Resolved ? 'Resolved' : 'Unresolved',
              status: Resolved, //true or false
              additionalDataUri: AdditionalDataURI,
            };
          });
          commit('setCeLogs', eventLogs);
        })
        .catch((error) => {
          console.log('Event Log Data:', error);
        });
    },
    async deleteAllEventLogs(_, data) {
      return await api
        .post(
          '/redfish/v1/Systems/system/LogServices/EventLog/Actions/LogService.ClearLog'
        )
        .catch((error) => {
          console.log(error);
          throw new Error(
            i18n.tc('pageEventLogs.toast.errorDelete', data.length)
          );
        });
    },
    async deleteEventLogs(_, uris = []) {
      let guardEntries = [];
      const promises = uris.map((uri) =>
        api.delete(uri).catch((error) => {
          console.log(error);
          if (
            error.response.data?.error?.code?.endsWith(
              'PropertyValueExternalConflict'
            )
          ) {
            guardEntries.push(error.response.data);
          }
          return error;
        })
      );
      return await api
        .all(promises)
        .then((response) => {
          return response;
        })
        .then(
          api.spread((...responses) => {
            const { successCount, errorCount } = getResponseCount(responses);
            const toastMessages = [];

            if (successCount) {
              const message = i18n.tc(
                'pageEventLogs.toast.successDelete',
                successCount
              );
              toastMessages.push({ type: 'success', message });
            }

            if (errorCount) {
              if (guardEntries.length > 0) {
                const message = i18n.tc(
                  'pageEventLogs.toast.errorDeleteGuardRecord',
                  guardEntries.length
                );
                toastMessages.push({ type: 'error', message });
              }
              const message = i18n.tc(
                'pageEventLogs.toast.errorDelete',
                errorCount
              );
              toastMessages.push({ type: 'error', message });
            }

            return toastMessages;
          })
        );
    },
    async resolveEventLogs(_, logs) {
      let guardEntries = [];
      const promises = logs.map((log) =>
        api.patch(log.uri, { Resolved: true }).catch((error) => {
          console.log(error);
          if (
            error.response.data?.error?.code?.endsWith(
              'PropertyValueExternalConflict'
            )
          ) {
            guardEntries.push(error.response.data);
          }
          return error;
        })
      );
      return await api
        .all(promises)
        .then((response) => {
          return response;
        })
        .then(
          api.spread((...responses) => {
            const { successCount, errorCount } = getResponseCount(responses);
            const toastMessages = [];
            if (successCount) {
              const message = i18n.tc(
                'pageEventLogs.toast.successResolveLogs',
                successCount
              );
              toastMessages.push({ type: 'success', message });
            }
            if (errorCount) {
              if (guardEntries.length > 0) {
                const message = i18n.tc(
                  'pageEventLogs.toast.errorResolveLogsGuardRecord',
                  guardEntries.length
                );
                toastMessages.push({ type: 'error', message });
              }
              const message = i18n.tc(
                'pageEventLogs.toast.errorResolveLogs',
                errorCount
              );
              toastMessages.push({ type: 'error', message });
            }
            return toastMessages;
          })
        );
    },
    async unresolveEventLogs(_, logs) {
      const promises = logs.map((log) =>
        api.patch(log.uri, { Resolved: false }).catch((error) => {
          console.log(error);
          return error;
        })
      );
      return await api
        .all(promises)
        .then((response) => {
          return response;
        })
        .then(
          api.spread((...responses) => {
            const { successCount, errorCount } = getResponseCount(responses);
            const toastMessages = [];
            if (successCount) {
              const message = i18n.tc(
                'pageEventLogs.toast.successUnresolveLogs',
                successCount
              );
              toastMessages.push({ type: 'success', message });
            }
            if (errorCount) {
              const message = i18n.tc(
                'pageEventLogs.toast.errorUnresolveLogs',
                errorCount
              );
              toastMessages.push({ type: 'error', message });
            }
            return toastMessages;
          })
        );
    },
    // Single log entry
    async updateEventLogStatus(_, log) {
      const updatedEventLogStatus = log.status;
      return await api
        .patch(log.uri, { Resolved: updatedEventLogStatus })
        .then(() => {
          if (log.status) {
            return i18n.tc('pageEventLogs.toast.successResolveLogs', 1);
          } else {
            return i18n.tc('pageEventLogs.toast.successUnresolveLogs', 1);
          }
        })
        .catch((error) => {
          console.log(error);
          if (
            error.response.data?.error?.code?.endsWith(
              'PropertyValueExternalConflict'
            )
          ) {
            const message =
              i18n.tc('pageEventLogs.toast.errorLogStatusUpdate') +
              '\n' +
              i18n.tc('pageEventLogs.toast.errorResolveLogsGuardRecord', 1);
            throw new Error(message);
          }
          const message = i18n.tc('pageEventLogs.toast.errorLogStatusUpdate');
          throw new Error(message);
        });
    },
    async downloadLogData(_, uri) {
      return await api.get(uri + `/OemPelAttachment`).then((response) => {
        return response?.data?.Oem?.IBM?.PelJson;
      });
    },
  },
};

export default EventLogStore;
